from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn


class EquipmentModelDetailCreateDto(BaseModel):
    """创建设备模型详情请求 DTO"""

    category_id: SnowflakeIdIn = Field(..., description="关联资产分类ID（雪花算法）")
    manufacturer: Optional[str] = Field(default=None, description="制造商", max_length=100)
    asset_type: Optional[str] = Field(default=None, description="资产类型", max_length=255)
    brand: Optional[str] = Field(default=None, description="品牌", max_length=50)
    root_usd_path: str = Field(..., description="根USD文件路径", min_length=1, max_length=1024)
    location_path: str = Field(..., description="位置路径", min_length=1, max_length=1024)
    thumbnail_path: Optional[str] = Field(default=None, description="缩略图路径", max_length=1024)
    specifications: Optional[Dict[str, Any]] = Field(default=None, description="规格参数（JSONB）")

    # 存储信息
    bucket_name: Optional[str] = Field(default='ov-usd-bucket', description="存储桶名称", max_length=100)

    # 基本信息
    category: Optional[str] = Field(default=None, description="分类，例如 SMT", max_length=100)
    model: Optional[str] = Field(default=None, description="型号，例如 SMT-L-002", max_length=100)

    # 3D 模型信息
    format: Optional[str] = Field(default=None, description="3D文件格式，例如 USD", max_length=50)
    poly_count: Optional[int] = Field(default=None, description="多边形数量，例如 24500")
    prim_path: Optional[str] = Field(default=None, description="Prim 路径", max_length=255)
    instance_path: Optional[str] = Field(default=None, description="Instance 路径", max_length=255)

    # 物理尺寸（单位：mm）
    width: Optional[float] = Field(default=None, description="宽度（mm），例如 2400")
    depth: Optional[float] = Field(default=None, description="深度（mm），例如 1800")
    height: Optional[float] = Field(default=None, description="高度（mm），例如 1650")


class EquipmentModelDetailUpdateDto(BaseModel):
    """更新设备模型详情请求 DTO（id 必填）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: SnowflakeIdIn = Field(..., description="设备模型详情主键ID（雪花算法，18~19位整数）")
    category_id: Optional[SnowflakeIdIn] = Field(default=None, description="关联资产分类ID（雪花算法）")
    manufacturer: Optional[str] = Field(default=None, description="制造商", max_length=100)
    asset_type: Optional[str] = Field(default=None, description="资产类型", max_length=255)
    brand: Optional[str] = Field(default=None, description="品牌", max_length=50)
    root_usd_path: Optional[str] = Field(default=None, description="根USD文件路径", max_length=1024)
    location_path: Optional[str] = Field(default=None, description="位置路径", max_length=1024)
    thumbnail_path: Optional[str] = Field(default=None, description="缩略图路径", max_length=1024)
    specifications: Optional[Dict[str, Any]] = Field(default=None, description="规格参数（JSONB）")

    # 存储信息
    bucket_name: Optional[str] = Field(default=None, description="存储桶名称", max_length=100)

    # 基本信息
    category: Optional[str] = Field(default=None, description="分类，例如 SMT", max_length=100)
    model: Optional[str] = Field(default=None, description="型号，例如 SMT-L-002", max_length=100)

    # 3D 模型信息
    format: Optional[str] = Field(default=None, description="3D文件格式，例如 USD", max_length=50)
    poly_count: Optional[int] = Field(default=None, description="多边形数量，例如 24500")
    prim_path: Optional[str] = Field(default=None, description="Prim 路径", max_length=255)
    instance_path: Optional[str] = Field(default=None, description="Instance 路径", max_length=255)

    # 物理尺寸（单位：mm）
    width: Optional[float] = Field(default=None, description="宽度（mm），例如 2400")
    depth: Optional[float] = Field(default=None, description="深度（mm），例如 1800")
    height: Optional[float] = Field(default=None, description="高度（mm），例如 1650")


class EquipmentModelDetailDeleteDto(BaseModel):
    """删除设备模型详情请求 DTO"""

    id: SnowflakeIdIn = Field(..., description="设备模型详情主键ID（雪花算法，18~19位整数）")


class EquipmentModelDetailQueryDto(PageRequest):
    """分页查询设备模型详情请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    category_id: Optional[SnowflakeIdIn] = Field(default=None, description="按资产分类ID过滤（雪花算法）")
    manufacturer: Optional[str] = Field(default=None, description="制造商（模糊搜索）")
    asset_type: Optional[str] = Field(default=None, description="资产类型（模糊搜索）")
    brand: Optional[str] = Field(default=None, description="品牌（模糊搜索）")
