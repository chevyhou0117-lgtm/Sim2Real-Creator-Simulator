from sqlalchemy import Column, String, Integer, Numeric, DateTime, ForeignKey
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class BaseEquipmentProcessParam(Base):
    """设备过程参数表 ORM 实体（1:1 对应 md_equipment）"""
    __tablename__ = "md_equipment_process_parameters"

    plan_id = Column(String(36), nullable=True, index=True)

    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花/UUID）")
    equipment_id = Column(String(36), ForeignKey("md_equipment.equipment_id"), nullable=False, comment="设备ID（外键→md_equipment，1:1）")
    standard_ct = Column(Numeric(10, 3), nullable=True, comment="设备标准节拍（秒），BOP未覆盖时使用")
    standard_yield_rate = Column(Numeric(10, 3), nullable=True, comment="设备标准良品率，BOP未覆盖时使用")
    standard_work_efficiency = Column(Numeric(10, 3), nullable=True, comment="设备标准作业效率，BOP未覆盖时使用")
    standard_worker_count = Column(Integer, nullable=True, comment="设备标准作业人数")
    created_at = Column(DateTime, nullable=False, server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now(), comment="更新时间")

    def __repr__(self):
        return f"<BaseEquipmentProcessParam(id={self.id}, equipment_id={self.equipment_id})>"
