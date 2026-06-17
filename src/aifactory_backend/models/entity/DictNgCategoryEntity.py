from sqlalchemy import Column, String, TIMESTAMP
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class DictNgCategory(Base):
    """不良类型字典 ORM 实体"""
    __tablename__ = "dict_ng_category"

    ng_category_id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID")
    ng_code = Column(String(20), nullable=False, unique=True, comment="不良编码")
    ng_name = Column(String(100), nullable=False, comment="不良名称")
    impact_level = Column(String(10), nullable=False, comment="影响等级: LOW/MEDIUM/HIGH")
    status = Column(String(20), nullable=False, server_default="ACTIVE", comment="状态")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")

    def __repr__(self):
        return f"<DictNgCategory(ng_category_id={self.ng_category_id}, ng_code={self.ng_code})>"
