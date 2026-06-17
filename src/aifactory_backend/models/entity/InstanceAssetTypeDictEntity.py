from sqlalchemy import Column, String, Text, TIMESTAMP, Boolean
from sqlalchemy.sql import func

from config.PgSqlConfig import Base


class InstanceAssetTypeDict(Base):
    """资产类型字典 ORM 实体（节点类型约束）"""
    __tablename__ = "instance_asset_type_dict"

    code = Column(String(50), primary_key=True, comment="类型编码：STAGE / LINE / EQUIPMENT")
    name = Column(String(200), nullable=False, comment="类型名称：制程 / 线体 / 设备")
    description = Column(Text, nullable=True, comment="类型描述")
    status = Column(String(20), nullable=False, server_default="ACTIVE", comment="状态")
    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), onupdate=func.now(), comment="更新时间")

    is_deleted = Column(Boolean, nullable=False, server_default="false", comment="逻辑删除标识")

    def __repr__(self):
        return f"<InstanceAssetTypeDict(code={self.code}, name={self.name})>"
