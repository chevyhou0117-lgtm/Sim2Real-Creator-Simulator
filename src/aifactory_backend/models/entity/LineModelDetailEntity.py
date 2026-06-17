from sqlalchemy import Column, String, TIMESTAMP, Boolean, Integer, Numeric, Text
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class LineModelDetail(Base):
    """
    线体模型详情 ORM 实体
    对应表: line_model_details
    """
    __tablename__ = "line_model_details"

    # 1. 主键（雪花算法 ID）
    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花算法）")

    # 2. 分类关联
    category_id = Column(String(36), nullable=False, comment="关联 asset_categories.id")

    # 3. 存储信息
    bucket_name = Column(String(100), nullable=True, default='ov-usd-bucket', comment="存储桶名称")
    root_usd_path = Column(String(1024), nullable=False, comment="根USD文件路径")
    location_path = Column(String(1024), nullable=False, comment="位置路径")
    thumbnail_path = Column(String(1024), nullable=True, comment="缩略图路径")

    # 状态机：DRAFT/ACTIVE/INACTIVE/ARCHIVED
    status = Column(String(20), nullable=False, server_default="DRAFT", comment="状态：DRAFT/ACTIVE/INACTIVE/ARCHIVED")

    # 扩展字段（资产库元数据）
    category = Column(String(100), nullable=True, comment="分类，例如 SMT")
    manufacturer = Column(String(100), nullable=True, comment="制造商")
    model = Column(String(100), nullable=True, comment="型号")
    format = Column(String(50), nullable=True, comment="3D文件格式")
    poly_count = Column(Integer, nullable=True, comment="多边形数量")
    prim_path = Column(String(255), nullable=True, comment="Prim 路径")
    instance_path = Column(String(255), nullable=True, comment="Instance 路径")
    width = Column(Numeric(10, 2), nullable=True, comment="宽度(mm)")
    depth = Column(Numeric(10, 2), nullable=True, comment="深度(mm)")
    height = Column(Numeric(10, 2), nullable=True, comment="高度(mm)")

    # 资产版本管理
    asset_version_id = Column(String(36), nullable=True, comment="逻辑资产ID：同一资产所有版本共享")
    version_tag = Column(String(50), nullable=False, server_default="v1.0", comment="版本标签")
    is_current = Column(Boolean, nullable=False, server_default="true", comment="是否最新版本")
    remark = Column(Text, nullable=True, comment="版本备注")
    created_by = Column(String(100), nullable=True, comment="版本创建人")

    # 逻辑删除
    is_deleted = Column(Boolean, nullable=False, server_default="false", comment="逻辑删除标识")

    # 4. 时间戳
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
        return f"<LineModelDetail(id={self.id}, category_id={self.category_id}, root_usd_path={self.root_usd_path})>"
