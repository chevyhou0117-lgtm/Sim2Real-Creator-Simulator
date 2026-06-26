"""Base data layer models (md_ prefix) — read-only cache from master data platform."""

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    Time,
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
# Plan-scoped unique helpers — PRD §2.1.x 基础数据快照机制
# 同一逻辑实体（如设备编码）允许在主数据（plan_id IS NULL）和各方案快照（plan_id 非空）
# 各持一行；原来的全表 UNIQUE 拆成两条 partial index：
#   * canonical = "WHERE plan_id IS NULL"   → 主数据全局唯一
#   * scoped    = "WHERE plan_id IS NOT NULL" → 同方案内唯一（含 plan_id 列）
# ---------------------------------------------------------------------------
_PLAN_NULL = text("plan_id IS NULL")
_PLAN_NOTNULL = text("plan_id IS NOT NULL")


def _scoped_unique(name_prefix: str, *cols: str) -> tuple[Index, Index]:
    return (
        Index(f"uq_{name_prefix}_canonical", *cols, unique=True, postgresql_where=_PLAN_NULL),
        Index(f"uq_{name_prefix}_scoped", "plan_id", *cols, unique=True, postgresql_where=_PLAN_NOTNULL),
    )


# ---------------------------------------------------------------------------
# md_factory
# ---------------------------------------------------------------------------
class Factory(Base):
    __tablename__ = "md_factory"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    factory_id = Column(String(36), primary_key=True, default=_uuid)
    factory_code = Column(String(50), nullable=False)
    factory_name = Column(String(200), nullable=False)
    location = Column(String(500))
    site_length = Column(Numeric(10, 2))  # 厂房尺寸（米）— Creator base_factory 迁移而来
    site_width = Column(Numeric(10, 2))   # 厂房尺寸（米）— Creator base_factory 迁移而来
    timezone = Column(String(50), nullable=False)
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = _scoped_unique("factory_code", "factory_code")

    stages = relationship("Stage", back_populates="factory")
    warehouses = relationship("Warehouse", back_populates="factory")
    work_calendars = relationship("WorkCalendar", back_populates="factory")
    worker_types = relationship("WorkerType", back_populates="factory")


# ---------------------------------------------------------------------------
# md_stage
# ---------------------------------------------------------------------------
class Stage(Base):
    __tablename__ = "md_stage"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    stage_id = Column(String(36), primary_key=True, default=_uuid)
    factory_id = Column(String(36), ForeignKey("md_factory.factory_id"), nullable=False)
    stage_code = Column(String(50), nullable=False)
    stage_name = Column(String(200), nullable=False)
    sequence = Column(Integer, nullable=False)
    stage_type = Column(String(50), nullable=False)
    line_count = Column(Integer)
    status = Column(String(20), nullable=False, default="ACTIVE")
    creator_binding_id = Column(String(500))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = _scoped_unique("stage_code", "factory_id", "stage_code")

    factory = relationship("Factory", back_populates="stages")
    production_lines = relationship("ProductionLine", back_populates="stage")
    operations = relationship("Operation", back_populates="stage")


# ---------------------------------------------------------------------------
# md_production_line
# ---------------------------------------------------------------------------
class ProductionLine(Base):
    __tablename__ = "md_production_line"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    line_id = Column(String(36), primary_key=True, default=_uuid)
    stage_id = Column(String(36), ForeignKey("md_stage.stage_id"), nullable=False)
    line_code = Column(String(50), nullable=False)
    line_name = Column(String(200), nullable=False)
    smt_pph = Column(Numeric(10, 2))
    operation_count = Column(Integer)
    status = Column(String(20), nullable=False, default="ACTIVE")
    sort_order = Column(Integer)
    creator_binding_id = Column(String(500))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = _scoped_unique("line_code", "stage_id", "line_code")

    stage = relationship("Stage", back_populates="production_lines")
    wip_buffers = relationship("WIPBuffer", back_populates="production_line")
    bops = relationship("BOP", back_populates="production_line")


# ---------------------------------------------------------------------------
# md_operation
# ---------------------------------------------------------------------------
class Operation(Base):
    __tablename__ = "md_operation"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    operation_id = Column(String(36), primary_key=True, default=_uuid)
    stage_id = Column(String(36), ForeignKey("md_stage.stage_id"), nullable=False)
    operation_code = Column(String(50), nullable=False)
    operation_name = Column(String(200), nullable=False)
    # 中文显示名：seed 期 operation_name 全是英文，前端树用中文更友好。NULL 时 fallback 用 operation_name。
    operation_name_cn = Column(String(200), nullable=True)
    sequence = Column(Integer, nullable=False)
    operation_type = Column(String(50))
    is_key_operation = Column(Boolean, default=False)
    status = Column(String(20), nullable=False, default="ACTIVE")
    creator_binding_id = Column(String(500))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = _scoped_unique("operation_code", "stage_id", "operation_code")

    stage = relationship("Stage", back_populates="operations")
    equipments = relationship("Equipment", back_populates="operation")
    staffing_configs = relationship("StaffingConfig", back_populates="operation")


# ---------------------------------------------------------------------------
# md_equipment
# ---------------------------------------------------------------------------
class Equipment(Base):
    """设备/工位基础数据。每条 line 各有独立物理 equipment 实例（line_id 必填）。
    工艺参数（standard_ct/yield/efficiency）已迁出至 EquipmentProcessParameters 子表。"""

    __tablename__ = "md_equipment"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    equipment_id = Column(String(36), primary_key=True, default=_uuid)
    operation_id = Column(String(36), ForeignKey("md_operation.operation_id"), nullable=False)
    line_id = Column(String(36), ForeignKey("md_production_line.line_id"), nullable=False)
    equipment_code = Column(String(50), nullable=False)
    equipment_name = Column(String(200), nullable=False)
    equipment_type = Column(String(50), nullable=False)
    equipment_group_id = Column(String(50))  # 设备组（外部表未构建）
    brand = Column(String(200))
    manufacturer = Column(String(200))
    model_no = Column(String(100))
    manufacture_date = Column(DateTime)
    manufacture_code = Column(String(50))
    made_in = Column(String(50))
    supplier = Column(String(50))
    supplier_phone = Column(String(50))
    purchase_date = Column(DateTime)
    service_life = Column(Integer)
    status = Column(String(20), nullable=False, default="ACTIVE")
    sort_order = Column(Integer)
    unit = Column(String(20))
    location = Column(String(50))
    equipment_photo = Column(String(500))  # 路径
    responsible_person = Column(String(50))
    asset_code = Column(String(50))
    creator_binding_id = Column(String(500))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    # equipment_code uniqueness 工厂内唯一 — 跨表难强约束，应用层保证

    operation = relationship("Operation", back_populates="equipments")
    production_line = relationship("ProductionLine")
    failure_param = relationship("EquipmentFailureParam", back_populates="equipment", uselist=False)
    technical_specification = relationship("EquipmentTechnicalSpecification", back_populates="equipment", uselist=False)
    process_parameters = relationship("EquipmentProcessParameters", back_populates="equipment", uselist=False)
    bom_parts = relationship("EquipmentBOMPart", back_populates="equipment")
    sops = relationship("EquipmentSOP", back_populates="equipment")
    operation_records = relationship("EquipmentOperationRecords", back_populates="equipment")


# ---------------------------------------------------------------------------
# md_equipment_technical_specification —— 设备技术规格 (1:1)
# ---------------------------------------------------------------------------
class EquipmentTechnicalSpecification(Base):
    __tablename__ = "md_equipment_technical_specification"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    id = Column(String(36), primary_key=True, default=_uuid)
    equipment_id = Column(String(36), ForeignKey("md_equipment.equipment_id"), nullable=False)
    main_parameters = Column(JSONB)  # 主要技术参数 e.g. {temperature: "200C"}
    power = Column(String(36))
    size = Column(String(36))
    weight = Column(String(36))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = _scoped_unique("eq_tech_spec_eq", "equipment_id")

    equipment = relationship("Equipment", back_populates="technical_specification")


# ---------------------------------------------------------------------------
# md_equipment_process_parameters —— 设备过程参数 (1:1) [BOP 未覆盖时使用]
# ---------------------------------------------------------------------------
class EquipmentProcessParameters(Base):
    __tablename__ = "md_equipment_process_parameters"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    id = Column(String(36), primary_key=True, default=_uuid)
    equipment_id = Column(String(36), ForeignKey("md_equipment.equipment_id"), nullable=False)
    standard_ct = Column(Numeric(10, 3))
    standard_yield_rate = Column(Numeric(10, 3))
    standard_work_efficiency = Column(Numeric(10, 3))
    standard_worker_count = Column(Integer)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = _scoped_unique("eq_process_params_eq", "equipment_id")

    equipment = relationship("Equipment", back_populates="process_parameters")


# ---------------------------------------------------------------------------
# md_equipment_failure_param —— 设备故障参数 (1:1) MTBF/MTTR
# ---------------------------------------------------------------------------
class EquipmentFailureParam(Base):
    __tablename__ = "md_equipment_failure_param"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    param_id = Column(String(36), primary_key=True, default=_uuid)
    equipment_id = Column(String(36), ForeignKey("md_equipment.equipment_id"), nullable=False)
    mtbf_hours = Column(Numeric(10, 2), nullable=False)
    mttr_minutes = Column(Numeric(10, 2), nullable=False)
    failure_distribution = Column(String(20), default="EXPONENTIAL")
    data_source = Column(String(100))
    effective_date = Column(Date)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = _scoped_unique("eq_failure_param_eq", "equipment_id")

    equipment = relationship("Equipment", back_populates="failure_param")


# ---------------------------------------------------------------------------
# md_equipment_bom_part —— 设备 BOM 备件（每设备多条；hierarchical via parent_part_id）
# ---------------------------------------------------------------------------
class EquipmentBOMPart(Base):
    __tablename__ = "md_equipment_bom_part"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    id = Column(String(36), primary_key=True, default=_uuid)
    equipment_id = Column(String(36), ForeignKey("md_equipment.equipment_id"), nullable=False)
    part_code = Column(String(50), nullable=False)
    part_name = Column(String(200), nullable=False)
    # 以下三列放宽为 nullable：Creator BOM 根节点（无父件）合并时无法提供 parent/model/manufacturer。
    # 放宽是向后兼容的（不破坏既有写入）。
    part_model = Column(String(200))
    part_manufacturer = Column(String(200))
    part_qty = Column(Integer, nullable=False)
    unit = Column(String(50), nullable=False)
    parent_part_id = Column(String(36), ForeignKey("md_equipment_bom_part.id"), nullable=True)
    part_position = Column(String(200))
    part_photo_url = Column(String(200))
    part_theoretical_life = Column(Numeric(10, 3))  # day
    part_remaining_life = Column(Numeric(10, 3))    # day
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    equipment = relationship("Equipment", back_populates="bom_parts")


# ---------------------------------------------------------------------------
# md_equipment_sop —— 设备作业指导书（每设备多条）
# ---------------------------------------------------------------------------
class EquipmentSOP(Base):
    __tablename__ = "md_equipment_sop"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    id = Column(String(36), primary_key=True, default=_uuid)
    equipment_id = Column(String(36), ForeignKey("md_equipment.equipment_id"), nullable=False)
    document_no = Column(String(50), nullable=False)
    document_title = Column(String(200), nullable=False)
    document_version = Column(String(36), nullable=False)
    created_by = Column(String(50), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    equipment = relationship("Equipment", back_populates="sops")


# ---------------------------------------------------------------------------
# md_equipment_operation_records —— 设备运行/变更记录（每设备多条）
# ---------------------------------------------------------------------------
class EquipmentOperationRecords(Base):
    __tablename__ = "md_equipment_operation_records"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    id = Column(String(36), primary_key=True, default=_uuid)
    equipment_id = Column(String(36), ForeignKey("md_equipment.equipment_id"), nullable=False)
    record_code = Column(String(36), nullable=False)
    record_type = Column(String(36), nullable=False)  # e.g. 设备新增 / 维修 / 换型
    related_department = Column(String(36))
    stage_status = Column(String(36))
    created_by = Column(String(50), nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    equipment = relationship("Equipment", back_populates="operation_records")


# ---------------------------------------------------------------------------
# md_wip_buffer
# ---------------------------------------------------------------------------
class WIPBuffer(Base):
    __tablename__ = "md_wip_buffer"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    wip_id = Column(String(36), primary_key=True, default=_uuid)
    line_id = Column(String(36), ForeignKey("md_production_line.line_id"), nullable=False)
    wip_code = Column(String(50), nullable=False)
    wip_name = Column(String(200), nullable=False)
    capacity_volume = Column(Numeric(15, 3), nullable=False)
    capacity_qty = Column(Integer)
    pre_operation_id = Column(String(36), ForeignKey("md_operation.operation_id"))
    post_operation_id = Column(String(36), ForeignKey("md_operation.operation_id"))
    location = Column(String(200))
    creator_binding_id = Column(String(500))
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    production_line = relationship("ProductionLine", back_populates="wip_buffers")
    pre_operation = relationship("Operation", foreign_keys=[pre_operation_id])
    post_operation = relationship("Operation", foreign_keys=[post_operation_id])


# ---------------------------------------------------------------------------
# md_warehouse
# ---------------------------------------------------------------------------
class Warehouse(Base):
    __tablename__ = "md_warehouse"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    warehouse_id = Column(String(36), primary_key=True, default=_uuid)
    factory_id = Column(String(36), ForeignKey("md_factory.factory_id"), nullable=False)
    warehouse_code = Column(String(50), nullable=False)
    warehouse_name = Column(String(200), nullable=False)
    warehouse_type = Column(String(30), nullable=False)
    location = Column(String(200))
    total_capacity = Column(Numeric(15, 3))
    creator_binding_id = Column(String(500))
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    factory = relationship("Factory", back_populates="warehouses")


# ---------------------------------------------------------------------------
# md_product
# ---------------------------------------------------------------------------
class Product(Base):
    __tablename__ = "md_product"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    product_id = Column(String(36), primary_key=True, default=_uuid)
    product_code = Column(String(50), nullable=False)
    product_name = Column(String(200), nullable=False)
    product_category = Column(String(50))
    unit = Column(String(20), nullable=False)
    standard_changeover_time = Column(Numeric(10, 2))
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = _scoped_unique("product_code", "product_code")

    bops = relationship("BOP", back_populates="product")


# ---------------------------------------------------------------------------
# md_bop
# ---------------------------------------------------------------------------
class BOP(Base):
    __tablename__ = "md_bop"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    bop_id = Column(String(36), primary_key=True, default=_uuid)
    product_id = Column(String(36), ForeignKey("md_product.product_id"), nullable=False)
    line_id = Column(String(36), ForeignKey("md_production_line.line_id"), nullable=False)
    bop_version = Column(String(20), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    effective_date = Column(Date)
    created_by = Column(String(50))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    # Only one active BOP per (product, line)
    # Enforced at application level (partial unique index not portable)

    product = relationship("Product", back_populates="bops")
    production_line = relationship("ProductionLine", back_populates="bops")
    processes = relationship("BOPProcess", back_populates="bop", order_by="BOPProcess.sequence")
    transitions = relationship("OperationTransition", back_populates="bop")


# ---------------------------------------------------------------------------
# md_bop_process
# ---------------------------------------------------------------------------
class BOPProcess(Base):
    __tablename__ = "md_bop_process"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    bop_process_id = Column(String(36), primary_key=True, default=_uuid)
    bop_id = Column(String(36), ForeignKey("md_bop.bop_id"), nullable=False)
    operation_id = Column(String(36), ForeignKey("md_operation.operation_id"), nullable=False)
    sequence = Column(Integer, nullable=False)
    standard_ct = Column(Numeric(10, 3), nullable=False)
    panel_qty = Column(Integer)
    ct_per_panel = Column(Numeric(10, 3))
    yield_rate = Column(Numeric(5, 4), nullable=False, default=1.0)
    standard_worker_count = Column(Integer, nullable=False, default=0)
    min_worker_count = Column(Integer)
    primary_material_type = Column(String(100))
    # 投入物料配方 {material_code: qty/件}，可含原料 + 上游半成品（如 {"MAT-PCB":1,"SF-...":1}）。
    # MATERIAL_SUPPLY 约束按其中【原料】(非 SEMI_FINISHED) 从库存扣；半成品走线边仓缓冲。
    material_usage = Column(JSONB)
    sop_ref = Column(String(500))
    sop_content = Column(Text)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = _scoped_unique("bop_process_seq", "bop_id", "sequence")

    bop = relationship("BOP", back_populates="processes")
    operation = relationship("Operation")
    params = relationship("BOPProcessParam", back_populates="bop_process")
    ng_types = relationship("BOPProcessNGType", back_populates="bop_process")


# ---------------------------------------------------------------------------
# md_bop_process_param
# ---------------------------------------------------------------------------
class BOPProcessParam(Base):
    __tablename__ = "md_bop_process_param"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    param_id = Column(String(36), primary_key=True, default=_uuid)
    bop_process_id = Column(String(36), ForeignKey("md_bop_process.bop_process_id"), nullable=False)
    param_name = Column(String(200), nullable=False)
    param_value = Column(String(200))
    upper_limit = Column(String(100))
    lower_limit = Column(String(100))
    sequence = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    bop_process = relationship("BOPProcess", back_populates="params")


# ---------------------------------------------------------------------------
# md_bop_process_ng_type
# ---------------------------------------------------------------------------
class BOPProcessNGType(Base):
    __tablename__ = "md_bop_process_ng_type"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    id = Column(String(36), primary_key=True, default=_uuid)
    bop_process_id = Column(String(36), ForeignKey("md_bop_process.bop_process_id"), nullable=False)
    ng_code = Column(String(20), ForeignKey("md_ng_type.ng_code"), nullable=False)
    occurrence_rate = Column(Numeric(5, 4))
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    bop_process = relationship("BOPProcess", back_populates="ng_types")
    ng_type = relationship("NGType")


# ---------------------------------------------------------------------------
# md_operation_transition
# ---------------------------------------------------------------------------
class OperationTransition(Base):
    __tablename__ = "md_operation_transition"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    transition_id = Column(String(36), primary_key=True, default=_uuid)
    bop_id = Column(String(36), ForeignKey("md_bop.bop_id"), nullable=False)
    from_operation_id = Column(String(36), ForeignKey("md_operation.operation_id"), nullable=False)
    to_operation_id = Column(String(36), ForeignKey("md_operation.operation_id"), nullable=False)
    transfer_time = Column(Numeric(10, 3), nullable=False, default=0)
    mandatory_wait_time = Column(Numeric(10, 3), nullable=False, default=0)
    transfer_mode = Column(String(30))
    wait_reason = Column(String(200))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    bop = relationship("BOP", back_populates="transitions")
    from_operation = relationship("Operation", foreign_keys=[from_operation_id])
    to_operation = relationship("Operation", foreign_keys=[to_operation_id])


# ---------------------------------------------------------------------------
# md_stage_transition —— 制程间接续（对齐 docs/5.数据模型与业务对象.md §4.x）
# ---------------------------------------------------------------------------
class StageTransition(Base):
    __tablename__ = "md_stage_transition"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    id = Column(String(36), primary_key=True, default=_uuid)
    from_stage_id = Column(String(36), ForeignKey("md_stage.stage_id"), nullable=False)
    to_stage_id = Column(String(36), ForeignKey("md_stage.stage_id"), nullable=False)
    # S2S=start-to-start (流式：上游每完工一件立刻流向下游)
    # E2S=end-to-start   (批量：上游 task 全部完工后整批流向下游)
    connection_type = Column(String(10), nullable=False)
    connection_time = Column(Numeric(10, 3), nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        *_scoped_unique("stage_transition_pair", "from_stage_id", "to_stage_id"),
        CheckConstraint(
            "connection_type IN ('S2S', 'E2S')",
            name="ck_stage_transition_connection_type",
        ),
    )

    from_stage = relationship("Stage", foreign_keys=[from_stage_id])
    to_stage = relationship("Stage", foreign_keys=[to_stage_id])


# ---------------------------------------------------------------------------
# md_work_calendar
# ---------------------------------------------------------------------------
class WorkCalendar(Base):
    __tablename__ = "md_work_calendar"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    calendar_id = Column(String(36), primary_key=True, default=_uuid)
    factory_id = Column(String(36), ForeignKey("md_factory.factory_id"), nullable=False)
    calendar_date = Column(Date, nullable=False)
    is_working_day = Column(Boolean, nullable=False)
    day_type = Column(String(20), nullable=False)
    total_work_hours = Column(Numeric(5, 2))
    remarks = Column(String(200))
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    factory = relationship("Factory", back_populates="work_calendars")
    shifts = relationship("Shift", back_populates="calendar")


# ---------------------------------------------------------------------------
# md_shift
# ---------------------------------------------------------------------------
class Shift(Base):
    __tablename__ = "md_shift"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    shift_id = Column(String(36), primary_key=True, default=_uuid)
    calendar_id = Column(String(36), ForeignKey("md_work_calendar.calendar_id"), nullable=False)
    shift_name = Column(String(50), nullable=False)
    start_time = Column(Time, nullable=False)
    end_time = Column(Time, nullable=False)
    work_hours = Column(Numeric(5, 2), nullable=False)
    break_minutes = Column(Integer)
    shift_order = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    calendar = relationship("WorkCalendar", back_populates="shifts")


# ---------------------------------------------------------------------------
# md_worker_type
# ---------------------------------------------------------------------------
class WorkerType(Base):
    __tablename__ = "md_worker_type"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    worker_type_id = Column(String(36), primary_key=True, default=_uuid)
    factory_id = Column(String(36), ForeignKey("md_factory.factory_id"), nullable=False)
    worker_type_code = Column(String(50), nullable=False)
    worker_type_name = Column(String(200), nullable=False)
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    factory = relationship("Factory", back_populates="worker_types")


# ---------------------------------------------------------------------------
# md_staffing_config
# ---------------------------------------------------------------------------
class StaffingConfig(Base):
    __tablename__ = "md_staffing_config"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    staffing_id = Column(String(36), primary_key=True, default=_uuid)
    operation_id = Column(String(36), ForeignKey("md_operation.operation_id"), nullable=False)
    worker_type_id = Column(String(36), ForeignKey("md_worker_type.worker_type_id"), nullable=False)
    worker_count = Column(Integer, nullable=False)
    ct_with_this_count = Column(Numeric(10, 3), nullable=False)
    is_standard = Column(Boolean, nullable=False, default=True)
    effective_date = Column(Date)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    operation = relationship("Operation", back_populates="staffing_configs")
    worker_type = relationship("WorkerType")


# ---------------------------------------------------------------------------
# md_material
# ---------------------------------------------------------------------------
class Material(Base):
    __tablename__ = "md_material"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    material_id = Column(String(36), primary_key=True, default=_uuid)
    material_code = Column(String(50), nullable=False)
    material_name = Column(String(200), nullable=False)
    material_type = Column(String(30), nullable=False)
    smt_placement_points = Column(Integer)
    unit = Column(String(20), nullable=False)
    unit_volume = Column(Numeric(15, 6))
    unit_weight = Column(Numeric(10, 3))
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    __table_args__ = _scoped_unique("material_code", "material_code")


# ---------------------------------------------------------------------------
# md_creator_project —— 关联 Omniverse Kit/Creator 已发布的工厂项目
# ---------------------------------------------------------------------------
class CreatorProject(Base):
    __tablename__ = "md_creator_project"

    creator_project_id = Column(String(36), primary_key=True, default=_uuid)
    project_name = Column(String(200), nullable=False)
    project_version = Column(String(50))
    project_status = Column(String(20), nullable=False, default="PUBLISHED")  # PUBLISHED / DRAFT / DEPRECATED
    factory_id = Column(String(36), ForeignKey("md_factory.factory_id"))
    description = Column(Text)
    creator_url = Column(String(500))
    published_at = Column(DateTime)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())

    factory = relationship("Factory")

    def __repr__(self):
        return f"<CreatorProject id={self.creator_project_id } name={self.project_name} status={self.project_status}>"

# ---------------------------------------------------------------------------
# md_ng_type
# ---------------------------------------------------------------------------
class NGType(Base):
    __tablename__ = "md_ng_type"
    plan_id = Column(String(36), ForeignKey("sim_simulation_plan.plan_id", ondelete="CASCADE"), nullable=True, index=True)

    ng_code = Column(String(20), primary_key=True)
    ng_name = Column(String(100), nullable=False)
    impact_level = Column(String(10), nullable=False)
    repairable = Column(String(20), nullable=False)
    repair_time_sec = Column(Numeric(10, 2), nullable=False)
    repair_rate = Column(Numeric(5, 4), nullable=False)
    status = Column(String(20), nullable=False, default="ACTIVE")
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
