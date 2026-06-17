from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class BaseStage(Base):
    """
    制程 ORM 实体
    对应表: md_stage
    """
    __tablename__ = "md_stage"
    plan_id = Column(String(36), nullable=True, index=True)

    stage_id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="制程主键ID（雪花算法）")
    factory_id = Column(
        String(36),
        ForeignKey("md_factory.factory_id"),
        nullable=False,
        comment="所属工厂ID",
    )

    stage_code = Column(String(50), nullable=False, comment="制程编码")
    stage_name = Column(String(200), nullable=False, comment="制程名称")
    sequence = Column(Integer, nullable=False, comment="制程顺序（>0）")

    stage_type = Column(String(50), nullable=False, comment="制程类型")

    line_count = Column(Integer, nullable=True, comment="产线数量")
    status = Column(String(20), nullable=False, server_default="ACTIVE", comment="状态(ACTIVE/INACTIVE)")
    creator_binding_id = Column(String(500), nullable=True, comment="创建者绑定ID")

    created_at = Column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        comment="创建时间",
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
        comment="更新时间",
    )

    def __repr__(self):
        return f"<BaseStage(stage_id={self.stage_id}, stage_name={self.stage_name}, factory_id={self.factory_id})>"
