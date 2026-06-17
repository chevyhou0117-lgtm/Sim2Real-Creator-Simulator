from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.enums.BaseStatusEnum import BaseStatus


class BaseWarehouseVo(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    warehouse_id: SnowflakeIdOut = Field(..., description="主键ID")
    factory_id: Optional[str] = Field(default=None, description="所属工厂ID")
    warehouse_code: str = Field(..., description="仓库编码")
    warehouse_name: str = Field(..., description="仓库名称")
    warehouse_type: Optional[str] = Field(default=None, description="仓库类型")
    location: Optional[str] = Field(default=None, description="仓库位置")
    total_capacity: Optional[float] = Field(default=None, description="总容量")
    status: Optional[BaseStatus] = Field(default=None, description="状态")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
