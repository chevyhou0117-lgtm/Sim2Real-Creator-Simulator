"""Business data snapshot layer models (biz_ prefix)."""

import uuid

from sqlalchemy import (
    Column,
    Date,
    DateTime,
    Index,
    Numeric,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# biz_work_order
# ---------------------------------------------------------------------------
class WorkOrder(Base):
    __tablename__ = "biz_work_order"

    wo_id = Column(String(36), primary_key=True, default=_uuid)
    # WO 当主数据看：plan_id IS NULL 为全局工单（seed 提供），建方案时随快照克隆为
    # 方案专属副本（plan_id=X）。与 md_* 同一 canonical/scoped partial-unique 模式。
    plan_id = Column(
        String(36),
        ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    wo_no = Column(String(50), nullable=False)
    order_no = Column(String(50))
    product_code = Column(String(50), nullable=False)
    product_name = Column(String(200))
    product_model = Column(String(100))
    pcb_layer = Column(Integer)
    board_size = Column(String(50))
    total_comp_qty = Column(Integer)
    small_comp_qty = Column(Integer)
    bga_qty = Column(Integer)
    connector_qty = Column(Integer)
    panel_qty = Column(Integer)
    plan_qty = Column(Integer, nullable=False)
    completed_qty = Column(Integer)
    qualified_qty = Column(Integer)
    plan_hours = Column(Numeric(10, 2))
    process_route = Column(Text)
    data_source = Column(String(30), nullable=False)
    source_system = Column(String(50))
    sync_time = Column(DateTime)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        Index("uq_wo_canonical", "wo_no", unique=True,
              postgresql_where=text("plan_id IS NULL")),
        Index("uq_wo_scoped", "plan_id", "wo_no", unique=True,
              postgresql_where=text("plan_id IS NOT NULL")),
    )

    plan = relationship("SimulationPlan", back_populates="work_orders")
    production_tasks = relationship("ProductionTask", back_populates="work_order")


# ---------------------------------------------------------------------------
# biz_production_task
# ---------------------------------------------------------------------------
class ProductionTask(Base):
    __tablename__ = "biz_production_task"

    task_id = Column(String(36), primary_key=True, default=_uuid)
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id"), nullable=False)
    wo_id = Column(String(36), ForeignKey("biz_work_order.wo_id"))
    stage_id = Column(String(36), ForeignKey("md_stage.stage_id"), nullable=False)
    line_id = Column(String(36), ForeignKey("md_production_line.line_id"), nullable=False)
    product_code = Column(String(50), nullable=False)
    plan_quantity = Column(Integer, nullable=False)
    completed_qty = Column(Integer)
    qualified_qty = Column(Integer)
    production_sequence = Column(Integer, nullable=False)
    data_source = Column(String(30), nullable=False)
    source_system = Column(String(50))
    sync_time = Column(DateTime)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    plan = relationship("SimulationPlan", back_populates="production_tasks")
    work_order = relationship("WorkOrder", back_populates="production_tasks")
    stage = relationship("Stage")
    production_line = relationship("ProductionLine")


# ---------------------------------------------------------------------------
# biz_material_supply
# ---------------------------------------------------------------------------
class MaterialSupply(Base):
    __tablename__ = "biz_material_supply"

    supply_id = Column(String(36), primary_key=True, default=_uuid)
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id"), nullable=False)
    material_code = Column(String(50), nullable=False)
    material_name = Column(String(200))
    supply_quantity = Column(Numeric(15, 3), nullable=False)
    arrival_sim_hour = Column(Numeric(7, 2), nullable=False)
    target_warehouse_id = Column(String(36), ForeignKey("md_warehouse.warehouse_id"), nullable=False)
    data_source = Column(String(30), nullable=False)
    sync_time = Column(DateTime)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    plan = relationship("SimulationPlan", back_populates="material_supplies")
    warehouse = relationship("Warehouse")


# ---------------------------------------------------------------------------
# biz_inventory_snapshot
# ---------------------------------------------------------------------------
class InventorySnapshot(Base):
    __tablename__ = "biz_inventory_snapshot"

    snapshot_id = Column(String(36), primary_key=True, default=_uuid)
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id"), nullable=False)
    warehouse_id = Column(String(36), ForeignKey("md_warehouse.warehouse_id"), nullable=False)
    material_code = Column(String(50), nullable=False)
    total_quantity = Column(Numeric(15, 3), nullable=False)
    available_quantity = Column(Numeric(15, 3), nullable=False)
    snapshot_time = Column(DateTime, nullable=False)
    data_source = Column(String(30), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    plan = relationship("SimulationPlan", back_populates="inventory_snapshots")
    warehouse = relationship("Warehouse")


# ---------------------------------------------------------------------------
# biz_demand_forecast
# ---------------------------------------------------------------------------
class DemandForecast(Base):
    __tablename__ = "biz_demand_forecast"

    forecast_id = Column(String(36), primary_key=True, default=_uuid)
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id"), nullable=False)
    product_code = Column(String(50), nullable=False)
    product_name = Column(String(200))
    time_granularity = Column(String(10), nullable=False)
    period_label = Column(String(20), nullable=False)
    period_start_date = Column(Date, nullable=False)
    period_end_date = Column(Date, nullable=False)
    demand_quantity = Column(Numeric(15, 3), nullable=False)
    data_source = Column(String(30), nullable=False)
    source_system = Column(String(50))
    sync_time = Column(DateTime)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    plan = relationship("SimulationPlan", back_populates="demand_forecasts")


# ---------------------------------------------------------------------------
# biz_wip_buffer_snapshot
# ---------------------------------------------------------------------------
class WIPBufferSnapshot(Base):
    __tablename__ = "biz_wip_buffer_snapshot"

    wip_snapshot_id = Column(String(36), primary_key=True, default=_uuid)
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id"), nullable=False)
    wip_id = Column(String(36), ForeignKey("md_wip_buffer.wip_id"), nullable=False)
    material_code = Column(String(50), nullable=False)
    current_quantity = Column(Numeric(15, 3), nullable=False)
    current_volume = Column(Numeric(15, 6), nullable=False)
    snapshot_time = Column(DateTime, nullable=False)
    data_source = Column(String(30), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    plan = relationship("SimulationPlan", back_populates="wip_buffer_snapshots")
    wip_buffer = relationship("WIPBuffer")
