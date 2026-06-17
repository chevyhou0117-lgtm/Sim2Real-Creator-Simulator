from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn
from models.enums.BaseStatusEnum import BaseStatus


class BaseStageCreateDto(BaseModel):
    """创建制程请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    factory_id: SnowflakeIdIn = Field(..., description="所属工厂ID（雪花算法，18~19位整数）")
    stage_code: str = Field(..., description="制程编码", min_length=1, max_length=50)
    stage_name: str = Field(..., description="制程名称", min_length=1, max_length=200)
    sequence: int = Field(..., description="制程顺序（必须>0）", gt=0)
    stage_type_id: SnowflakeIdIn = Field(..., description="制程类型字典ID（雪花算法，18~19位整数）")
    line_count: Optional[int] = Field(default=None, description="产线数量")
    status: BaseStatus = Field(default=BaseStatus.ACTIVE, description="状态(ACTIVE/INACTIVE)")
    creator_binding_id: Optional[str] = Field(default=None, description="创建者绑定ID", max_length=100)


class BaseStageUpdateDto(BaseModel):
    """更新制程请求 DTO（stage_id 必填）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    stage_id: SnowflakeIdIn = Field(..., description="制程主键ID（雪花算法，18~19位整数）")

    factory_id: Optional[SnowflakeIdIn] = Field(default=None, description="所属工厂ID")
    stage_code: Optional[str] = Field(default=None, description="制程编码", max_length=50)
    stage_name: Optional[str] = Field(default=None, description="制程名称", max_length=200)
    sequence: Optional[int] = Field(default=None, description="制程顺序（必须>0）", gt=0)
    stage_type_id: Optional[SnowflakeIdIn] = Field(default=None, description="制程类型字典ID")
    line_count: Optional[int] = Field(default=None, description="产线数量")
    status: Optional[BaseStatus] = Field(default=None, description="状态(ACTIVE/INACTIVE)")
    creator_binding_id: Optional[str] = Field(default=None, description="创建者绑定ID", max_length=100)


class BaseStageDeleteDto(BaseModel):
    """删除制程请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    stage_id: SnowflakeIdIn = Field(..., description="制程主键ID（雪花算法，18~19位整数）")



class BaseStageQueryDto(PageRequest):
    """分页查询制程请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    factory_id: Optional[SnowflakeIdIn] = Field(default=None, description="所属工厂ID过滤")
    stage_code: Optional[str] = Field(default=None, description="制程编码（精确匹配）")
    stage_name: Optional[str] = Field(default=None, description="制程名称（模糊搜索）")
    stage_type_id: Optional[SnowflakeIdIn] = Field(default=None, description="制程类型字典ID过滤")
    status: Optional[BaseStatus] = Field(default=None, description="状态过滤")
