from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn
from models.enums.BaseStatusEnum import BaseStatus


class DictWorkerTypeCreateDto(BaseModel):
    """创建工种字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    worker_type_code: str = Field(..., description="工种编码", min_length=1, max_length=50)
    worker_type_name: str = Field(..., description="工种名称", min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, description="补充说明", max_length=500)
    status: BaseStatus = Field(default=BaseStatus.ACTIVE, description="状态")


class DictWorkerTypeUpdateDto(BaseModel):
    """更新工种字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    worker_type_id: SnowflakeIdIn = Field(..., description="主键ID")
    worker_type_code: Optional[str] = Field(default=None, description="工种编码", max_length=50)
    worker_type_name: Optional[str] = Field(default=None, description="工种名称", max_length=200)
    description: Optional[str] = Field(default=None, description="补充说明", max_length=500)
    status: Optional[BaseStatus] = Field(default=None, description="状态")


class DictWorkerTypeDeleteDto(BaseModel):
    """删除工种字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    worker_type_id: SnowflakeIdIn = Field(..., description="主键ID")


class DictWorkerTypeQueryDto(PageRequest):
    """分页查询工种字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    worker_type_code: Optional[str] = Field(default=None, description="工种编码（模糊搜索）")
    worker_type_name: Optional[str] = Field(default=None, description="工种名称（模糊搜索）")
    status: Optional[BaseStatus] = Field(default=None, description="状态过滤")
