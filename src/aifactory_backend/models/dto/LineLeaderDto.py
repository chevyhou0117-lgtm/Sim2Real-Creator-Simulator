from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn


class LineLeaderCreateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    factory_asset_id: SnowflakeIdIn = Field(..., description="关联线体资产节点ID（雪花算法）")
    line_leader_name: Optional[str] = Field(default=None, description="产线负责人姓名", max_length=255)
    employee_id: Optional[str] = Field(default=None, description="员工ID", max_length=50)
    contact_number: Optional[str] = Field(default=None, description="联系电话", max_length=50)
    email: Optional[str] = Field(default=None, description="邮箱", max_length=255)
    shift_schedule: Optional[str] = Field(default=None, description="班次安排", max_length=100)
    shift_a_leader: Optional[str] = Field(default=None, description="A班负责人", max_length=255)
    shift_b_leader: Optional[str] = Field(default=None, description="B班负责人", max_length=255)
    shift_c_leader: Optional[str] = Field(default=None, description="C班负责人", max_length=255)


class LineLeaderUpdateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: SnowflakeIdIn = Field(..., description="主键ID（雪花算法，18~19位整数）")
    factory_asset_id: Optional[SnowflakeIdIn] = Field(default=None, description="关联线体资产节点ID（雪花算法）")
    line_leader_name: Optional[str] = Field(default=None, description="产线负责人姓名", max_length=255)
    employee_id: Optional[str] = Field(default=None, description="员工ID", max_length=50)
    contact_number: Optional[str] = Field(default=None, description="联系电话", max_length=50)
    email: Optional[str] = Field(default=None, description="邮箱", max_length=255)
    shift_schedule: Optional[str] = Field(default=None, description="班次安排", max_length=100)
    shift_a_leader: Optional[str] = Field(default=None, description="A班负责人", max_length=255)
    shift_b_leader: Optional[str] = Field(default=None, description="B班负责人", max_length=255)
    shift_c_leader: Optional[str] = Field(default=None, description="C班负责人", max_length=255)


class LineLeaderDeleteDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: SnowflakeIdIn = Field(..., description="主键ID（雪花算法，18~19位整数）")


class LineLeaderQueryDto(PageRequest):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    factory_asset_id: Optional[SnowflakeIdIn] = Field(default=None, description="按线体资产节点ID过滤（雪花算法）")
    line_leader_name: Optional[str] = Field(default=None, description="按负责人姓名模糊搜索", max_length=255)
    employee_id: Optional[str] = Field(default=None, description="按员工ID过滤", max_length=50)
    email: Optional[str] = Field(default=None, description="按邮箱过滤", max_length=255)
