from sqlalchemy import Column, String, Integer, TIMESTAMP, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class FactoryLineDetails(Base):
    """线体详情 ORM 实体（v2）- ref_id 从节点表迁移至此"""
    __tablename__ = "factory_line_details"

    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花算法）")
    factory_asset_id = Column(String(36), ForeignKey("factory_asset_node.id", ondelete="CASCADE"), nullable=False, comment="关联工厂资产节点ID（线体）")
    ref_id = Column(String(36), nullable=True, comment="关联 base_production_line.line_id，获取线体基础信息")

    capacity_per_day = Column(Integer, nullable=True, comment="实例层日产能（pcs），考虑排班后的实际值")
    extra_metadata = Column(JSONB, nullable=True, comment="扩展元数据")

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")

    is_deleted = Column(Boolean, nullable=False, server_default="false", comment="逻辑删除标识")

    def __repr__(self):
        return f"<FactoryLineDetails(id={self.id}, factory_asset_id={self.factory_asset_id}, ref_id={self.ref_id})>"
