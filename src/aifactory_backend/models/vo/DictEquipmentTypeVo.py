from typing import Optional
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.enums.BaseStatusEnum import BaseStatus


class DictEquipmentTypeVo(BaseModel):
    """设备类型字典响应 VO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    equipment_type_id: SnowflakeIdOut = Field(..., description="主键ID")
    equipment_type_code: str = Field(..., description="类型编码")
    equipment_type_name: str = Field(..., description="类型名称")
    description: Optional[str] = Field(default=None, description="补充说明")
    status: Optional[BaseStatus] = Field(default=None, description="状态")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
