from sqlalchemy import Column, String, TIMESTAMP, ForeignKey, Boolean
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class FactoryAsset3dModel(Base):
    """
    3D 模型信息 ORM 实体（通用表）
    对应表: factory_asset_3d_model
    制程/线体/设备都可能拥有 3D 模型信息，统一管理
    从原 factory_line_model_details 和 factory_equipment_model_details 的 USD 字段抽取
    """
    __tablename__ = "factory_asset_3d_model"

    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花算法）")

    factory_asset_id = Column(
        String(36),
        ForeignKey("factory_asset_node.id", ondelete="CASCADE"),
        nullable=False,
        comment="关联工厂资产节点ID"
    )

    # USD/Omniverse 模型信息
    usd_name = Column(String(255), nullable=True, comment="USD文件名称，例如: SMT01# Line.USDA")
    usd_id = Column(String(255), nullable=True, comment="USD唯一标识")
    root_usd_path = Column(String(1024), nullable=False, comment="USD文件在存储桶中的路径")
    bucket_name = Column(String(100), nullable=True, default="ov-usd-bucket", comment="对象存储桶名")
    prim_path = Column(String(1024), nullable=True, comment="USD中的主要Prim路径")
    location_path = Column(String(1024), nullable=True, comment="模型在场景中的相对路径")
    thumbnail_path = Column(String(1024), nullable=True, comment="缩略图路径")

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

    is_deleted = Column(Boolean, nullable=False, server_default="false", comment="逻辑删除标识")

    def __repr__(self):
        return f"<FactoryAsset3dModel(id={self.id}, usd_name={self.usd_name}, factory_asset_id={self.factory_asset_id})>"
