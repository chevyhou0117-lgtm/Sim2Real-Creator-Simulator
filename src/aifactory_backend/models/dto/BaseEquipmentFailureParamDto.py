from typing import Optional
from datetime import date
from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel
from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn

VALID_FAILURE_DISTRIBUTIONS = {"EXPONENTIAL", "NORMAL", "WEIBULL"}


class BaseEquipmentFailureParamCreateDto(BaseModel):

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    equipment_id: SnowflakeIdIn = Field(..., description="设备ID")
    mtbf_hours: float = Field(..., description="平均无故障间隔（小时）")
    mttr_minutes: float = Field(..., description="平均维修时间（分钟）")
    failure_distribution: str = Field(default="EXPONENTIAL", description="故障分布模型")
    data_source: Optional[str] = Field(default=None, description="数据来源", max_length=100)
    effective_date: Optional[date] = Field(default=None, description="生效日期")

    @field_validator("failure_distribution")
    @classmethod
    def validate_failure_distribution(cls, v: str) -> str:
        if v not in VALID_FAILURE_DISTRIBUTIONS:
            raise ValueError(f"故障分布模型不合法: {v}，仅支持 {', '.join(sorted(VALID_FAILURE_DISTRIBUTIONS))}")
        return v


class BaseEquipmentFailureParamUpdateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    param_id: SnowflakeIdIn = Field(..., description="主键ID")
    equipment_id: Optional[SnowflakeIdIn] = Field(default=None, description="设备ID")
    mtbf_hours: Optional[float] = Field(default=None, description="平均无故障间隔（小时）")
    mttr_minutes: Optional[float] = Field(default=None, description="平均维修时间（分钟）")
    failure_distribution: Optional[str] = Field(default=None, description="故障分布模型")
    data_source: Optional[str] = Field(default=None, description="数据来源")
    effective_date: Optional[date] = Field(default=None, description="生效日期")

    @field_validator("failure_distribution")
    @classmethod
    def validate_failure_distribution(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_FAILURE_DISTRIBUTIONS:
            raise ValueError(f"故障分布模型不合法: {v}，仅支持 {', '.join(sorted(VALID_FAILURE_DISTRIBUTIONS))}")
        return v


class BaseEquipmentFailureParamDeleteDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    param_id: SnowflakeIdIn = Field(..., description="主键ID")


class BaseEquipmentFailureParamQueryDto(PageRequest):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    equipment_id: Optional[SnowflakeIdIn] = Field(default=None, description="设备ID过滤")
    failure_distribution: Optional[str] = Field(default=None, description="故障分布模型过滤")
