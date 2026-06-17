"""Shared utilities for simulation engines — CT resolution, data loading."""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

from sqlalchemy.orm import Session

from app.api.scope import scoped
from app.models.md import BOP, BOPProcess, Equipment, Operation, Product, StaffingConfig
from app.models.sim import ParameterOverride, SoftConstraintConfig


@dataclass
class ResolvedProcess:
    """A BOP process with its effective CT and equipment info resolved."""

    bop_process_id: str
    operation_id: str
    operation_name: str
    sequence: int
    effective_ct: float  # seconds
    equipment_count: int  # 串联簇内设备数（同 (line, operation) 下挂的所有 Equipment 视为串联，同启同停）
    equipment_ids: list[str]
    equipment_prim_paths: list[str]  # creator_binding_id values
    yield_rate: float
    worker_count: int
    design_ct: float  # BOP standard_ct before overrides


@dataclass
class SimEvent:
    """A single simulation event with millisecond precision."""

    timestamp_ms: int
    equipment_id: str
    prim_path: str | None
    event_type: str  # PROCESSING_START / PROCESSING_END / IDLE / FAILURE_START / FAILURE_END / BLOCKED
    product_id: str | None = None
    metadata: dict | None = None


def get_enabled_constraints(db: Session, plan_id: str) -> set[str]:
    """Return set of enabled constraint types for a plan."""
    rows = (
        db.query(SoftConstraintConfig)
        .filter(SoftConstraintConfig.plan_id == plan_id, SoftConstraintConfig.is_enabled == True)  # noqa: E712
        .all()
    )
    return {r.constraint_type for r in rows}


_SCOPE_PRIORITY = {"EQUIPMENT": 0, "BOP_PROCESS": 1, "OPERATION": 2, "LINE": 3, "GLOBAL": 4}


def _resolve_override(
    db: Session,
    plan_id: str,
    *,
    bop_process_id: str | None = None,
    operation_id: str,
    line_id: str | None,
    equipment_ids: list[str],
    param_key: str,
    default: float,
    sim_time_hours: float | None = None,
) -> float | None:
    """按 EQUIPMENT(0) > BOP_PROCESS(1) > OPERATION(2) > LINE(3) > GLOBAL(4) 优先级查 ParameterOverride，返回最特化匹配。

    BOP_PROCESS 粒度对应一条 BoP 上的一道工序（per line × product × operation），是面板默认写入的粒度。
    OPERATION 是跨线跨产品的同名工序（用于批量调）。无任何匹配时返回 None。
    """
    rows = (
        db.query(ParameterOverride)
        .filter(ParameterOverride.plan_id == plan_id, ParameterOverride.param_key == param_key)
        .all()
    )

    best_value: float | None = None
    best_priority = 99
    for ov in rows:
        priority = _SCOPE_PRIORITY.get(ov.scope_type, 99)
        if ov.scope_type == "EQUIPMENT" and ov.scope_id not in equipment_ids:
            continue
        if ov.scope_type == "BOP_PROCESS" and ov.scope_id != bop_process_id:
            continue
        if ov.scope_type == "OPERATION" and ov.scope_id != operation_id:
            continue
        if ov.scope_type == "LINE" and ov.scope_id != line_id:
            continue
        if sim_time_hours is not None:
            if ov.time_range_start is not None and sim_time_hours < float(ov.time_range_start):
                continue
            if ov.time_range_end is not None and sim_time_hours > float(ov.time_range_end):
                continue
        if priority < best_priority:
            best_priority = priority
            try:
                best_value = float(ov.param_value)
            except (TypeError, ValueError):
                continue
    return best_value


def resolve_ct_for_operation(
    db: Session,
    plan_id: str,
    operation_id: str,
    bop_standard_ct: float,
    *,
    bop_process_id: str | None = None,
    line_id: str | None = None,
    equipment_ids: list[str] | None = None,
    sim_time_hours: float | None = None,
) -> float:
    """Resolve effective CT considering ct_override + efficiency.

    Priority: EQUIPMENT > BOP_PROCESS > OPERATION > LINE > GLOBAL > BOP standard CT.
    Efficiency adjustment applies if no ct_override matched.

    `bop_process_id` / `line_id` / `equipment_ids` 由调用方传入；不传时回退到按 operation_id 粗查（仅 OPERATION 级 override 能命中，per-BoP 粒度会失效）。
    """
    if equipment_ids is None:
        equipment_ids = [
            e.equipment_id
            for e in db.query(Equipment).filter(Equipment.operation_id == operation_id).all()
        ]
    if line_id is None:
        bop_row = (
            db.query(BOP.line_id)
            .join(BOPProcess, BOPProcess.bop_id == BOP.bop_id)
            .filter(BOPProcess.operation_id == operation_id, BOP.is_active == True)  # noqa: E712
            .first()
        )
        line_id = bop_row[0] if bop_row else None

    ct_override = _resolve_override(
        db, plan_id,
        bop_process_id=bop_process_id, operation_id=operation_id, line_id=line_id,
        equipment_ids=equipment_ids,
        param_key="ct", default=bop_standard_ct, sim_time_hours=sim_time_hours,
    )
    if ct_override is not None:
        return ct_override

    efficiency = _resolve_override(
        db, plan_id,
        bop_process_id=bop_process_id, operation_id=operation_id, line_id=line_id,
        equipment_ids=equipment_ids,
        param_key="efficiency", default=1.0, sim_time_hours=sim_time_hours,
    )
    if efficiency is not None and efficiency > 0:
        return bop_standard_ct / efficiency

    return bop_standard_ct


def load_resolved_processes(
    db: Session,
    plan_id: str,
    line_id: str,
    product_code: str | None = None,
) -> list[ResolvedProcess]:
    """Load BOP processes for a line with resolved CTs and equipment info.

    When `product_code` is given, filters to the active BoP of that (line, product) pair
    (the intended path for multi-product DES). When None, returns the first active BoP
    on the line (legacy path, kept for `line_balance.py` which has not yet been
    upgraded — see TODO).

    Returns [] when no matching active BoP exists.
    """
    q = db.query(BOP).filter(BOP.line_id == line_id, BOP.is_active == True)  # noqa: E712
    q = scoped(q, BOP, plan_id)
    if product_code is not None:
        q = q.join(Product, Product.product_id == BOP.product_id).filter(
            Product.product_code == product_code,
        )
        q = scoped(q, Product, plan_id)
    bop = q.order_by(BOP.plan_id.desc().nullslast()).first()
    if not bop:
        return []

    processes = scoped(
        db.query(BOPProcess).filter(BOPProcess.bop_id == bop.bop_id),
        BOPProcess, plan_id,
    ).order_by(BOPProcess.sequence).all()

    result = []
    for proc in processes:
        operation = db.query(Operation).get(proc.operation_id)
        # 设备已与产线 1:1 绑定 — 必须按 line_id 过滤，避免拿到其它 line 的设备
        # 按 sort_order 升序：串联簇内的物料流向顺序（DES 引擎按这个顺序依次 emit 事件）
        equipments = scoped(
            db.query(Equipment).filter(
                Equipment.operation_id == proc.operation_id,
                Equipment.line_id == line_id,
                Equipment.status == "ACTIVE",
            ),
            Equipment, plan_id,
        ).order_by(Equipment.sort_order.asc().nullslast(), Equipment.equipment_id).all()

        eq_ids_for_resolve = [e.equipment_id for e in equipments]
        effective_ct = resolve_ct_for_operation(
            db, plan_id, proc.operation_id, float(proc.standard_ct),
            bop_process_id=proc.bop_process_id,
            line_id=line_id,
            equipment_ids=eq_ids_for_resolve,
        )

        # yield_rate 也走 override（同优先级）
        effective_yield = _resolve_override(
            db, plan_id,
            bop_process_id=proc.bop_process_id,
            operation_id=proc.operation_id, line_id=line_id,
            equipment_ids=eq_ids_for_resolve,
            param_key="yield_rate", default=float(proc.yield_rate),
        )
        if effective_yield is None:
            effective_yield = float(proc.yield_rate)

        # worker_count 也走 override（path 1：仅总人数兜底，不分工种）
        effective_workers = _resolve_override(
            db, plan_id,
            bop_process_id=proc.bop_process_id,
            operation_id=proc.operation_id, line_id=line_id,
            equipment_ids=eq_ids_for_resolve,
            param_key="worker_count", default=float(proc.standard_worker_count or 0),
        )
        if effective_workers is None:
            effective_workers = float(proc.standard_worker_count or 0)
        worker_count_int = max(0, int(round(effective_workers)))

        result.append(
            ResolvedProcess(
                bop_process_id=proc.bop_process_id,
                operation_id=proc.operation_id,
                operation_name=operation.operation_name if operation else "Unknown",
                sequence=proc.sequence,
                effective_ct=effective_ct,
                equipment_count=max(len(equipments), 1),
                equipment_ids=eq_ids_for_resolve,
                equipment_prim_paths=[e.creator_binding_id or "" for e in equipments],
                yield_rate=effective_yield,
                worker_count=worker_count_int,
                design_ct=float(proc.standard_ct),
            )
        )

    return result
