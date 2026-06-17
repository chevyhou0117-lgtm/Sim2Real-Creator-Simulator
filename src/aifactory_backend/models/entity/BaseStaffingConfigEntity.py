from sqlalchemy import Column, String, Integer, Numeric, Boolean, Date, TIMESTAMP
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class BaseStaffingConfig(Base):
    """人员-CT关系配置表 ORM 实体"""
    __tablename__ = "base_staffing_config"

    staffing_id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID")
    factory_id = Column(String(36), nullable=False, comment="工厂ID")
    operation_id = Column(String(36), nullable=False, comment="工序ID")
    worker_type_id = Column(String(36), nullable=False, comment="工种ID")
    worker_count = Column(Integer, nullable=False, comment="人数配置")
    ct_with_this_count = Column(Numeric(10, 3), nullable=False, comment="对应CT（秒）")
    is_standard = Column(Boolean, nullable=False, default=False, comment="是否标准配置")
    effective_date = Column(Date, nullable=True, comment="生效日期")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")

    def __repr__(self):
        return f"<BaseStaffingConfig(staffing_id={self.staffing_id}, operation_id={self.operation_id})>"
