from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn


class BaseEquipmentBomPartCreateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    equipment_id: SnowflakeIdIn = Field(..., description="设备ID")
    part_code: str = Field(..., description="备件编码", max_length=50)
    part_name: str = Field(..., description="备件名称", max_length=200)
    part_model: Optional[str] = Field(default=None, description="备件型号", max_length=200)
    part_manufacturer: Optional[str] = Field(default=None, description="备件厂商", max_length=200)
    part_qty: int = Field(..., description="备件数量", gt=0)
    unit: str = Field(..., description="备件单位", max_length=50)
    parent_part_id: Optional[SnowflakeIdIn] = Field(default=None, description="父级 part id（自引用）")
    part_position: Optional[str] = Field(default=None, description="备件位置", max_length=200)
    part_photo_url: Optional[str] = Field(default=None, description="备件照片URL", max_length=500)
    part_theoretical_life: Optional[float] = Field(default=None, description="理论寿命（天）")
    part_remaining_life: Optional[float] = Field(default=None, description="剩余寿命（天）")


class BaseEquipmentBomPartUpdateDto(BaseModel):

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: SnowflakeIdIn = Field(..., description="主键ID")
    equipment_id: Optional[SnowflakeIdIn] = Field(default=None, description="设备ID")
    part_code: Optional[str] = Field(default=None, description="备件编码", max_length=50)
    part_name: Optional[str] = Field(default=None, description="备件名称", max_length=200)
    part_model: Optional[str] = Field(default=None, description="备件型号")
    part_manufacturer: Optional[str] = Field(default=None, description="备件厂商")
    part_qty: Optional[int] = Field(default=None, description="备件数量", gt=0)
    unit: Optional[str] = Field(default=None, description="备件单位")
    parent_part_id: Optional[SnowflakeIdIn] = Field(default=None, description="父级 part id（自引用）")
    part_position: Optional[str] = Field(default=None, description="备件位置")
    part_photo_url: Optional[str] = Field(default=None, description="备件照片URL")
    part_theoretical_life: Optional[float] = Field(default=None, description="理论寿命（天）")
    part_remaining_life: Optional[float] = Field(default=None, description="剩余寿命（天）")


class BaseEquipmentBomPartDeleteDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: SnowflakeIdIn = Field(..., description="主键ID")


class BaseEquipmentBomPartQueryDto(PageRequest):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    equipment_id: Optional[SnowflakeIdIn] = Field(default=None, description="设备ID过滤")
    part_code: Optional[str] = Field(default=None, description="备件编码（模糊搜索）")
    part_name: Optional[str] = Field(default=None, description="备件名称（模糊搜索）")
    parent_part_id: Optional[SnowflakeIdIn] = Field(default=None, description="父级 part id 过滤")
