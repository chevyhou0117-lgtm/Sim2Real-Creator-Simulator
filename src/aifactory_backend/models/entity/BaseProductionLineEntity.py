from sqlalchemy import Column, String, Integer, Numeric, DateTime, ForeignKey
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class BaseProductionLine(Base):
    """基础线体表 ORM 实体"""
    __tablename__ = "md_production_line"

    plan_id = Column(String(36), nullable=True, index=True)

    line_id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID")
    stage_id = Column(String(36), ForeignKey("md_stage.stage_id"), nullable=False, comment="所属制程ID")
    line_code = Column(String(50), nullable=False, comment="线体编码")
    line_name = Column(String(200), nullable=False, comment="线体名称")
    smt_pph = Column(Numeric(10, 2), nullable=True, comment="每小时置件点数")
    operation_count = Column(Integer, nullable=True, comment="工序总数")
    status = Column(String(20), nullable=False, server_default="ACTIVE", comment="状态")
    sort_order = Column(Integer, nullable=True, comment="排序")
    creator_binding_id = Column(String(500), nullable=True, comment="Creator绑定ID")
    created_at = Column(DateTime, nullable=False, server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now(), comment="更新时间")

    def __repr__(self):
        return f"<BaseProductionLine(line_id={self.line_id}, line_code={self.line_code})>"
