from sqlalchemy import Column, String, Numeric, Date, DateTime, ForeignKey
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class BaseEquipmentFailureParam(Base):
    """设备故障参数表 ORM 实体"""
    __tablename__ = "md_equipment_failure_param"
    plan_id = Column(String(36), nullable=True, index=True)

    param_id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID")
    equipment_id = Column(String(36), ForeignKey("md_equipment.equipment_id"), nullable=False, comment="设备ID")
    mtbf_hours = Column(Numeric(10, 2), nullable=False, comment="平均无故障间隔（小时）")
    mttr_minutes = Column(Numeric(10, 2), nullable=False, comment="平均维修时间（分钟）")
    failure_distribution = Column(String(20), default="EXPONENTIAL", comment="故障分布模型")
    data_source = Column(String(100), nullable=True, comment="数据来源")
    effective_date = Column(Date, nullable=True, comment="生效日期")
    created_at = Column(DateTime, nullable=False, server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now(), comment="更新时间")

    def __repr__(self):
        return f"<BaseEquipmentFailureParam(param_id={self.param_id}, equipment_id={self.equipment_id})>"
