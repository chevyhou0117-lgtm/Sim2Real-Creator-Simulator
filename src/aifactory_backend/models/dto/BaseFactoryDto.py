from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn
from models.enums.BaseStatusEnum import BaseStatus


class BaseFactoryCreateDto(BaseModel):
    """创建工厂基础信息请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    factory_name: str = Field(..., description="工厂名称，如：深圳一厂", min_length=1, max_length=255)
    factory_code: Optional[str] = Field(default=None, description="工厂编码（唯一）", max_length=50)
    site_length: Optional[float] = Field(default=None, description="现实物理长度")
    site_width: Optional[float] = Field(default=None, description="现实物理宽度")
    location: Optional[str] = Field(default=None, description="工厂地理位置")
    timezone: Optional[str] = Field(default=None, description="时区", max_length=50)
    status: BaseStatus = Field(default=BaseStatus.ACTIVE, description="工厂状态(ACTIVE/INACTIVE)")


class BaseFactoryUpdateDto(BaseModel):
    """更新工厂基础信息请求 DTO（factory_id 必填）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    factory_id: SnowflakeIdIn = Field(..., description="工厂主键ID（雪花算法，18~19位整数）")

    factory_name: Optional[str] = Field(default=None, description="工厂名称", max_length=255)
    factory_code: Optional[str] = Field(default=None, description="工厂编码（唯一）", max_length=50)
    site_length: Optional[float] = Field(default=None, description="现实物理长度")
    site_width: Optional[float] = Field(default=None, description="现实物理宽度")
    location: Optional[str] = Field(default=None, description="工厂地理位置")
    timezone: Optional[str] = Field(default=None, description="时区", max_length=50)
    status: Optional[BaseStatus] = Field(default=None, description="工厂状态(ACTIVE/INACTIVE)")


class BaseFactoryDeleteDto(BaseModel):
    """删除工厂基础信息请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    factory_id: SnowflakeIdIn = Field(..., description="工厂主键ID（雪花算法，18~19位整数）")


class BaseFactoryQueryDto(PageRequest):
    """分页查询工厂基础信息请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    factory_name: Optional[str] = Field(default=None, description="工厂名称（模糊搜索）")
    factory_code: Optional[str] = Field(default=None, description="工厂编码（精确匹配）")
    status: Optional[BaseStatus] = Field(default=None, description="工厂状态过滤")
