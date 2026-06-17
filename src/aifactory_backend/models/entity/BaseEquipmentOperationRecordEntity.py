from sqlalchemy import Column, String, Text, TIMESTAMP
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class BaseEquipmentOperationRecord(Base):
    """设备运行记录表 ORM 实体（1:N 对应 base_equipment）"""
    __tablename__ = "base_equipment_operation_record"

    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花）")
    equipment_id = Column(String(36), nullable=False, comment="设备ID（外键→base_equipment）")
    record_code = Column(String(36), nullable=False, comment="记录编号")
    record_type = Column(String(50), nullable=False, comment="记录类型：EQUIPMENT_ADD / EQUIPMENT_REPAIR / EQUIPMENT_MOVE / EQUIPMENT_MAINTENANCE / EQUIPMENT_SCRAP")
    related_department = Column(String(100), nullable=True, comment="相关部门")
    stage_status = Column(String(50), nullable=True, comment="阶段状态（如：进行中/已完成）")
    record_description = Column(Text, nullable=True, comment="记录详细描述")
    created_by = Column(String(50), nullable=False, comment="创建人")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")

    def __repr__(self):
        return f"<BaseEquipmentOperationRecord(id={self.id}, equipment_id={self.equipment_id}, record_code={self.record_code})>"
