from typing import Any, Dict, Optional
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.enums.AssetModelStatusEnum import AssetModelStatus


class EquipmentModelDetailVo(BaseModel):
    """设备模型详情响应 VO（驼峰命名）"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )

    id: SnowflakeIdOut = Field(..., description="主键ID（雪花算法）")
    category_id: SnowflakeIdOut = Field(..., description="关联资产分类ID（雪花算法）")
    manufacturer: Optional[str] = Field(default=None, description="制造商")
    asset_type: Optional[str] = Field(default=None, description="资产类型")
    brand: Optional[str] = Field(default=None, description="品牌")
    root_usd_path: str = Field(..., description="根USD文件路径")
    location_path: str = Field(..., description="位置路径")
    thumbnail_path: Optional[str] = Field(default=None, description="缩略图路径")
    specifications: Optional[Dict[str, Any]] = Field(default=None, description="规格参数（JSONB）")

    # 存储信息
    bucket_name: Optional[str] = Field(default=None, description="存储桶名称")

    # 基本信息
    category: Optional[str] = Field(default=None, description="分类，例如 SMT")
    model: Optional[str] = Field(default=None, description="型号，例如 SMT-L-002")

    # 3D 模型信息
    format: Optional[str] = Field(default=None, description="3D文件格式，例如 USD")
    poly_count: Optional[int] = Field(default=None, description="多边形数量，例如 24500")
    prim_path: Optional[str] = Field(default=None, description="Prim 路径")
    instance_path: Optional[str] = Field(default=None, description="Instance 路径")

    # 物理尺寸（单位：mm）
    width: Optional[float] = Field(default=None, description="宽度（mm），例如 2400")
    depth: Optional[float] = Field(default=None, description="深度（mm），例如 1800")
    height: Optional[float] = Field(default=None, description="高度（mm），例如 1650")

    # 状态
    status: AssetModelStatus = Field(default=AssetModelStatus.DRAFT, description="资产状态：DRAFT草稿 / ACTIVE激活 / INACTIVE禁用 / ARCHIVED归档")

    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
