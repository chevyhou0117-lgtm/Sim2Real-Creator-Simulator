from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.enums.InstanceAssetTypeEnum import InstanceAssetType
from models.enums.BindStatusEnum import BindStatus


class ProcessDetailsSpecialVo(BaseModel):
    """制程详情 Special VO（聚合视图）"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: Optional[str] = Field(None, description="详情表主键ID")
    ref_id: Optional[str] = Field(None, description="关联 base_stage.stage_id")
    # [基础] 来自 base_stage（通过 ref_id JOIN）
    process_name: Optional[str] = Field(None, description="[基础] 制程名称")
    process_code: Optional[str] = Field(None, description="[基础] 制程编码")
    line_count: Optional[int] = Field(None, description="[基础] 线体数量")
    # [实例] 来自 factory_process_details
    total_capacity: Optional[int] = Field(None, description="[实例] 总产能（pcs/day）")


class LineDetailsSpecialVo(BaseModel):
    """线体详情 Special VO（聚合视图）"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: Optional[str] = Field(None, description="详情表主键ID")
    ref_id: Optional[str] = Field(None, description="关联 base_production_line.line_id")
    # [基础] 来自 base_production_line（通过 ref_id JOIN）
    line_name: Optional[str] = Field(None, description="[基础] 线体名称")
    line_code: Optional[str] = Field(None, description="[基础] 线体编码")
    # [实例] 来自 factory_line_details
    capacity_per_day: Optional[int] = Field(None, description="[实例] 日产能（pcs）")
    # [3D] 来自 factory_asset_3d_model
    root_usd_path: Optional[str] = Field(None, description="[3D] 根USD文件路径")
    prim_path: Optional[str] = Field(None, description="[3D] Prim路径")


class EquipmentDetailsSpecialVo(BaseModel):
    """设备详情 Special VO（聚合视图）- 含空间定位"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    id: Optional[str] = Field(None, description="详情表主键ID")
    ref_id: Optional[str] = Field(None, description="关联 base_equipment.equipment_id")
    # [基础] 来自 base_equipment（通过 ref_id JOIN）
    equipment_name: Optional[str] = Field(None, description="[基础] 设备名称")
    equipment_type: Optional[str] = Field(None, description="[基础] 设备类型")
    manufacturer: Optional[str] = Field(None, description="[基础] 制造商")
    standard_ct: Optional[float] = Field(None, description="[基础] 标准节拍(秒)")
    # [3D] 来自 factory_asset_3d_model
    root_usd_path: Optional[str] = Field(None, description="[3D] 根USD文件路径")
    prim_path: Optional[str] = Field(None, description="[3D] Prim路径")
    location_path: Optional[str] = Field(None, description="[3D] 位置路径")
    # [空间] 来自 factory_equipment_details（已合并）
    position_data: Optional[dict] = Field(None, description="[空间] 坐标数据")
    rotation_data: Optional[dict] = Field(None, description="[空间] 旋转数据")


class FactoryAssetNodeVo(BaseModel):
    """工厂资产节点响应 VO（v2 - ref_id 已移至详情表）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)
    id: SnowflakeIdOut = Field(..., description="主键ID（雪花算法）")
    factory_projects_id: SnowflakeIdOut = Field(..., description="关联工厂项目ID（雪花算法）")
    version_id: SnowflakeIdOut = Field(..., description="关联项目版本ID（雪花算法）")
    name: str = Field(..., description="节点名称")
    code: Optional[str] = Field(default=None, description="节点编码")
    type: InstanceAssetType = Field(..., description="节点类型：STAGE（制程）/ LINE（线体）/ EQUIPMENT（设备）")
    parent_id: Optional[SnowflakeIdOut] = Field(default=None, description="父节点ID（雪花算法）")
    description: Optional[str] = Field(default=None, description="描述")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")

    # 绑定状态
    bind_status: BindStatus = Field(default=BindStatus.UNBOUND, description="绑定状态：UNBOUND/BOUND/BIND_FAILED/PARTIALLY_BOUND")

    # 节点关联详情
    detail: Optional[ProcessDetailsSpecialVo | LineDetailsSpecialVo | EquipmentDetailsSpecialVo] = Field(
        None, description="节点关联详情（制程 / 线体 / 设备）"
    )
    # 树形子节点
    children: list["FactoryAssetNodeVo"] = Field(default_factory=list, description="子节点列表")


FactoryAssetNodeVo.model_rebuild()


class FactoryAssetNodeTreeVo(BaseModel):
    """工厂资产节点树形结构 VO（仅节点层级关系 + 基础字段，不含 detail）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    id: SnowflakeIdOut = Field(..., description="主键ID（雪花算法）")
    factory_projects_id: SnowflakeIdOut = Field(..., description="关联工厂项目ID（雪花算法）")
    version_id: SnowflakeIdOut = Field(..., description="关联项目版本ID（雪花算法）")
    name: str = Field(..., description="节点名称")
    code: Optional[str] = Field(default=None, description="节点编码")
    type: InstanceAssetType = Field(..., description="节点类型：STAGE（制程）/ LINE（线体）/ EQUIPMENT（设备）")
    parent_id: Optional[SnowflakeIdOut] = Field(default=None, description="父节点ID（雪花算法）")
    description: Optional[str] = Field(default=None, description="描述")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
    # 树形子节点（仅结构，不含详情）
    children: list["FactoryAssetNodeTreeVo"] = Field(default_factory=list, description="子节点列表")


FactoryAssetNodeTreeVo.model_rebuild()
