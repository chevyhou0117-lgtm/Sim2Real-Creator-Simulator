from sqlalchemy import Column, String, TIMESTAMP
from sqlalchemy.sql import func

from config.PgSqlConfig import Base


class FactoryWorkerTypeRel(Base):
    """工厂-工种关联表 ORM 实体"""
    __tablename__ = "factory_worker_type_rel"

    factory_id = Column(String(36), nullable=False, primary_key=True, comment="工厂ID")
    worker_type_id = Column(String(36), nullable=False, primary_key=True, comment="工种ID")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), comment="创建时间")

    def __repr__(self):
        return f"<FactoryWorkerTypeRel(factory_id={self.factory_id}, worker_type_id={self.worker_type_id})>"
