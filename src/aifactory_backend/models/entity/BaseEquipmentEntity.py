from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.sql import func

from commonutils.SnowflakeUtils import generate_snowflake_id
from config.PgSqlConfig import Base


class BaseEquipment(Base):
    """基础设备表 ORM 实体"""
    __tablename__ = "md_equipment"
    plan_id = Column(String(36), nullable=True, index=True)

    equipment_id = Column(String(36), primary_key=True, default=generate_snowflake_id, comment="主键ID")
    operation_id = Column(String(36), ForeignKey("md_operation.operation_id"), nullable=False, comment="所属工序ID")
    line_id = Column(String(36), ForeignKey("md_production_line.line_id"), nullable=False, comment="所属产线ID（冗余）")
    equipment_code = Column(String(50), nullable=False, comment="设备编码")
    equipment_name = Column(String(200), nullable=False, comment="设备名称")
    equipment_type = Column(String(50), nullable=False, comment="设备类型")
    equipment_group_id = Column(String(50), nullable=True, comment="设备组ID")
    brand = Column(String(200), nullable=True, comment="设备品牌")
    manufacturer = Column(String(200), nullable=True, comment="设备厂商")
    model_no = Column(String(100), nullable=True, comment="设备型号")
    manufacture_date = Column(DateTime, nullable=True, comment="出厂日期")
    manufacture_code = Column(String(50), nullable=True, comment="出厂编号")
    made_in = Column(String(50), nullable=True, comment="产地")
    supplier = Column(String(50), nullable=True, comment="供应商")
    supplier_phone = Column(String(50), nullable=True, comment="供应商电话")
    purchase_date = Column(DateTime, nullable=True, comment="购置日期")
    service_life = Column(Integer, nullable=True, comment="使用寿命（年）")
    status = Column(String(20), nullable=False, server_default="ACTIVE", comment="状态")
    sort_order = Column(Integer, nullable=True, comment="排序")
    unit = Column(String(20), nullable=True, comment="设备单位")
    location = Column(String(50), nullable=True, comment="设备位置")
    equipment_photo = Column(String(500), nullable=True, comment="设备图片路径")
    responsible_person = Column(String(50), nullable=True, comment="责任人")
    asset_code = Column(String(50), nullable=True, comment="资产编号")
    creator_binding_id = Column(String(500), nullable=True, comment="Creator绑定ID")
    created_at = Column(DateTime, nullable=False, server_default=func.now(), comment="创建时间")
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now(), comment="更新时间")

    def __repr__(self):
        return f"<BaseEquipment(equipment_id={self.equipment_id}, equipment_code={self.equipment_code})>"
