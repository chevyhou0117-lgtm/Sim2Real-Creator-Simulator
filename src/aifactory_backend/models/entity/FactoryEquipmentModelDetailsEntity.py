from sqlalchemy import Column, String, Text, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class FactoryEquipmentModelDetails(Base):
    """
    工厂设备模型详情 ORM 实体
    对应表: factory_equipment_model_details
    """
    __tablename__ = "factory_equipment_model_details"

    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花算法）")

    factory_asset_id = Column(
        String(36),
        ForeignKey("factory_asset_node.id", ondelete="CASCADE"),
        nullable=False,
        comment="关联工厂资产节点ID"
    )

    factory_layer = Column(String(100), nullable=True, comment="工厂层级")
    equipment_name = Column(String(255), nullable=False, comment="设备名称")
    equipment_id = Column(String(255), nullable=True, comment="设备唯一标识")
    equipment_type = Column(String(100), nullable=True, comment="设备类型")

    manufacturer = Column(String(100), nullable=True, comment="制造商")
    brand = Column(String(100), nullable=True, comment="品牌")

    usd_name = Column(String(255), nullable=True, comment="USD文件名称")
    usd_id = Column(String(255), nullable=True, comment="USD唯一标识")
    root_usd_path = Column(String(1024), nullable=False, comment="根USD文件路径")
    bucket_name = Column(String(100), nullable=True, default="ov-usd-bucket", comment="存储桶名称")
    location_path = Column(String(1024), nullable=True, comment="位置路径")
    thumbnail_path = Column(String(1024), nullable=True, comment="缩略图路径")
    prim_path = Column(String(1024), nullable=True, comment="USD中的主要Prim路径")

    position_data = Column(JSONB, nullable=True, comment="空间坐标（x, y, z）")
    rotation_data = Column(JSONB, nullable=True, comment="旋转角度（rx, ry, rz）")
    specifications = Column(JSONB, nullable=True, comment="技术规格")
    extra_metadata = Column(JSONB, nullable=True, comment="元数据")
    description = Column(Text, nullable=True, comment="设备描述")

    installation_date = Column(
        TIMESTAMP(timezone=True),
        nullable=True,
        comment="安装日期"
    )
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
        return f"<FactoryEquipmentModelDetails(id={self.id}, equipment_name={self.equipment_name}, factory_asset_id={self.factory_asset_id})>"
