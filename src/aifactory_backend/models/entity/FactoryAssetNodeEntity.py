from sqlalchemy import Column, String, Text, TIMESTAMP, ForeignKey, Boolean
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class FactoryAssetNode(Base):
    """
    工厂资产节点 ORM 实体（v2）
    对应表: factory_asset_node
    核心变更：ref_id 已迁移至各详情表（factory_process_details/factory_line_details/factory_equipment_details）
    节点表只负责树形结构 + 版本关联
    """
    __tablename__ = "factory_asset_node"

    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花算法）")

    factory_projects_id = Column(String(36), ForeignKey("factory_projects.project_id", ondelete="CASCADE"), nullable=False, comment="关联工厂项目ID")
    version_id = Column(String(36), ForeignKey("factory_project_version.version_id", ondelete="CASCADE"), nullable=False, comment="关联项目版本ID")

    name = Column(String(255), nullable=False, comment="节点名称")
    code = Column(String(100), nullable=True, comment="节点编码")
    type = Column(String(50), ForeignKey("instance_asset_type_dict.code"), nullable=False, comment="节点类型：STAGE / LINE / EQUIPMENT")

    parent_id = Column(String(36), ForeignKey("factory_asset_node.id", ondelete="SET NULL"), nullable=True, comment="父节点ID（树结构）")
    description = Column(Text, nullable=True, comment="描述")
    bind_status = Column(String(30), nullable=False, server_default="UNBOUND", comment="绑定状态：UNBOUND/BOUND/BIND_FAILED/PARTIALLY_BOUND")

    created_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        comment="创建时间"
    )
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        comment="更新时间"
    )
    is_deleted = Column(Boolean, nullable=False, server_default="false", comment="逻辑删除标识")

    def __repr__(self):
        return f"<FactoryAssetNode(id={self.id}, name={self.name}, type={self.type})>"
