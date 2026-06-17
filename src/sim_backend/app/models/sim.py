"""Simulation plan layer models (sim_ prefix)."""

import uuid

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Numeric,
    ForeignKey,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# sim_simulation_plan
# ---------------------------------------------------------------------------
class SimulationPlan(Base):
    __tablename__ = "sim_simulation_plan"

    plan_id = Column(String(36), primary_key=True, default=_uuid)
    plan_name = Column(String(200), nullable=False)
    plan_description = Column(Text)
    factory_id = Column(String(36), ForeignKey("md_factory.factory_id"), nullable=False)
    status = Column(String(20), nullable=False, default="DRAFT")
    enabled_simulators = Column(JSONB, nullable=False)
    # True = 隔离模式（每条线独立跑 task，不跨 stage 联动）；False = WO 模式（按 wo_id 链路跨 stage 路由）
    ignore_wo = Column(Boolean, nullable=False, default=False)
    simulation_duration_hours = Column(Numeric(7, 2), nullable=False)
    base_data_version = Column(String(50))
    parameter_template_id = Column(String(36), ForeignKey("tpl_parameter_template.template_id"))
    input_template_id = Column(String(36))
    creator_project_id = Column(String(36), ForeignKey("md_creator_project.creator_project_id"))
    created_by = Column(String(50), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    factory = relationship("Factory", foreign_keys=[factory_id])
    creator_project = relationship("CreatorProject", foreign_keys=[creator_project_id])
    constraints = relationship("SoftConstraintConfig", back_populates="plan")
    overrides = relationship("ParameterOverride", back_populates="plan")
    anomalies = relationship("AnomalyInjection", back_populates="plan")
    work_orders = relationship("WorkOrder", back_populates="plan")
    production_tasks = relationship("ProductionTask", back_populates="plan")
    material_supplies = relationship("MaterialSupply", back_populates="plan")
    inventory_snapshots = relationship("InventorySnapshot", back_populates="plan")
    demand_forecasts = relationship("DemandForecast", back_populates="plan")
    wip_buffer_snapshots = relationship("WIPBufferSnapshot", back_populates="plan")
    result = relationship("SimulationResult", back_populates="plan", uselist=False)
    versions = relationship("PlanVersion", back_populates="plan")


# ---------------------------------------------------------------------------
# sim_soft_constraint_config
# ---------------------------------------------------------------------------
class SoftConstraintConfig(Base):
    __tablename__ = "sim_soft_constraint_config"

    constraint_id = Column(String(36), primary_key=True, default=_uuid)
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id"), nullable=False)
    constraint_type = Column(String(50), nullable=False)
    is_enabled = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (UniqueConstraint("plan_id", "constraint_type"),)

    plan = relationship("SimulationPlan", back_populates="constraints")


# ---------------------------------------------------------------------------
# sim_parameter_override
# ---------------------------------------------------------------------------
class ParameterOverride(Base):
    __tablename__ = "sim_parameter_override"

    override_id = Column(String(36), primary_key=True, default=_uuid)
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id"), nullable=False)
    scope_type = Column(String(30), nullable=False)
    scope_id = Column(String(36))
    param_key = Column(String(50), nullable=False)
    param_value = Column(String(200), nullable=False)
    time_range_start = Column(Numeric(7, 2))
    time_range_end = Column(Numeric(7, 2))
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    plan = relationship("SimulationPlan", back_populates="overrides")


# ---------------------------------------------------------------------------
# sim_anomaly_injection
# ---------------------------------------------------------------------------
class AnomalyInjection(Base):
    __tablename__ = "sim_anomaly_injection"

    anomaly_id = Column(String(36), primary_key=True, default=_uuid)
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id"), nullable=False)
    anomaly_type = Column(String(30), nullable=False)
    target_id = Column(String(36), nullable=False)
    start_sim_hour = Column(Numeric(7, 2), nullable=False)
    duration_minutes = Column(Numeric(10, 2), nullable=False)
    description = Column(String(500))
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    plan = relationship("SimulationPlan", back_populates="anomalies")
