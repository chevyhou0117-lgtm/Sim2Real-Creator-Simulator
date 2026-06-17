from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.enums.BaseStatusEnum import BaseStatus


class BaseProductionLineVo(BaseModel):

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    line_id: SnowflakeIdOut = Field(..., description="主键ID")
    stage_id: Optional[str] = Field(default=None, description="所属制程ID")
    line_code: str = Field(..., description="线体编码")
    line_name: str = Field(..., description="线体名称")
    smt_pph: Optional[float] = Field(default=None, description="每小时置件点数")
    operation_count: Optional[int] = Field(default=None, description="工序总数")
    status: Optional[BaseStatus] = Field(default=None, description="状态")
    sort_order: Optional[int] = Field(default=None, description="排序")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
