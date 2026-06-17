from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.sql import func
from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class BaseLineOperation(Base):
    """基础线体工序表 ORM 实体"""
    __tablename__ = "md_operation"

    plan_id = Column(String(36), nullable=True, index=True)

    operation_id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID")
    stage_id = Column(String(36), ForeignKey("md_stage.stage_id"), nullable=False, comment="所属制程阶段ID")
    operation_code = Column(String(50), nullable=False, comment="工序编码")
    operation_name = Column(String(200), nullable=False, comment="工序名称")
    operation_name_cn = Column(String(200), nullable=True, comment="工序中文名称")
    sequence = Column(Integer, nullable=False, comment="工序顺序")
    operation_type = Column(String(50), nullable=True, comment="工序类型")
    is_key_operation = Column(Boolean, default=False, comment="是否关键工序")
    status = Column(String(20), nullable=False, default="ACTIVE", comment="状态")
    creator_binding_id = Column(String(500), nullable=True, comment="Creator绑定ID")
    created_at = Column(DateTime, nullable=False, server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now(), comment="更新时间")

    def __repr__(self):
        return f"<BaseLineOperation(operation_id={self.operation_id}, operation_code={self.operation_code})>"
