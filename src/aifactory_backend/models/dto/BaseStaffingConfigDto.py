from typing import Optional
from datetime import date
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn


class BaseStaffingConfigCreateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    factory_id: int = Field(..., description="工厂ID")
    operation_id: int = Field(..., description="工序ID")
    worker_type_id: int = Field(..., description="工种ID")
    worker_count: int = Field(..., description="人数配置")
    ct_with_this_count: float = Field(..., description="对应CT（秒）")
    is_standard: bool = Field(default=False, description="是否标准配置")
    effective_date: Optional[date] = Field(default=None, description="生效日期")


class BaseStaffingConfigUpdateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    staffing_id: SnowflakeIdIn = Field(..., description="主键ID")
    factory_id: Optional[int] = Field(default=None, description="工厂ID")
    operation_id: Optional[int] = Field(default=None, description="工序ID")
    worker_type_id: Optional[int] = Field(default=None, description="工种ID")
    worker_count: Optional[int] = Field(default=None, description="人数配置")
    ct_with_this_count: Optional[float] = Field(default=None, description="对应CT（秒）")
    is_standard: Optional[bool] = Field(default=None, description="是否标准配置")
    effective_date: Optional[date] = Field(default=None, description="生效日期")


class BaseStaffingConfigDeleteDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    staffing_id: SnowflakeIdIn = Field(..., description="主键ID")


class BaseStaffingConfigQueryDto(PageRequest):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    factory_id: Optional[int] = Field(default=None, description="工厂ID过滤")
    operation_id: Optional[int] = Field(default=None, description="工序ID过滤")
    worker_type_id: Optional[int] = Field(default=None, description="工种ID过滤")
    is_standard: Optional[bool] = Field(default=None, description="是否标准配置过滤")
