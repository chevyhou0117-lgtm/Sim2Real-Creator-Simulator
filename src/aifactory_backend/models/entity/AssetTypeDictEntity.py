from sqlalchemy import Column, String, Boolean

from config.PgSqlConfig import Base


class AssetTypeDict(Base):
    """
    资产类型字典 ORM 实体
    对应表: asset_type_dict
    """
    __tablename__ = "asset_type_dict"

    # 1. 主键（类型编码，如: process / line_type / equipment_type / line_model / equipment_model）
    code = Column(String(50), primary_key=True, comment="类型编码（主键），如: process")

    # 2. 类型名称
    name = Column(String(100), nullable=False, comment="类型名称，如: 工序")

    is_deleted = Column(Boolean, nullable=False, server_default="false", comment="逻辑删除标识")

    def __repr__(self):
        return f"<AssetTypeDict(code={self.code}, name={self.name})>"
