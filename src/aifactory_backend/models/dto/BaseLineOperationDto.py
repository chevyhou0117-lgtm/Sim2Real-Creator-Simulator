from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn
from models.enums.BaseStatusEnum import BaseStatus


class BaseLineOperationCreateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    stage_id: SnowflakeIdIn = Field(..., description="所属制程阶段ID")
    operation_code: str = Field(..., description="工序编码", max_length=50)
    operation_name: str = Field(..., description="工序名称", max_length=200)
    sequence: int = Field(..., description="工序顺序")
    operation_type: Optional[str] = Field(default=None, description="工序类型", max_length=50)
    is_key_operation: bool = Field(default=False, description="是否关键工序")
    status: BaseStatus = Field(default=BaseStatus.ACTIVE, description="状态")


class BaseLineOperationUpdateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    operation_id: SnowflakeIdIn = Field(..., description="主键ID")
    stage_id: Optional[SnowflakeIdIn] = Field(default=None, description="所属制程阶段ID")
    operation_code: Optional[str] = Field(default=None, description="工序编码", max_length=50)
    operation_name: Optional[str] = Field(default=None, description="工序名称", max_length=200)
    sequence: Optional[int] = Field(default=None, description="工序顺序")
    operation_type: Optional[str] = Field(default=None, description="工序类型", max_length=50)
    is_key_operation: Optional[bool] = Field(default=None, description="是否关键工序")
    status: Optional[BaseStatus] = Field(default=None, description="状态")


class BaseLineOperationDeleteDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    operation_id: SnowflakeIdIn = Field(..., description="主键ID")


class BaseLineOperationQueryDto(PageRequest):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    stage_id: Optional[SnowflakeIdIn] = Field(default=None, description="制程阶段ID过滤")
    operation_code: Optional[str] = Field(default=None, description="工序编码（模糊搜索）")
    operation_name: Optional[str] = Field(default=None, description="工序名称（模糊搜索）")
    operation_type: Optional[str] = Field(default=None, description="工序类型过滤")
    status: Optional[BaseStatus] = Field(default=None, description="状态过滤")
