"""Plan version management API endpoints."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.res import SimulationResult
from app.models.sim import SimulationPlan
from app.models.tpl import PlanVersion
from app.schemas.sim import VersionCreate, VersionOut

router = APIRouter(prefix="/plans", tags=["Plan Versions"])


@router.get("/{plan_id}/versions", response_model=list[VersionOut])
def list_versions(plan_id: str, db: Session = Depends(get_db)):
    return (
        db.query(PlanVersion)
        .filter(PlanVersion.plan_id == plan_id)
        .order_by(PlanVersion.version_no.desc())
        .all()
    )


@router.post("/{plan_id}/versions", response_model=VersionOut, status_code=201)
def create_version(plan_id: str, body: VersionCreate, db: Session = Depends(get_db)):
    plan = db.query(SimulationPlan).get(plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")

    # Get next version number
    max_no = (
        db.query(PlanVersion.version_no)
        .filter(PlanVersion.plan_id == plan_id)
        .order_by(PlanVersion.version_no.desc())
        .first()
    )
    next_no = (max_no[0] + 1) if max_no else 1

    # Collect key metrics from result if available
    key_metrics = None
    result = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
    if result and result.computation_status == "SUCCESS":
        key_metrics = {
            "total_output": result.total_output,
            "output_per_hour": float(result.output_per_hour) if result.output_per_hour else None,
            "overall_lbr": float(result.overall_lbr) if result.overall_lbr else None,
        }

    version = PlanVersion(
        version_id=str(uuid.uuid4()),
        plan_id=plan_id,
        version_name=body.version_name,
        version_no=next_no,
        is_baseline=next_no == 1,
        key_metrics=key_metrics,
        notes=body.notes,
        archived_at=datetime.utcnow(),
        archived_by=plan.created_by,
    )
    db.add(version)
    db.commit()
    db.refresh(version)
    return version
