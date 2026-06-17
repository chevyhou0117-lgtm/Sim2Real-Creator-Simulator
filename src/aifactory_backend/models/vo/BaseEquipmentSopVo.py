from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from commonutils.SnowflakeUtils import SnowflakeIdOut


class BaseEquipmentSopVo(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    id: SnowflakeIdOut = Field(..., description="主键ID")
    equipment_id: Optional[str] = Field(default=None, description="设备ID")
    document_no: Optional[str] = Field(default=None, description="文档编号")
    document_title: Optional[str] = Field(default=None, description="文档标题")
    document_version: Optional[str] = Field(default=None, description="文档版本")
    document_url: Optional[str] = Field(default=None, description="文档文件URL")
    created_by: Optional[str] = Field(default=None, description="创建人")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
