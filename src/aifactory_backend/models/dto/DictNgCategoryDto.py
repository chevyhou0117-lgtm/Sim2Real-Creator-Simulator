from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn
from models.enums.BaseStatusEnum import BaseStatus


class DictNgCategoryCreateDto(BaseModel):
    """创建不良类型字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    ng_code: str = Field(..., description="不良编码", min_length=1, max_length=20)
    ng_name: str = Field(..., description="不良名称", min_length=1, max_length=100)
    impact_level: str = Field(..., description="影响等级: LOW/MEDIUM/HIGH")
    status: BaseStatus = Field(default=BaseStatus.ACTIVE, description="状态")


class DictNgCategoryUpdateDto(BaseModel):
    """更新不良类型字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    ng_category_id: SnowflakeIdIn = Field(..., description="主键ID")
    ng_code: Optional[str] = Field(default=None, description="不良编码", max_length=20)
    ng_name: Optional[str] = Field(default=None, description="不良名称", max_length=100)
    impact_level: Optional[str] = Field(default=None, description="影响等级")
    status: Optional[BaseStatus] = Field(default=None, description="状态")


class DictNgCategoryDeleteDto(BaseModel):
    """删除不良类型字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    ng_category_id: SnowflakeIdIn = Field(..., description="主键ID")


class DictNgCategoryQueryDto(PageRequest):
    """分页查询不良类型字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    ng_code: Optional[str] = Field(default=None, description="不良编码（模糊搜索）")
    ng_name: Optional[str] = Field(default=None, description="不良名称（模糊搜索）")
    impact_level: Optional[str] = Field(default=None, description="影响等级过滤")
    status: Optional[BaseStatus] = Field(default=None, description="状态过滤")
