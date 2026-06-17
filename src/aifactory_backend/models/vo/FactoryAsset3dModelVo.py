from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut


class FactoryAsset3dModelVo(BaseModel):
    """3D 模型信息响应 VO（驼峰命名）"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )

    id: SnowflakeIdOut = Field(..., description="主键ID（雪花算法）")
    factory_asset_id: SnowflakeIdOut = Field(..., description="关联工厂资产节点ID（雪花算法）")

    usd_name: Optional[str] = Field(default=None, description="USD文件名称")
    usd_id: Optional[str] = Field(default=None, description="USD唯一标识")
    root_usd_path: Optional[str] = Field(default=None, description="USD文件在存储桶中的路径")
    bucket_name: Optional[str] = Field(default=None, description="对象存储桶名")
    prim_path: Optional[str] = Field(default=None, description="USD中的主要Prim路径")
    location_path: Optional[str] = Field(default=None, description="模型在场景中的相对路径")
    thumbnail_path: Optional[str] = Field(default=None, description="缩略图路径")

    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
