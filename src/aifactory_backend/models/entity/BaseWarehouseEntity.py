from sqlalchemy import Column, String, Numeric, DateTime, ForeignKey
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class BaseWarehouse(Base):
    """仓库表 ORM 实体"""
    __tablename__ = "md_warehouse"
    plan_id = Column(String(36), nullable=True, index=True, comment="所属方案ID")

    warehouse_id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID")
    factory_id = Column(String(36), ForeignKey("md_factory.factory_id"), nullable=False, comment="所属工厂ID")
    warehouse_code = Column(String(50), nullable=False, comment="仓库编码")
    warehouse_name = Column(String(200), nullable=False, comment="仓库名称")
    warehouse_type = Column(String(30), nullable=False, comment="仓库类型")
    location = Column(String(200), nullable=True, comment="仓库位置")
    total_capacity = Column(Numeric(15, 3), nullable=True, comment="总容量")
    creator_binding_id = Column(String(500), nullable=True, comment="Creator绑定ID")
    status = Column(String(20), nullable=False, server_default="ACTIVE", comment="状态")
    created_at = Column(DateTime, nullable=False, server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now(), comment="更新时间")

    def __repr__(self):
        return f"<BaseWarehouse(warehouse_id={self.warehouse_id}, warehouse_code={self.warehouse_code})>"
