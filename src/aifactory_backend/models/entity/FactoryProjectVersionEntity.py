from sqlalchemy import Column, Integer, String, Boolean, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class FactoryProjectVersion(Base):
    """
    项目版本管理 ORM 实体
    对应表: factory_project_version
    支持多版本并行：DRAFT → PUBLISHED → ARCHIVED
    """
    __tablename__ = "factory_project_version"

    version_id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="版本主键ID（雪花算法）")
    project_id = Column(
        String(36),
        ForeignKey("factory_projects.project_id", ondelete="CASCADE"),
        nullable=False,
        comment="项目ID",
    )

    # 版本标识
    version_number = Column(Integer, nullable=False, comment="版本号（1, 2, 3...）")
    version_name = Column(String(255), nullable=True, comment="版本名称，如 V1.0 初版")
    remark = Column(String(255), nullable=True, comment="备注描述")

    # 版本状态
    version_status = Column(
        String(20),
        nullable=False,
        server_default="DRAFT",
        comment="版本状态: DRAFT / PUBLISHED / ARCHIVED",
    )

    # 当前编辑版本标记
    is_current = Column(Boolean, nullable=False, server_default="false", comment="是否当前编辑版本")

    # 发布信息
    published_at = Column(TIMESTAMP(timezone=True), nullable=True, comment="发布时间")
    published_by = Column(String(100), nullable=True, comment="发布人")

    # 基线版本
    base_version_id = Column(String(36), nullable=True, comment="基线版本ID（从哪个版本派生）")

    # 创建人
    created_by = Column(String(100), nullable=True, comment="创建人")

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        comment="更新时间",
    )

    def __repr__(self):
        return f"<FactoryProjectVersion(version_id={self.version_id}, project_id={self.project_id}, v{self.version_number}, status={self.version_status})>"
