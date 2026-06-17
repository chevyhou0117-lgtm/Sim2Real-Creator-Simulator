from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn
from models.enums.BaseStatusEnum import BaseStatus


class DictStageTypeCreateDto(BaseModel):
    """创建制程类型字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    stage_type_code: str = Field(..., description="类型编码", min_length=1, max_length=50)
    stage_type_name: str = Field(..., description="类型名称", min_length=1, max_length=200)
    status: BaseStatus = Field(default=BaseStatus.ACTIVE, description="状态")


class DictStageTypeUpdateDto(BaseModel):
    """更新制程类型字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    stage_type_id: SnowflakeIdIn = Field(..., description="主键ID")
    stage_type_code: Optional[str] = Field(default=None, description="类型编码", max_length=50)
    stage_type_name: Optional[str] = Field(default=None, description="类型名称", max_length=200)
    status: Optional[BaseStatus] = Field(default=None, description="状态")


class DictStageTypeDeleteDto(BaseModel):
    """删除制程类型字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    stage_type_id: SnowflakeIdIn = Field(..., description="主键ID")


class DictStageTypeQueryDto(PageRequest):
    """分页查询制程类型字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    stage_type_code: Optional[str] = Field(default=None, description="类型编码（模糊搜索）")
    stage_type_name: Optional[str] = Field(default=None, description="类型名称（模糊搜索）")
    status: Optional[BaseStatus] = Field(default=None, description="状态过滤")
