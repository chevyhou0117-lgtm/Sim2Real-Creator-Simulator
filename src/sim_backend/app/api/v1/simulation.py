"""Simulation execution and result query API endpoints."""

from __future__ import annotations

import threading
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.database import SessionLocal
from app.engine.common import SimEvent
from app.engine.des_engine import run_des
from app.engine.line_balance import run_line_balance
from sqlalchemy import func, text

from app.models.md import Equipment, ProductionLine, Stage, WIPBuffer
from app.models.res import LineBalanceResult, SimulationEvent, SimulationResult, SimulationStateSnapshot
from app.models.sim import SimulationPlan
from app.schemas.res import (
    LineBalanceResultOut,
    RunStatusOut,
    SimEventOut,
    SimulationEventsOut,
    SimulationResultOut,
)

router = APIRouter(prefix="/plans", tags=["Simulation"])


# ---------------------------------------------------------------------------
# Background task — runs the simulation engines
# ---------------------------------------------------------------------------
def _execute_simulation(plan_id: str):
    """Background task: runs simulation engines with a dedicated DB session."""
    db = SessionLocal()
    try:
        plan = db.query(SimulationPlan).get(plan_id)
        result = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
        if not plan or not result:
            return

        result.computation_start = datetime.utcnow()
        simulators = plan.enabled_simulators or []

        # Run line balance (static)
        if "LINE_BALANCE" in simulators:
            run_line_balance(db, plan_id)

        # Run DES (production process simulation)
        if "PRODUCTION" in simulators:
            # 阶段①：跑 DES。先 commit 让 /run/status 立刻看到 SIMULATING。
            result.computation_phase = "SIMULATING"
            db.commit()
            des_metrics = run_des(db, plan_id)

            # Store the full event stream as a JSON summary in result_summary
            # (events are also accessible via the /events endpoint)
            plan_hours = float(plan.simulation_duration_hours)
            actual_hours = des_metrics.actual_completion_sec / 3600.0
            peak_hourly = max(
                (h.get("actual", 0) for h in des_metrics.hourly_output),
                default=0,
            )
            result.result_summary = {
                "des_total_output": des_metrics.total_output,
                "des_ng_count": des_metrics.ng_count,
                "des_event_count": len(des_metrics.events),
                "des_duration_ms": int(plan_hours * 3600 * 1000),
                "hourly_output": des_metrics.hourly_output,
                # 实际完工时长（秒/小时）
                "actual_completion_sec": round(des_metrics.actual_completion_sec, 3),
                "actual_completion_hours": round(actual_hours, 3),
                # 两种速率同时暴露，前端按需选用
                "steady_state_output_per_hour": (
                    round(des_metrics.total_output / actual_hours, 3) if actual_hours > 0 else 0
                ),
                "plan_duration_avg_per_hour": (
                    round(des_metrics.total_output / plan_hours, 3) if plan_hours > 0 else 0
                ),
                "peak_hourly_output": peak_hourly,
                # 每条 line 一份 LBR 时序（60s 窗口聚合，points: [{t_min, lbr}, ...]）
                "line_lbr_timeseries": des_metrics.line_lbr_timeseries,
                # 各阶段实际耗时（秒）：des / linebalance / persist，供前端分步显示
                "phase_timings": des_metrics.phase_timings,
                # 线边仓（WIP_CAPACITY）背压/饥饿汇总（未启用约束时全为 0）
                "wip_capacity": {
                    "blocked_count": des_metrics.blocked_count,
                    "blocked_seconds": round(des_metrics.blocked_seconds, 1),
                    "starved_count": des_metrics.starved_count,
                    "starved_seconds": round(des_metrics.starved_seconds, 1),
                    "peak_levels": des_metrics.wip_peak_level,
                },
            }

        result.computation_status = "SUCCESS"
        result.computation_end = datetime.utcnow()
        plan.status = "COMPLETED"
        db.commit()

    except Exception as e:
        from loguru import logger
        logger.exception("[DES] 仿真执行失败 plan_id={}", plan_id)
        # 原 session 可能因 PG 内部错误（如 catcache）被毒化，rollback 都未必能跑通；
        # 容错降级后用全新 session 做状态回滚，确保 plan.status 一定能落库为 FAILED。
        try:
            db.rollback()
        except Exception:
            logger.warning("[DES] rollback on poisoned session failed; will recover with fresh session")
        recovery = SessionLocal()
        try:
            # 失败时立即清主记录及其子表：用户选择"失败时立即清"语义。
            # 主记录在 /run 入口已 commit（COMPUTING）；线平衡引擎中途也 commit 过 LBR；
            # 事件流 / 状态快照本次都未 commit（同一事务被 rollback），但保险起见一并清。
            result = recovery.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
            if result:
                recovery.query(SimulationEvent).filter(SimulationEvent.result_id == result.result_id).delete()
                recovery.query(SimulationStateSnapshot).filter(SimulationStateSnapshot.result_id == result.result_id).delete()
                recovery.query(LineBalanceResult).filter(LineBalanceResult.result_id == result.result_id).delete()
                recovery.delete(result)
            plan = recovery.query(SimulationPlan).get(plan_id)
            if plan:
                # FAILED 是终态分支：与 DRAFT 同义但保留"上一次跑失败"的语义。
                # 用户需走 /reconfigure 回 DRAFT，再 /ready 校验通过才能重跑。
                # 注：按"失败时立即清"语义，错误详情不持久化（result 主记录已删）。
                # 若以后要看 traceback，从 loguru 日志查 plan_id={plan_id} 的栈。
                plan.status = "FAILED"
            recovery.commit()
        except Exception:
            logger.exception("[DES] 兜底状态回滚失败，plan {} 可能仍卡在 RUNNING，需手动重置", plan_id)
            recovery.rollback()
        finally:
            recovery.close()
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Run simulation
# ---------------------------------------------------------------------------
@router.post("/{plan_id}/run", response_model=RunStatusOut)
def run_simulation(
    plan_id: str,
    db: Session = Depends(get_db),
):
    plan = db.query(SimulationPlan).get(plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    if plan.status != "READY":
        raise HTTPException(
            400,
            f"方案必须为 READY 才能启动仿真（先点「保存并就绪」过校验门），当前 {plan.status}",
        )

    # PRD §5.4.A R411：READY/DRAFT → RUNNING 状态切换时，单事务复制基础数据快照。
    # 这一步确保仿真期间所有 md_* 行都有方案专属副本，引擎查询走 plan-scoped 路径。
    from app.services.snapshot import clone_master_data_for_plan, rewrite_plan_biz_refs
    try:
        clone_master_data_for_plan(db, plan_id)
        # 克隆出 scoped md 后，把 biz 行（ProductionTask 的 stage_id/line_id/wo_id 等）
        # 从 canonical 重指到本方案 scoped 副本。否则引擎在快照隔离视图（plan_id==X）
        # 里找不到 task 的 canonical 线 → 每件 NO_BOP_SKIP → 0 产出、无 playback 小球。
        rewrite_plan_biz_refs(db, plan_id)
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"基础数据快照失败：{e}") from e

    # Transition to RUNNING
    plan.status = "RUNNING"

    # Create result record
    existing = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
    if existing:
        # Clean up previous result
        db.query(SimulationEvent).filter(SimulationEvent.result_id == existing.result_id).delete()
        db.query(SimulationStateSnapshot).filter(SimulationStateSnapshot.result_id == existing.result_id).delete()
        db.query(LineBalanceResult).filter(LineBalanceResult.result_id == existing.result_id).delete()
        db.delete(existing)
        db.flush()

    result = SimulationResult(
        result_id=str(uuid.uuid4()),
        plan_id=plan_id,
        computation_status="COMPUTING",
        computation_start=datetime.utcnow(),
    )
    db.add(result)
    db.commit()

    # 仿真是 CPU 密集型纯 Python（SimPy），放 anyio 线程池会长时间持有 GIL 导致事件循环
    # 无法处理其他请求（所有 /run/status 轮询全部 pending）。用独立 daemon 线程绕开池限制。
    threading.Thread(target=_execute_simulation, args=(plan_id,), daemon=True).start()

    return RunStatusOut(plan_id=plan_id, computation_status="COMPUTING")


# ---------------------------------------------------------------------------
# Run status
# ---------------------------------------------------------------------------
@router.get("/{plan_id}/run/status", response_model=RunStatusOut)
def get_run_status(plan_id: str, db: Session = Depends(get_db)):
    result = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
    if not result:
        raise HTTPException(404, "No simulation result found")
    elapsed: float | None = None
    if result.computation_start and result.computation_status == "COMPUTING":
        elapsed = (datetime.utcnow() - result.computation_start).total_seconds()
    return RunStatusOut(
        plan_id=plan_id,
        computation_status=result.computation_status,
        # 仅 COMPUTING 时透出子阶段，避免 SUCCESS/FAILED 后泄露陈旧 phase
        computation_phase=(result.computation_phase if result.computation_status == "COMPUTING" else None),
        # 各阶段耗时：随阶段推进逐步补全（SUCCESS 时已含全部三段，供前端定格显示）
        phase_timings=((result.result_summary or {}).get("phase_timings") or None),
        elapsed_sec=elapsed,
    )


# ---------------------------------------------------------------------------
# Result summary
# ---------------------------------------------------------------------------
@router.get("/{plan_id}/result", response_model=SimulationResultOut)
def get_result(plan_id: str, db: Session = Depends(get_db)):
    result = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
    if not result:
        raise HTTPException(404, "No simulation result found")
    return result


# ---------------------------------------------------------------------------
# Line balance results
# ---------------------------------------------------------------------------
@router.get("/{plan_id}/result/line-balance", response_model=list[LineBalanceResultOut])
def get_line_balance_results(plan_id: str, db: Session = Depends(get_db)):
    result = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
    if not result:
        raise HTTPException(404, "No simulation result found")
    return (
        db.query(LineBalanceResult)
        .filter(LineBalanceResult.result_id == result.result_id)
        .all()
    )


# ---------------------------------------------------------------------------
# State snapshots (paginated, for chart data)
# ---------------------------------------------------------------------------
@router.get("/{plan_id}/result/snapshots")
def get_snapshots(
    plan_id: str,
    offset: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    result = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
    if not result:
        raise HTTPException(404, "No simulation result found")

    snapshots = (
        db.query(SimulationStateSnapshot)
        .filter(SimulationStateSnapshot.result_id == result.result_id)
        .order_by(SimulationStateSnapshot.sim_timestamp_sec)
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [
        {
            "sim_timestamp_sec": float(s.sim_timestamp_sec),
            "equipment_states": s.equipment_states,
            "wip_states": s.wip_states,
            "warehouse_states": s.warehouse_states,
        }
        for s in snapshots
    ]


# ---------------------------------------------------------------------------
# Full event stream (for Kit / Omniverse 3D playback)
# ---------------------------------------------------------------------------
@router.get("/{plan_id}/result/events", response_model=SimulationEventsOut)
def get_events(
    plan_id: str,
    from_ms: int | None = None,
    to_ms: int | None = None,
    equipment_id: str | None = None,
    product_id: str | None = None,
    event_type: str | None = None,
    prim_path: str | None = None,
    limit: int | None = None,
    db: Session = Depends(get_db),
):
    """毫秒级事件流。供 Omniverse Kit `SimulationPlaybackController` 拉取后驱动 3D。

    可选过滤：
    - `from_ms` / `to_ms`：时间窗（仿真起点为 0ms）
    - `equipment_id`：仅某台设备
    - `product_id`：仅某件产品（追踪轨迹）
    - `event_type`：仅某类事件（如 PRODUCT_COMPLETE）
    - `limit`：最多返回 N 条（默认无限）

    无过滤时返回**全量事件流**（gzip 后约 2MB / 11h 仿真），可直接喂给 Kit。
    """
    result = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
    if not result:
        raise HTTPException(404, "No simulation result found")
    if result.computation_status != "SUCCESS":
        raise HTTPException(400, f"Simulation not completed: {result.computation_status}")

    plan = db.query(SimulationPlan).get(plan_id)
    duration_ms = int(float(plan.simulation_duration_hours) * 3600 * 1000)

    q = (
        db.query(SimulationEvent)
        .filter(SimulationEvent.result_id == result.result_id)
    )
    if from_ms is not None:
        q = q.filter(SimulationEvent.timestamp_ms >= from_ms)
    if to_ms is not None:
        q = q.filter(SimulationEvent.timestamp_ms <= to_ms)
    if equipment_id:
        q = q.filter(SimulationEvent.equipment_id == equipment_id)
    if product_id:
        q = q.filter(SimulationEvent.product_id == product_id)
    if event_type:
        q = q.filter(SimulationEvent.event_type == event_type)
    if prim_path:
        q = q.filter(SimulationEvent.prim_path == prim_path)

    q = q.order_by(SimulationEvent.timestamp_ms, SimulationEvent.event_id)
    if limit:
        q = q.limit(limit)

    rows = q.all()
    events = [
        SimEventOut(
            timestamp_ms=r.timestamp_ms,
            equipment_id=r.equipment_id or "",
            prim_path=r.prim_path,
            event_type=r.event_type,
            product_id=r.product_id,
            metadata=r.event_metadata,
        )
        for r in rows
    ]

    return SimulationEventsOut(
        plan_id=plan_id,
        total_events=len(events),
        duration_ms=duration_ms,
        events=events,
    )


# ---------------------------------------------------------------------------
# Per-equipment timeline (pre-aggregated for Kit status badge rendering)
# ---------------------------------------------------------------------------
@router.get("/{plan_id}/result/equipment-timeline/{equipment_id}")
def get_equipment_timeline(plan_id: str, equipment_id: str, db: Session = Depends(get_db)):
    """单台设备的状态时间轴：把 PROCESSING_START/END、FAILURE_START/END 折成
    [{from_ms, to_ms, status}, ...] 区间序列。Kit 端二分查询某 t 时刻状态。"""
    result = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
    if not result:
        raise HTTPException(404, "No simulation result found")

    plan = db.query(SimulationPlan).get(plan_id)
    duration_ms = int(float(plan.simulation_duration_hours) * 3600 * 1000)

    rows = (
        db.query(SimulationEvent)
        .filter(
            SimulationEvent.result_id == result.result_id,
            SimulationEvent.equipment_id == equipment_id,
            SimulationEvent.event_type.in_([
                "PROCESSING_START", "PROCESSING_END",
                "FAILURE_START", "FAILURE_END",
            ]),
        )
        .order_by(SimulationEvent.timestamp_ms, SimulationEvent.event_id)
        .all()
    )

    intervals: list[dict] = []
    cur_status = "IDLE"
    cur_start = 0
    for r in rows:
        new_status = cur_status
        if r.event_type == "PROCESSING_START":
            new_status = "BUSY"
        elif r.event_type == "PROCESSING_END":
            new_status = "IDLE"
        elif r.event_type == "FAILURE_START":
            new_status = "FAILURE"
        elif r.event_type == "FAILURE_END":
            new_status = "IDLE"
        if new_status != cur_status:
            intervals.append({"from_ms": cur_start, "to_ms": r.timestamp_ms, "status": cur_status})
            cur_status = new_status
            cur_start = r.timestamp_ms
    intervals.append({"from_ms": cur_start, "to_ms": duration_ms, "status": cur_status})
    return {"equipment_id": equipment_id, "duration_ms": duration_ms, "intervals": intervals}


# ---------------------------------------------------------------------------
# 某时刻各工序实时状态 + 在制产品 CT —— 供 2D 回放毫秒级着色（替代 60s 快照）
# ---------------------------------------------------------------------------
_STATE_OF = {
    "PROCESSING_START": "BUSY",
    "PROCESSING_END": "IDLE",
    "PRODUCT_COMPLETE": "IDLE",
    "BLOCKED_START": "BLOCKED",
    "BLOCKED_END": "IDLE",
    "STARVED_START": "STARVED",
    "STARVED_END": "IDLE",
    "MATERIAL_SHORTAGE_START": "SHORTAGE",
    "MATERIAL_SHORTAGE_END": "IDLE",
    "FAILURE_START": "FAILURE",
    "FAILURE_END": "IDLE",
}
# 严重度（工序级跨设备聚合取最严重）：停工类逐级升 STARVED<SHORTAGE<BLOCKED<FAILURE
_SEV = {"IDLE": 0, "BUSY": 1, "STARVED": 2, "SHORTAGE": 3, "BLOCKED": 4, "FAILURE": 5}


@router.get("/{plan_id}/result/state-at", response_model=dict)
def state_at(plan_id: str, t_ms: int, db: Session = Depends(get_db)):
    """t_ms 时刻各工序(line::op)实时状态 + 各线边仓当前 WIP 数量。事件驱动、毫秒级。

    ops：每台设备 <= t_ms 的最后一条事件定状态（DISTINCT ON，走 (result, equipment, ts) 索引），
    聚合到 (line::op) 取最严重；BUSY 带在制 product_code / ct / start_ms（前端按 (t_ms-start_ms) 插值 CT）。
    buffers：线边仓(pre→post)当前在制件数 = 通过 pre 末端设备件数 − 进入 post 首端设备件数（按事件计数，
    与引擎 put/get 口径一致），**不依赖 WIP_CAPACITY 是否开启**——所以即便容量无限也显示真实当前数量。
    返回 {"ops": {...}, "buffers": {wip_id: 数量}}。
    """
    result = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
    if not result:
        raise HTTPException(404, "No simulation result found")
    plan = db.query(SimulationPlan).get(plan_id)

    # equipment：eq_id -> "line::op"，并按 (line, op) 收集设备（按 sort_order 排，定 pre 末端 / post 首端）
    eq_rows = (
        db.query(Equipment.equipment_id, Equipment.line_id, Equipment.operation_id, Equipment.sort_order)
        .filter(Equipment.plan_id == plan_id)
        .all()
    )
    if not eq_rows:
        eq_rows = (
            db.query(Equipment.equipment_id, Equipment.line_id, Equipment.operation_id, Equipment.sort_order)
            .join(ProductionLine, ProductionLine.line_id == Equipment.line_id)
            .join(Stage, Stage.stage_id == ProductionLine.stage_id)
            .filter(Stage.factory_id == plan.factory_id, Equipment.plan_id.is_(None))
            .all()
        )
    eq_map: dict = {}
    lineop_eqs: dict = {}
    for eq, ln, op, so in eq_rows:
        eq_map[eq] = f"{ln}::{op}"
        lineop_eqs.setdefault((ln, op), []).append((so if so is not None else 0, eq))
    for v in lineop_eqs.values():
        v.sort()
    # 各工序末端设备（用于统计完工件数 → 任务进度）
    op_last_eq = {f"{ln}::{op}": (eqs[-1][1] if eqs else op) for (ln, op), eqs in lineop_eqs.items()}
    # 各工序簇内设备顺序（按 sort_order）—— 把单台 CT 汇总成工序级 CT 用
    cluster_by_key = {f"{ln}::{op}": [eq for _so, eq in eqs] for (ln, op), eqs in lineop_eqs.items()}

    # ── ops 状态 ──
    # 每台设备「<= t_ms 的最后一条事件」。原先用 DISTINCT ON 会对 timestamp_ms<=t 的全部事件做
    # Seq Scan + 外部归并排序（数十万行、溢盘），耗时随 t_ms 线性增长（8h 跑到秒级 → 回放卡顿）。
    # 改为按设备列表做 LATERAL 索引回查：每台设备走 ix_sim_event_result_eq_ts 索引 LIMIT 1，
    # O(设备数 × log N)、与 t_ms 无关。设备编号是 UUID（无逗号），用 string_to_array 传列表免 ARRAY 绑定。
    if eq_map:
        rows = db.execute(
            text(
                """
                SELECT e.eqid AS equipment_id, ev.event_type AS event_type,
                       ev.timestamp_ms AS timestamp_ms, ev.event_metadata AS event_metadata
                FROM unnest(string_to_array(:eqids, ',')) AS e(eqid)
                CROSS JOIN LATERAL (
                    SELECT event_type, timestamp_ms, event_metadata
                    FROM res_simulation_event
                    WHERE result_id = :rid AND equipment_id = e.eqid AND timestamp_ms <= :t
                    ORDER BY timestamp_ms DESC, event_id DESC
                    LIMIT 1
                ) ev
                """
            ),
            {"eqids": ",".join(eq_map.keys()), "rid": result.result_id, "t": t_ms},
        ).all()
    else:
        rows = []
    ops: dict = {}
    for r in rows:
        key = eq_map.get(r.equipment_id)
        if not key:
            continue
        st = _STATE_OF.get(r.event_type, "IDLE")
        prev = ops.get(key)
        if prev is not None and _SEV.get(prev["status"], 0) >= _SEV.get(st, 0):
            continue
        entry: dict = {"status": st}
        if st == "BUSY":
            md = r.event_metadata or {}
            per_eq = md.get("ct")  # 单台设备 CT（引擎把工序 CT 均分到簇内 N 台）
            cluster = cluster_by_key.get(key, [])
            n = len(cluster) or 1
            idx = cluster.index(r.equipment_id) if r.equipment_id in cluster else 0
            entry["product_code"] = md.get("product_code")
            entry["start_ms"] = r.timestamp_ms
            if per_eq is not None:
                entry["ct"] = round(per_eq * n, 3)         # 工序总 CT = 簇内 N 台合计
                entry["ct_base"] = round(idx * per_eq, 3)   # 已在前序设备上跑完的秒数
            else:
                entry["ct"] = per_eq
                entry["ct_base"] = 0
        ops[key] = entry

    # ── 线边仓当前 WIP ──
    def _rep(ln, op, last):
        eqs = lineop_eqs.get((ln, op))
        if eqs:
            return eqs[-1][1] if last else eqs[0][1]
        return op  # 无设备工序：事件以 operation_id 作 equipment_id

    bufs = (
        db.query(WIPBuffer)
        .filter(WIPBuffer.status == "ACTIVE", WIPBuffer.plan_id == plan_id)
        .all()
    )
    if not bufs:
        bufs = (
            db.query(WIPBuffer)
            .join(ProductionLine, ProductionLine.line_id == WIPBuffer.line_id)
            .join(Stage, Stage.stage_id == ProductionLine.stage_id)
            .filter(Stage.factory_id == plan.factory_id, WIPBuffer.plan_id.is_(None), WIPBuffer.status == "ACTIVE")
            .all()
        )
    specs = []  # (wip_id, pre_last_eq, post_first_eq)
    needed: set = set()
    for w in bufs:
        if not (w.pre_operation_id and w.post_operation_id):
            continue
        pre_eq = _rep(w.line_id, w.pre_operation_id, True)
        post_eq = _rep(w.line_id, w.post_operation_id, False)
        specs.append((w.wip_id, pre_eq, post_eq))
        needed.add(pre_eq)
        needed.add(post_eq)
    needed.update(op_last_eq.values())  # 同一计数查询里一并统计各工序完工件数（任务进度）
    counts: dict = {}
    if needed:
        cnt_rows = (
            db.query(SimulationEvent.equipment_id, SimulationEvent.event_type, func.count())
            .filter(
                SimulationEvent.result_id == result.result_id,
                SimulationEvent.timestamp_ms <= t_ms,
                SimulationEvent.equipment_id.in_(needed),
                SimulationEvent.event_type.in_(["PROCESSING_START", "PROCESSING_END"]),
            )
            .group_by(SimulationEvent.equipment_id, SimulationEvent.event_type)
            .all()
        )
        counts = {(eq, et): c for eq, et, c in cnt_rows}
    buffers: dict = {}
    for wip_id, pre_eq, post_eq in specs:
        produced = counts.get((pre_eq, "PROCESSING_END"), 0)
        consumed = counts.get((post_eq, "PROCESSING_START"), 0)
        buffers[wip_id] = max(0, produced - consumed)

    # ── 任务完成进度：done=通过该工序末端设备的件数；plan=该线计划总量 ──
    from app.models.biz import ProductionTask

    plan_by_line = dict(
        db.query(ProductionTask.line_id, func.coalesce(func.sum(ProductionTask.plan_quantity), 0))
        .filter(ProductionTask.plan_id == plan_id)
        .group_by(ProductionTask.line_id)
        .all()
    )
    for key, last_eq in op_last_eq.items():
        done = int(counts.get((last_eq, "PROCESSING_END"), 0))
        plan = int(plan_by_line.get(key.split("::", 1)[0], 0) or 0)
        e = ops.get(key)
        if e is None:
            e = {"status": "IDLE"}
            ops[key] = e
        e["done"] = done
        e["plan"] = plan

    return {"ops": ops, "buffers": buffers}


# ---------------------------------------------------------------------------
# Per-product trajectory (for Kit product flow animation)
# ---------------------------------------------------------------------------
@router.get("/{plan_id}/result/product-trajectory/{product_id}")
def get_product_trajectory(plan_id: str, product_id: str, db: Session = Depends(get_db)):
    """单件产品的轨迹：[{equipment_id, prim_path, enter_ms, exit_ms}, ...]
    每个 PROCESSING_START/END 配对得到一段；末尾可能是 STAGE_HANDOFF 或 PRODUCT_COMPLETE。"""
    result = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
    if not result:
        raise HTTPException(404, "No simulation result found")

    rows = (
        db.query(SimulationEvent)
        .filter(
            SimulationEvent.result_id == result.result_id,
            SimulationEvent.product_id == product_id,
        )
        .order_by(SimulationEvent.timestamp_ms, SimulationEvent.event_id)
        .all()
    )

    # 用 equipment_id 配 START/END，避免同 ms 多事件时配错
    segments: list[dict] = []
    open_by_eq: dict[str, dict] = {}
    terminal_event: dict | None = None
    for r in rows:
        if r.event_type == "PROCESSING_START":
            open_by_eq[r.equipment_id] = {
                "equipment_id": r.equipment_id,
                "prim_path": r.prim_path,
                "enter_ms": r.timestamp_ms,
                "exit_ms": None,
            }
        elif r.event_type == "PROCESSING_END":
            seg = open_by_eq.pop(r.equipment_id, None)
            if seg is not None:
                seg["exit_ms"] = r.timestamp_ms
                segments.append(seg)
        elif r.event_type in ("STAGE_HANDOFF", "PRODUCT_COMPLETE"):
            terminal_event = {
                "type": r.event_type,
                "timestamp_ms": r.timestamp_ms,
                "equipment_id": r.equipment_id,
                "metadata": r.event_metadata,
            }
    segments.sort(key=lambda s: s["enter_ms"])
    return {
        "product_id": product_id,
        "segments": segments,
        "terminal": terminal_event,
    }
