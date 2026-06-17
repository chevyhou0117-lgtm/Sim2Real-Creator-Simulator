"""方案级主数据 CRUD API。

允许用户在方案 DRAFT/READY 期间，在方案视图里"假设性地"新增/修改/删除
产线、设备等基础数据实体（PRD §2.1.x R416）。

实现要点：
- 所有写入操作要求 plan.status ∈ {DRAFT, READY}
- 新增的行 plan_id = path 中的 plan_id（用户主动写入，按 R416 必填）
- PATCH 只能改 plan-scoped 行（plan_id 非空那条）；如果用户编辑的是主数据行，
  先克隆出一份 plan-scoped 副本再改
- DELETE 只删 plan-scoped 行（恢复主数据可见性）；主数据行不可删
"""

from __future__ import annotations

import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.md import Equipment, EquipmentProcessParameters, ProductionLine
from app.models.sim import SimulationPlan
from app.schemas.md import EquipmentOut, ProductionLineOut

router = APIRouter(prefix="/plans/{plan_id}/master-data", tags=["Plan-scoped Master Data"])


def _get_writable_plan(db: Session, plan_id: str) -> SimulationPlan:
    plan = db.query(SimulationPlan).get(plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")
    if plan.status not in ("DRAFT", "READY"):
        raise HTTPException(400, f"Plan in {plan.status} state, master-data not editable")
    return plan


# ---------------------------------------------------------------------------
# ProductionLine
# ---------------------------------------------------------------------------
class PlanLineCreate(BaseModel):
    stage_id: str
    line_code: str
    line_name: str
    smt_pph: float | None = None
    operation_count: int | None = None
    sort_order: int | None = None
    creator_binding_id: str | None = None
    status: str = "ACTIVE"


class PlanLineUpdate(BaseModel):
    stage_id: str | None = None
    line_code: str | None = None
    line_name: str | None = None
    smt_pph: float | None = None
    operation_count: int | None = None
    sort_order: int | None = None
    creator_binding_id: str | None = None
    status: str | None = None


@router.post("/lines", response_model=ProductionLineOut, status_code=201)
def create_line(plan_id: str, body: PlanLineCreate, db: Session = Depends(get_db)):
    """方案内新增一条虚拟产线（plan_id=path-plan_id）。"""
    _get_writable_plan(db, plan_id)
    line = ProductionLine(
        line_id=str(uuid.uuid4()),
        plan_id=plan_id,
        **body.model_dump(),
    )
    db.add(line)
    db.commit()
    db.refresh(line)
    return line


@router.patch("/lines/{line_id}", response_model=ProductionLineOut)
def update_line(plan_id: str, line_id: str, body: PlanLineUpdate, db: Session = Depends(get_db)):
    """编辑方案级产线。若指向主数据行，先 fork 一份 plan-scoped 副本再改。"""
    _get_writable_plan(db, plan_id)
    line = db.query(ProductionLine).filter(ProductionLine.line_id == line_id).first()
    if not line:
        raise HTTPException(404, "Line not found")
    # 主数据行 → fork 出一个 plan-scoped 副本（保留同 line_id 不可能，PK 唯一；故用新 UUID）
    if line.plan_id is None:
        forked = ProductionLine(
            line_id=str(uuid.uuid4()),
            plan_id=plan_id,
            stage_id=line.stage_id,
            line_code=line.line_code,
            line_name=line.line_name,
            smt_pph=line.smt_pph,
            operation_count=line.operation_count,
            sort_order=line.sort_order,
            creator_binding_id=line.creator_binding_id,
            status=line.status,
        )
        db.add(forked)
        db.flush()
        line = forked
    elif line.plan_id != plan_id:
        raise HTTPException(403, "Line belongs to another plan")
    # 应用更新
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(line, k, v)
    db.commit()
    db.refresh(line)
    return line


@router.delete("/lines/{line_id}", status_code=204)
def delete_line(plan_id: str, line_id: str, db: Session = Depends(get_db)):
    """删除方案级产线快照行。主数据行不可删（只能 fork 后再删 fork）。"""
    _get_writable_plan(db, plan_id)
    line = db.query(ProductionLine).filter(ProductionLine.line_id == line_id).first()
    if not line:
        raise HTTPException(404, "Line not found")
    if line.plan_id is None:
        raise HTTPException(400, "Cannot delete canonical (main) data row from plan scope")
    if line.plan_id != plan_id:
        raise HTTPException(403, "Line belongs to another plan")
    db.delete(line)
    db.commit()


# ---------------------------------------------------------------------------
# Equipment
# ---------------------------------------------------------------------------
class PlanEquipmentCreate(BaseModel):
    operation_id: str
    line_id: str
    equipment_code: str
    equipment_name: str
    equipment_type: str
    manufacturer: str | None = None
    model_no: str | None = None
    creator_binding_id: str | None = None
    status: str = "ACTIVE"
    sort_order: int | None = None
    # 同时落 EquipmentProcessParameters（设备级默认参数）
    standard_ct: float | None = None
    standard_yield_rate: float | None = None
    standard_work_efficiency: float | None = None
    standard_worker_count: int | None = None


class PlanEquipmentUpdate(BaseModel):
    operation_id: str | None = None
    line_id: str | None = None
    equipment_code: str | None = None
    equipment_name: str | None = None
    equipment_type: str | None = None
    manufacturer: str | None = None
    model_no: str | None = None
    creator_binding_id: str | None = None
    status: str | None = None
    sort_order: int | None = None


@router.post("/equipment", response_model=EquipmentOut, status_code=201)
def create_equipment(plan_id: str, body: PlanEquipmentCreate, db: Session = Depends(get_db)):
    """方案内新增一台设备 + 同时建一条 EquipmentProcessParameters。"""
    _get_writable_plan(db, plan_id)
    eq_id = str(uuid.uuid4())
    eq = Equipment(
        equipment_id=eq_id,
        plan_id=plan_id,
        operation_id=body.operation_id,
        line_id=body.line_id,
        equipment_code=body.equipment_code,
        equipment_name=body.equipment_name,
        equipment_type=body.equipment_type,
        manufacturer=body.manufacturer,
        model_no=body.model_no,
        creator_binding_id=body.creator_binding_id,
        status=body.status,
        sort_order=body.sort_order,
    )
    db.add(eq)
    db.flush()
    # 工艺参数（设备级）
    if any(v is not None for v in (body.standard_ct, body.standard_yield_rate,
                                    body.standard_work_efficiency, body.standard_worker_count)):
        pp = EquipmentProcessParameters(
            id=str(uuid.uuid4()),
            plan_id=plan_id,
            equipment_id=eq_id,
            standard_ct=Decimal(str(body.standard_ct)) if body.standard_ct is not None else None,
            standard_yield_rate=Decimal(str(body.standard_yield_rate)) if body.standard_yield_rate is not None else None,
            standard_work_efficiency=Decimal(str(body.standard_work_efficiency)) if body.standard_work_efficiency is not None else None,
            standard_worker_count=body.standard_worker_count,
        )
        db.add(pp)
    db.commit()
    db.refresh(eq)
    # 把 PP 字段补回 response
    pp_row = db.query(EquipmentProcessParameters).filter(
        EquipmentProcessParameters.equipment_id == eq_id,
        EquipmentProcessParameters.plan_id == plan_id,
    ).first()
    return EquipmentOut(
        equipment_id=eq.equipment_id,
        operation_id=eq.operation_id,
        line_id=eq.line_id,
        equipment_code=eq.equipment_code,
        equipment_name=eq.equipment_name,
        equipment_type=eq.equipment_type,
        manufacturer=eq.manufacturer,
        model_no=eq.model_no,
        status=eq.status,
        creator_binding_id=eq.creator_binding_id,
        standard_ct=pp_row.standard_ct if pp_row else None,
        standard_yield_rate=pp_row.standard_yield_rate if pp_row else None,
        standard_work_efficiency=pp_row.standard_work_efficiency if pp_row else None,
        standard_worker_count=pp_row.standard_worker_count if pp_row else None,
    )


@router.patch("/equipment/{equipment_id}", response_model=EquipmentOut)
def update_equipment(plan_id: str, equipment_id: str, body: PlanEquipmentUpdate, db: Session = Depends(get_db)):
    """编辑方案级设备。若指向主数据行，先 fork 一份 plan-scoped 副本再改。"""
    _get_writable_plan(db, plan_id)
    eq = db.query(Equipment).filter(Equipment.equipment_id == equipment_id).first()
    if not eq:
        raise HTTPException(404, "Equipment not found")
    if eq.plan_id is None:
        # fork
        forked = Equipment(
            equipment_id=str(uuid.uuid4()),
            plan_id=plan_id,
            operation_id=eq.operation_id,
            line_id=eq.line_id,
            equipment_code=eq.equipment_code,
            equipment_name=eq.equipment_name,
            equipment_type=eq.equipment_type,
            manufacturer=eq.manufacturer,
            model_no=eq.model_no,
            creator_binding_id=eq.creator_binding_id,
            status=eq.status,
            sort_order=eq.sort_order,
        )
        db.add(forked)
        db.flush()
        # 同时 fork process_params（如有主数据行）
        canonical_pp = db.query(EquipmentProcessParameters).filter(
            EquipmentProcessParameters.equipment_id == equipment_id,
            EquipmentProcessParameters.plan_id.is_(None),
        ).first()
        if canonical_pp:
            db.add(EquipmentProcessParameters(
                id=str(uuid.uuid4()),
                plan_id=plan_id,
                equipment_id=forked.equipment_id,
                standard_ct=canonical_pp.standard_ct,
                standard_yield_rate=canonical_pp.standard_yield_rate,
                standard_work_efficiency=canonical_pp.standard_work_efficiency,
                standard_worker_count=canonical_pp.standard_worker_count,
            ))
            db.flush()
        eq = forked
    elif eq.plan_id != plan_id:
        raise HTTPException(403, "Equipment belongs to another plan")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(eq, k, v)
    db.commit()
    db.refresh(eq)
    pp_row = db.query(EquipmentProcessParameters).filter(
        EquipmentProcessParameters.equipment_id == eq.equipment_id,
        EquipmentProcessParameters.plan_id == plan_id,
    ).first()
    return EquipmentOut(
        equipment_id=eq.equipment_id,
        operation_id=eq.operation_id,
        line_id=eq.line_id,
        equipment_code=eq.equipment_code,
        equipment_name=eq.equipment_name,
        equipment_type=eq.equipment_type,
        manufacturer=eq.manufacturer,
        model_no=eq.model_no,
        status=eq.status,
        creator_binding_id=eq.creator_binding_id,
        standard_ct=pp_row.standard_ct if pp_row else None,
        standard_yield_rate=pp_row.standard_yield_rate if pp_row else None,
        standard_work_efficiency=pp_row.standard_work_efficiency if pp_row else None,
        standard_worker_count=pp_row.standard_worker_count if pp_row else None,
    )


@router.delete("/equipment/{equipment_id}", status_code=204)
def delete_equipment(plan_id: str, equipment_id: str, db: Session = Depends(get_db)):
    _get_writable_plan(db, plan_id)
    eq = db.query(Equipment).filter(Equipment.equipment_id == equipment_id).first()
    if not eq:
        raise HTTPException(404, "Equipment not found")
    if eq.plan_id is None:
        raise HTTPException(400, "Cannot delete canonical (main) data row from plan scope")
    if eq.plan_id != plan_id:
        raise HTTPException(403, "Equipment belongs to another plan")
    # ondelete=CASCADE 会自动清理 process_params 等子表，但子表的 FK 没设 ON DELETE CASCADE。
    # 显式清理 plan-scoped process_params。
    db.query(EquipmentProcessParameters).filter(
        EquipmentProcessParameters.equipment_id == equipment_id,
        EquipmentProcessParameters.plan_id == plan_id,
    ).delete(synchronize_session=False)
    db.delete(eq)
    db.commit()


# ---------------------------------------------------------------------------
# 全局同步：从当前主数据重新整厂快照（硬覆盖）
# ---------------------------------------------------------------------------
class ResyncResult(BaseModel):
    plan_id: str
    base_data_version: str | None
    rows_by_table: dict[str, int]
    total_rows: int
    biz_refs_rewritten: int


@router.post(":resync", response_model=ResyncResult)
def resync_master_data(plan_id: str, db: Session = Depends(get_db)):
    """从主数据平台当前状态【硬覆盖】重新整厂快照本方案。

    ⚠️ 会清空本方案全部 md 快照副本（含用户在方案内手加/手改的产线、设备 CT 等）
    再按最新主数据重灌。biz 数据（工单/任务/库存导入）不在快照范围，不受影响。
    前端须二次确认后才调用。仅 DRAFT/READY 可同步。
    """
    _get_writable_plan(db, plan_id)
    from app.services.snapshot import (
        find_orphan_biz_refs,
        resync_master_data_for_plan,
    )

    # 前置校验：若 biz 引用了全局已不存在的编码（典型：方案内手加、全局无孪生的
    # 产线/设备），同步会令其悬空 → 直接 422 拒绝并列出，不静默丢数据。
    orphans = find_orphan_biz_refs(db, plan_id)
    if orphans:
        raise HTTPException(
            422,
            detail={
                "message": f"同步会令 {len(orphans)} 处业务数据引用悬空，已拒绝。"
                f"请先调整这些 task/供应/库存/WIP 行后再同步。",
                "orphans": orphans[:50],
            },
        )

    try:
        counts = resync_master_data_for_plan(db, plan_id)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"主数据同步失败：{e}") from e

    biz_rewritten = counts.pop("_biz_refs_rewritten", 0)
    plan = db.query(SimulationPlan).get(plan_id)
    return ResyncResult(
        plan_id=plan_id,
        base_data_version=plan.base_data_version if plan else None,
        rows_by_table=counts,
        total_rows=sum(counts.values()),
        biz_refs_rewritten=biz_rewritten,
    )
