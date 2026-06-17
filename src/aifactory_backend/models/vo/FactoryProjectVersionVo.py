from typing import Optional
from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut


class FactoryProjectVersionVo(BaseModel):
    """项目版本响应 VO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    version_id: SnowflakeIdOut = Field(..., description="版本主键ID（雪花算法）")
    project_id: SnowflakeIdOut = Field(..., description="项目ID")

    version_number: int = Field(..., description="版本号")
    version_name: Optional[str] = Field(default=None, description="版本名称")
    remark: Optional[str] = Field(default=None, description="备注描述")

    version_status: str = Field(..., description="版本状态: DRAFT/PUBLISHED/ARCHIVED")
    is_current: bool = Field(..., description="是否当前编辑版本")

    published_at: Optional[datetime] = Field(default=None, description="发布时间")
    published_by: Optional[str] = Field(default=None, description="发布人")

    base_version_id: Optional[SnowflakeIdOut] = Field(default=None, description="基线版本ID")
    created_by: Optional[str] = Field(default=None, description="创建人")

    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
