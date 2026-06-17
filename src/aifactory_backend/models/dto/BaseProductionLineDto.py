from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn
from models.enums.BaseStatusEnum import BaseStatus


class BaseProductionLineCreateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    stage_id: SnowflakeIdIn = Field(..., description="所属制程ID")
    line_code: str = Field(..., description="线体编码", max_length=50)
    line_name: str = Field(..., description="线体名称", max_length=200)
    smt_pph: Optional[float] = Field(default=None, description="每小时置件点数")
    operation_count: Optional[int] = Field(default=None, description="工序总数")
    status: BaseStatus = Field(default=BaseStatus.ACTIVE, description="状态")
    sort_order: Optional[int] = Field(default=None, description="排序")


class BaseProductionLineUpdateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    line_id: SnowflakeIdIn = Field(..., description="主键ID")
    stage_id: Optional[SnowflakeIdIn] = Field(default=None, description="所属制程ID")
    line_code: Optional[str] = Field(default=None, description="线体编码", max_length=50)
    line_name: Optional[str] = Field(default=None, description="线体名称", max_length=200)
    smt_pph: Optional[float] = Field(default=None, description="每小时置件点数")
    operation_count: Optional[int] = Field(default=None, description="工序总数")
    status: Optional[BaseStatus] = Field(default=None, description="状态")
    sort_order: Optional[int] = Field(default=None, description="排序")


class BaseProductionLineDeleteDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    line_id: SnowflakeIdIn = Field(..., description="主键ID")


class BaseProductionLineBatchCreateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    items: List[BaseProductionLineCreateDto] = Field(..., description="批量创建线体列表")


class BaseProductionLineQueryDto(PageRequest):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    stage_id: Optional[SnowflakeIdIn] = Field(default=None, description="制程ID过滤")
    line_code: Optional[str] = Field(default=None, description="线体编码（模糊搜索）")
    line_name: Optional[str] = Field(default=None, description="线体名称（模糊搜索）")
    status: Optional[BaseStatus] = Field(default=None, description="状态过滤")
