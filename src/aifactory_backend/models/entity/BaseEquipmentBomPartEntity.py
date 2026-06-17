from sqlalchemy import Column, String, Integer, Numeric, DateTime, ForeignKey
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class BaseEquipmentBomPart(Base):
    """设备BOM备件表 ORM 实体（1:N，支持自引用树结构）"""
    __tablename__ = "md_equipment_bom_part"

    plan_id = Column(String(36), nullable=True, index=True)

    id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID（雪花）")
    equipment_id = Column(String(36), ForeignKey("md_equipment.equipment_id"), nullable=False, comment="设备ID（外键→md_equipment）")
    part_code = Column(String(50), nullable=False, comment="备件编码")
    part_name = Column(String(200), nullable=False, comment="备件名称")
    part_model = Column(String(200), nullable=True, comment="备件型号")
    part_manufacturer = Column(String(200), nullable=True, comment="备件厂商")
    part_qty = Column(Integer, nullable=False, comment="备件数量")
    unit = Column(String(50), nullable=False, comment="备件单位")
    parent_part_id = Column(String(36), ForeignKey("md_equipment_bom_part.id"), nullable=True, comment="父级 part id（自引用，支持BOM树结构）")
    part_position = Column(String(200), nullable=True, comment="备件位置（父级part的什么位置）")
    part_photo_url = Column(String(200), nullable=True, comment="备件照片URL")
    part_theoretical_life = Column(Numeric(10, 3), nullable=True, comment="理论寿命（天）")
    part_remaining_life = Column(Numeric(10, 3), nullable=True, comment="剩余寿命（天）")
    created_at = Column(DateTime, nullable=False, server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now(), comment="更新时间")

    def __repr__(self):
        return f"<BaseEquipmentBomPart(id={self.id}, equipment_id={self.equipment_id}, part_code={self.part_code})>"
