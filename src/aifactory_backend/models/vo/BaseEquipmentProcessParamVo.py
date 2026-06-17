from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from commonutils.SnowflakeUtils import SnowflakeIdOut


class BaseEquipmentProcessParamVo(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    id: SnowflakeIdOut = Field(..., description="主键ID")
    equipment_id: Optional[str] = Field(default=None, description="设备ID")
    standard_ct: Optional[float] = Field(default=None, description="设备标准节拍（秒）")
    standard_yield_rate: Optional[float] = Field(default=None, description="设备标准良品率（0.0000~1.0000）")
    standard_work_efficiency: Optional[float] = Field(default=None, description="设备标准作业效率（0.0000~1.0000）")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
