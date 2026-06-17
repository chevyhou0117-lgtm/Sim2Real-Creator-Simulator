from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from commonutils.SnowflakeUtils import SnowflakeIdOut


class BaseEquipmentBomPartVo(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    id: SnowflakeIdOut = Field(..., description="主键ID")
    equipment_id: Optional[str] = Field(default=None, description="设备ID")
    part_code: Optional[str] = Field(default=None, description="备件编码")
    part_name: Optional[str] = Field(default=None, description="备件名称")
    part_model: Optional[str] = Field(default=None, description="备件型号")
    part_manufacturer: Optional[str] = Field(default=None, description="备件厂商")
    part_qty: Optional[int] = Field(default=None, description="备件数量")
    unit: Optional[str] = Field(default=None, description="备件单位")
    parent_part_id: Optional[str] = Field(default=None, description="父级 part id（自引用）")
    part_position: Optional[str] = Field(default=None, description="备件位置")
    part_photo_url: Optional[str] = Field(default=None, description="备件照片URL")
    part_theoretical_life: Optional[float] = Field(default=None, description="理论寿命（天）")
    part_remaining_life: Optional[float] = Field(default=None, description="剩余寿命（天）")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
