from sqlalchemy import Column, String, Integer, Numeric, DateTime, ForeignKey
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class BaseWipBuffer(Base):
    """线边仓表 ORM 实体"""
    __tablename__ = "md_wip_buffer"
    plan_id = Column(String(36), nullable=True, index=True, comment="所属方案ID")

    wip_id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID")
    line_id = Column(String(36), ForeignKey("md_production_line.line_id"), nullable=False, comment="所属产线ID")
    wip_code = Column(String(50), nullable=False, comment="线边仓编码")
    wip_name = Column(String(200), nullable=False, comment="线边仓名称")
    capacity_volume = Column(Numeric(15, 3), nullable=False, comment="总容量")
    capacity_qty = Column(Integer, nullable=True, comment="最大存放件数")
    pre_operation_id = Column(String(36), ForeignKey("md_operation.operation_id"), nullable=True, comment="前置工序ID")
    post_operation_id = Column(String(36), ForeignKey("md_operation.operation_id"), nullable=True, comment="后置工序ID")
    location = Column(String(200), nullable=True, comment="物理位置")
    creator_binding_id = Column(String(500), nullable=True, comment="Creator绑定ID")
    status = Column(String(20), nullable=False, server_default="ACTIVE", comment="状态")
    created_at = Column(DateTime, nullable=False, server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now(), comment="更新时间")

    def __repr__(self):
        return f"<BaseWipBuffer(wip_id={self.wip_id}, wip_code={self.wip_code})>"
