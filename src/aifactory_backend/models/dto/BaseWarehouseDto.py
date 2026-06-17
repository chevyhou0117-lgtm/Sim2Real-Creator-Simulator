from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn
from models.enums.BaseStatusEnum import BaseStatus


class BaseWarehouseCreateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    factory_id: SnowflakeIdIn = Field(..., description="所属工厂ID")
    warehouse_code: str = Field(..., description="仓库编码", max_length=50)
    warehouse_name: str = Field(..., description="仓库名称", max_length=200)
    warehouse_type: str = Field(..., description="仓库类型", max_length=30)
    location: Optional[str] = Field(default=None, description="仓库位置", max_length=200)
    total_capacity: Optional[float] = Field(default=None, description="总容量")
    status: BaseStatus = Field(default=BaseStatus.ACTIVE, description="状态")


class BaseWarehouseUpdateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    warehouse_id: SnowflakeIdIn = Field(..., description="主键ID")
    factory_id: Optional[SnowflakeIdIn] = Field(default=None, description="所属工厂ID")
    warehouse_code: Optional[str] = Field(default=None, description="仓库编码", max_length=50)
    warehouse_name: Optional[str] = Field(default=None, description="仓库名称", max_length=200)
    warehouse_type: Optional[str] = Field(default=None, description="仓库类型", max_length=30)
    location: Optional[str] = Field(default=None, description="仓库位置")
    total_capacity: Optional[float] = Field(default=None, description="总容量")
    status: Optional[BaseStatus] = Field(default=None, description="状态")


class BaseWarehouseDeleteDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    warehouse_id: SnowflakeIdIn = Field(..., description="主键ID")


class BaseWarehouseQueryDto(PageRequest):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    factory_id: Optional[SnowflakeIdIn] = Field(default=None, description="工厂ID过滤")
    warehouse_code: Optional[str] = Field(default=None, description="仓库编码（模糊搜索）")
    warehouse_name: Optional[str] = Field(default=None, description="仓库名称（模糊搜索）")
    warehouse_type: Optional[str] = Field(default=None, description="仓库类型过滤")
    status: Optional[BaseStatus] = Field(default=None, description="状态过滤")
