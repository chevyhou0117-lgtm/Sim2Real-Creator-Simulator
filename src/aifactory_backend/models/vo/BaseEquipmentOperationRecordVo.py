from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from commonutils.SnowflakeUtils import SnowflakeIdOut


class BaseEquipmentOperationRecordVo(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    id: SnowflakeIdOut = Field(..., description="主键ID")
    equipment_id: Optional[str] = Field(default=None, description="设备ID")
    record_code: Optional[str] = Field(default=None, description="记录编号")
    record_type: Optional[str] = Field(default=None, description="记录类型")
    related_department: Optional[str] = Field(default=None, description="相关部门")
    stage_status: Optional[str] = Field(default=None, description="阶段状态")
    record_description: Optional[str] = Field(default=None, description="记录详细描述")
    created_by: Optional[str] = Field(default=None, description="创建人")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
