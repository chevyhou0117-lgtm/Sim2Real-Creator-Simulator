from sqlalchemy import Column, String, Numeric, DateTime
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class BaseFactory(Base):
    """
    工厂基础信息 ORM 实体
    对应表: md_factory
    """

    __tablename__ = "md_factory"

    plan_id = Column(String(36), nullable=True, index=True, comment="所属模拟方案ID")

    factory_id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="工厂主键ID（UUID字符串）")

    factory_code = Column(String(50), nullable=False, comment="工厂编码")
    factory_name = Column(String(200), nullable=False, comment="现实工厂名称，如：深圳一厂")

    location = Column(String(500), nullable=True, comment="工厂地理位置")
    site_length = Column(Numeric(10, 2), nullable=True, comment="现实物理长度（米）")
    site_width = Column(Numeric(10, 2), nullable=True, comment="现实物理宽度（米）")
    timezone = Column(String(50), nullable=False, comment="时区")

    status = Column(
        String(20),
        nullable=False,
        default="ACTIVE",
        comment="工厂状态(ACTIVE/INACTIVE)",
    )

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
        return f"<BaseFactory(factory_id={self.factory_id}, factory_name={self.factory_name}, status={self.status})>"
