"""BOP management endpoints: activate a version, create a new version."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.md import BOP, BOPProcess, OperationTransition
from app.schemas.md import BOPOut

router = APIRouter(prefix="/bops", tags=["BOP"])


class NewVersionRequest(BaseModel):
    new_version: str
    activate: bool = False


@router.post("/{bop_id}/activate", response_model=BOPOut)
def activate_bop(bop_id: str, db: Session = Depends(get_db)):
    """Activate this BOP and deactivate all other BOPs on the same production line."""
    bop = db.query(BOP).filter(BOP.bop_id == bop_id).first()
    if not bop:
        raise HTTPException(404, "BOP not found")

    db.query(BOP).filter(
        BOP.line_id == bop.line_id,
        BOP.bop_id != bop_id,
    ).update({"is_active": False}, synchronize_session=False)

    bop.is_active = True
    db.commit()
    db.refresh(bop)
    return bop


@router.post("/{bop_id}/new-version", response_model=BOPOut)
def create_new_version(
    bop_id: str,
    payload: NewVersionRequest,
    db: Session = Depends(get_db),
):
    """Clone an existing BOP into a new version. Copies all BOPProcess and OperationTransition rows."""
    source = db.query(BOP).filter(BOP.bop_id == bop_id).first()
    if not source:
        raise HTTPException(404, "Source BOP not found")

    duplicate = (
        db.query(BOP)
        .filter(
            BOP.line_id == source.line_id,
            BOP.product_id == source.product_id,
            BOP.bop_version == payload.new_version,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(409, f"Version '{payload.new_version}' already exists on this line")

    new_bop = BOP(
        product_id=source.product_id,
        line_id=source.line_id,
        bop_version=payload.new_version,
        is_active=False,
        effective_date=source.effective_date,
        created_by=source.created_by,
    )
    db.add(new_bop)
    db.flush()

    for proc in source.processes:
        db.add(BOPProcess(
            bop_id=new_bop.bop_id,
            operation_id=proc.operation_id,
            sequence=proc.sequence,
            standard_ct=proc.standard_ct,
            panel_qty=proc.panel_qty,
            ct_per_panel=proc.ct_per_panel,
            yield_rate=proc.yield_rate,
            standard_worker_count=proc.standard_worker_count,
            min_worker_count=proc.min_worker_count,
            primary_material_type=proc.primary_material_type,
            sop_ref=proc.sop_ref,
            sop_content=proc.sop_content,
        ))

    for tr in source.transitions:
        db.add(OperationTransition(
            bop_id=new_bop.bop_id,
            from_operation_id=tr.from_operation_id,
            to_operation_id=tr.to_operation_id,
            transfer_time=tr.transfer_time,
        ))

    if payload.activate:
        db.query(BOP).filter(
            BOP.line_id == source.line_id,
            BOP.bop_id != new_bop.bop_id,
        ).update({"is_active": False}, synchronize_session=False)
        new_bop.is_active = True

    db.commit()
    db.refresh(new_bop)
    return new_bop
