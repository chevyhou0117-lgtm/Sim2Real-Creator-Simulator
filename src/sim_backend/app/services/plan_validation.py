"""方案输入校验单一真源。

`GET /plans/{id}/readiness`（百分比条）与 `POST /plans/{id}/ready`（保存并就绪门禁）
都委托本模块，保证「条满 100%」⟺「该维度过门」。

规则维度：input / params / constraints。
- blocking=True 的规则未过 → 阻止进入 READY。
- constraints 维度全部非阻塞（仅信息展示）。
- 物料供应/库存/线边仓仅在对应软约束启用时才纳入且阻塞（用户决策 4）。
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.api.scope import scoped
from app.engine.common import load_resolved_processes
from app.models.biz import (
    InventorySnapshot,
    MaterialSupply,
    ProductionTask,
    WIPBufferSnapshot,
)
from app.models.md import Product
from app.models.sim import SimulationPlan, SoftConstraintConfig
from app.schemas.sim import ImportIssue


@dataclass
class RuleResult:
    rule_id: str
    dimension: str  # "input" | "params" | "constraints"
    label: str
    passed: bool
    blocking: bool
    issues: list[ImportIssue] = field(default_factory=list)


def _enabled_constraints(db: Session, plan_id: str) -> set[str]:
    rows = (
        db.query(SoftConstraintConfig.constraint_type)
        .filter(
            SoftConstraintConfig.plan_id == plan_id,
            SoftConstraintConfig.is_enabled.is_(True),
        )
        .all()
    )
    return {r[0] for r in rows}


def _task_row(t: ProductionTask, idx: int) -> int:
    """per-task issue 的 row：用 production_sequence，缺失退回枚举序号。"""
    return t.production_sequence if t.production_sequence is not None else idx


def validate_plan(db: Session, plan: SimulationPlan) -> list[RuleResult]:
    """对持久化的方案数据跑全部规则，返回结果列表（不改任何状态）。"""
    plan_id = plan.plan_id
    results: list[RuleResult] = []

    tasks: list[ProductionTask] = (
        db.query(ProductionTask)
        .filter(ProductionTask.plan_id == plan_id)
        .order_by(ProductionTask.production_sequence)
        .all()
    )
    enabled = _enabled_constraints(db, plan_id)

    # ---------------- INPUT ----------------
    # input.tasks_present
    results.append(RuleResult(
        rule_id="input.tasks_present",
        dimension="input",
        label="生产任务",
        passed=len(tasks) > 0,
        blocking=True,
        issues=[] if tasks else [ImportIssue(row=0, field="tasks", message="方案没有任何生产任务（至少需要 1 条）")],
    ))

    # input.product_resolves —— product_code 能解析到 scoped Product
    prod_issues: list[ImportIssue] = []
    for i, t in enumerate(tasks, start=1):
        hit = scoped(
            db.query(Product).filter(Product.product_code == t.product_code),
            Product, plan_id,
        ).first()
        if hit is None:
            prod_issues.append(ImportIssue(
                row=_task_row(t, i), field="product_code",
                message=f"产品型号 {t.product_code!r} 在本方案主数据中不存在（task {t.task_id})",
            ))
    results.append(RuleResult(
        rule_id="input.product_resolves", dimension="input", label="产品型号可解析",
        passed=not prod_issues, blocking=True, issues=prod_issues,
    ))

    # input.bop_active —— 走引擎同款解析，杜绝 NO_BOP_SKIP 静默零产出
    bop_issues: list[ImportIssue] = []
    for i, t in enumerate(tasks, start=1):
        procs = load_resolved_processes(db, plan_id, t.line_id, t.product_code)
        if not procs:
            bop_issues.append(ImportIssue(
                row=_task_row(t, i), field="product_code",
                message=f"产品 {t.product_code} 在该产线（line_id={t.line_id}）上无启用的 BoP，"
                        f"仿真会静默跳过、产出为 0（task {t.task_id})",
            ))
    results.append(RuleResult(
        rule_id="input.bop_active", dimension="input", label="产线×产品有启用 BoP",
        passed=not bop_issues, blocking=True, issues=bop_issues,
    ))

    # WO 模式规则（仅 ignore_wo=False）
    if not plan.ignore_wo:
        miss = [
            ImportIssue(row=_task_row(t, i), field="wo_id",
                        message=f"WO 模式下 task 必须挂工单（task {t.task_id} 缺 wo_id）")
            for i, t in enumerate(tasks, start=1) if not t.wo_id
        ]
        results.append(RuleResult(
            rule_id="input.wo_mode_complete", dimension="input", label="WO 模式：任务均挂工单",
            passed=not miss, blocking=True, issues=miss,
        ))

        # 每 (wo_id, stage_id) ≤ 1 task
        seen: dict[tuple, int] = {}
        dup: list[ImportIssue] = []
        for i, t in enumerate(tasks, start=1):
            if not t.wo_id:
                continue
            key = (t.wo_id, t.stage_id)
            if key in seen:
                dup.append(ImportIssue(
                    row=_task_row(t, i), field="stage_id",
                    message=f"工单 {t.wo_id} 在同一制程下有多条 task（每 WO 每制程最多 1 条）",
                ))
            seen[key] = seen.get(key, 0) + 1
        results.append(RuleResult(
            rule_id="input.wo_stage_unique", dimension="input", label="WO 模式：每工单每制程唯一",
            passed=not dup, blocking=True, issues=dup,
        ))

        # 同 wo_id 链 plan_quantity 一致
        by_wo: dict[str, list[ProductionTask]] = {}
        for t in tasks:
            if t.wo_id:
                by_wo.setdefault(t.wo_id, []).append(t)
        qty_issues: list[ImportIssue] = []
        for wo_id, group in by_wo.items():
            qtys = {g.plan_quantity for g in group}
            if len(qtys) > 1:
                qty_issues.append(ImportIssue(
                    row=0, field="plan_quantity",
                    message=f"工单 {wo_id} 跨制程的计划产量不一致：{sorted(qtys)}",
                ))
        results.append(RuleResult(
            rule_id="input.wo_qty_consistent", dimension="input", label="WO 模式：链路产量一致",
            passed=not qty_issues, blocking=True, issues=qty_issues,
        ))

    # 条件阻塞：MATERIAL_SUPPLY → 供应 + 库存；WIP_CAPACITY → 线边仓
    if "MATERIAL_SUPPLY" in enabled:
        supplies = db.query(MaterialSupply).filter(MaterialSupply.plan_id == plan_id).all()
        s_iss: list[ImportIssue] = []
        if not supplies:
            s_iss.append(ImportIssue(row=0, field="material-supply",
                                     message="已启用 MATERIAL_SUPPLY 约束但未配置任何物料供应数据"))
        s_iss += [
            ImportIssue(row=0, field="supply_quantity",
                        message=f"物料 {s.material_code} 供应数量非正：{s.supply_quantity}")
            for s in supplies if s.supply_quantity is None or s.supply_quantity <= 0
        ]
        results.append(RuleResult(
            rule_id="input.supply_sane", dimension="input", label="物料供应数据（约束已启用）",
            passed=not s_iss, blocking=True, issues=s_iss,
        ))

        invs = db.query(InventorySnapshot).filter(InventorySnapshot.plan_id == plan_id).all()
        i_iss = [
            ImportIssue(row=0, field="available_quantity",
                        message=f"库存可用量 > 总量：{iv.material_code}")
            for iv in invs
            if iv.available_quantity is not None and iv.total_quantity is not None
            and iv.available_quantity > iv.total_quantity
        ]
        results.append(RuleResult(
            rule_id="input.inventory_sane", dimension="input", label="库存快照数据（约束已启用）",
            passed=not i_iss, blocking=True, issues=i_iss,
        ))

    if "WIP_CAPACITY" in enabled:
        wips = db.query(WIPBufferSnapshot).filter(WIPBufferSnapshot.plan_id == plan_id).all()
        w_iss: list[ImportIssue] = []
        if not wips:
            w_iss.append(ImportIssue(row=0, field="wip",
                                     message="已启用 WIP_CAPACITY 约束但未配置任何线边仓快照数据"))
        w_iss += [
            ImportIssue(row=0, field="current_volume",
                        message=f"线边仓占用体积为负：{w.material_code}")
            for w in wips if w.current_volume is not None and w.current_volume < 0
        ]
        results.append(RuleResult(
            rule_id="input.wip_sane", dimension="input", label="线边仓快照数据（约束已启用）",
            passed=not w_iss, blocking=True, issues=w_iss,
        ))

    # ---------------- PARAMS ----------------
    duration_ok = float(plan.simulation_duration_hours or 0) > 0
    results.append(RuleResult(
        rule_id="params.duration", dimension="params", label="仿真时长",
        passed=duration_ok, blocking=True,
        issues=[] if duration_ok else [ImportIssue(row=0, field="simulation_duration_hours",
                                                   message="仿真时长必须 > 0")],
    ))
    sim_ok = bool(plan.enabled_simulators)
    results.append(RuleResult(
        rule_id="params.simulators", dimension="params", label="启用模拟器",
        passed=sim_ok, blocking=True,
        issues=[] if sim_ok else [ImportIssue(row=0, field="enabled_simulators",
                                              message="至少选择一个模拟器")],
    ))

    # ---------------- CONSTRAINTS（非阻塞，仅信息）----------------
    constraint_n = (
        db.query(SoftConstraintConfig)
        .filter(SoftConstraintConfig.plan_id == plan_id)
        .count()
    )
    results.append(RuleResult(
        rule_id="constraints.configured", dimension="constraints", label="软约束设置",
        passed=constraint_n > 0, blocking=False, issues=[],
    ))

    return results
