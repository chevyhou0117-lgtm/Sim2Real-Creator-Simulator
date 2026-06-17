from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn


class BaseEquipmentProcessParamCreateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    equipment_id: SnowflakeIdIn = Field(..., description="设备ID")
    standard_ct: Optional[float] = Field(default=None, description="设备标准节拍（秒），必须大于0", gt=0)
    standard_yield_rate: Optional[float] = Field(default=None, description="设备标准良品率（0.0000~1.0000）", ge=0, le=1)
    standard_work_efficiency: Optional[float] = Field(default=None, description="设备标准作业效率（0.0000~1.0000）", ge=0, le=1)


class BaseEquipmentProcessParamUpdateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: SnowflakeIdIn = Field(..., description="主键ID")
    equipment_id: Optional[SnowflakeIdIn] = Field(default=None, description="设备ID")
    standard_ct: Optional[float] = Field(default=None, description="设备标准节拍（秒），必须大于0", gt=0)
    standard_yield_rate: Optional[float] = Field(default=None, description="设备标准良品率（0.0000~1.0000）", ge=0, le=1)
    standard_work_efficiency: Optional[float] = Field(default=None, description="设备标准作业效率（0.0000~1.0000）", ge=0, le=1)


class BaseEquipmentProcessParamDeleteDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: SnowflakeIdIn = Field(..., description="主键ID")


class BaseEquipmentProcessParamQueryDto(PageRequest):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    equipment_id: Optional[SnowflakeIdIn] = Field(default=None, description="设备ID过滤")
