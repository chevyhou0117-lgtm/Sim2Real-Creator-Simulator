from sqlalchemy import Column, String, TIMESTAMP, ForeignKey, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class LineModelEquipmentRel(Base):
    """
    线体挂载设备实例关联 ORM 实体
    对应表: line_model_equipment_rel
    记录某条线体模型下挂载了哪些设备模型实例
    """
    __tablename__ = "line_model_equipment_rel"

    # 1. 主键（雪花算法 ID）
    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花算法）")

    # 2. 关联外键
    line_model_id = Column(
        String(36),
        ForeignKey("line_model_details.id", ondelete="CASCADE"),
        nullable=False,
        comment="关联线体模型详情ID (line_model_details.id)"
    )
    equipment_model_id = Column(
        String(36),
        ForeignKey("equipment_model_details.id", ondelete="CASCADE"),
        nullable=False,
        comment="关联设备模型详情ID (equipment_model_details.id)"
    )

    # 3. 实例信息
    instance_name = Column(String(255), nullable=True, comment="设备实例名称")

    # 4. 位置与旋转数据（JSONB）
    position_data = Column(
        JSONB,
        nullable=True,
        server_default='{"pos_x": 0, "pos_y": 0, "pos_z": 0}',
        comment="位置数据，格式: {pos_x, pos_y, pos_z}"
    )
    rotation_data = Column(
        JSONB,
        nullable=True,
        server_default='{"rot_pitch": 0, "rot_yaw": 0, "rot_roll": 0}',
        comment="旋转数据，格式: {rot_pitch, rot_yaw, rot_roll}"
    )

    # 5. 设备状态与区域
    device_status = Column(
        String(50),
        nullable=True,
        server_default="active",
        comment="设备状态: active（运行中）/ inactive（停机）"
    )
    device_area = Column(String(100), nullable=True, comment="设备所在区域，如: 生产线A、车间1")

    # 6. USD 文件路径（设备实例在线体中对应的完整 USD 路径）
    root_usd_path = Column(String(1024), nullable=True, server_default="", comment="设备实例 USD 文件完整路径")
    # 7. 时间戳
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
        return (
            f"<LineModelEquipmentRel("
            f"id={self.id}, "
            f"line_model_id={self.line_model_id}, "
            f"equipment_model_id={self.equipment_model_id}, "
            f"instance_name={self.instance_name}"
            f")>"
        )
