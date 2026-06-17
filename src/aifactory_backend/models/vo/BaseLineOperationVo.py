from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.enums.BaseStatusEnum import BaseStatus


class BaseLineOperationVo(BaseModel):

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    operation_id: SnowflakeIdOut = Field(..., description="主键ID")
    stage_id: Optional[str] = Field(default=None, description="所属制程阶段ID")
    operation_code: str = Field(..., description="工序编码")
    operation_name: str = Field(..., description="工序名称")
    sequence: Optional[int] = Field(default=None, description="工序顺序")
    operation_type: Optional[str] = Field(default=None, description="工序类型")
    is_key_operation: Optional[bool] = Field(default=None, description="是否关键工序")
    status: Optional[BaseStatus] = Field(default=None, description="状态")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
