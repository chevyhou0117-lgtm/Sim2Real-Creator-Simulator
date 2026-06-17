from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdIn


class FactoryProcessDetailsCreateDto(BaseModel):
    """创建制程详情请求 DTO（重构版，冗余字段通过 base_stage 获取）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    factory_asset_id: SnowflakeIdIn = Field(..., description="关联工厂资产节点ID（雪花算法）")
    ref_id: Optional[SnowflakeIdIn] = Field(default=None, description="关联 base_stage.stage_id，绑定制程基础信息")
    total_capacity: Optional[int] = Field(default=None, description="制程总产能（pcs/day），实例层计算值")
    extra_metadata: Optional[Dict[str, Any]] = Field(default=None, description="扩展元数据（JSONB）")
    description: Optional[str] = Field(default=None, description="实例级补充描述")


# 更新dto 应该需要重新写吧

class FactoryProcessDetailsUpdateDto(BaseModel):
    """
    更新制程详情请求 DTO（id 必填）
    覆盖 FactoryProcessDetailsVo 全部可编辑字段，支持同时更新两层数据：
    - [实例层]   factory_process_details（总产能、扩展元数据、描述等）
    - [基础制程] base_stage（制程名称、编码、顺序、类型、线体数量、状态等基础信息）
    注意：制程没有 3D 模型层，无需 factory_asset_3d_model 字段
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: SnowflakeIdIn = Field(..., description="制程详情主键ID（雪花算法，18~19位整数）")

    # ===== [实例层] factory_process_details =====
    factory_asset_id: Optional[SnowflakeIdIn] = Field(default=None, description="[实例] 关联工厂资产节点ID")
    ref_id: Optional[SnowflakeIdIn] = Field(default=None, description="[实例] 关联 base_stage.stage_id，绑定制程基础信息")
    total_capacity: Optional[int] = Field(default=None, description="[实例] 制程总产能（pcs/day）")
    extra_metadata: Optional[Dict[str, Any]] = Field(default=None, description="[实例] 扩展元数据（JSONB）")
    description: Optional[str] = Field(default=None, description="[实例] 补充描述")

    # ===== [基础制程] base_stage =====
    stage_name: Optional[str] = Field(default=None, description="[基础] 制程名称")
    stage_code: Optional[str] = Field(default=None, description="[基础] 制程编码")
    sequence: Optional[int] = Field(default=None, description="[基础] 制程顺序（>0）")
    stage_type_id: Optional[SnowflakeIdIn] = Field(default=None, description="[基础] 制程类型字典ID")
    line_count: Optional[int] = Field(default=None, description="[基础] 产线数量")
    status: Optional[str] = Field(default=None, description="[基础] 状态（ACTIVE / INACTIVE）")
    creator_binding_id: Optional[str] = Field(default=None, description="[基础] 创建者绑定ID")


class FactoryProcessDetailsDeleteDto(BaseModel):
    """删除制程详情请求 DTO"""

    id: SnowflakeIdIn = Field(..., description="制程详情主键ID（雪花算法，18~19位整数）")
