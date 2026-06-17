from sqlalchemy import Column, String, Text, TIMESTAMP, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class FactoryEquipmentDetails(Base):
    """设备详情 ORM 实体（v2）- ref_id 迁移至此 + spatial 合并"""
    __tablename__ = "factory_equipment_details"

    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花算法）")
    factory_asset_id = Column(String(36), ForeignKey("factory_asset_node.id", ondelete="CASCADE"), nullable=False, comment="关联工厂资产节点ID")
    ref_id = Column(String(36), nullable=True, comment="关联 base_equipment.equipment_id，获取设备基础信息")

    # 实例层增量字段
    specifications = Column(JSONB, nullable=True, comment="技术规格扩展")
    installation_date = Column(TIMESTAMP(timezone=True), nullable=True, comment="安装日期（实例级）")

    # 空间定位（从 factory_equipment_spatial 合并）
    position_data = Column(JSONB, nullable=True, comment="空间坐标，例如: {\"x\": 0, \"y\": 0, \"z\": 0}")
    rotation_data = Column(JSONB, nullable=True, comment="旋转角度，例如: {\"rx\": 0, \"ry\": 0, \"rz\": 0}")

    extra_metadata = Column(JSONB, nullable=True, comment="扩展元数据")
    description = Column(Text, nullable=True, comment="实例级补充描述")

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")

    is_deleted = Column(Boolean, nullable=False, server_default="false", comment="逻辑删除标识")

    def __repr__(self):
        return f"<FactoryEquipmentDetails(id={self.id}, factory_asset_id={self.factory_asset_id}, ref_id={self.ref_id})>"
