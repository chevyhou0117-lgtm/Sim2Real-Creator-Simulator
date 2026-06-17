
from sqlalchemy import Column, String, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class BaseEquipmentTechnicalSpec(Base):
    """设备技术规格表 ORM 实体（1:1 对应 md_equipment）"""
    __tablename__ = "md_equipment_technical_specification"
    plan_id = Column(String(36), nullable=True, index=True, comment="仿真方案ID")

    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花/UUID）")
    equipment_id = Column(String(36), ForeignKey("md_equipment.equipment_id"), nullable=False, comment="设备ID（外键→md_equipment，1:1）")
    main_parameters = Column(JSONB, nullable=True, comment="主要技术参数（JSON）")
    power = Column(String(36), nullable=True, comment="设备功率")
    size = Column(String(36), nullable=True, comment="尺寸（长x宽x高）")
    weight = Column(String(36), nullable=True, comment="重量")
    created_at = Column(DateTime, nullable=False, server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now(), comment="更新时间")

    def __repr__(self):
        return f"<BaseEquipmentTechnicalSpec(id={self.id}, equipment_id={self.equipment_id})>"
