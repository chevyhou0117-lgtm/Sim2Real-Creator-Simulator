"""Static line balance simulation engine.

Calculates LBR (Line Balance Rate) for each production line based on
BOP process CTs and parameter overrides. No time progression — pure math.

Formula (from PRD Section 3.3):
    Takt Time = Available working seconds / Required output quantity
    LBR = Σ(CT_i) / (Bottleneck_CT × N_stations) × 100%
    Balance Loss Rate = 1 - LBR

Overall LBR is the station-count-weighted average of per-line LBR:
    Overall LBR = Σ(LBR_line × N_line) / Σ(N_line)
single-station lines excluded (their LBR is trivially 100%).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from app.engine.common import load_resolved_processes
from app.models.biz import ProductionTask
from app.models.md import ProductionLine, Shift, WorkCalendar
from app.models.res import LineBalanceResult, SimulationResult
from app.models.sim import SimulationPlan


def _calculate_available_seconds(db: Session, plan: SimulationPlan) -> float:
    """Calculate total available working seconds from work calendar / plan duration.

    If no work calendar data exists, fall back to plan.simulation_duration_hours.
    """
    # Try to get shifts from work calendar
    calendars = (
        db.query(WorkCalendar)
        .filter(
            WorkCalendar.factory_id == plan.factory_id,
            WorkCalendar.is_working_day == True,  # noqa: E712
        )
        .all()
    )

    if calendars:
        total_hours = 0.0
        for cal in calendars:
            shifts = db.query(Shift).filter(Shift.calendar_id == cal.calendar_id).all()
            for s in shifts:
                total_hours += float(s.work_hours)
        if total_hours > 0:
            return total_hours * 3600.0

    # Fallback: use plan duration directly
    return float(plan.simulation_duration_hours) * 3600.0


def _calculate_total_demand(db: Session, plan_id: str, line_id: str) -> int:
    """Sum plan_quantity for all production tasks on this line."""
    tasks = (
        db.query(ProductionTask)
        .filter(ProductionTask.plan_id == plan_id, ProductionTask.line_id == line_id)
        .all()
    )
    total = sum((t.plan_quantity - (t.completed_qty or 0)) for t in tasks)
    return max(total, 1)


def run_line_balance(db: Session, plan_id: str) -> list[LineBalanceResult]:
    """Execute static line balance calculation for all lines in the plan.

    Returns list of LineBalanceResult records (one per line).
    """
    plan = db.query(SimulationPlan).get(plan_id)
    if not plan:
        raise ValueError(f"Plan {plan_id} not found")

    # Get result record (should already exist with COMPUTING status)
    result = db.query(SimulationResult).filter(SimulationResult.plan_id == plan_id).first()
    if not result:
        raise ValueError(f"No SimulationResult found for plan {plan_id}")

    # Get all lines involved in production tasks
    task_line_ids = (
        db.query(ProductionTask.line_id)
        .filter(ProductionTask.plan_id == plan_id)
        .distinct()
        .all()
    )
    line_ids = [row[0] for row in task_line_ids]

    available_seconds = _calculate_available_seconds(db, plan)
    lb_results = []

    # Overall LBR = weighted average of per-line LBR, weighted by station count:
    #   Σ(LBR_i × N_i) / Σ(N_i)
    # Single-station lines have LBR ≡ 100% (CT / (CT × 1)) and would inflate the
    # metric, so they are excluded from the weighting.
    overall_weighted_lbr_sum = 0.0
    overall_weight_total = 0

    for line_id in line_ids:
        processes = load_resolved_processes(db, plan_id, line_id)
        if not processes:
            continue

        # Calculate demand for takt time
        demand = _calculate_total_demand(db, plan_id, line_id)
        takt_time = available_seconds / demand

        # Extract CTs
        cts = [p.effective_ct for p in processes]
        ct_sum = sum(cts)
        bottleneck_ct = max(cts)
        min_ct = min(cts)
        n_stations = len(processes)

        # LBR = Σ(CT) / (Bottleneck_CT × N_stations)
        lbr = ct_sum / (bottleneck_ct * n_stations) if bottleneck_ct > 0 else 0.0
        balance_loss = 1.0 - lbr

        # Identify bottleneck and idle operations
        bottleneck_proc = max(processes, key=lambda p: p.effective_ct)
        idle_proc = min(processes, key=lambda p: p.effective_ct)

        # Build operation load detail
        operation_detail = {}
        for p in processes:
            utilization = p.effective_ct / bottleneck_ct if bottleneck_ct > 0 else 0
            takt_deviation = p.effective_ct - takt_time
            operation_detail[p.operation_id] = {
                "operation_name": p.operation_name,
                "sequence": p.sequence,
                "design_ct": p.design_ct,
                "effective_ct": p.effective_ct,
                "equipment_count": p.equipment_count,
                "worker_count": p.worker_count,
                "utilization": round(utilization, 4),
                "takt_deviation": round(takt_deviation, 3),
                "is_bottleneck": p.effective_ct == bottleneck_ct,
                "is_idle": p.effective_ct < takt_time * 0.7,
            }

        lb_result = LineBalanceResult(
            lb_result_id=str(uuid.uuid4()),
            result_id=result.result_id,
            line_id=line_id,
            takt_time=round(takt_time, 3),
            lbr=round(lbr, 4),
            balance_loss_rate=round(balance_loss, 4),
            bottleneck_operation_id=bottleneck_proc.operation_id,
            bottleneck_ct=round(bottleneck_ct, 3),
            idle_operation_id=idle_proc.operation_id,
            operation_load_detail=operation_detail,
        )
        db.add(lb_result)
        lb_results.append(lb_result)

        # Accumulate for overall LBR (weighted by station count, excluding
        # single-station lines whose LBR is trivially 100%)
        if n_stations > 1:
            overall_weighted_lbr_sum += lbr * n_stations
            overall_weight_total += n_stations

    # Update overall result
    if overall_weight_total > 0:
        result.overall_lbr = round(
            overall_weighted_lbr_sum / overall_weight_total, 4
        )

    db.commit()
    return lb_results
