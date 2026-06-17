from typing import Optional
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.enums.BaseStatusEnum import BaseStatus


class BaseStageVo(BaseModel):
    """制程响应 VO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    stage_id: SnowflakeIdOut = Field(..., description="制程主键ID（雪花算法）")
    factory_id: SnowflakeIdOut = Field(..., description="所属工厂ID")
    stage_code: str = Field(..., description="制程编码")
    stage_name: str = Field(..., description="制程名称")
    sequence: int = Field(..., description="制程顺序")
    # 合并后 md_stage 用内联字符串 stage_type（无 stage_type_id 字典FK）。
    # 保留 stage_type_id 字段（恒为 None）以兼容旧前端，真实值在 stage_type。
    stage_type_id: Optional[SnowflakeIdOut] = Field(default=None, description="制程类型字典ID（md_stage 无此列，恒为 None）")
    stage_type: Optional[str] = Field(default=None, description="制程类型（md_stage.stage_type）")
    line_count: Optional[int] = Field(default=None, description="产线数量")
    status: Optional[BaseStatus] = Field(default=None, description="状态(ACTIVE/INACTIVE)")
    creator_binding_id: Optional[str] = Field(default=None, description="创建者绑定ID")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
