from sqlalchemy import Column, String, TIMESTAMP
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class BaseEquipmentSop(Base):
    """设备作业指导表 ORM 实体（1:N 对应 base_equipment）"""
    __tablename__ = "base_equipment_sop"

    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花）")
    equipment_id = Column(String(36), nullable=False, comment="设备ID（外键→base_equipment）")
    document_no = Column(String(50), nullable=False, comment="文档编号")
    document_title = Column(String(200), nullable=False, comment="文档标题")
    document_version = Column(String(36), nullable=False, comment="文档版本")
    document_url = Column(String(1024), nullable=True, comment="文档文件URL（PDF/Word等）")
    created_by = Column(String(50), nullable=False, comment="创建人")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")

    def __repr__(self):
        return f"<BaseEquipmentSop(id={self.id}, equipment_id={self.equipment_id}, document_no={self.document_no})>"
