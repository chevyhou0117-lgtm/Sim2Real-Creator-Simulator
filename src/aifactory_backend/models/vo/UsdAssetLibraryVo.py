from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut


class AssetLibraryVo(BaseModel):
    """USD 资产库响应 VO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    id: SnowflakeIdOut = Field(..., description="主键ID（雪花算法）")
    name: str = Field(..., description="资产名称")
    storage_type: str = Field(..., description="存储类型: file 或 folder")
    root_usd_path: str = Field(..., description="根USD文件路径")
    location_path: str = Field(..., description="存储位置路径")
    thumbnail_path: Optional[str] = Field(default=None, description="缩略图路径")
    category_l1: str = Field(..., description="主分类")
    category_l2: Optional[str] = Field(default=None, description="子分类")
    category_l3: Optional[str] = Field(default=None, description="三级分类")
    tags: Optional[List[str]] = Field(default=None, description="标签列表")
    open_config: Optional[Dict[str, Any]] = Field(default=None, description="打开方式配置")
    file_list: Optional[Any] = Field(default=None, description="文件夹内所有文件列表")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")


class AssetFileUploadVo(BaseModel):
    """文件上传结果 VO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    object_name: str = Field(..., description="文件在MinIO中的完整路径(object_name)")
    original_filename: str = Field(..., description="原始文件名")
    file_size: int = Field(..., description="文件大小(字节)")
    content_type: str = Field(..., description="文件MIME类型")
    bucket_name: str = Field(..., description="所在存储桶名称")
    etag: str = Field(..., description="MinIO ETag")


class AssetFolderUploadVo(BaseModel):
    """文件夹/批量上传结果 VO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    location_path: str = Field(..., description="上传到MinIO的文件夹路径前缀")
    total_files: int = Field(..., description="成功上传的文件总数")
    file_list: List[str] = Field(..., description="所有上传文件的object_name列表")
    total_size: int = Field(..., description="所有文件总大小(字节)")
    files: List[AssetFileUploadVo] = Field(..., description="每个文件的详细上传信息")


class AssetPresignedUrlVo(BaseModel):
    """预签名 URL 响应 VO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    asset_id: SnowflakeIdOut = Field(..., description="资产ID（雪花算法）")
    object_name: str = Field(..., description="MinIO object_name")
    presigned_url: str = Field(..., description="预签名下载URL（有效期默认1小时）")
    expires_in_seconds: int = Field(..., description="URL有效期（秒）")
