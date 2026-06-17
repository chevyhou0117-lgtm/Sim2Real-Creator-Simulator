from typing import Optional
from datetime import datetime, date
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from commonutils.SnowflakeUtils import SnowflakeIdOut


class BaseEquipmentFailureParamVo(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    param_id: SnowflakeIdOut = Field(..., description="主键ID")
    equipment_id: Optional[str] = Field(default=None, description="设备ID")
    mtbf_hours: Optional[float] = Field(default=None, description="平均无故障间隔（小时）")
    mttr_minutes: Optional[float] = Field(default=None, description="平均维修时间（分钟）")
    failure_distribution: Optional[str] = Field(default=None, description="故障分布模型")
    data_source: Optional[str] = Field(default=None, description="数据来源")
    effective_date: Optional[date] = Field(default=None, description="生效日期")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
