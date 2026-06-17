from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.enums.BaseStatusEnum import BaseStatus


class BaseEquipmentVo(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    equipment_id: SnowflakeIdOut = Field(..., description="主键ID")
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
    service_life: Optional[int] = Field(default=None, description="使用寿命")
    standard_ct: Optional[float] = Field(default=None, description="标准节拍")
    unit: Optional[str] = Field(default=None, description="设备单位")
    location: Optional[str] = Field(default=None, description="设备位置")
    equipment_photo: Optional[str] = Field(default=None, description="设备图片路径")
    responsible_person: Optional[str] = Field(default=None, description="责任人")
    asset_code: Optional[str] = Field(default=None, description="资产编号")
    status: Optional[BaseStatus] = Field(default=None, description="状态")
    sort_order: Optional[int] = Field(default=None, description="排序")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
