from typing import Optional
from datetime import datetime, date
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from commonutils.SnowflakeUtils import SnowflakeIdOut


class BaseStaffingConfigVo(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    staffing_id: SnowflakeIdOut = Field(..., description="主键ID")
    factory_id: Optional[str] = Field(default=None, description="工厂ID")
    operation_id: Optional[str] = Field(default=None, description="工序ID")
    worker_type_id: Optional[str] = Field(default=None, description="工种ID")
    worker_count: Optional[int] = Field(default=None, description="人数配置")
    ct_with_this_count: Optional[float] = Field(default=None, description="对应CT（秒）")
    is_standard: Optional[bool] = Field(default=None, description="是否标准配置")
    effective_date: Optional[date] = Field(default=None, description="生效日期")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
