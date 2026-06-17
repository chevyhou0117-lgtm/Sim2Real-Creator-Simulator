from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdIn


class FactoryLineDetailsCreateDto(BaseModel):
    """创建线体详情请求 DTO（重构版，冗余字段通过 base_production_line 获取，3D模型独立管理）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    factory_asset_id: SnowflakeIdIn = Field(..., description="关联工厂资产节点ID（雪花算法）")
    ref_id: Optional[SnowflakeIdIn] = Field(default=None, description="关联 base_production_line.line_id，绑定线体基础信息")
    capacity_per_day: Optional[int] = Field(default=None, description="实例层日产能（pcs），考虑排班后的实际值")
    extra_metadata: Optional[Dict[str, Any]] = Field(default=None, description="扩展元数据（JSONB）")


class FactoryLineDetailsUpdateDto(BaseModel):
    """
    更新线体详情请求 DTO（id 必填）
    覆盖 FactoryLineDetailsVo 全部可编辑字段，支持同时更新三层数据：
    - [实例层]   factory_line_details（日产能、扩展元数据等）
    - [3D模型层] factory_asset_3d_model（USD路径、Prim路径等）
    - [基础线体] base_production_line（线体名称、编码、SMT PPH等基础信息）
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: SnowflakeIdIn = Field(..., description="线体详情主键ID（雪花算法，18~19位整数）")

    # ===== [实例层] factory_line_details =====
    factory_asset_id: Optional[SnowflakeIdIn] = Field(default=None, description="[实例] 关联工厂资产节点ID")
    ref_id: Optional[SnowflakeIdIn] = Field(default=None, description="[实例] 关联 base_production_line.line_id，绑定线体基础信息")
    capacity_per_day: Optional[int] = Field(default=None, description="[实例] 实例层日产能（pcs）")
    extra_metadata: Optional[Dict[str, Any]] = Field(default=None, description="[实例] 扩展元数据（JSONB）")

    # ===== [3D模型层] factory_asset_3d_model =====
    usd_name: Optional[str] = Field(default=None, description="[3D] USD文件名称")
    usd_id: Optional[str] = Field(default=None, description="[3D] USD唯一标识")
    root_usd_path: Optional[str] = Field(default=None, description="[3D] 根USD文件路径")
    bucket_name: Optional[str] = Field(default=None, description="[3D] 存储桶名称")
    prim_path: Optional[str] = Field(default=None, description="[3D] Prim路径")
    location_path: Optional[str] = Field(default=None, description="[3D] 位置路径")
    thumbnail_path: Optional[str] = Field(default=None, description="[3D] 缩略图路径")

    # ===== [基础线体] base_production_line =====
    line_name: Optional[str] = Field(default=None, description="[基础] 线体名称")
    line_code: Optional[str] = Field(default=None, description="[基础] 线体编码")
    smt_pph: Optional[float] = Field(default=None, description="[基础] 每小时置件点数")
    operation_count: Optional[int] = Field(default=None, description="[基础] 工序总数")
    status: Optional[str] = Field(default=None, description="[基础] 状态（ACTIVE / INACTIVE）")
    sort_order: Optional[int] = Field(default=None, description="[基础] 排序")


class FactoryLineDetailsDeleteDto(BaseModel):
    """删除线体详情请求 DTO"""

    id: SnowflakeIdIn = Field(..., description="线体详情主键ID（雪花算法，18~19位整数）")
