from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.enums.BaseStatusEnum import BaseStatus


class BaseWipBufferVo(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    wip_id: SnowflakeIdOut = Field(..., description="主键ID")
    line_id: Optional[str] = Field(default=None, description="所属产线ID")
    wip_code: str = Field(..., description="线边仓编码")
    wip_name: str = Field(..., description="线边仓名称")
    capacity_volume: Optional[float] = Field(default=None, description="总容量")
    capacity_qty: Optional[int] = Field(default=None, description="最大存放件数")
    pre_operation_id: Optional[str] = Field(default=None, description="前置工序ID")
    post_operation_id: Optional[str] = Field(default=None, description="后置工序ID")
    location: Optional[str] = Field(default=None, description="物理位置")
    status: Optional[BaseStatus] = Field(default=None, description="状态")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
