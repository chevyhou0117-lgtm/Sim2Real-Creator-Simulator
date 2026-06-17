from typing import Optional
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.enums.BaseStatusEnum import BaseStatus


class DictNgCategoryVo(BaseModel):
    """不良类型字典响应 VO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    ng_category_id: SnowflakeIdOut = Field(..., description="主键ID")
    ng_code: str = Field(..., description="不良编码")
    ng_name: str = Field(..., description="不良名称")
    impact_level: Optional[str] = Field(default=None, description="影响等级")
    status: Optional[BaseStatus] = Field(default=None, description="状态")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
