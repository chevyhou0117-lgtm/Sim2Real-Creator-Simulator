from sqlalchemy import Column, String, TIMESTAMP
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class DictWarehouseType(Base):
    """仓库类型字典 ORM 实体"""
    __tablename__ = "dict_warehouse_type"

    warehouse_type_id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID")
    warehouse_type_code = Column(String(50), nullable=False, unique=True, comment="类型编码")
    warehouse_type_name = Column(String(200), nullable=False, comment="类型名称")
    description = Column(String(500), nullable=True, comment="补充说明")
    status = Column(String(20), nullable=False, server_default="ACTIVE", comment="状态")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")

    def __repr__(self):
        return f"<DictWarehouseType(warehouse_type_id={self.warehouse_type_id}, code={self.warehouse_type_code})>"
