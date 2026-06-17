from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn
from models.enums.BaseStatusEnum import BaseStatus


class BaseWipBufferCreateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    line_id: SnowflakeIdIn = Field(..., description="所属产线ID")
    wip_code: str = Field(..., description="线边仓编码", max_length=50)
    wip_name: str = Field(..., description="线边仓名称", max_length=200)
    capacity_volume: float = Field(..., description="总容量")
    capacity_qty: Optional[int] = Field(default=None, description="最大存放件数")
    pre_operation_id: Optional[SnowflakeIdIn] = Field(default=None, description="前置工序ID")
    post_operation_id: Optional[SnowflakeIdIn] = Field(default=None, description="后置工序ID")
    location: Optional[str] = Field(default=None, description="物理位置", max_length=200)
    status: BaseStatus = Field(default=BaseStatus.ACTIVE, description="状态")


class BaseWipBufferUpdateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    wip_id: SnowflakeIdIn = Field(..., description="主键ID")
    line_id: Optional[SnowflakeIdIn] = Field(default=None, description="所属产线ID")
    wip_code: Optional[str] = Field(default=None, description="线边仓编码", max_length=50)
    wip_name: Optional[str] = Field(default=None, description="线边仓名称", max_length=200)
    capacity_volume: Optional[float] = Field(default=None, description="总容量")
    capacity_qty: Optional[int] = Field(default=None, description="最大存放件数")
    pre_operation_id: Optional[SnowflakeIdIn] = Field(default=None, description="前置工序ID")
    post_operation_id: Optional[SnowflakeIdIn] = Field(default=None, description="后置工序ID")
    location: Optional[str] = Field(default=None, description="物理位置")
    status: Optional[BaseStatus] = Field(default=None, description="状态")


class BaseWipBufferDeleteDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    wip_id: SnowflakeIdIn = Field(..., description="主键ID")


class BaseWipBufferQueryDto(PageRequest):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    line_id: Optional[SnowflakeIdIn] = Field(default=None, description="产线ID过滤")
    wip_code: Optional[str] = Field(default=None, description="线边仓编码（模糊搜索）")
    wip_name: Optional[str] = Field(default=None, description="线边仓名称（模糊搜索）")
    status: Optional[BaseStatus] = Field(default=None, description="状态过滤")
