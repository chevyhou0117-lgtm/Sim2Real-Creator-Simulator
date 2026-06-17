from typing import Optional
from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut


class LineLeaderVo(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    id: SnowflakeIdOut = Field(..., description="主键ID（雪花算法）")
    factory_asset_id: SnowflakeIdOut = Field(..., description="关联线体资产节点ID（雪花算法）")
    line_leader_name: Optional[str] = Field(default=None, description="产线负责人姓名")
    employee_id: Optional[str] = Field(default=None, description="员工ID")
    contact_number: Optional[str] = Field(default=None, description="联系电话")
    email: Optional[str] = Field(default=None, description="邮箱")
    shift_schedule: Optional[str] = Field(default=None, description="班次安排")
    shift_a_leader: Optional[str] = Field(default=None, description="A班负责人")
    shift_b_leader: Optional[str] = Field(default=None, description="B班负责人")
    shift_c_leader: Optional[str] = Field(default=None, description="C班负责人")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
