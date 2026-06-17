from typing import Any, Dict, Optional
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.vo.BaseProductionLineVo import BaseProductionLineVo


class FactoryLineDetailsVo(BaseModel):
    """
    线体详情响应 VO（驼峰命名）
    重构说明：本 VO 为聚合视图，同时返回基础数据层(base_production_line)和实例层信息
    - 带 [基础] 标记的字段来自 base_production_line
    - 带 [实例] 标记的字段为本表直接存储
    - 带 [3D] 标记的字段来自 factory_asset_3d_model
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )
    id: SnowflakeIdOut = Field(..., description="主键ID（雪花算法）")
    factory_asset_id: SnowflakeIdOut = Field(..., description="关联工厂资产节点ID（雪花算法）")
    # ===== [实例] 本表直接存储 =====
    capacity_per_day: Optional[int] = Field(default=None, description="[实例] 实例层日产能（pcs）")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="[实例] 扩展元数据")

    # ===== [3D] 来自 factory_asset_3d_model =====
    usd_name: Optional[str] = Field(default=None, description="[3D] USD文件名称")
    usd_id: Optional[str] = Field(default=None, description="[3D] USD唯一标识")
    root_usd_path: Optional[str] = Field(default=None, description="[3D] 根USD文件路径")
    prim_path: Optional[str] = Field(default=None, description="[3D] Prim路径")
    bucket_name: Optional[str] = Field(default=None, description="[3D] 存储桶名称")
    location_path: Optional[str] = Field(default=None, description="[3D] 位置路径")
    thumbnail_path: Optional[str] = Field(default=None, description="[3D] 缩略图路径")

    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")

    # ===== 基础信息线体的信息
    base_line: Optional[BaseProductionLineVo] = Field(
        default=None,
        description="线体基础信息"
    )

