from typing import Optional, Any, Dict
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from commonutils.SnowflakeUtils import SnowflakeIdOut


class BaseEquipmentTechnicalSpecVo(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    id: SnowflakeIdOut = Field(..., description="主键ID")
    equipment_id: Optional[str] = Field(default=None, description="设备ID")
    main_parameters: Optional[Dict[str, Any]] = Field(default=None, description="主要技术参数（JSON）")
    power: Optional[str] = Field(default=None, description="设备功率")
    size: Optional[str] = Field(default=None, description="尺寸（长x宽x高）")
    weight: Optional[str] = Field(default=None, description="重量")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
