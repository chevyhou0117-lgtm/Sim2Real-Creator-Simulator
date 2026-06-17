from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn


class BaseEquipmentOperationRecordCreateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    equipment_id: int = Field(..., description="设备ID")
    record_code: str = Field(..., description="记录编号", max_length=36)
    record_type: str = Field(..., description="记录类型：EQUIPMENT_ADD / EQUIPMENT_REPAIR / EQUIPMENT_MOVE / EQUIPMENT_MAINTENANCE / EQUIPMENT_SCRAP", max_length=50)
    related_department: Optional[str] = Field(default=None, description="相关部门", max_length=100)
    stage_status: Optional[str] = Field(default=None, description="阶段状态（如：进行中/已完成）", max_length=50)
    record_description: Optional[str] = Field(default=None, description="记录详细描述")
    created_by: str = Field(..., description="创建人", max_length=50)


class BaseEquipmentOperationRecordUpdateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: SnowflakeIdIn = Field(..., description="主键ID")
    equipment_id: Optional[int] = Field(default=None, description="设备ID")
    record_code: Optional[str] = Field(default=None, description="记录编号", max_length=36)
    record_type: Optional[str] = Field(default=None, description="记录类型", max_length=50)
    related_department: Optional[str] = Field(default=None, description="相关部门")
    stage_status: Optional[str] = Field(default=None, description="阶段状态")
    record_description: Optional[str] = Field(default=None, description="记录详细描述")
    created_by: Optional[str] = Field(default=None, description="创建人")


class BaseEquipmentOperationRecordDeleteDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: SnowflakeIdIn = Field(..., description="主键ID")


class BaseEquipmentOperationRecordQueryDto(PageRequest):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    equipment_id: Optional[int] = Field(default=None, description="设备ID过滤")
    record_code: Optional[str] = Field(default=None, description="记录编号（模糊搜索）")
    record_type: Optional[str] = Field(default=None, description="记录类型过滤")
    stage_status: Optional[str] = Field(default=None, description="阶段状态过滤")
