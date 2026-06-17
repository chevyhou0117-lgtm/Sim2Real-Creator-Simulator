from sqlalchemy import Column, String, Integer, TIMESTAMP, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class FactoryLineModelDetails(Base):
    """
    线体详情 ORM 实体
    对应表: factory_line_model_details
    """
    __tablename__ = "factory_line_model_details"

    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花算法）")

    factory_asset_id = Column(
        String(36),
        ForeignKey("factory_asset_node.id", ondelete="CASCADE"),
        nullable=False,
        comment="关联工厂资产节点ID（线体）"
    )

    factory_layer = Column(String(100), nullable=True, comment="工厂层级")
    line_name = Column(String(255), nullable=True, comment="线体名称")
    line_code = Column(String(100), nullable=True, comment="线体编码")

    standard_ct = Column(Integer, nullable=True, comment="标准CT（秒）")
    capacity_per_day = Column(Integer, nullable=True, comment="日产能（pcs）")
    shift_count = Column(Integer, nullable=True, default=0, comment="班次数")

    usd_name = Column(String(255), nullable=True, comment="USD文件名称")
    usd_id = Column(String(255), nullable=True, comment="USD唯一标识")
    root_usd_path = Column(String(1024), nullable=True, comment="根USD文件路径")
    prim_path = Column(String(1024), nullable=True, comment="Prim路径")
    bucket_name = Column(String(100), nullable=True, default="ov-usd-bucket", comment="存储桶名称")

    location_path = Column(String(1024), nullable=True, comment="位置路径")
    thumbnail_path = Column(String(1024), nullable=True, comment="缩略图路径")
    extra_metadata = Column(JSONB, nullable=True, comment="元数据")

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
        return f"<FactoryLineModelDetails(id={self.id}, line_name={self.line_name}, factory_asset_id={self.factory_asset_id})>"
