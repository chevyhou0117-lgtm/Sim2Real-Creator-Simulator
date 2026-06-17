from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn
from models.enums.BaseStatusEnum import BaseStatus


class DictWarehouseTypeCreateDto(BaseModel):
    """创建仓库类型字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    warehouse_type_code: str = Field(..., description="类型编码", min_length=1, max_length=50)
    warehouse_type_name: str = Field(..., description="类型名称", min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, description="补充说明", max_length=500)
    status: BaseStatus = Field(default=BaseStatus.ACTIVE, description="状态")


class DictWarehouseTypeUpdateDto(BaseModel):
    """更新仓库类型字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    warehouse_type_id: SnowflakeIdIn = Field(..., description="主键ID")
    warehouse_type_code: Optional[str] = Field(default=None, description="类型编码", max_length=50)
    warehouse_type_name: Optional[str] = Field(default=None, description="类型名称", max_length=200)
    description: Optional[str] = Field(default=None, description="补充说明", max_length=500)
    status: Optional[BaseStatus] = Field(default=None, description="状态")


class DictWarehouseTypeDeleteDto(BaseModel):
    """删除仓库类型字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    warehouse_type_id: SnowflakeIdIn = Field(..., description="主键ID")


class DictWarehouseTypeQueryDto(PageRequest):
    """分页查询仓库类型字典请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    warehouse_type_code: Optional[str] = Field(default=None, description="类型编码（模糊搜索）")
    warehouse_type_name: Optional[str] = Field(default=None, description="类型名称（模糊搜索）")
    status: Optional[BaseStatus] = Field(default=None, description="状态过滤")
