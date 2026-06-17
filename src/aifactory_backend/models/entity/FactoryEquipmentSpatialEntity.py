from sqlalchemy import Column, String, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class FactoryEquipmentSpatial(Base):
    """
    设备空间定位 ORM 实体（设备专属）
    对应表: factory_equipment_spatial
    从原 factory_equipment_model_details 的 position_data/rotation_data 抽取
    """
    __tablename__ = "factory_equipment_spatial"

    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花算法）")

    factory_asset_id = Column(
        String(36),
        ForeignKey("factory_asset_node.id", ondelete="CASCADE"),
        nullable=False,
        comment="关联工厂资产节点ID"
    )

    position_data = Column(JSONB, nullable=True, comment="空间坐标，例如: {\"x\": 0, \"y\": 0, \"z\": 0}")
    rotation_data = Column(JSONB, nullable=True, comment="旋转角度，例如: {\"rx\": 0, \"ry\": 0, \"rz\": 0}")

    created_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        comment="创建时间"
    )
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        comment="更新时间"
    )

    def __repr__(self):
        return f"<FactoryEquipmentSpatial(id={self.id}, factory_asset_id={self.factory_asset_id})>"
