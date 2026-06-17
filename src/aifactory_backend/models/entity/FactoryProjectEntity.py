from sqlalchemy import Column, Integer, String, Text, TIMESTAMP, ForeignKey, Boolean
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class FactoryProject(Base):
    """
    工厂项目 ORM 实体
    对应表: factory_projects
    """

    __tablename__ = "factory_projects"

    project_id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="项目主键ID（雪花算法）")

    factory_id = Column(
        String(36),
        ForeignKey("md_factory.factory_id", ondelete="RESTRICT"),
        nullable=False,
        comment="所属工厂ID",
    )

    project_name = Column(String(255), nullable=False, comment="项目名称，如：深圳一厂扩产评估")
    thumbnail_url = Column(String(2048), nullable=True, comment="项目缩略图地址")
    status = Column(
        String(50),
        nullable=True,
        server_default="active",
        comment="项目状态(active/inactive/archived/draft)",
    )

    owner_id = Column(String(100), nullable=True, comment="项目负责人ID")
    description = Column(Text, nullable=True, comment="项目描述")
    # 版本管理冗余字段
    current_version_id = Column(String(36), nullable=True, comment="当前编辑版本ID")
    version_count = Column(Integer, nullable=True, server_default="0", comment="版本总数")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        comment="更新时间",
    )
    last_accessed_at = Column(TIMESTAMP(timezone=True), nullable=True, comment="最后访问时间")

    is_deleted = Column(Boolean, nullable=False, server_default="false", comment="逻辑删除标识")

    def __repr__(self):
        return f"<FactoryProject(project_id={self.project_id}, project_name={self.project_name}, status={self.status})>"
