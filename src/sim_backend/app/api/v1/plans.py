"""Simulation plan CRUD API endpoints."""

import uuid
from datetime import datetime
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.scope import scoped
from app.models.ai import AIAnalysisResult, ImprovementSuggestion
from app.models.biz import (
    DemandForecast,
    InventorySnapshot,
    MaterialSupply,
    ProductionTask,
    WIPBufferSnapshot,
    WorkOrder,
)
from app.models.md import (
    BOP,
    BOPProcess,
    Equipment,
    EquipmentFailureParam,
    EquipmentProcessParameters,
    Operation,
    Product,
    ProductionLine,
    Stage,
    WIPBuffer,
)
from app.models.res import (
    LineBalanceResult,
    SMTCapacityPeriodResult,
    SMTCapacityResult,
    SimulationEvent,
    SimulationResult,
    SimulationStateSnapshot,
)
from app.models.sim import (
    AnomalyInjection,
    ParameterOverride,
    SimulationPlan,
    SoftConstraintConfig,
)
from app.models.tpl import PlanVersion
from app.schemas.sim import (
    AnomalyCreate,
    AnomalyOut,
    AnomalyUpdate,
    BatchIds,
    ConstraintOut,
    ConstraintSet,
    EffectiveParam,
    EffectiveParamsOut,
    InventorySnapshotOut,
    MaterialSupplyOut,
    OverrideBatchUpsert,
    OverrideCreate,
    OverrideOut,
    OverrideUpsert,
    PlanCreate,
    PlanOut,
    PlanUpdate,
    ReadinessOut,
    ReadinessSection,
    ReadyRuleReport,
    ReadyValidationError,
    TaskCreate,
    TaskOut,
    WIPBufferOut,
    WIPBufferSnapshotOut,
)


PARAM_KEYS: tuple[str, ...] = (
    "ct",
    "yield_rate",
    "efficiency",
    "mtbf",
    "mttr",
    "worker_count",
)

# override scope_type → 优先级序号；越小越具体，越优先
_SCOPE_PRIORITY = ("EQUIPMENT", "OPERATION", "BOP_PROCESS", "LINE", "STAGE", "GLOBAL")


def _decimal_or_none(v: str | None) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        return Decimal(v)
    except (InvalidOperation, ValueError):
        return None


def _resolve_baseline(
    param_key: str,
    pp: EquipmentProcessParameters | None,
    fp: EquipmentFailureParam | None,
    bp: BOPProcess | None,
) -> tuple[Decimal | None, str]:
    """根据 param_key 从主数据基线表里取值，返回 (value, source)。"""
    if param_key == "ct":
        if pp and pp.standard_ct is not None:
            return pp.standard_ct, "BASELINE_EQUIPMENT"
        if bp and bp.standard_ct is not None:
            return bp.standard_ct, "BASELINE_BOP_PROCESS"
        return None, "BASELINE_DEFAULT"
    if param_key == "yield_rate":
        if pp and pp.standard_yield_rate is not None:
            return pp.standard_yield_rate, "BASELINE_EQUIPMENT"
        if bp and bp.yield_rate is not None:
            return bp.yield_rate, "BASELINE_BOP_PROCESS"
        return None, "BASELINE_DEFAULT"
    if param_key == "efficiency":
        if pp and pp.standard_work_efficiency is not None:
            return pp.standard_work_efficiency, "BASELINE_EQUIPMENT"
        return Decimal("1.0"), "BASELINE_DEFAULT"
    if param_key == "worker_count":
        if pp and pp.standard_worker_count is not None:
            return Decimal(pp.standard_worker_count), "BASELINE_EQUIPMENT"
        if bp and bp.standard_worker_count is not None:
            return Decimal(bp.standard_worker_count), "BASELINE_BOP_PROCESS"
        return None, "BASELINE_DEFAULT"
    if param_key == "mtbf":
        if fp and fp.mtbf_hours is not None:
            return fp.mtbf_hours, "BASELINE_FAILURE_PARAM"
        return None, "BASELINE_DEFAULT"
    if param_key == "mttr":
        if fp and fp.mttr_minutes is not None:
            return fp.mttr_minutes, "BASELINE_FAILURE_PARAM"
        return None, "BASELINE_DEFAULT"
    return None, "BASELINE_DEFAULT"

router = APIRouter(prefix="/plans", tags=["Simulation Plans"])


def _get_plan(db: Session, plan_id: str) -> SimulationPlan:
    plan = db.query(SimulationPlan).get(plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    return plan


def _revert_to_draft_if_ready(db: Session, plan_id: str) -> None:
    """任何输入/参数/约束改动前的守卫：

    - DRAFT：放行，状态不变。
    - READY：放行 + 退回 DRAFT，强制重新过「保存并就绪」门。
    - FAILED：拒绝（400）—— FAILED 是只读终态，用户须先 POST /reconfigure 退回 DRAFT。
    - RUNNING/COMPLETED/ARCHIVED：拒绝（400）—— 与之前 update_plan 的语义一致。

    随调用方自身的 db.commit() 一并落库（caller 负责 commit）。
    """
    plan = db.query(SimulationPlan).get(plan_id)
    if plan is None:
        return
    if plan.status == "FAILED":
        raise HTTPException(400, "FAILED 方案只读，请先 POST /reconfigure 退回 DRAFT 再编辑")
    if plan.status not in ("DRAFT", "READY"):
        raise HTTPException(400, f"只有 DRAFT/READY 方案可编辑，当前 {plan.status}")
    if plan.status == "READY":
        plan.status = "DRAFT"


def _cascade_delete_plan(db: Session, plan: SimulationPlan) -> None:
    """Delete a plan and all its downstream data (results, AI, business snapshots, versions).

    FK columns don't declare ondelete=CASCADE, so we delete in topological order explicitly.
    Does not commit — caller is responsible.
    """
    plan_id = plan.plan_id

    # Result layer: find the SimulationResult first
    result = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
    if result:
        result_id = result.result_id

        # AI layer (depends on result)
        ai = db.query(AIAnalysisResult).filter(AIAnalysisResult.result_id == result_id).first()
        if ai:
            db.query(ImprovementSuggestion).filter(
                ImprovementSuggestion.ai_result_id == ai.ai_result_id
            ).delete(synchronize_session=False)
            db.delete(ai)

        # SMT capacity (periods depend on smt_result)
        smt = db.query(SMTCapacityResult).filter(SMTCapacityResult.result_id == result_id).first()
        if smt:
            db.query(SMTCapacityPeriodResult).filter(
                SMTCapacityPeriodResult.smt_result_id == smt.smt_result_id
            ).delete(synchronize_session=False)
            db.delete(smt)

        db.query(LineBalanceResult).filter(
            LineBalanceResult.result_id == result_id
        ).delete(synchronize_session=False)
        db.query(SimulationStateSnapshot).filter(
            SimulationStateSnapshot.result_id == result_id
        ).delete(synchronize_session=False)
        db.query(SimulationEvent).filter(
            SimulationEvent.result_id == result_id
        ).delete(synchronize_session=False)
        db.delete(result)

    # Plan versions
    db.query(PlanVersion).filter(PlanVersion.plan_id == plan_id).delete(synchronize_session=False)

    # Business snapshots (tasks reference work_orders, so tasks first)
    db.query(ProductionTask).filter(ProductionTask.plan_id == plan_id).delete(synchronize_session=False)
    db.query(WorkOrder).filter(WorkOrder.plan_id == plan_id).delete(synchronize_session=False)
    db.query(MaterialSupply).filter(MaterialSupply.plan_id == plan_id).delete(synchronize_session=False)
    db.query(InventorySnapshot).filter(InventorySnapshot.plan_id == plan_id).delete(synchronize_session=False)
    db.query(DemandForecast).filter(DemandForecast.plan_id == plan_id).delete(synchronize_session=False)
    db.query(WIPBufferSnapshot).filter(WIPBufferSnapshot.plan_id == plan_id).delete(synchronize_session=False)

    # Plan configuration
    db.query(SoftConstraintConfig).filter(
        SoftConstraintConfig.plan_id == plan_id
    ).delete(synchronize_session=False)
    db.query(ParameterOverride).filter(
        ParameterOverride.plan_id == plan_id
    ).delete(synchronize_session=False)
    db.query(AnomalyInjection).filter(
        AnomalyInjection.plan_id == plan_id
    ).delete(synchronize_session=False)

    # （Factory 永久全局单例、不克隆，plan.factory_id 恒指向 canonical 全局 Factory；
    #   删 scoped md 不涉及 md_factory，无需再把 factory 指针挪回，无 FK 违例。）

    # PRD R413：方案删除时级联清理所有 md_* 的 plan-scoped 快照行
    # FK 已设 ON DELETE CASCADE，但显式 delete 保证 SQLAlchemy session 一致 + 跨 dialect 通用
    from app.services.snapshot import _CLONE_PLAN
    for model, _, _ in reversed(_CLONE_PLAN):
        db.query(model).filter(model.plan_id == plan_id).delete(synchronize_session=False)

    db.delete(plan)


# ---------------------------------------------------------------------------
# Plan CRUD
# ---------------------------------------------------------------------------
@router.get("", response_model=list[PlanOut])
def list_plans(status: str | None = None, db: Session = Depends(get_db)):
    q = db.query(SimulationPlan)
    if status:
        q = q.filter(SimulationPlan.status == status)
    return q.order_by(SimulationPlan.updated_at.desc()).all()


@router.post("", response_model=PlanOut, status_code=201)
def create_plan(body: PlanCreate, db: Session = Depends(get_db)):
    plan = SimulationPlan(
        plan_name=body.plan_name,
        factory_id=body.factory_id,
        enabled_simulators=body.enabled_simulators,
        simulation_duration_hours=body.simulation_duration_hours,
        plan_description=body.plan_description,
        created_by=body.created_by,
        ignore_wo=body.ignore_wo,
        creator_project_id=body.creator_project_id,
        status="DRAFT",
    )
    db.add(plan)
    db.flush()  # 确保 plan_id 落地，供快照行 FK 引用

    # 建方案即全量快照（PRD §2.1.x）：把当前主数据冻结成方案专属副本，
    # 之后主数据平台变更不再影响本方案。失败整体回滚，不留半拉子方案。
    from app.services.snapshot import clone_master_data_for_plan
    try:
        clone_master_data_for_plan(db, plan.plan_id)
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"基础数据快照失败：{e}") from e

    db.commit()
    db.refresh(plan)
    return plan


@router.get("/{plan_id}", response_model=PlanOut)
def get_plan(plan_id: str, db: Session = Depends(get_db)):
    return _get_plan(db, plan_id)


@router.patch("/{plan_id}", response_model=PlanOut)
def update_plan(plan_id: str, body: PlanUpdate, db: Session = Depends(get_db)):
    plan = _get_plan(db, plan_id)
    if plan.status not in ("DRAFT", "READY"):
        raise HTTPException(400, "Can only update DRAFT or READY plans")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(plan, k, v)
    if plan.status == "READY":
        plan.status = "DRAFT"  # 改了输入须重新过就绪门
    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=204)
def delete_plan(plan_id: str, db: Session = Depends(get_db)):
    plan = _get_plan(db, plan_id)
    if plan.status in ("RUNNING", "ARCHIVED"):
        raise HTTPException(400, "Cannot delete running or archived plans")
    _cascade_delete_plan(db, plan)
    db.commit()


# ---------------------------------------------------------------------------
# Soft Constraints
# ---------------------------------------------------------------------------
@router.get("/{plan_id}/constraints", response_model=list[ConstraintOut])
def list_constraints(plan_id: str, db: Session = Depends(get_db)):
    _get_plan(db, plan_id)
    return db.query(SoftConstraintConfig).filter(SoftConstraintConfig.plan_id == plan_id).all()


@router.post("/{plan_id}/constraints", response_model=ConstraintOut, status_code=201)
def set_constraint(plan_id: str, body: ConstraintSet, db: Session = Depends(get_db)):
    _get_plan(db, plan_id)
    _revert_to_draft_if_ready(db, plan_id)
    existing = (
        db.query(SoftConstraintConfig)
        .filter(SoftConstraintConfig.plan_id == plan_id, SoftConstraintConfig.constraint_type == body.constraint_type)
        .first()
    )
    if existing:
        existing.is_enabled = body.is_enabled
        db.commit()
        db.refresh(existing)
        return existing
    c = SoftConstraintConfig(plan_id=plan_id, constraint_type=body.constraint_type, is_enabled=body.is_enabled)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


# ---------------------------------------------------------------------------
# Parameter Overrides
# ---------------------------------------------------------------------------
@router.get("/{plan_id}/overrides", response_model=list[OverrideOut])
def list_overrides(plan_id: str, db: Session = Depends(get_db)):
    _get_plan(db, plan_id)
    return db.query(ParameterOverride).filter(ParameterOverride.plan_id == plan_id).all()


@router.post("/{plan_id}/overrides", response_model=OverrideOut, status_code=201)
def create_override(plan_id: str, body: OverrideCreate, db: Session = Depends(get_db)):
    _get_plan(db, plan_id)
    _revert_to_draft_if_ready(db, plan_id)
    o = ParameterOverride(plan_id=plan_id, **body.model_dump())
    db.add(o)
    db.commit()
    db.refresh(o)
    return o


@router.delete("/{plan_id}/overrides/{override_id}", status_code=204)
def delete_override(plan_id: str, override_id: str, db: Session = Depends(get_db)):
    o = db.query(ParameterOverride).get(override_id)
    if not o or o.plan_id != plan_id:
        raise HTTPException(404, "Override not found")
    db.delete(o)
    _revert_to_draft_if_ready(db, plan_id)
    db.commit()


@router.put("/{plan_id}/overrides", response_model=OverrideOut | None)
def upsert_override(plan_id: str, body: OverrideUpsert, db: Session = Depends(get_db)):
    """按 (plan_id, scope_type, scope_id, param_key) 唯一键 upsert。
    `param_value` 为空 → 删除该 override（恢复 BoP 默认值），返回 null。"""
    _get_plan(db, plan_id)
    _revert_to_draft_if_ready(db, plan_id)
    existing = (
        db.query(ParameterOverride)
        .filter(
            ParameterOverride.plan_id == plan_id,
            ParameterOverride.scope_type == body.scope_type,
            ParameterOverride.scope_id == body.scope_id,
            ParameterOverride.param_key == body.param_key,
        )
        .first()
    )
    if not body.param_value.strip():
        if existing:
            db.delete(existing)
            db.commit()
        return None
    if existing:
        existing.param_value = body.param_value
        existing.time_range_start = body.time_range_start
        existing.time_range_end = body.time_range_end
        db.commit()
        db.refresh(existing)
        return existing
    new_row = ParameterOverride(plan_id=plan_id, **body.model_dump())
    db.add(new_row)
    db.commit()
    db.refresh(new_row)
    return new_row


@router.post("/{plan_id}/overrides:batch", response_model=list[OverrideOut | None])
def batch_upsert_overrides(
    plan_id: str, body: OverrideBatchUpsert, db: Session = Depends(get_db)
):
    """批量 upsert 多条 override，单事务提交。
    返回与 items 一一对应的结果列表：None 表示该 item 因 param_value 为空被删除。"""
    _get_plan(db, plan_id)
    _revert_to_draft_if_ready(db, plan_id)
    results: list[ParameterOverride | None] = []
    for item in body.items:
        existing = (
            db.query(ParameterOverride)
            .filter(
                ParameterOverride.plan_id == plan_id,
                ParameterOverride.scope_type == item.scope_type,
                ParameterOverride.scope_id == item.scope_id,
                ParameterOverride.param_key == item.param_key,
            )
            .first()
        )
        if not item.param_value.strip():
            if existing:
                db.delete(existing)
            results.append(None)
            continue
        if existing:
            existing.param_value = item.param_value
            existing.time_range_start = item.time_range_start
            existing.time_range_end = item.time_range_end
            results.append(existing)
        else:
            new_row = ParameterOverride(plan_id=plan_id, **item.model_dump())
            db.add(new_row)
            results.append(new_row)
    db.commit()
    for r in results:
        if r is not None:
            db.refresh(r)
    return results


@router.get("/{plan_id}/effective-params", response_model=EffectiveParamsOut)
def list_effective_params(
    plan_id: str,
    product_code: str | None = None,
    db: Session = Depends(get_db),
):
    """计算本厂每台设备每个参数的当前生效值 + 来源层级。

    继承优先级（高→低）：
      EQUIPMENT(override) > OPERATION(override) > BOP_PROCESS(override) >
      LINE(override) > STAGE(override) > GLOBAL(override) > baseline(主数据)

    param_key 固定 6 个：ct / yield_rate / efficiency / mtbf / mttr / worker_count。

    可选 product_code：限定 BoP 视图。不传时每条线选第一个激活 BoP。
    响应 used_product_by_line 告知前端每条线实际采用的产品。
    """
    plan = _get_plan(db, plan_id)
    factory_id = plan.factory_id

    # 1) 全厂 ACTIVE equipment + op/line/stage + process_params + failure_param (plan-scoped)
    eq_q = (
        db.query(
            Equipment, Operation, ProductionLine, Stage,
            EquipmentProcessParameters, EquipmentFailureParam,
        )
        .join(Operation, Operation.operation_id == Equipment.operation_id)
        .join(ProductionLine, ProductionLine.line_id == Equipment.line_id)
        .join(Stage, Stage.stage_id == ProductionLine.stage_id)
        .outerjoin(
            EquipmentProcessParameters,
            EquipmentProcessParameters.equipment_id == Equipment.equipment_id,
        )
        .outerjoin(
            EquipmentFailureParam,
            EquipmentFailureParam.equipment_id == Equipment.equipment_id,
        )
        .filter(Stage.factory_id == factory_id, Equipment.status == "ACTIVE")
    )
    # plan-scope 应用到所有结构表（保留主数据 + 方案覆盖）
    for m in (Equipment, Operation, ProductionLine, Stage):
        eq_q = scoped(eq_q, m, plan_id)
    eq_rows = eq_q.all()

    # 2) 全厂激活 BoP（可按 product_code 过滤），建 (line_id, op_id) → BOPProcess 查找表
    bop_q = (
        db.query(BOP, BOPProcess, Product)
        .join(BOPProcess, BOPProcess.bop_id == BOP.bop_id)
        .join(Product, Product.product_id == BOP.product_id)
        .join(ProductionLine, ProductionLine.line_id == BOP.line_id)
        .join(Stage, Stage.stage_id == ProductionLine.stage_id)
        .filter(Stage.factory_id == factory_id, BOP.is_active.is_(True))
    )
    for m in (BOP, BOPProcess, Product, ProductionLine, Stage):
        bop_q = scoped(bop_q, m, plan_id)
    if product_code:
        bop_q = bop_q.filter(Product.product_code == product_code)
    bop_rows = bop_q.all()
    bp_by_line_op: dict[tuple[str, str], BOPProcess] = {}
    used_product_by_line: dict[str, str | None] = {}
    for bop, bp, prod in bop_rows:
        used_product_by_line.setdefault(bop.line_id, prod.product_code)
        bp_by_line_op.setdefault((bop.line_id, bp.operation_id), bp)
    # 没有激活 BoP 的产线在响应里也要出现，标 None
    line_ids_with_eq = {line.line_id for _, _, line, _, _, _ in eq_rows}
    for lid in line_ids_with_eq:
        used_product_by_line.setdefault(lid, None)

    # 3) plan 范围所有 override → 查找表
    overrides = (
        db.query(ParameterOverride)
        .filter(ParameterOverride.plan_id == plan_id)
        .all()
    )
    ov_lookup: dict[tuple[str, str | None, str], ParameterOverride] = {}
    for o in overrides:
        ov_lookup[(o.scope_type, o.scope_id, o.param_key)] = o

    # 4) 对每台 equipment × 6 个 param_key 解析生效值
    items: list[EffectiveParam] = []
    for eq, op, line, stage, pp, fp in eq_rows:
        bp = bp_by_line_op.get((line.line_id, op.operation_id))
        scope_chain: list[tuple[str, str | None]] = [
            ("EQUIPMENT", eq.equipment_id),
            ("OPERATION", op.operation_id),
            ("BOP_PROCESS", bp.bop_process_id if bp else None),
            ("LINE", line.line_id),
            ("STAGE", stage.stage_id),
            ("GLOBAL", None),
        ]
        for pk in PARAM_KEYS:
            baseline_value, baseline_source = _resolve_baseline(pk, pp, fp, bp)
            value = baseline_value
            source = baseline_source
            override_scope_id: str | None = None
            override_id: str | None = None
            for scope_type, scope_id in scope_chain:
                if scope_type == "BOP_PROCESS" and scope_id is None:
                    continue
                o = ov_lookup.get((scope_type, scope_id, pk))
                if o is None:
                    continue
                ov_val = _decimal_or_none(o.param_value)
                if ov_val is None:
                    continue
                value = ov_val
                source = f"OVERRIDE_{scope_type}"
                override_scope_id = scope_id
                override_id = o.override_id
                break

            items.append(EffectiveParam(
                equipment_id=eq.equipment_id,
                operation_id=op.operation_id,
                line_id=line.line_id,
                stage_id=stage.stage_id,
                factory_id=factory_id,
                bop_process_id=bp.bop_process_id if bp else None,
                param_key=pk,
                value=value,
                source=source,
                override_scope_id=override_scope_id,
                override_id=override_id,
                baseline_value=baseline_value,
            ))

    return EffectiveParamsOut(
        plan_id=plan_id,
        factory_id=factory_id,
        used_product_by_line=used_product_by_line,
        items=items,
    )


def _dim_pct(results, dim: str) -> int:
    """该维度阻塞规则通过比例（无阻塞规则视为 100）。"""
    blocking = [r for r in results if r.dimension == dim and r.blocking]
    if not blocking:
        return 100
    passed = sum(1 for r in blocking if r.passed)
    return round(100 * passed / len(blocking))


@router.get("/{plan_id}/readiness", response_model=ReadinessOut)
def get_plan_readiness(plan_id: str, db: Session = Depends(get_db)):
    """方案就绪度。委托 plan_validation.validate_plan（与「保存并就绪」门同源）。

    input/params 百分比 = 该维度阻塞规则通过比例，100 ⟺ 该维度过门；
    constraints 维度全部非阻塞，百分比按已配置软约束数 / 5 计（仅信息，不参与门禁）。
    """
    from app.services.plan_validation import validate_plan

    plan = _get_plan(db, plan_id)
    results = validate_plan(db, plan)

    input_pct = _dim_pct(results, "input")
    params_pct = _dim_pct(results, "params")

    constraint_n = (
        db.query(SoftConstraintConfig)
        .filter(SoftConstraintConfig.plan_id == plan_id)
        .count()
    )
    constraints_pct = min(100, int(constraint_n * 100 / 5))

    sections: list[ReadinessSection] = []
    for r in results:
        if r.rule_id == "constraints.configured":
            sections.append(ReadinessSection(
                section_id=r.rule_id, label=r.label, pct=constraints_pct,
                status="ok" if constraint_n >= 5 else ("warning" if constraint_n > 0 else "missing"),
                detail=f"{constraint_n}/5 类已设置",
            ))
            continue
        sections.append(ReadinessSection(
            section_id=r.rule_id,
            label=r.label,
            pct=100 if r.passed else 0,
            status="ok" if r.passed else ("warning" if not r.blocking else "missing"),
            detail=(r.issues[0].message if r.issues else "通过"),
        ))

    overall_pct = (input_pct + params_pct + constraints_pct) // 3
    return ReadinessOut(
        plan_id=plan_id,
        input_pct=input_pct,
        params_pct=params_pct,
        constraints_pct=constraints_pct,
        overall_pct=overall_pct,
        sections=sections,
    )


@router.post("/{plan_id}/ready", response_model=PlanOut)
def save_and_ready(plan_id: str, db: Session = Depends(get_db)):
    """保存并就绪：校验全部持久化输入；全过 → status=READY 落库；
    有阻塞错 → 422（ReadyValidationError），不改状态。幂等：已 READY 再点重校验。"""
    from app.services.plan_validation import validate_plan

    plan = _get_plan(db, plan_id)
    if plan.status not in ("DRAFT", "READY"):
        raise HTTPException(400, f"只有 DRAFT/READY 方案可校验就绪，当前 {plan.status}")

    results = validate_plan(db, plan)
    failed = [r for r in results if r.blocking and not r.passed]
    warns = [r for r in results if not r.blocking and not r.passed]

    if failed:
        def _rep(r):
            return ReadyRuleReport(
                rule_id=r.rule_id, dimension=r.dimension, label=r.label,
                passed=r.passed, blocking=r.blocking, issues=r.issues,
            )
        err = ReadyValidationError(
            plan_id=plan_id,
            failed_rules=[_rep(r) for r in failed],
            warnings=[_rep(r) for r in warns],
        )
        raise HTTPException(422, detail=err.model_dump())

    plan.status = "READY"
    db.commit()
    db.refresh(plan)
    return plan


# ---------------------------------------------------------------------------
# Production Tasks
# ---------------------------------------------------------------------------
@router.get("/{plan_id}/tasks", response_model=list[TaskOut])
def list_tasks(plan_id: str, db: Session = Depends(get_db)):
    """返回方案下的全部 task，附带 line_code / line_name / wo_no（前端表格直接消费，免再次查表）。"""
    from sqlalchemy.orm import joinedload

    _get_plan(db, plan_id)
    tasks = (
        db.query(ProductionTask)
        .options(
            joinedload(ProductionTask.production_line),
            joinedload(ProductionTask.work_order),
        )
        .filter(ProductionTask.plan_id == plan_id)
        .order_by(ProductionTask.production_sequence)
        .all()
    )
    return [
        TaskOut(
            task_id=t.task_id,
            plan_id=t.plan_id,
            wo_id=t.wo_id,
            stage_id=t.stage_id,
            line_id=t.line_id,
            product_code=t.product_code,
            plan_quantity=t.plan_quantity,
            completed_qty=t.completed_qty,
            production_sequence=t.production_sequence,
            line_code=t.production_line.line_code if t.production_line else None,
            line_name=t.production_line.line_name if t.production_line else None,
            wo_no=t.work_order.wo_no if t.work_order else None,
        )
        for t in tasks
    ]


@router.post("/{plan_id}/tasks", response_model=TaskOut, status_code=201)
def create_task(plan_id: str, body: TaskCreate, db: Session = Depends(get_db)):
    _get_plan(db, plan_id)
    data = body.model_dump()
    # 前端选的是全局 md id；已快照方案落库前翻译成本方案 scoped 同编码 id，
    # 否则引擎按 plan_id 查不到对应工艺。未快照方案原样返回（兜底）。
    from app.models.md import ProductionLine, Stage
    from app.services.snapshot import resolve_scoped_md_id
    if data.get("stage_id"):
        data["stage_id"] = resolve_scoped_md_id(db, plan_id, Stage, data["stage_id"])
    if data.get("line_id"):
        data["line_id"] = resolve_scoped_md_id(db, plan_id, ProductionLine, data["line_id"])
    t = ProductionTask(plan_id=plan_id, **data)
    db.add(t)
    _revert_to_draft_if_ready(db, plan_id)
    db.commit()
    db.refresh(t)
    return t


# ---------------------------------------------------------------------------
# Business snapshots (read-only)
# ---------------------------------------------------------------------------
@router.get("/{plan_id}/material-supplies", response_model=list[MaterialSupplyOut])
def list_material_supplies(plan_id: str, db: Session = Depends(get_db)):
    _get_plan(db, plan_id)
    return (
        db.query(MaterialSupply)
        .filter(MaterialSupply.plan_id == plan_id)
        .order_by(MaterialSupply.arrival_sim_hour)
        .all()
    )


@router.get("/{plan_id}/inventory-snapshots", response_model=list[InventorySnapshotOut])
def list_inventory_snapshots(plan_id: str, db: Session = Depends(get_db)):
    _get_plan(db, plan_id)
    return (
        db.query(InventorySnapshot)
        .filter(InventorySnapshot.plan_id == plan_id)
        .all()
    )


@router.get("/{plan_id}/wip-snapshots", response_model=list[WIPBufferSnapshotOut])
def list_wip_snapshots(plan_id: str, db: Session = Depends(get_db)):
    _get_plan(db, plan_id)
    return (
        db.query(WIPBufferSnapshot)
        .filter(WIPBufferSnapshot.plan_id == plan_id)
        .all()
    )


@router.get("/{plan_id}/wip-buffers", response_model=list[WIPBufferOut])
def list_wip_buffers(plan_id: str, db: Session = Depends(get_db)):
    """线边仓"定义"（虚拟线边仓拓扑 + 容量），供 2D 俯视图画工序间缓冲。

    已克隆方案：取方案专属行（含导入的 capacity_qty）；未克隆：回退全局定义（容量默认 NULL=无限）。
    """
    plan = _get_plan(db, plan_id)
    rows = (
        db.query(WIPBuffer)
        .filter(WIPBuffer.plan_id == plan_id, WIPBuffer.status == "ACTIVE")
        .all()
    )
    if not rows:
        rows = (
            db.query(WIPBuffer)
            .join(ProductionLine, ProductionLine.line_id == WIPBuffer.line_id)
            .join(Stage, Stage.stage_id == ProductionLine.stage_id)
            .filter(
                Stage.factory_id == plan.factory_id,
                WIPBuffer.plan_id.is_(None),
                WIPBuffer.status == "ACTIVE",
            )
            .all()
        )
    return rows


@router.get("/{plan_id}/equipment-map", response_model=dict[str, str])
def equipment_map(plan_id: str, db: Session = Depends(get_db)):
    """{equipment_id: operation_id} 映射，供 2D 回放把 equipment_states 聚合到工序盒着色。

    与快照里 equipment_states 的设备 ID 同 scope：已克隆方案取方案专属设备，否则取全局。
    """
    plan = _get_plan(db, plan_id)
    rows = (
        db.query(Equipment.equipment_id, Equipment.operation_id)
        .filter(Equipment.plan_id == plan_id)
        .all()
    )
    if not rows:
        rows = (
            db.query(Equipment.equipment_id, Equipment.operation_id)
            .join(ProductionLine, ProductionLine.line_id == Equipment.line_id)
            .join(Stage, Stage.stage_id == ProductionLine.stage_id)
            .filter(Stage.factory_id == plan.factory_id, Equipment.plan_id.is_(None))
            .all()
        )
    return {eq_id: op_id for eq_id, op_id in rows}


# ---------------------------------------------------------------------------
# Anomaly Injection
# ---------------------------------------------------------------------------
@router.get("/{plan_id}/anomalies", response_model=list[AnomalyOut])
def list_anomalies(plan_id: str, db: Session = Depends(get_db)):
    _get_plan(db, plan_id)
    return db.query(AnomalyInjection).filter(AnomalyInjection.plan_id == plan_id).all()


@router.post("/{plan_id}/anomalies", response_model=AnomalyOut, status_code=201)
def create_anomaly(plan_id: str, body: AnomalyCreate, db: Session = Depends(get_db)):
    _get_plan(db, plan_id)
    a = AnomalyInjection(plan_id=plan_id, **body.model_dump())
    db.add(a)
    _revert_to_draft_if_ready(db, plan_id)
    db.commit()
    db.refresh(a)
    return a


@router.patch("/{plan_id}/anomalies/{anomaly_id}", response_model=AnomalyOut)
def update_anomaly(plan_id: str, anomaly_id: str, body: AnomalyUpdate, db: Session = Depends(get_db)):
    a = db.query(AnomalyInjection).get(anomaly_id)
    if not a or a.plan_id != plan_id:
        raise HTTPException(404, "Anomaly not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    _revert_to_draft_if_ready(db, plan_id)
    db.commit()
    db.refresh(a)
    return a


@router.delete("/{plan_id}/anomalies/{anomaly_id}", status_code=204)
def delete_anomaly(plan_id: str, anomaly_id: str, db: Session = Depends(get_db)):
    a = db.query(AnomalyInjection).get(anomaly_id)
    if not a or a.plan_id != plan_id:
        raise HTTPException(404, "Anomaly not found")
    db.delete(a)
    _revert_to_draft_if_ready(db, plan_id)
    db.commit()


# ---------------------------------------------------------------------------
# Task Delete
# ---------------------------------------------------------------------------
@router.delete("/{plan_id}/tasks/{task_id}", status_code=204)
def delete_task(plan_id: str, task_id: str, db: Session = Depends(get_db)):
    t = db.query(ProductionTask).get(task_id)
    if not t or t.plan_id != plan_id:
        raise HTTPException(404, "Task not found")
    db.delete(t)
    _revert_to_draft_if_ready(db, plan_id)
    db.commit()


# ---------------------------------------------------------------------------
# Archive / Copy / Cancel
# ---------------------------------------------------------------------------
@router.post("/{plan_id}/archive", response_model=PlanOut)
def archive_plan(plan_id: str, db: Session = Depends(get_db)):
    plan = _get_plan(db, plan_id)
    if plan.status not in ("COMPLETED", "DRAFT", "READY", "FAILED"):
        raise HTTPException(400, f"Cannot archive plan in {plan.status} status")
    plan.status = "ARCHIVED"
    db.commit()
    db.refresh(plan)
    return plan


@router.post("/{plan_id}/copy", response_model=PlanOut)
def copy_plan(plan_id: str, db: Session = Depends(get_db)):
    src = _get_plan(db, plan_id)
    new_id = str(uuid.uuid4())
    new_plan = SimulationPlan(
        plan_id=new_id,
        plan_name=f"{src.plan_name} (Copy)",
        plan_description=src.plan_description,
        factory_id=src.factory_id,
        status="DRAFT",
        enabled_simulators=src.enabled_simulators,
        simulation_duration_hours=src.simulation_duration_hours,
        ignore_wo=src.ignore_wo,
        created_by=src.created_by,
    )
    db.add(new_plan)

    # Copy constraints
    for c in db.query(SoftConstraintConfig).filter(SoftConstraintConfig.plan_id == plan_id).all():
        db.add(SoftConstraintConfig(
            constraint_id=str(uuid.uuid4()), plan_id=new_id,
            constraint_type=c.constraint_type, is_enabled=c.is_enabled,
        ))

    # Copy overrides
    for o in db.query(ParameterOverride).filter(ParameterOverride.plan_id == plan_id).all():
        db.add(ParameterOverride(
            override_id=str(uuid.uuid4()), plan_id=new_id,
            scope_type=o.scope_type, scope_id=o.scope_id,
            param_key=o.param_key, param_value=o.param_value,
            time_range_start=o.time_range_start, time_range_end=o.time_range_end,
        ))

    # Copy work orders first → 得到 old_wo_id → new_wo_id 映射，task 用映射重连
    wo_id_map: dict[str, str] = {}
    for wo in db.query(WorkOrder).filter(WorkOrder.plan_id == plan_id).all():
        new_wo_id = str(uuid.uuid4())
        wo_id_map[wo.wo_id] = new_wo_id
        db.add(WorkOrder(
            wo_id=new_wo_id, plan_id=new_id,
            wo_no=wo.wo_no, order_no=wo.order_no,
            product_code=wo.product_code, product_name=wo.product_name,
            product_model=wo.product_model, pcb_layer=wo.pcb_layer,
            board_size=wo.board_size, total_comp_qty=wo.total_comp_qty,
            small_comp_qty=wo.small_comp_qty, bga_qty=wo.bga_qty,
            connector_qty=wo.connector_qty, panel_qty=wo.panel_qty,
            plan_qty=wo.plan_qty, completed_qty=wo.completed_qty,
            qualified_qty=wo.qualified_qty, plan_hours=wo.plan_hours,
            process_route=wo.process_route, data_source=wo.data_source,
            source_system=wo.source_system,
        ))

    # Copy tasks，wo_id 用映射重连（保持 WO chain 完整性）
    for t in db.query(ProductionTask).filter(ProductionTask.plan_id == plan_id).all():
        db.add(ProductionTask(
            task_id=str(uuid.uuid4()), plan_id=new_id,
            wo_id=wo_id_map.get(t.wo_id) if t.wo_id else None,
            stage_id=t.stage_id, line_id=t.line_id,
            product_code=t.product_code, plan_quantity=t.plan_quantity,
            production_sequence=t.production_sequence, data_source=t.data_source,
        ))

    # Copy anomalies
    for a in db.query(AnomalyInjection).filter(AnomalyInjection.plan_id == plan_id).all():
        db.add(AnomalyInjection(
            anomaly_id=str(uuid.uuid4()), plan_id=new_id,
            anomaly_type=a.anomaly_type, target_id=a.target_id,
            start_sim_hour=a.start_sim_hour, duration_minutes=a.duration_minutes,
            description=a.description,
        ))

    db.commit()
    db.refresh(new_plan)
    return new_plan


@router.post("/{plan_id}/cancel", response_model=PlanOut)
def cancel_simulation(plan_id: str, db: Session = Depends(get_db)):
    plan = _get_plan(db, plan_id)
    if plan.status != "RUNNING":
        raise HTTPException(400, "Plan is not running")
    plan.status = "READY"
    # Clean up incomplete result
    result = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
    if result and result.computation_status == "COMPUTING":
        result.computation_status = "FAILED"
        result.error_message = "Cancelled by user"
    db.commit()
    db.refresh(plan)
    return plan


@router.post("/{plan_id}/reconfigure", response_model=PlanOut)
def reconfigure_plan(plan_id: str, db: Session = Depends(get_db)):
    """COMPLETED / FAILED 方案回退到 DRAFT，以便修改配置后重新仿真。

    回 DRAFT(而非 READY)——重跑前必须重新过"保存并就绪"校验门,语义最干净。
    COMPLETED 的仿真结果保留在库(res_*),重跑时覆盖,不在此删除；
    FAILED 的主记录已在失败兜底中清掉，此处不再处理。
    幂等:已是 DRAFT 直接返回(便于前端按钮重复点不报错)。
    """
    plan = _get_plan(db, plan_id)
    if plan.status == "DRAFT":
        return plan
    if plan.status not in ("COMPLETED", "FAILED"):
        raise HTTPException(400, f"只有 COMPLETED/FAILED 方案可重新配置，当前 {plan.status}")
    plan.status = "DRAFT"
    db.commit()
    db.refresh(plan)
    return plan


# ---------------------------------------------------------------------------
# Batch operations
# ---------------------------------------------------------------------------
@router.post("/batch-archive")
def batch_archive(body: BatchIds, db: Session = Depends(get_db)):
    count = 0
    for pid in body.plan_ids:
        plan = db.query(SimulationPlan).get(pid)
        if plan and plan.status in ("COMPLETED", "DRAFT", "READY"):
            plan.status = "ARCHIVED"
            count += 1
    db.commit()
    return {"archived": count}


@router.post("/batch-delete")
def batch_delete(body: BatchIds, db: Session = Depends(get_db)):
    count = 0
    for pid in body.plan_ids:
        plan = db.query(SimulationPlan).get(pid)
        if plan and plan.status not in ("RUNNING", "ARCHIVED"):
            _cascade_delete_plan(db, plan)
            count += 1
    db.commit()
    return {"deleted": count}
