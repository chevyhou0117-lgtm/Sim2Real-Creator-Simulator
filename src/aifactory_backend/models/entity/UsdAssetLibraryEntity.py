from sqlalchemy import Column, String, TIMESTAMP
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class UsdAssetLibrary(Base):
    """
    USD 资产库 ORM 实体
    对应表: usd_asset_library
    """
    __tablename__ = "usd_asset_library"

    # 1. 标识信息（雪花算法 ID）
    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花算法）")
    name = Column(String(255), nullable=False, comment="资产名称")

    # 2. 存储核心
    storage_type = Column(String(20), default="folder", comment="存储类型: file 或 folder")
    root_usd_path = Column(String(1024), nullable=False, comment="根USD文件路径")
    location_path = Column(String(1024), nullable=False, comment="存储位置路径")
    thumbnail_path = Column(String(1024), nullable=True, comment="缩略图路径")

    # 3. 分类与检索
    category_l1 = Column(String(50), nullable=False, comment="主分类")
    category_l2 = Column(String(50), nullable=True, comment="子分类")
    category_l3 = Column(String(50), nullable=True, comment="三级分类")
    tags = Column(ARRAY(String(100)), nullable=True, comment="标签列表")

    # 4. 扩展配置
    open_config = Column(JSONB, nullable=True, comment="打开方式配置")
    file_list = Column(JSONB, nullable=True, comment="文件夹内所有文件列表")

    # 时间戳
    created_at = Column(TIMESTAMP(timezone=False), server_default=func.now(), comment="创建时间")
    updated_at = Column(
        TIMESTAMP(timezone=False),
        server_default=func.now(),
        onupdate=func.now(),
        comment="更新时间"
    )

    def __repr__(self):
        return f"<UsdAssetLibrary(id={self.id}, name={self.name}, storage_type={self.storage_type})>"
