"""Report export API endpoints."""

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.models.res import LineBalanceResult, SimulationResult, SimulationStateSnapshot
from app.models.sim import SimulationPlan
from app.schemas.sim import ExportRequest

router = APIRouter(prefix="/plans", tags=["Export"])


@router.post("/{plan_id}/export")
def export_report(plan_id: str, body: ExportRequest, db: Session = Depends(get_db)):
    plan = db.query(SimulationPlan).get(plan_id)
    if not plan:
        raise HTTPException(404, "Plan not found")

    result = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
    if not result:
        raise HTTPException(404, "No simulation result found")

    report: dict = {
        "title": body.title or plan.plan_name,
        "plan_id": plan_id,
        "plan_name": plan.plan_name,
        "format": body.format,
        "language": body.language,
        "generated_at": result.computation_end.isoformat() if result.computation_end else None,
    }

    modules = body.modules

    if "summary" in modules or not modules:
        report["summary"] = {
            "computation_status": result.computation_status,
            "total_output": result.total_output,
            "output_per_hour": float(result.output_per_hour) if result.output_per_hour else None,
            "overall_lbr": float(result.overall_lbr) if result.overall_lbr else None,
            "bottleneck_utilization": float(result.bottleneck_utilization) if result.bottleneck_utilization else None,
            "equipment_failure_count": result.equipment_failure_count,
        }

    if "line_balance" in modules or not modules:
        lb_results = db.query(LineBalanceResult).filter(LineBalanceResult.result_id == result.result_id).all()
        report["line_balance"] = [
            {
                "line_id": lb.line_id,
                "lbr": float(lb.lbr),
                "takt_time": float(lb.takt_time),
                "bottleneck_ct": float(lb.bottleneck_ct) if lb.bottleneck_ct else None,
                "balance_loss_rate": float(lb.balance_loss_rate),
                "operation_load_detail": lb.operation_load_detail,
            }
            for lb in lb_results
        ]

    if "events" in modules:
        snapshots = (
            db.query(SimulationStateSnapshot)
            .filter(SimulationStateSnapshot.result_id == result.result_id)
            .order_by(SimulationStateSnapshot.sim_timestamp_sec)
            .limit(100)
            .all()
        )
        report["event_snapshots_count"] = len(snapshots)

    return JSONResponse(content=report)
