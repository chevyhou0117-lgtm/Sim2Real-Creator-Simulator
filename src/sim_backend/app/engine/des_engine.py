"""Discrete Event Simulation (DES) engine using SimPy.

架构（WO-linked + 隔离双模式）：

- 引擎**不做排产**。每条 line 按 task 清单串行跑，task 的 line_id / 顺序由外部钉死。
- **有工单模式** (所有 task 有 wo_id)：WO 把跨 stage 的 task 链起来，上游 task 的产出定向
  给同 wo_id 的下游 task。不进共享池、不做派发。跨 stage 接续方式由 StageTransition 决定：
    * S2S = 上游每件完工立即流向下游（连接时长每件生效）
    * E2S = 上游 task 全部完工后整批流向下游（连接时长只对整批生效一次）
- **无工单模式** (所有 task 的 wo_id=None)：每条线独立跑自己的 task，无跨 stage 传递。
  下游 stage 的 task 视为"自备来料"（emit ISOLATED_MODE_SYNTHETIC_FEED 事件）。

工序-设备口径：**同 (line, operation) 下多台设备视为串联簇**，按 `Equipment.sort_order` 顺序
排列，工序 CT 均分到簇内 N 台 → 每台持续 ct/N → 逐台 emit START/END，整段持有同一
`simpy.Resource(capacity=1)`。事件流可直接驱动 Kit 端产品逐台流动动画。

产出毫秒级事件：PROCESSING_START/END、PRODUCT_COMPLETE、STAGE_HANDOFF、CHANGEOVER_START/END、
NG_DETECTED、FAILURE_START/END、ISOLATED_MODE_SYNTHETIC_FEED、BLOCKED_START/END（线边仓背压）、
STARVED_START/END（线边仓饥饿）。

线边仓（WIP_CAPACITY 软约束）：同 line 上 md_wip_buffer 定义的 (pre_op, post_op) 有界缓冲。
前置工序完工后向缓冲 put（满则攥着上游资源阻塞=背压），后置工序开工时从缓冲 get（空则占着
下游资源等料=饥饿）。容量按件数 capacity_qty 判定。缓冲水位 60s 采样写入快照 wip_states。
"""

from __future__ import annotations

import io
import itertools
import json
import random
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime

import simpy
from sqlalchemy.orm import Session


def _copy_escape(v) -> str:
    r"""PG COPY 文本格式转义：None→\N；反斜杠/制表/换行/回车按 PG 文本协议转义。"""
    if v is None:
        return r"\N"
    s = v if isinstance(v, str) else str(v)
    return (
        s.replace("\\", "\\\\")
        .replace("\t", "\\t")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
    )


def _bulk_insert_pg(db: Session, table_name: str, columns: tuple[str, ...], rows: list[dict], jsonb_cols: tuple[str, ...] = ()) -> None:
    r"""绕开 SQLAlchemy ORM bulk insert，用 psycopg2 原生 COPY ... FROM STDIN 写。

    背景：
    - SQLAlchemy ORM bulk insert 在 Python 3.14 + SA 2.0.50 下会触发
      `_deliver_insertmanyvalues_batches` 的 `'int' object is not subscriptable`。
    - 改用过 execute_values（多行 VALUES），但本地 Docker/WSL2 上的 postgres:16 在
      ~70 万行 + JSONB 的大批量 INSERT 下会偶发后端内存损坏崩溃（signal 11/6、
      "unrecognized node type"）。COPY 走完全不同的摄入路径（COPY 协议，非
      parse/plan/execute 多行 VALUES），既绕开该崩溃路径，又是最快的批量写法。

    文本格式：制表符分隔、`\N`=NULL、特殊字符按 _copy_escape 转义；JSONB 列先
    json.dumps 再当普通文本走（PG COPY 解析后交给 jsonb 输入函数）。
    """
    if not rows:
        return
    jset = set(jsonb_cols)
    buf = io.StringIO()
    for r in rows:
        cells = []
        for c in columns:
            v = r.get(c)
            if c in jset and v is not None:
                cells.append(_copy_escape(json.dumps(v, ensure_ascii=False)))
            else:
                cells.append(_copy_escape(v))
        buf.write("\t".join(cells))
        buf.write("\n")
    buf.seek(0)
    col_list = ",".join(columns)
    raw = db.connection().connection  # psycopg2 connection（与 ORM 同一事务）
    cur = raw.cursor()
    try:
        cur.copy_expert(f"COPY {table_name} ({col_list}) FROM STDIN", buf)
    finally:
        cur.close()


# res_simulation_event 的 3 个二级复合索引（定义须与 models/res.py __table_args__ 一致）。
# 批量写库前 DROP、写完 CREATE：避免 66 万行逐行维护 3 棵 B-tree，写入快一倍以上。
# 全程在 _execute_simulation 的同一事务里（PG 事务级 DDL）——若写库失败 rollback，
# DROP 会一并回滚，索引不会真丢。
# 注意（单写者假设）：DROP/CREATE 取表级锁、且 CREATE 会按全表（含其它方案的事件）重建。
# 本地单跑没问题；将来若出现「跑新仿真的同时另一个方案在看 3D 回放」的并发，需重新评估
# （改 partial index / 分区，或仅在空表时走删建索引路径）。
_EVENT_INDEXES = {
    "ix_sim_event_result_ts": "(result_id, timestamp_ms)",
    "ix_sim_event_result_eq_ts": "(result_id, equipment_id, timestamp_ms)",
    "ix_sim_event_result_product": "(result_id, product_id)",
}


def _set_event_indexes(db: Session, *, create: bool) -> None:
    """删/建 res_simulation_event 二级索引（用同一 raw 连接，与 _bulk_insert_pg 同事务）。"""
    cur = db.connection().connection.cursor()
    try:
        for name, cols in _EVENT_INDEXES.items():
            if create:
                cur.execute(f"CREATE INDEX IF NOT EXISTS {name} ON res_simulation_event {cols}")
            else:
                cur.execute(f"DROP INDEX IF EXISTS {name}")
    finally:
        cur.close()


from app.engine.common import (
    ResolvedProcess,
    SimEvent,
    get_enabled_constraints,
    load_resolved_processes,
    semi_finished_code,
)
from app.models.biz import ProductionTask
from app.models.md import (
    BOP,
    BOPProcess,
    Equipment,
    EquipmentFailureParam,
    Operation,
    OperationTransition,
    Product,
    ProductionLine,
    Stage,
    StageTransition,
    WIPBuffer,
)
from app.models.res import SimulationEvent, SimulationResult, SimulationStateSnapshot
from app.models.sim import AnomalyInjection, ParameterOverride, SimulationPlan

import logging as _logging
_log = _logging.getLogger(__name__)

# 换线时间占位（暂时不考虑）。未来读 md_product.standard_changeover_time 时替换。
DEFAULT_CHANGEOVER_SEC = 0


# ===========================================================================
# Metrics
# ===========================================================================
@dataclass
class DESMetrics:
    """Collected metrics during simulation."""

    total_output: int = 0
    ng_count: int = 0
    events: list[SimEvent] = field(default_factory=list)
    equipment_busy_time: dict[str, float] = field(default_factory=dict)  # eq_id -> seconds
    equipment_idle_time: dict[str, float] = field(default_factory=dict)
    material_shortage_count: int = 0
    equipment_failure_count: int = 0
    equipment_downtime_seconds: float = 0.0
    # 线边仓（WIP_CAPACITY 软约束）量化指标
    blocked_count: int = 0          # 背压：上游因缓冲满被卡的次数
    blocked_seconds: float = 0.0    # 背压累计时长（秒）
    starved_count: int = 0          # 饥饿：下游因缓冲空等料的次数
    starved_seconds: float = 0.0    # 饥饿累计时长（秒）
    wip_peak_level: dict[str, int] = field(default_factory=dict)  # wip_id -> 峰值水位
    # 线边仓水位采样（旁路：(ts_ms, wip_id, level, capacity)；仅供 _finalize replay 重建
    # wip_states 时序，不写入 res_simulation_event 主表，避免放大事件量/索引重建成本）
    wip_level_samples: list = field(default_factory=list)
    hourly_output: list[dict] = field(default_factory=list)
    actual_completion_sec: float = 0.0  # 最后一件 PRODUCT_COMPLETE 事件的时间戳
    # Per-line LBR 时序：[{line_id, line_code, line_name, points: [{t_min, lbr}, ...]}, ...]
    # LBR(t) = avg_op_util(t) / max_op_util(t)，60s 窗口聚合；max=0 时 lbr=null
    line_lbr_timeseries: list[dict] = field(default_factory=list)
    # 各阶段实际耗时（秒）：{"des": .., "linebalance": .., "persist": ..}，供前端分步显示
    phase_timings: dict = field(default_factory=dict)


# ===========================================================================
# LineResources —— 一条 line 的物理资源池（跨 task 共享）
# ===========================================================================
class LineResources:
    """物理 line 的共享资源池：Resources / 失效注册 / metrics 记录入口。

    工序 → 设备的语义：**同一 (line, operation) 下的多台设备视为串联簇**（非并联池）。
    每道工序对应一个 capacity=1 的 simpy.Resource，整条工序同时只跑一件产品。
    簇内多台设备按 `Equipment.sort_order` 升序排列，产品依次流过每台：
      effective_ct 均分到 N 台 → 每台持续 ct/N → 逐台 emit START/END。
    Kit 端据此驱动产品 prim 从簇头流到簇尾，设备 busy_time per-eq 各得 ct/N。

    同一条 line 上的多个 TaskExecutor 共享这个对象，确保：
    - simpy.Resource 不重复创建（同 operation 跨 task 共用一个）
    - 失效进程只注册一次
    """

    def __init__(
        self,
        env: simpy.Environment,
        line_id: str,
        all_processes: list[ResolvedProcess],
        constraints: set[str],
        failure_params: dict[str, tuple[float, float]],
        anomalies: list[AnomalyInjection],
        wip_buffers: dict[str, int],
        metrics: DESMetrics,
    ):
        self.env = env
        self.line_id = line_id
        self.constraints = constraints
        self.metrics = metrics

        # Resources 按 operation_id 去重；串联簇 capacity 恒为 1（同时只能跑一件）
        self.resources: dict[str, simpy.Resource] = {}
        self._op_proc_ref: dict[str, ResolvedProcess] = {}
        for proc in all_processes:
            if proc.operation_id not in self.resources:
                self.resources[proc.operation_id] = simpy.Resource(env, capacity=1)
                self._op_proc_ref[proc.operation_id] = proc

        # 线边仓：有界缓冲(cap≥1)建 simpy.Container 做背压；所有缓冲（含无限 cap=None）都记
        # 逻辑水位 self.wip_level（供"每道工序间半成品数量"水位时序观测）。wip_meta 存全部缓冲。
        self.wip_containers: dict[str, simpy.Container] = {}
        self.wip_meta: dict[str, dict] = {}
        self.wip_level: dict[str, int] = {}
        self._claimed_wip: set[str] = set()  # 被某 task BoP 成功插桩的 wip_id（检出跨 stage 失配）
        if "WIP_CAPACITY" in constraints:
            for wip_id, meta in wip_buffers.items():
                self.wip_meta[wip_id] = meta
                self.wip_level[wip_id] = 0
                cap = meta.get("cap")
                if cap and cap >= 1:
                    self.wip_containers[wip_id] = simpy.Container(env, capacity=cap, init=0)

        # 失效进程（每台设备只注册一次）
        if "EQUIPMENT_FAILURE" in constraints:
            registered: set[str] = set()
            for proc in all_processes:
                for eq_id in proc.equipment_ids:
                    if eq_id in registered:
                        continue
                    if eq_id in failure_params:
                        mtbf_sec, mttr_sec = failure_params[eq_id]
                        env.process(self._equipment_failure(proc, eq_id, mtbf_sec, mttr_sec))
                        registered.add(eq_id)

        # 异常注入（本线相关的）
        self._line_equipment_ids = set(self._op_proc_ref and
            {eq for proc in self._op_proc_ref.values() for eq in proc.equipment_ids})
        for anomaly in anomalies:
            if anomaly.anomaly_type == "EQUIPMENT_DOWNTIME" and anomaly.target_id in self._line_equipment_ids:
                env.process(self._anomaly_downtime(anomaly))

    # ------------------------------------------------------------------
    def iter_equipment_for(self, proc: ResolvedProcess) -> list[tuple[str, str | None]]:
        """串联簇内全部设备 (eq_id, prim_path)，按 Equipment.sort_order 升序返回
        （`common.py::load_resolved_processes` 在 BoP 解析时已排好序）。
        无设备时回退为 (operation_id, None) 单元素，保证事件依然有 label。"""
        if not proc.equipment_ids:
            return [(proc.operation_id, None)]
        prims = proc.equipment_prim_paths or []
        return [
            (eq, prims[i] if i < len(prims) else None)
            for i, eq in enumerate(proc.equipment_ids)
        ]

    def record_event(self, equipment_id: str, prim_path: str | None, event_type: str,
                     product_id: str | None = None, metadata: dict | None = None):
        self.metrics.events.append(SimEvent(
            timestamp_ms=int(self.env.now * 1000),
            equipment_id=equipment_id,
            prim_path=prim_path,
            event_type=event_type,
            product_id=product_id,
            metadata=metadata,
        ))

    def record_wip_level(self, wip_id: str, level: int, capacity, material_code=None):
        """记录线边仓水位采样（旁路 list，仅供 _finalize replay 重建 wip_states 时序）。
        capacity 为 int（有界）或 None（无限）。"""
        self.metrics.wip_level_samples.append(
            (int(self.env.now * 1000), wip_id, int(level), capacity, material_code)
        )
        if level > self.metrics.wip_peak_level.get(wip_id, 0):
            self.metrics.wip_peak_level[wip_id] = int(level)

    def all_equipment_ids(self) -> set[str]:
        return {eq for proc in self._op_proc_ref.values() for eq in proc.equipment_ids}

    # ------------------------------------------------------------------
    def _equipment_failure(self, proc: ResolvedProcess, eq_id: str,
                           mtbf_sec: float, mttr_sec: float):
        prim_path = None
        for j, eid in enumerate(proc.equipment_ids):
            if eid == eq_id:
                prim_path = proc.equipment_prim_paths[j] if j < len(proc.equipment_prim_paths) else None
                break

        while True:
            time_to_failure = random.expovariate(1.0 / mtbf_sec)
            yield self.env.timeout(time_to_failure)

            resource = self.resources[proc.operation_id]
            with resource.request(priority=-1) as req:
                yield req
                self.record_event(eq_id, prim_path, "FAILURE_START")
                self.metrics.equipment_failure_count += 1
                repair_time = random.expovariate(1.0 / mttr_sec)
                yield self.env.timeout(repair_time)
                self.metrics.equipment_downtime_seconds += repair_time
                self.record_event(eq_id, prim_path, "FAILURE_END")

    def _anomaly_downtime(self, anomaly: AnomalyInjection):
        start_sec = float(anomaly.start_sim_hour) * 3600
        duration_sec = float(anomaly.duration_minutes) * 60

        yield self.env.timeout(start_sec)

        target_proc = None
        for proc in self._op_proc_ref.values():
            if anomaly.target_id in proc.equipment_ids:
                target_proc = proc
                break
        if not target_proc:
            return

        resource = self.resources[target_proc.operation_id]
        with resource.request(priority=-1) as req:
            yield req
            prim_path = None
            for j, eid in enumerate(target_proc.equipment_ids):
                if eid == anomaly.target_id:
                    prim_path = target_proc.equipment_prim_paths[j] if j < len(target_proc.equipment_prim_paths) else None
                    break
            self.record_event(anomaly.target_id, prim_path, "FAILURE_START", metadata={"anomaly": True})
            yield self.env.timeout(duration_sec)
            self.record_event(anomaly.target_id, prim_path, "FAILURE_END", metadata={"anomaly": True})


# ===========================================================================
# TaskExecutor —— 一个 task 一个实例
# ===========================================================================
class TaskExecutor:
    """一个 ProductionTask 的执行器。"""

    def __init__(
        self,
        env: simpy.Environment,
        task: ProductionTask,
        line_resources: LineResources,
        processes: list[ResolvedProcess],
        transitions: dict[tuple[str, str], tuple[float, float]],
        inbox: simpy.Store | None,
        downstream_inbox: simpy.Store | None,
        connection_type: str = "E2S",
        connection_time: float = 0.0,
        is_isolated_mode_downstream: bool = False,
    ):
        self.env = env
        self.task = task
        self.line = line_resources
        self.processes = processes
        self.transitions = transitions
        self.inbox = inbox
        self.downstream_inbox = downstream_inbox
        self.connection_type = connection_type
        self.connection_time = connection_time
        self.is_isolated_mode_downstream = is_isolated_mode_downstream

        self._output_buffer: list[str] = []  # E2S 暂存
        self._in_flight: list[simpy.Process] = []

        # 线边仓插桩：把本线的缓冲按 pre/post 工序在本 task BoP(processes) 中的位置登记。
        # _out_buf[i]=wip_id：procs[i] 完工后向该缓冲放料（背压）；
        # _in_buf[i]=wip_id：procs[i] 开工前从该缓冲取料（饥饿）。
        # 按位置插桩（而非假定相邻）：pre/post 即便不相邻也能正确插桩；pre/post 不在本
        # task BoP 内（跨 stage 等）则自然不登记 → 该缓冲对本 task no-op。
        self._out_buf: dict[int, str] = {}
        self._in_buf: dict[int, str] = {}
        if self.line.wip_meta:
            op_to_idx: dict[str, int] = {}
            for idx, p in enumerate(self.processes):
                op_to_idx.setdefault(p.operation_id, idx)
            for wip_id, meta in self.line.wip_meta.items():
                a = op_to_idx.get(meta["pre_op"])
                b = op_to_idx.get(meta["post_op"])
                if a is not None and b is not None and a < b:
                    self._out_buf[a] = wip_id
                    self._in_buf[b] = wip_id
                    self.line._claimed_wip.add(wip_id)

    # ------------------------------------------------------------------
    def run(self):
        """Task 执行入口：生成器。同 line 的下一 task 只在本 run 返回后才启动。"""
        task = self.task
        qty = (task.plan_quantity or 0) - (task.completed_qty or 0)
        if qty <= 0:
            return

        # 隔离模式下游 stage 的 task：emit 一次提示事件
        if self.is_isolated_mode_downstream:
            self.line.record_event(
                equipment_id="line", prim_path=None,
                event_type="ISOLATED_MODE_SYNTHETIC_FEED",
                product_id=None,
                metadata={
                    "task_id": task.task_id,
                    "stage_id": task.stage_id,
                    "line_id": task.line_id,
                    "product_code": task.product_code,
                    "qty": qty,
                    "note": "downstream stage task in isolated mode — units are synthesized, not fed by upstream",
                },
            )

        # 投料
        if self.inbox is not None:
            # 下游 task：从 inbox 拉 qty 件
            # inbox 里塞的是 tuple (product_id, product_code) — 拆出来只用 product_id
            for i in range(qty):
                item = yield self.inbox.get()
                product_id_str = item[0] if isinstance(item, tuple) else item
                p = self.env.process(self._unit_flow(product_id_str))
                self._in_flight.append(p)
        else:
            # entry / isolated：自投 qty 件，1ms 错峰
            for i in range(qty):
                unit = f"{task.task_id}_unit_{i:05d}"
                p = self.env.process(self._unit_flow(unit))
                self._in_flight.append(p)
                yield self.env.timeout(0.001)

        # 等本 task 所有件跑完（清线）
        if self._in_flight:
            yield self.env.all_of(self._in_flight)

        # E2S 批量 handoff
        if self.connection_type == "E2S" and self._output_buffer and self.downstream_inbox is not None:
            if self.connection_time > 0:
                yield self.env.timeout(self.connection_time)
            for u in self._output_buffer:
                yield self.downstream_inbox.put((u, self.task.product_code))
            self._output_buffer.clear()

    # ------------------------------------------------------------------
    def _unit_flow(self, product_id: str):
        """一件产品流过本 task 的 BoP。"""
        procs = self.processes
        if not procs:
            # 本 task 对应的 (line, product) 没有 active BoP
            self.line.record_event(
                equipment_id="line", prim_path=None, event_type="NO_BOP_SKIP",
                product_id=product_id,
                metadata={"product_code": self.task.product_code, "task_id": self.task.task_id},
            )
            return

        for i, proc in enumerate(procs):
            resource = self.line.resources[proc.operation_id]
            eq_list = self.line.iter_equipment_for(proc)  # 串联簇按 sort_order 升序
            # 簇内 effective_ct 均分到每台设备：Kit 据此驱动产品逐台流动动画
            per_eq_ct = proc.effective_ct / len(eq_list)

            with resource.request() as req:
                yield req
                # 取料（饥饿）：本工序是某缓冲的后置工序 → 持下游资源后、开工前取 1 件；
                # 缓冲空则占着资源等料 = 饥饿（STARVED）。
                in_wid = self._in_buf.get(i)
                if in_wid is not None:
                    yield from self._wip_get(in_wid, eq_list[0], product_id)
                # 簇内逐台 START → timeout(ct/N) → END，整段持有同一 Resource
                for eq_id, prim_path in eq_list:
                    self.line.record_event(
                        eq_id, prim_path, "PROCESSING_START", product_id,
                        {"ct": per_eq_ct, "sequence": proc.sequence,
                         "product_code": self.task.product_code},
                    )
                    yield self.env.timeout(per_eq_ct)
                    self.line.metrics.equipment_busy_time[eq_id] = (
                        self.line.metrics.equipment_busy_time.get(eq_id, 0) + per_eq_ct
                    )
                    self.line.record_event(eq_id, prim_path, "PROCESSING_END", product_id)
                # 放料（背压）：本工序是某缓冲的前置工序 → 完工后、释放资源前放 1 件；
                # 缓冲满则攥着资源阻塞 = 背压（BLOCKED），上游随之逆向堵塞。
                out_wid = self._out_buf.get(i)
                if out_wid is not None:
                    yield from self._wip_put(out_wid, eq_list[-1], product_id)

            # Yield rate（纯统计：NG 不杀件，仅累计 ng_count + 事件记录；产品继续过下游工序）
            # 串联簇的 NG 归到簇末端（视为整道工序判定）
            if random.random() > proc.yield_rate:
                self.line.metrics.ng_count += 1
                ng_eq_id, ng_prim = eq_list[-1]
                self.line.record_event(ng_eq_id, ng_prim, "NG_DETECTED", product_id)

            # Intra-line op transition
            if i < len(procs) - 1:
                next_proc = procs[i + 1]
                key = (proc.operation_id, next_proc.operation_id)
                if key in self.transitions:
                    transfer_time, wait_time = self.transitions[key]
                    if transfer_time > 0 or wait_time > 0:
                        yield self.env.timeout(transfer_time + wait_time)

        # BoP 跑完 —— 决定去向（用最后一道工序串联簇的末端设备作为出口标签）
        last_eq = procs[-1].equipment_ids[-1] if procs[-1].equipment_ids else "output"

        if self.downstream_inbox is None:
            # Terminal task（WO chain 末端，或隔离模式 task）
            self.line.metrics.total_output += 1
            self.line.record_event(
                last_eq, None, "PRODUCT_COMPLETE", product_id,
                {"product_code": self.task.product_code, "task_id": self.task.task_id},
            )
            return

        # 有下游：S2S 立即流出；E2S 暂存，等 task 结束统一推
        self.line.record_event(
            last_eq, None, "STAGE_HANDOFF", product_id,
            {"product_code": self.task.product_code, "task_id": self.task.task_id,
             "connection_type": self.connection_type},
        )
        if self.connection_type == "S2S":
            self.env.process(self._stream_handoff(product_id))
        else:  # E2S
            self._output_buffer.append(product_id)

    # ------------------------------------------------------------------
    def _stream_handoff(self, product_id: str):
        """S2S：单件异步传输到下游 inbox。"""
        if self.connection_time > 0:
            yield self.env.timeout(self.connection_time)
        yield self.downstream_inbox.put((product_id, self.task.product_code))

    # ------------------------------------------------------------------
    def _buf_material(self, meta: dict) -> str | None:
        """该缓冲当前持有的半成品码（按本 task 的产品 + 缓冲前置工序）。"""
        return (semi_finished_code(self.task.product_code, meta["pre_op_code"])
                if meta.get("pre_op_code") else None)

    def _wip_get(self, wip_id: str, eq_tuple: tuple[str, str | None], product_id: str):
        """后置工序开工前从缓冲取 1 件。有界且空仓 → 阻塞=饥饿(STARVED)；无限 → 仅记水位。"""
        meta = self.line.wip_meta.get(wip_id, {})
        cap = meta.get("cap")
        c = self.line.wip_containers.get(wip_id)  # None=无限
        eq_id, prim = eq_tuple
        mat = self._buf_material(meta)
        md = {"wip_id": wip_id, "wip_code": meta.get("wip_code"), "capacity": cap, "material_code": mat}
        if c is not None and c.level == 0:
            self.line.record_event(eq_id, prim, "STARVED_START", product_id, md)
            t0 = self.env.now
            yield c.get(1)
            self.line.metrics.starved_seconds += self.env.now - t0
            self.line.metrics.starved_count += 1
            self.line.record_event(eq_id, prim, "STARVED_END", product_id, md)
        elif c is not None:
            yield c.get(1)
        # 逻辑水位 -1（与 Container.level 同步；无限缓冲也据此给出水位时序）
        self.line.wip_level[wip_id] = self.line.wip_level.get(wip_id, 0) - 1
        self.line.record_wip_level(wip_id, self.line.wip_level[wip_id], cap, mat)

    def _wip_put(self, wip_id: str, eq_tuple: tuple[str, str | None], product_id: str):
        """前置工序完工后向缓冲放 1 件。有界且满仓 → 阻塞=背压(BLOCKED)；无限 → 仅记水位。"""
        meta = self.line.wip_meta.get(wip_id, {})
        cap = meta.get("cap")
        c = self.line.wip_containers.get(wip_id)
        eq_id, prim = eq_tuple
        mat = self._buf_material(meta)
        md = {"wip_id": wip_id, "wip_code": meta.get("wip_code"), "capacity": cap, "material_code": mat}
        if c is not None and c.level >= c.capacity:
            self.line.record_event(eq_id, prim, "BLOCKED_START", product_id, md)
            t0 = self.env.now
            yield c.put(1)
            self.line.metrics.blocked_seconds += self.env.now - t0
            self.line.metrics.blocked_count += 1
            self.line.record_event(eq_id, prim, "BLOCKED_END", product_id, md)
        elif c is not None:
            yield c.put(1)
        self.line.wip_level[wip_id] = self.line.wip_level.get(wip_id, 0) + 1
        self.line.record_wip_level(wip_id, self.line.wip_level[wip_id], cap, mat)


# ===========================================================================
# Helper: StageTransition 查询
# ===========================================================================
def _lookup_stage_transition(
    db: Session, from_stage_id: str, to_stage_id: str,
) -> tuple[str, float]:
    """返回 (connection_type, connection_time)。表里无记录时默认 ('E2S', 0)。"""
    row = (
        db.query(StageTransition)
        .filter(
            StageTransition.from_stage_id == from_stage_id,
            StageTransition.to_stage_id == to_stage_id,
        )
        .first()
    )
    if row:
        return row.connection_type, float(row.connection_time)
    return "E2S", 0.0


# ===========================================================================
# Helper: 为某 (line, product) 加载 BoP + intra-line transitions
# ===========================================================================
def _load_line_bop_and_transitions(
    db: Session, plan_id: str, line_id: str, product_code: str,
) -> tuple[list[ResolvedProcess], dict[tuple[str, str], tuple[float, float]]]:
    procs = load_resolved_processes(db, plan_id, line_id, product_code)
    transitions: dict[tuple[str, str], tuple[float, float]] = {}
    if procs:
        # Intra-line operation transitions: 查同一 (line, product) 的 BoP
        bop = (
            db.query(BOP)
            .join(Product, Product.product_id == BOP.product_id)
            .filter(
                BOP.line_id == line_id,
                BOP.is_active == True,  # noqa: E712
                Product.product_code == product_code,
            )
            .first()
        )
        if bop:
            trans_rows = (
                db.query(OperationTransition)
                .filter(OperationTransition.bop_id == bop.bop_id)
                .all()
            )
            for tr in trans_rows:
                transitions[(tr.from_operation_id, tr.to_operation_id)] = (
                    float(tr.transfer_time),
                    float(tr.mandatory_wait_time),
                )
    return procs, transitions


def _load_failure_params(
    db: Session, plan_id: str, equipment_ids: set[str], constraints: set[str],
) -> dict[str, tuple[float, float]]:
    """读 MTBF/MTTR 基线（小时/分钟），考虑 plan 级 override。

    Override 优先级：EQUIPMENT > LINE > GLOBAL → baseline (EquipmentFailureParam)
    返回 (mtbf_sec, mttr_sec) per equipment_id。"""
    out: dict[str, tuple[float, float]] = {}
    if "EQUIPMENT_FAILURE" not in constraints:
        return out

    # 一次性拉 plan 级 mtbf / mttr override，避免逐设备查
    ov_rows = (
        db.query(ParameterOverride)
        .filter(
            ParameterOverride.plan_id == plan_id,
            ParameterOverride.param_key.in_(("mtbf", "mttr")),
        )
        .all()
    )
    # (param_key, equipment_id) → value（小时/分钟 unit 同 baseline 列）
    eq_ov: dict[tuple[str, str], float] = {}
    line_ov: dict[tuple[str, str], float] = {}  # (pk, line_id) → val
    global_ov: dict[str, float] = {}             # pk → val
    for o in ov_rows:
        try:
            val = float(o.param_value)
        except (TypeError, ValueError):
            continue
        if o.scope_type == "EQUIPMENT" and o.scope_id:
            eq_ov[(o.param_key, o.scope_id)] = val
        elif o.scope_type == "LINE" and o.scope_id:
            line_ov[(o.param_key, o.scope_id)] = val
        elif o.scope_type == "GLOBAL":
            global_ov[o.param_key] = val

    # 拉 equipment.line_id 关系一次（避免 N+1）
    line_by_eq: dict[str, str] = dict(
        db.query(Equipment.equipment_id, Equipment.line_id)
        .filter(Equipment.equipment_id.in_(equipment_ids))
        .all()
    )

    def _resolve(pk: str, eq_id: str, baseline: float) -> float:
        v = eq_ov.get((pk, eq_id))
        if v is not None:
            return v
        line_id = line_by_eq.get(eq_id)
        if line_id is not None:
            v = line_ov.get((pk, line_id))
            if v is not None:
                return v
        v = global_ov.get(pk)
        if v is not None:
            return v
        return baseline

    for eq_id in equipment_ids:
        fp = db.query(EquipmentFailureParam).filter(
            EquipmentFailureParam.equipment_id == eq_id
        ).first()
        if fp:
            mtbf_hours = _resolve("mtbf", eq_id, float(fp.mtbf_hours))
            mttr_mins = _resolve("mttr", eq_id, float(fp.mttr_minutes))
        else:
            # 没有 baseline：只有 override 才能注入故障
            mtbf_o = _resolve("mtbf", eq_id, 0.0)
            mttr_o = _resolve("mttr", eq_id, 0.0)
            if mtbf_o <= 0 or mttr_o <= 0:
                continue
            mtbf_hours, mttr_mins = mtbf_o, mttr_o
        if mtbf_hours > 0 and mttr_mins > 0:
            out[eq_id] = (mtbf_hours * 3600, mttr_mins * 60)
    return out


def _load_wip_buffers(db: Session, plan_id: str, line_id: str, constraints: set[str]) -> dict[str, dict]:
    """读线边仓定义（仅 WIP_CAPACITY 启用时）。返回 wip_id -> meta{cap, pre_op, post_op, wip_code}。

    容量口径：本期以**件数 capacity_qty** 为引擎约束依据（产品按抽象 unit 流动，put/get 量=1 件）。
    无 capacity_qty 的缓冲本期不按体积建模 → 跳过（视为无约束）并告警。
    scope：line_id 已是方案专属（克隆后重映射），再叠加 (plan 命中 OR 全局 NULL) 防御性过滤。
    """
    out: dict[str, dict] = {}
    if "WIP_CAPACITY" not in constraints:
        return out
    rows = (
        db.query(WIPBuffer)
        .filter(
            WIPBuffer.line_id == line_id,
            WIPBuffer.status == "ACTIVE",
            (WIPBuffer.plan_id == plan_id) | (WIPBuffer.plan_id.is_(None)),
        )
        .all()
    )
    rows = [w for w in rows if w.pre_operation_id and w.post_operation_id]  # 双边齐才是有效缓冲
    pre_ids = {w.pre_operation_id for w in rows}
    op_code = dict(
        db.query(Operation.operation_id, Operation.operation_code)
        .filter(Operation.operation_id.in_(pre_ids)).all()
    ) if pre_ids else {}
    for w in rows:
        # cap=件数(≥1)→有界(背压生效)；NULL/<1→None=无限(不背压，但仍记水位)
        cap = int(w.capacity_qty) if (w.capacity_qty and int(w.capacity_qty) >= 1) else None
        out[w.wip_id] = {
            "cap": cap,
            "pre_op": w.pre_operation_id,
            "post_op": w.post_operation_id,
            "wip_code": w.wip_code,
            "pre_op_code": op_code.get(w.pre_operation_id),
        }
    return out


# ===========================================================================
# Line orchestrator: 同线 task 按 production_sequence 串行跑
# ===========================================================================
def _line_runner(env: simpy.Environment, executors: list[TaskExecutor],
                 line_resources: LineResources):
    """同一条 line 上的 TaskExecutor 按 production_sequence 串行执行。
    产品切换时 emit CHANGEOVER 事件（相同 product_code 不 emit）。"""
    prev_pcode: str | None = None
    first_eq_hint = "line"
    for te in executors:
        if te.processes and te.processes[0].equipment_ids:
            first_eq_hint = te.processes[0].equipment_ids[0]
            break

    for te in executors:
        # Changeover 事件（跨 task product 变化）
        if prev_pcode is not None and te.task.product_code != prev_pcode:
            line_resources.record_event(
                first_eq_hint, None, "CHANGEOVER_START", None,
                {"from_product": prev_pcode, "to_product": te.task.product_code,
                 "duration_sec": DEFAULT_CHANGEOVER_SEC,
                 "line_id": line_resources.line_id},
            )
            if DEFAULT_CHANGEOVER_SEC > 0:
                yield env.timeout(DEFAULT_CHANGEOVER_SEC)
            line_resources.record_event(
                first_eq_hint, None, "CHANGEOVER_END", None,
                {"from_product": prev_pcode, "to_product": te.task.product_code,
                 "line_id": line_resources.line_id},
            )

        yield env.process(te.run())
        prev_pcode = te.task.product_code


# ===========================================================================
# run_des entry —— 模式判别 + 分支
# ===========================================================================
def run_des(db: Session, plan_id: str) -> DESMetrics:
    """Execute DES simulation。返回聚合 DESMetrics。"""
    plan = db.query(SimulationPlan).get(plan_id)
    if not plan:
        raise ValueError(f"Plan {plan_id} not found")

    result = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
    if not result:
        raise ValueError(f"No SimulationResult found for plan {plan_id}")

    duration_seconds = float(plan.simulation_duration_hours) * 3600
    constraints = get_enabled_constraints(db, plan_id)

    tasks = (
        db.query(ProductionTask)
        .filter(ProductionTask.plan_id == plan_id)
        .order_by(ProductionTask.production_sequence)
        .all()
    )
    if not tasks:
        # 空 plan，直接返回空 metrics
        return _finalize_and_write(db, plan, result, DESMetrics(), tasks, duration_seconds, [], des_sec=0.0)

    env = simpy.Environment()
    anomalies = db.query(AnomalyInjection).filter(AnomalyInjection.plan_id == plan_id).all()
    all_metrics = DESMetrics()

    # 模式判别：plan.ignore_wo 显式控制
    if plan.ignore_wo:
        line_resources_list = _run_isolated(
            env, db, plan, tasks, anomalies, constraints, all_metrics,
        )
    else:
        # WO 模式：要求所有 task 都挂 wo_id（数据完整性约束）
        missing = [t.task_id for t in tasks if not t.wo_id]
        if missing:
            raise ValueError(
                f"WO mode requires every task to have wo_id; "
                f"{len(missing)} task(s) missing (sample: {missing[:3]}). "
                f"Either fix data or set plan.ignore_wo=True."
            )
        line_resources_list = _run_wo_linked(
            env, db, plan, tasks, anomalies, constraints, all_metrics,
        )

    _log.info("[DES] SimPy env.run() 开始，仿真时长 %.1f h (%d 秒)，任务数 %d",
              plan.simulation_duration_hours, int(duration_seconds), len(tasks))

    _des_t0 = time.perf_counter()
    env.run(until=duration_seconds)
    des_sec = round(time.perf_counter() - _des_t0, 2)

    _log.info("[DES] SimPy env.run() 完成（%.1fs），共产生事件 %d 条，开始写库…",
              des_sec, len(all_metrics.events))

    result_ = _finalize_and_write(
        db, plan, result, all_metrics, tasks, duration_seconds, line_resources_list,
        des_sec=des_sec,
    )
    _log.info("[DES] 写库完成，仿真结束")
    return result_


# ===========================================================================
# WO-linked mode
# ===========================================================================
def _run_wo_linked(
    env: simpy.Environment,
    db: Session,
    plan: SimulationPlan,
    tasks: list[ProductionTask],
    anomalies: list[AnomalyInjection],
    constraints: set[str],
    metrics: DESMetrics,
) -> list[LineResources]:
    # 1. 按 wo_id 分组，按 stage.sequence 排序形成 WO chain
    stage_seq_by_id: dict[str, int] = {
        s.stage_id: s.sequence
        for s in db.query(Stage).filter(Stage.factory_id == plan.factory_id).all()
    }
    wo_chains: dict[str, list[ProductionTask]] = {}
    for t in tasks:
        wo_chains.setdefault(t.wo_id, []).append(t)
    for wo_id, chain in wo_chains.items():
        chain.sort(key=lambda t: stage_seq_by_id.get(t.stage_id, 0))

    # 2. 为 chain 中每个非首 task 建 inbox，查 StageTransition 得接续信息
    task_inbox: dict[str, simpy.Store] = {}
    task_downstream: dict[str, tuple[simpy.Store, str, float]] = {}  # inbox, connection_type, connection_time
    for chain in wo_chains.values():
        for i in range(len(chain) - 1):
            up, down = chain[i], chain[i + 1]
            inbox = simpy.Store(env)
            task_inbox[down.task_id] = inbox
            conn_type, conn_time = _lookup_stage_transition(db, up.stage_id, down.stage_id)
            task_downstream[up.task_id] = (inbox, conn_type, conn_time)

    # 3. 按 line 分组 tasks，建 LineResources + TaskExecutor
    tasks_by_line: dict[str, list[ProductionTask]] = {}
    for t in tasks:
        tasks_by_line.setdefault(t.line_id, []).append(t)
    for line_id in tasks_by_line:
        tasks_by_line[line_id].sort(key=lambda t: t.production_sequence)

    line_resources_list: list[LineResources] = []
    for line_id, line_tasks in tasks_by_line.items():
        procs_and_trans_by_task: list[tuple[ProductionTask, list[ResolvedProcess], dict]] = []
        all_line_procs: list[ResolvedProcess] = []
        for t in line_tasks:
            procs, trans = _load_line_bop_and_transitions(db, plan.plan_id, line_id, t.product_code)
            procs_and_trans_by_task.append((t, procs, trans))
            all_line_procs.extend(procs)

        equipment_ids = {eq for proc in all_line_procs for eq in proc.equipment_ids}
        failure_params = _load_failure_params(db, plan.plan_id, equipment_ids, constraints)
        wip_buffers = _load_wip_buffers(db, plan.plan_id, line_id, constraints)

        line_res = LineResources(
            env=env, line_id=line_id, all_processes=all_line_procs,
            constraints=constraints, failure_params=failure_params,
            anomalies=anomalies, wip_buffers=wip_buffers, metrics=metrics,
        )
        line_resources_list.append(line_res)

        # 组装 TaskExecutor
        executors: list[TaskExecutor] = []
        for task, procs, trans in procs_and_trans_by_task:
            inbox = task_inbox.get(task.task_id)  # None 则为 WO chain 首端
            ds = task_downstream.get(task.task_id)  # None 则为 WO chain 末端
            if ds is not None:
                downstream_inbox, conn_type, conn_time = ds
            else:
                downstream_inbox, conn_type, conn_time = None, "E2S", 0.0
            executors.append(TaskExecutor(
                env=env, task=task, line_resources=line_res,
                processes=procs, transitions=trans,
                inbox=inbox, downstream_inbox=downstream_inbox,
                connection_type=conn_type, connection_time=conn_time,
                is_isolated_mode_downstream=False,
            ))
        # 检出「建了仓却没被任一 task BoP 插桩」的线边仓（前/后置工序跨 stage 或配置错），告警不静默
        for _wid in set(line_res.wip_containers) - line_res._claimed_wip:
            _m = line_res.wip_meta.get(_wid, {})
            _log.warning(
                "[DES][WIP] 线边仓 %s 的前/后置工序不在线 %s 任一 task 的 BoP 内（跨 stage 或配置错），本轮忽略",
                _m.get("wip_code", _wid), line_id,
            )
        env.process(_line_runner(env, executors, line_res))

    return line_resources_list


# ===========================================================================
# Isolated mode
# ===========================================================================
def _run_isolated(
    env: simpy.Environment,
    db: Session,
    plan: SimulationPlan,
    tasks: list[ProductionTask],
    anomalies: list[AnomalyInjection],
    constraints: set[str],
    metrics: DESMetrics,
) -> list[LineResources]:
    # 按 stage.sequence 判断某 line 的 task 是否属于"下游 stage"（为 SYNTHETIC_FEED 事件判定）
    stage_seq_by_id: dict[str, int] = {
        s.stage_id: s.sequence
        for s in db.query(Stage).filter(Stage.factory_id == plan.factory_id).all()
    }
    min_seq = min(stage_seq_by_id.values()) if stage_seq_by_id else 0

    tasks_by_line: dict[str, list[ProductionTask]] = {}
    for t in tasks:
        tasks_by_line.setdefault(t.line_id, []).append(t)
    for line_id in tasks_by_line:
        tasks_by_line[line_id].sort(key=lambda t: t.production_sequence)

    line_resources_list: list[LineResources] = []
    for line_id, line_tasks in tasks_by_line.items():
        procs_and_trans_by_task = []
        all_line_procs: list[ResolvedProcess] = []
        for t in line_tasks:
            procs, trans = _load_line_bop_and_transitions(db, plan.plan_id, line_id, t.product_code)
            procs_and_trans_by_task.append((t, procs, trans))
            all_line_procs.extend(procs)

        equipment_ids = {eq for proc in all_line_procs for eq in proc.equipment_ids}
        failure_params = _load_failure_params(db, plan.plan_id, equipment_ids, constraints)
        wip_buffers = _load_wip_buffers(db, plan.plan_id, line_id, constraints)

        line_res = LineResources(
            env=env, line_id=line_id, all_processes=all_line_procs,
            constraints=constraints, failure_params=failure_params,
            anomalies=anomalies, wip_buffers=wip_buffers, metrics=metrics,
        )
        line_resources_list.append(line_res)

        executors: list[TaskExecutor] = []
        for task, procs, trans in procs_and_trans_by_task:
            is_downstream = stage_seq_by_id.get(task.stage_id, min_seq) > min_seq
            executors.append(TaskExecutor(
                env=env, task=task, line_resources=line_res,
                processes=procs, transitions=trans,
                inbox=None, downstream_inbox=None,
                connection_type="E2S", connection_time=0.0,
                is_isolated_mode_downstream=is_downstream,
            ))
        # 检出「建了仓却没被任一 task BoP 插桩」的线边仓（前/后置工序跨 stage 或配置错），告警不静默
        for _wid in set(line_res.wip_containers) - line_res._claimed_wip:
            _m = line_res.wip_meta.get(_wid, {})
            _log.warning(
                "[DES][WIP] 线边仓 %s 的前/后置工序不在线 %s 任一 task 的 BoP 内（跨 stage 或配置错），本轮忽略",
                _m.get("wip_code", _wid), line_id,
            )
        env.process(_line_runner(env, executors, line_res))

    return line_resources_list


# ===========================================================================
# Per-line LBR 时序计算
# ===========================================================================
def _compute_line_lbr_timeseries(
    db: Session,
    events: list[SimEvent],
    line_resources_list: list[LineResources],
    duration_seconds: float,
    window_sec: int = 60,
) -> list[dict]:
    """对每条 line 按 window_sec 窗口聚合 LBR 时序。

    LBR(window) = avg(op_busy_pct) / max(op_busy_pct)，op_busy_pct 是窗口内
    本线该 op 所有 equipment 的 busy 时间占比平均。max=0 时 lbr=null。
    """
    if not line_resources_list:
        return []

    # 1. 把事件折成 per-equipment 的 BUSY 区间 [start_sec, end_sec]
    intervals_by_eq: dict[str, list[tuple[float, float]]] = {}
    open_starts: dict[str, float] = {}
    for ev in events:
        if ev.event_type == "PROCESSING_START":
            open_starts[ev.equipment_id] = ev.timestamp_ms / 1000.0
        elif ev.event_type in ("PROCESSING_END", "PRODUCT_COMPLETE"):
            start = open_starts.pop(ev.equipment_id, None)
            if start is not None:
                end = ev.timestamp_ms / 1000.0
                intervals_by_eq.setdefault(ev.equipment_id, []).append((start, end))
    # 仿真结束时还在 BUSY 的区间补到 duration
    for eq_id, start in open_starts.items():
        intervals_by_eq.setdefault(eq_id, []).append((start, duration_seconds))

    # 2. line metadata（line_code / line_name）
    from app.models.md import ProductionLine
    line_meta: dict[str, tuple[str, str]] = {
        pl.line_id: (pl.line_code, pl.line_name)
        for pl in db.query(ProductionLine).all()
    }

    # 3. 逐 line 计算
    # 单遍分桶：每个 busy 区间只摊进它实际跨越的窗口（而非每个窗口重扫全部区间）。
    # busy_by_op[op_id][w] = 窗口 w 内本线该 op 全部设备的 busy 秒数之和。
    # 复杂度从 O(窗口 × 区间) 降到 ~O(区间 + 窗口)。数值与逐窗口重扫完全一致。
    n_windows = int(duration_seconds // window_sec)
    out: list[dict] = []
    for lr in line_resources_list:
        # op_id → list of equipment_ids（本线的）
        op_to_eqs: dict[str, list[str]] = {
            op_id: list(proc.equipment_ids) for op_id, proc in lr._op_proc_ref.items()
        }
        if not op_to_eqs:
            continue

        busy_by_op: dict[str, list[float]] = {
            op_id: [0.0] * n_windows for op_id in op_to_eqs
        }
        for op_id, eqs in op_to_eqs.items():
            if not eqs:
                continue
            arr = busy_by_op[op_id]
            for eq in eqs:
                for (s, e) in intervals_by_eq.get(eq, []):
                    if e <= s:
                        continue
                    w_lo = int(s // window_sec)
                    w_hi = int(e // window_sec)
                    if w_lo < 0:
                        w_lo = 0
                    if w_hi > n_windows - 1:
                        w_hi = n_windows - 1
                    for w in range(w_lo, w_hi + 1):
                        overlap = min(e, (w + 1) * window_sec) - max(s, w * window_sec)
                        if overlap > 0:
                            arr[w] += overlap

        points: list[dict] = []
        for w in range(n_windows):
            op_utils: list[float] = [
                busy_by_op[op_id][w] / (len(eqs) * window_sec)
                for op_id, eqs in op_to_eqs.items() if eqs
            ]
            mx = max(op_utils) if op_utils else 0
            avg = sum(op_utils) / len(op_utils) if op_utils else 0
            lbr = round(avg / mx, 4) if mx > 0 else None
            points.append({"t_min": (w + 1), "lbr": lbr})

        code, name = line_meta.get(lr.line_id, (lr.line_id[:8], lr.line_id[:8]))
        out.append({
            "line_id": lr.line_id,
            "line_code": code,
            "line_name": name,
            "points": points,
        })
    return out


# ===========================================================================
# 最终聚合 + 结果入库
# ===========================================================================
def _finalize_and_write(
    db: Session,
    plan: SimulationPlan,
    result: SimulationResult,
    all_metrics: DESMetrics,
    tasks: list[ProductionTask],
    duration_seconds: float,
    line_resources_list: list[LineResources],
    des_sec: float = 0.0,
) -> DESMetrics:
    # 阶段②「线平衡计算」：env.run() 已完成，进入后处理聚合（排序/瓶颈/hourly/LBR 时序）。
    # 先把阶段①(DES) 耗时落库 + 切 phase，让 /run/status 立刻看到。
    all_metrics.phase_timings = {"des": des_sec}
    result.computation_phase = "AGGREGATING"
    result.result_summary = {**(result.result_summary or {}), "phase_timings": all_metrics.phase_timings}
    db.commit()
    _agg_t0 = time.perf_counter()

    # 事件排序
    all_metrics.events.sort(key=lambda e: e.timestamp_ms)

    # 截断收尾：env.run(until=T) 丢弃仍卡在 put/get 的单元，其 *_END 永不触发 → 阻塞/饥饿
    # 秒数漏计 + *_START 失配。扫描未闭合的 BLOCKED/STARVED_START，按 T 补 END 并补 [t0,T] 时长，
    # 维持「每个 *_START 都有 *_END」不变量（快照状态机/轨迹端点依赖）。capacity=1 资源下同一
    # 设备同时至多 1 个未闭合 → FIFO 配对精确。
    _dur_ms = int(duration_seconds * 1000)
    _open_blk: dict[str, list[int]] = {}
    _open_stv: dict[str, list[int]] = {}
    for ev in all_metrics.events:
        if ev.event_type == "BLOCKED_START":
            _open_blk.setdefault(ev.equipment_id, []).append(ev.timestamp_ms)
        elif ev.event_type == "BLOCKED_END":
            _l = _open_blk.get(ev.equipment_id)
            if _l:
                _l.pop(0)
        elif ev.event_type == "STARVED_START":
            _open_stv.setdefault(ev.equipment_id, []).append(ev.timestamp_ms)
        elif ev.event_type == "STARVED_END":
            _l = _open_stv.get(ev.equipment_id)
            if _l:
                _l.pop(0)
    _synth: list[SimEvent] = []
    for _eq, _starts in _open_blk.items():
        for _t0 in _starts:
            all_metrics.blocked_count += 1
            all_metrics.blocked_seconds += max(0.0, duration_seconds - _t0 / 1000.0)
            _synth.append(SimEvent(_dur_ms, _eq, None, "BLOCKED_END", None, {"truncated": True}))
    for _eq, _starts in _open_stv.items():
        for _t0 in _starts:
            all_metrics.starved_count += 1
            all_metrics.starved_seconds += max(0.0, duration_seconds - _t0 / 1000.0)
            _synth.append(SimEvent(_dur_ms, _eq, None, "STARVED_END", None, {"truncated": True}))
    if _synth:
        all_metrics.events.extend(_synth)
        all_metrics.events.sort(key=lambda e: e.timestamp_ms)

    # 实际完工耗时
    last_complete_ms = max(
        (ev.timestamp_ms for ev in all_metrics.events if ev.event_type == "PRODUCT_COMPLETE"),
        default=0,
    )
    all_metrics.actual_completion_sec = last_complete_ms / 1000.0

    # 基本结果字段
    hours = float(plan.simulation_duration_hours)
    result.total_output = all_metrics.total_output
    actual_hours = all_metrics.actual_completion_sec / 3600.0
    result.output_per_hour = (
        round(all_metrics.total_output / actual_hours, 3) if actual_hours > 0 else 0
    )
    result.equipment_failure_count = all_metrics.equipment_failure_count
    result.equipment_downtime_minutes = round(all_metrics.equipment_downtime_seconds / 60, 2)

    # 瓶颈设备
    if all_metrics.equipment_busy_time:
        bottleneck_eq = max(all_metrics.equipment_busy_time, key=all_metrics.equipment_busy_time.get)
        result.bottleneck_equipment_id = bottleneck_eq
        result.bottleneck_utilization = round(
            all_metrics.equipment_busy_time[bottleneck_eq] / duration_seconds, 4
        ) if duration_seconds > 0 else 0

    # hourly bucket
    hour_buckets: dict[int, dict[str, int]] = {}
    for ev in all_metrics.events:
        if ev.event_type not in ("PRODUCT_COMPLETE", "NG_DETECTED"):
            continue
        hr = int(ev.timestamp_ms // 3_600_000)
        bucket = hour_buckets.setdefault(hr, {"actual": 0, "defect": 0})
        if ev.event_type == "PRODUCT_COMPLETE":
            bucket["actual"] += 1
        else:
            bucket["defect"] += 1
    total_plan_qty = sum(t.plan_quantity or 0 for t in tasks)
    plan_per_hour = round(total_plan_qty / hours) if hours > 0 else 0
    all_metrics.hourly_output = [
        {
            "hour": h,
            "actual": hour_buckets.get(h, {}).get("actual", 0),
            "defect": hour_buckets.get(h, {}).get("defect", 0),
            "plan": plan_per_hour,
        }
        for h in range(int(hours))
    ]

    # ── per-line LBR 时序（60s 窗口）─────────────────────────────────
    all_metrics.line_lbr_timeseries = _compute_line_lbr_timeseries(
        db, all_metrics.events, line_resources_list, duration_seconds, window_sec=60,
    )

    # 阶段②(线平衡计算)完成 → 阶段③「数据写入」：落库 linebalance 耗时 + 切 phase。
    all_metrics.phase_timings["linebalance"] = round(time.perf_counter() - _agg_t0, 2)
    result.computation_phase = "PERSISTING"
    result.result_summary = {**(result.result_summary or {}), "phase_timings": all_metrics.phase_timings}
    db.commit()
    _persist_t0 = time.perf_counter()

    # 快照：每 60s 记一次设备状态 + 线边仓水位
    snapshot_interval = 60
    current_equipment_states: dict[str, str] = {}
    for lr in line_resources_list:
        for eq_id in lr.all_equipment_ids():
            current_equipment_states[eq_id] = "IDLE"

    # 线边仓水位时序（旁路采样，按时间消费重建 current_wip_levels）
    wip_samples = sorted(all_metrics.wip_level_samples, key=lambda x: x[0])
    current_wip_levels: dict[str, tuple] = {}  # wip_id -> (level, capacity, material_code)
    wip_idx = 0

    snapshot_rows: list[dict] = []
    event_idx = 0
    for t_sec in range(0, int(duration_seconds), snapshot_interval):
        t_ms = t_sec * 1000
        while event_idx < len(all_metrics.events) and all_metrics.events[event_idx].timestamp_ms <= t_ms:
            ev = all_metrics.events[event_idx]
            if ev.event_type == "PROCESSING_START":
                current_equipment_states[ev.equipment_id] = "BUSY"
            elif ev.event_type in ("PROCESSING_END", "PRODUCT_COMPLETE"):
                current_equipment_states[ev.equipment_id] = "IDLE"
            elif ev.event_type == "FAILURE_START":
                current_equipment_states[ev.equipment_id] = "FAILURE"
            elif ev.event_type == "FAILURE_END":
                current_equipment_states[ev.equipment_id] = "IDLE"
            elif ev.event_type == "BLOCKED_START":
                current_equipment_states[ev.equipment_id] = "BLOCKED"
            elif ev.event_type == "STARVED_START":
                current_equipment_states[ev.equipment_id] = "STARVED"
            elif ev.event_type in ("BLOCKED_END", "STARVED_END"):
                current_equipment_states[ev.equipment_id] = "IDLE"
            event_idx += 1

        # 消费本窗口前的线边仓水位采样
        while wip_idx < len(wip_samples) and wip_samples[wip_idx][0] <= t_ms:
            _, _wid, _lvl, _cap, _mat = wip_samples[wip_idx]
            current_wip_levels[_wid] = (_lvl, _cap, _mat)
            wip_idx += 1

        _wip_states = {
            wid: {"quantity": lvl, "capacity": cap, "material_code": mat,
                  "fill_rate": (round(lvl / cap, 3) if cap else None)}
            for wid, (lvl, cap, mat) in current_wip_levels.items()
        }
        snapshot_rows.append({
            "snapshot_id": str(uuid.uuid4()),
            "result_id": result.result_id,
            "sim_timestamp_sec": round(t_sec, 3),
            "equipment_states": {eq: {"status": st} for eq, st in current_equipment_states.items()},
            "wip_states": _wip_states or None,
            "snapshot_interval_sec": snapshot_interval,
        })

    if snapshot_rows:
        _bulk_insert_pg(
            db,
            "res_simulation_state_snapshot",
            ("snapshot_id", "result_id", "sim_timestamp_sec", "equipment_states", "wip_states", "snapshot_interval_sec"),
            snapshot_rows,
            jsonb_cols=("equipment_states", "wip_states"),
        )

    # ── 全量毫秒事件入库（供 Omniverse Kit 3D 回放消费）────────────────────────
    # event_id 用 sortable 前缀（emission 序号 + result_id 短哈希），保证同 ms 多
    # 事件 ORDER BY (timestamp_ms, event_id) 时仍保持原顺序 — END(N) 在 START(N+1)
    # 之前。否则 trajectory/timeline 端点会配错对。
    if all_metrics.events:
        _t0 = time.perf_counter()
        rid_short = result.result_id[:8]
        rows = [
            {
                "event_id": f"{i:010d}-{rid_short}",
                "result_id": result.result_id,
                "timestamp_ms": ev.timestamp_ms,
                "equipment_id": ev.equipment_id,
                "prim_path": ev.prim_path,
                "event_type": ev.event_type,
                "product_id": ev.product_id,
                "event_metadata": ev.metadata,
            }
            for i, ev in enumerate(all_metrics.events)
        ]
        _set_event_indexes(db, create=False)   # 写前删二级索引（避免逐行维护）
        _bulk_insert_pg(
            db,
            "res_simulation_event",
            ("event_id", "result_id", "timestamp_ms", "equipment_id", "prim_path",
             "event_type", "product_id", "event_metadata"),
            rows,
            jsonb_cols=("event_metadata",),
        )
        _set_event_indexes(db, create=True)    # 写后重建二级索引
        _log.info("[DES] 事件入库完成：%d 条，耗时 %.1fs", len(rows), time.perf_counter() - _t0)

    # 阶段③(数据写入)耗时；最终 result_summary 由 _execute_simulation 写入时带上 phase_timings
    all_metrics.phase_timings["persist"] = round(time.perf_counter() - _persist_t0, 2)
    db.commit()
    return all_metrics
