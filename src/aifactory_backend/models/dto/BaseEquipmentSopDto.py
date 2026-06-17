from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn


class BaseEquipmentSopCreateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    equipment_id: int = Field(..., description="设备ID")
    document_no: str = Field(..., description="文档编号", max_length=50)
    document_title: str = Field(..., description="文档标题", max_length=200)
    document_version: str = Field(..., description="文档版本", max_length=36)
    document_url: Optional[str] = Field(default=None, description="文档文件URL（PDF/Word等）", max_length=1024)
    created_by: str = Field(..., description="创建人", max_length=50)


class BaseEquipmentSopUpdateDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: SnowflakeIdIn = Field(..., description="主键ID")
    equipment_id: Optional[int] = Field(default=None, description="设备ID")
    document_no: Optional[str] = Field(default=None, description="文档编号", max_length=50)
    document_title: Optional[str] = Field(default=None, description="文档标题", max_length=200)
    document_version: Optional[str] = Field(default=None, description="文档版本", max_length=36)
    document_url: Optional[str] = Field(default=None, description="文档文件URL")
    created_by: Optional[str] = Field(default=None, description="创建人")


class BaseEquipmentSopDeleteDto(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    id: SnowflakeIdIn = Field(..., description="主键ID")


class BaseEquipmentSopQueryDto(PageRequest):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    equipment_id: Optional[int] = Field(default=None, description="设备ID过滤")
    document_no: Optional[str] = Field(default=None, description="文档编号（模糊搜索）")
    document_title: Optional[str] = Field(default=None, description="文档标题（模糊搜索）")
