from typing import Optional
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.enums.BaseStatusEnum import BaseStatus


class BaseFactoryVo(BaseModel):
    """工厂基础信息响应 VO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    factory_id: SnowflakeIdOut = Field(..., description="工厂主键ID（雪花算法）")
    factory_name: str = Field(..., description="工厂名称")
    factory_code: Optional[str] = Field(default=None, description="工厂编码")
    site_length: Optional[float] = Field(default=None, description="现实物理长度")
    site_width: Optional[float] = Field(default=None, description="现实物理宽度")
    location: Optional[str] = Field(default=None, description="工厂地理位置")
    timezone: Optional[str] = Field(default=None, description="时区")
    status: Optional[BaseStatus] = Field(default=None, description="工厂状态(ACTIVE/INACTIVE)")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
