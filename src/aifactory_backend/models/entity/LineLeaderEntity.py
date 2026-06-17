from sqlalchemy import Column, String, TIMESTAMP, ForeignKey
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class LineLeader(Base):
    """
    线体负责人 ORM 实体
    对应表: line_leaders_info
    """
    __tablename__ = "line_leaders_info"

    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花算法）")

    factory_asset_id = Column(
        String(36),
        ForeignKey("factory_asset_node.id", ondelete="CASCADE"),
        nullable=False,
        comment="关联线体资产节点ID（factory_asset_node.id）",
    )
    line_leader_name = Column(String(255), nullable=True, comment="产线负责人姓名")
    employee_id = Column(String(50), nullable=True, comment="员工ID")
    contact_number = Column(String(50), nullable=True, comment="联系电话")
    email = Column(String(255), nullable=True, comment="邮箱")
    shift_schedule = Column(String(100), nullable=True, comment="班次安排")
    shift_a_leader = Column(String(255), nullable=True, comment="A班负责人")
    shift_b_leader = Column(String(255), nullable=True, comment="B班负责人")
    shift_c_leader = Column(String(255), nullable=True, comment="C班负责人")

    created_at = Column(TIMESTAMP(timezone=True), server_default=func.now(), comment="创建时间")
    updated_at = Column(
        TIMESTAMP(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        comment="更新时间",
    )

    def __repr__(self):
        return f"<LineLeader(id={self.id}, factory_asset_id={self.factory_asset_id}, employee_id={self.employee_id})>"
