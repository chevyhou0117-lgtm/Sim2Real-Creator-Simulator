from typing import Any, Dict, Optional
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.vo.BaseEquipmentFullDetailVo import BaseEquipmentFullDetailVo


class FactoryEquipmentDetailsVo(BaseModel):
    """
    工厂设备实例完整聚合 VO
    - [实例层]  factory_equipment_details：实例规格、安装日期、空间定位等
    - [3D模型]  factory_asset_3d_model：USD路径、Prim路径等
    - [基础设备] base_equipment 完整信息（含技术规格/过程参数/BOM/SOP/运行记录）→ BaseEquipmentFullDetailVo
    """
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    # ===== [实例层] factory_equipment_details =====
    id: SnowflakeIdOut = Field(..., description="[实例] factory_equipment_details 主键ID")
    factory_asset_id: SnowflakeIdOut = Field(..., description="[实例] 关联工厂资产节点ID")

    specifications: Optional[Dict[str, Any]] = Field(default=None, description="[实例] 技术规格扩展（JSON）")
    installation_date: Optional[datetime] = Field(default=None, description="[实例] 安装日期")
    extra_metadata: Optional[Dict[str, Any]] = Field(default=None, description="[实例] 扩展元数据（JSON）")
    instance_description: Optional[str] = Field(default=None, description="[实例] 补充描述")

    # ===== [空间定位] factory_equipment_details 合并存储 =====
    position_data: Optional[Dict[str, Any]] = Field(default=None, description="[空间] 坐标 {x, y, z}")
    rotation_data: Optional[Dict[str, Any]] = Field(default=None, description="[空间] 旋转角度 {rx, ry, rz}")

    # ===== [3D模型] factory_asset_3d_model =====
    usd_name: Optional[str] = Field(default=None, description="[3D] USD文件名称")
    usd_id: Optional[str] = Field(default=None, description="[3D] USD唯一标识")
    root_usd_path: Optional[str] = Field(default=None, description="[3D] 根USD文件路径")
    bucket_name: Optional[str] = Field(default=None, description="[3D] 存储桶名称")
    prim_path: Optional[str] = Field(default=None, description="[3D] Prim路径")
    location_path: Optional[str] = Field(default=None, description="[3D] 位置路径")
    thumbnail_path: Optional[str] = Field(default=None, description="[3D] 缩略图路径")

    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")

    # ===== [基础设备完整信息] base_equipment + 技术规格/过程参数/BOM/SOP/运行记录 =====
    base_equipment: Optional[BaseEquipmentFullDetailVo] = Field(
        default=None,
        description="[基础设备] 完整设备信息（含技术规格、过程参数、BOM备件、SOP、运行记录）"
    )


