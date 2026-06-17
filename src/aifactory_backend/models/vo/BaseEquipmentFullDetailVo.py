from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.enums.BaseStatusEnum import BaseStatus
from models.vo.BaseEquipmentTechnicalSpecVo import BaseEquipmentTechnicalSpecVo
from models.vo.BaseEquipmentProcessParamVo import BaseEquipmentProcessParamVo
from models.vo.BaseEquipmentBomPartVo import BaseEquipmentBomPartVo
from models.vo.BaseEquipmentSopVo import BaseEquipmentSopVo
from models.vo.BaseEquipmentOperationRecordVo import BaseEquipmentOperationRecordVo


class BaseEquipmentFullDetailVo(BaseModel):
    """设备完整详情聚合 VO（EquipmentBase + TechnicalSpec + ProcessParam + BOMPart + SOP + OperationRecord）"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    # ── 基础信息（base_equipment）
    equipment_id: SnowflakeIdOut = Field(..., description="设备主键ID")
    operation_id: Optional[str] = Field(default=None, description="所属工序ID")
    line_id: Optional[str] = Field(default=None, description="所属产线ID")
    equipment_code: str = Field(..., description="设备编码")
    equipment_name: str = Field(..., description="设备名称")
    equipment_type: Optional[str] = Field(default=None, description="设备类型")
    equipment_group_id: Optional[str] = Field(default=None, description="设备组ID")
    brand: Optional[str] = Field(default=None, description="设备品牌")
    manufacturer: Optional[str] = Field(default=None, description="设备厂商")
    model_no: Optional[str] = Field(default=None, description="设备型号")
    manufacture_date: Optional[datetime] = Field(default=None, description="出厂日期")
    manufacture_code: Optional[str] = Field(default=None, description="出厂编号")
    made_in: Optional[str] = Field(default=None, description="产地")
    supplier: Optional[str] = Field(default=None, description="供应商")
    supplier_phone: Optional[str] = Field(default=None, description="供应商电话")
    purchase_date: Optional[datetime] = Field(default=None, description="购置日期")
    service_life: Optional[int] = Field(default=None, description="使用寿命（年）")
    standard_ct: Optional[float] = Field(default=None, description="标准节拍（秒）")
    unit: Optional[str] = Field(default=None, description="设备单位")
    location: Optional[str] = Field(default=None, description="设备位置")
    equipment_photo: Optional[str] = Field(default=None, description="设备图片路径")
    responsible_person: Optional[str] = Field(default=None, description="责任人")
    asset_code: Optional[str] = Field(default=None, description="资产编号")
    status: Optional[BaseStatus] = Field(default=None, description="状态")
    sort_order: Optional[int] = Field(default=None, description="排序")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")

    # ── 技术规格（base_equipment_technical_spec，1:1）
    technical_spec: Optional[BaseEquipmentTechnicalSpecVo] = Field(default=None, description="设备技术规格（1:1）")

    # ── 过程参数（base_equipment_process_param，1:1）
    process_param: Optional[BaseEquipmentProcessParamVo] = Field(default=None, description="设备过程参数（1:1）")

    # ── BOM备件（base_equipment_bom_part，1:N）
    bom_parts: List[BaseEquipmentBomPartVo] = Field(default_factory=list, description="BOM备件列表（1:N）")

    # ── 作业指导（base_equipment_sop，1:N）
    sop_list: List[BaseEquipmentSopVo] = Field(default_factory=list, description="作业指导列表（1:N）")

    # ── 运行记录（base_equipment_operation_record，1:N）
    operation_records: List[BaseEquipmentOperationRecordVo] = Field(default_factory=list, description="运行记录列表（1:N）")
