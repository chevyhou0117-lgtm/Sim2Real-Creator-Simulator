from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdIn


class FactoryAsset3dModelCreateDto(BaseModel):
    """创建3D模型信息请求 DTO（通用，制程/线体/设备都可使用）"""

    factory_asset_id: SnowflakeIdIn = Field(..., description="关联工厂资产节点ID（雪花算法）")
    usd_name: Optional[str] = Field(default=None, description="USD文件名称", max_length=255)
    usd_id: Optional[str] = Field(default=None, description="USD唯一标识", max_length=255)
    root_usd_path: str = Field(..., description="USD文件在存储桶中的路径", min_length=1, max_length=1024)
    bucket_name: Optional[str] = Field(default="ov-usd-bucket", description="对象存储桶名", max_length=100)
    prim_path: Optional[str] = Field(default=None, description="USD中的主要Prim路径", max_length=1024)
    location_path: Optional[str] = Field(default=None, description="模型在场景中的相对路径", max_length=1024)
    thumbnail_path: Optional[str] = Field(default=None, description="缩略图路径", max_length=1024)


class FactoryAsset3dModelUpdateDto(BaseModel):
    """更新3D模型信息请求 DTO（id 必填）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: SnowflakeIdIn = Field(..., description="3D模型主键ID（雪花算法，18~19位整数）")
    factory_asset_id: Optional[SnowflakeIdIn] = Field(default=None, description="关联工厂资产节点ID（雪花算法）")
    usd_name: Optional[str] = Field(default=None, description="USD文件名称", max_length=255)
    usd_id: Optional[str] = Field(default=None, description="USD唯一标识", max_length=255)
    root_usd_path: Optional[str] = Field(default=None, description="USD文件在存储桶中的路径", max_length=1024)
    bucket_name: Optional[str] = Field(default=None, description="对象存储桶名", max_length=100)
    prim_path: Optional[str] = Field(default=None, description="USD中的主要Prim路径", max_length=1024)
    location_path: Optional[str] = Field(default=None, description="模型在场景中的相对路径", max_length=1024)
    thumbnail_path: Optional[str] = Field(default=None, description="缩略图路径", max_length=1024)


class FactoryAsset3dModelDeleteDto(BaseModel):
    """删除3D模型信息请求 DTO"""

    id: SnowflakeIdIn = Field(..., description="3D模型主键ID（雪花算法，18~19位整数）")
