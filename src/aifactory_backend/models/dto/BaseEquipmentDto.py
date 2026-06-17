from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn
from models.enums.BaseStatusEnum import BaseStatus


class BaseEquipmentCreateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    operation_id: SnowflakeIdIn = Field(..., description="所属工序ID")
    line_id: Optional[SnowflakeIdIn] = Field(default=None, description="所属产线ID")
    equipment_code: str = Field(..., description="设备编码", max_length=50)
    equipment_name: str = Field(..., description="设备名称", max_length=200)
    equipment_type: str = Field(..., description="设备类型", max_length=50)
    equipment_group_id: Optional[str] = Field(default=None, description="设备组ID", max_length=50)
    brand: Optional[str] = Field(default=None, description="设备品牌", max_length=200)
    manufacturer: Optional[str] = Field(default=None, description="设备厂商", max_length=200)
    model_no: Optional[str] = Field(default=None, description="设备型号", max_length=100)
    manufacture_date: Optional[datetime] = Field(default=None, description="出厂日期")
    manufacture_code: Optional[str] = Field(default=None, description="出厂编号", max_length=50)
    made_in: Optional[str] = Field(default=None, description="产地", max_length=50)
    supplier: Optional[str] = Field(default=None, description="供应商", max_length=50)
    supplier_phone: Optional[str] = Field(default=None, description="供应商电话", max_length=50)
    purchase_date: Optional[datetime] = Field(default=None, description="购置日期")
    service_life: Optional[int] = Field(default=None, description="使用寿命（年）")
    standard_ct: Optional[float] = Field(default=None, description="标准节拍（秒）")
    unit: Optional[str] = Field(default=None, description="设备单位", max_length=20)
    location: Optional[str] = Field(default=None, description="设备位置", max_length=50)
    equipment_photo: Optional[str] = Field(default=None, description="设备图片路径", max_length=1024)
    responsible_person: Optional[str] = Field(default=None, description="责任人", max_length=50)
    asset_code: Optional[str] = Field(default=None, description="资产编号", max_length=50)
    status: BaseStatus = Field(default=BaseStatus.ACTIVE, description="状态")
    sort_order: Optional[int] = Field(default=None, description="排序")


class BaseEquipmentUpdateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    equipment_id: SnowflakeIdIn = Field(..., description="主键ID")
    operation_id: Optional[SnowflakeIdIn] = Field(default=None, description="所属工序ID")
    line_id: Optional[SnowflakeIdIn] = Field(default=None, description="所属产线ID")
    equipment_code: Optional[str] = Field(default=None, description="设备编码", max_length=50)
    equipment_name: Optional[str] = Field(default=None, description="设备名称", max_length=200)
    equipment_type: Optional[str] = Field(default=None, description="设备类型", max_length=50)
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


class BaseEquipmentDeleteDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    equipment_id: SnowflakeIdIn = Field(..., description="主键ID")


class BaseEquipmentBatchCreateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    items: List[BaseEquipmentCreateDto] = Field(..., description="批量创建设备列表")


class BaseEquipmentQueryDto(PageRequest):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    operation_id: Optional[SnowflakeIdIn] = Field(default=None, description="工序ID过滤")
    line_id: Optional[SnowflakeIdIn] = Field(default=None, description="产线ID过滤")
    equipment_code: Optional[str] = Field(default=None, description="设备编码（模糊搜索）")
    equipment_name: Optional[str] = Field(default=None, description="设备名称（模糊搜索）")
    equipment_type: Optional[str] = Field(default=None, description="设备类型过滤")
    status: Optional[BaseStatus] = Field(default=None, description="状态过滤")


class QueryEquipmentByLineIdDto(BaseModel):
    """根据父节点(线体)查询其下设备的请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    parent_id: SnowflakeIdIn = Field(..., description="工厂资产节点 parentId（线体节点）")
    keyword: Optional[str] = Field(default=None, description="按设备名称/编码模糊过滤")
