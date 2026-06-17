from typing import Optional, Any, Dict
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn


class BaseEquipmentTechnicalSpecCreateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    equipment_id: SnowflakeIdIn = Field(..., description="设备ID")
    main_parameters: Optional[Dict[str, Any]] = Field(default=None, description="主要技术参数（JSON）")
    power: Optional[str] = Field(default=None, description="设备功率", max_length=50)
    size: Optional[str] = Field(default=None, description="尺寸（长x宽x高）", max_length=100)
    weight: Optional[str] = Field(default=None, description="重量", max_length=50)


class BaseEquipmentTechnicalSpecUpdateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: SnowflakeIdIn = Field(..., description="主键ID")
    equipment_id: Optional[SnowflakeIdIn] = Field(default=None, description="设备ID")
    main_parameters: Optional[Dict[str, Any]] = Field(default=None, description="主要技术参数（JSON）")
    power: Optional[str] = Field(default=None, description="设备功率")
    size: Optional[str] = Field(default=None, description="尺寸（长x宽x高）")
    weight: Optional[str] = Field(default=None, description="重量")


class BaseEquipmentTechnicalSpecDeleteDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: SnowflakeIdIn = Field(..., description="主键ID")


class BaseEquipmentTechnicalSpecQueryDto(PageRequest):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    equipment_id: Optional[SnowflakeIdIn] = Field(default=None, description="设备ID过滤")
