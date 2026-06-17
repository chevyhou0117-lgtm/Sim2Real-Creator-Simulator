from sqlalchemy import Column, BigInteger, String, Text, TIMESTAMP, ForeignKey, Boolean
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class AssetCategory(Base):
    """
    资产分类 ORM 实体
    对应表: asset_categories
    """
    __tablename__ = "asset_categories"

    # 1. 主键（雪花算法 ID）
    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花算法）")

    # 2. 分类信息
    name = Column(String(255), nullable=False, comment="分类名称")
    code = Column(String(100), unique=True, nullable=False, comment="分类编码（唯一）")
    type = Column(
        String(50),
        ForeignKey("asset_type_dict.code", onupdate="CASCADE"),
        nullable=False,
        comment="分类类型，外键关联 asset_type_dict.code: process / line_type / equipment_type / line_model / equipment_model"
    )
    parent_id = Column(String(36), nullable=True, comment="父级分类ID")
    description = Column(Text, nullable=True, comment="分类描述")
    thumbnail_path = Column(String(1024), nullable=True, comment="分类缩略图路径")
    asset_total_count = Column(BigInteger, nullable=True, server_default="0", comment="树节点叶子节点个数")

    # 3. 时间戳
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
        return f"<AssetCategory(id={self.id}, name={self.name}, code={self.code}, type={self.type})>"
