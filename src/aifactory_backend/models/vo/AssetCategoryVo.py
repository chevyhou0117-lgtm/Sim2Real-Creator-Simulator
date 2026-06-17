from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.enums.CategoryEnum import AssetCategoryType


class AssetCategoryVo(BaseModel):
    """资产分类响应 VO（驼峰命名）"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )

    id: SnowflakeIdOut = Field(..., description="主键ID（雪花算法）")
    name: str = Field(..., description="分类名称")
    code: str = Field(..., description="分类编码")
    type: AssetCategoryType = Field(..., description="分类类型: process / line_type / equipment_type / line_model / equipment_model")
    parent_id: Optional[SnowflakeIdOut] = Field(default=None, description="父级分类ID（雪花算法）")
    description: Optional[str] = Field(default=None, description="分类描述")
    thumbnail_path: Optional[str] = Field(default=None, description="分类缩略图路径")
    asset_total_count: Optional[int] = Field(default=0, description="树节点叶子节点个数")
    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")



class AssetCategoryTypeVo(BaseModel):
    """资产分类type"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )
    type: AssetCategoryType = Field(..., description="分类类型:line_type/equipment_type")


class LineModelSpecialVo(BaseModel):
    """线体模型详情 VO（仅包含业务特有字段）"""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        # from_attributes=True
    )

    id: Optional[str] = Field(None, description="详情表主键ID（雪花算法，字符串格式）")
    root_usd_path: Optional[str] = Field(None, description="根USD文件路径")
    location_path: Optional[str] = Field(None, description="位置路径")
    prim_path: Optional[str] = Field(None, description="Prim 路径")
    instance_path: Optional[str] = Field(None, description="Instance 路径")
    thumbnail_path: Optional[str] = Field(None, description="缩略图路径")
    status: Optional[str] = Field(None, description="模型状态：DRAFT/ACTIVE/INACTIVE/ARCHIVED")
    version_tag: Optional[str] = Field(None, description="版本标签")

class EquipmentModelSpecialVo(BaseModel):
    """设备模型详情 VO（仅包含业务特有字段）"""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )
    id: Optional[str] = Field(None, description="详情表主键ID（雪花算法，字符串格式）")
    manufacturer: Optional[str] = Field(None, description="制造商")
    asset_type: Optional[str] = Field(None, description="资产类型")
    brand: Optional[str] = Field(None, description="品牌")
    root_usd_path: Optional[str] = Field(None, description="根USD文件路径")
    location_path: Optional[str] = Field(None, description="位置路径")
    prim_path: Optional[str] = Field(None, description="Prim 路径")
    instance_path: Optional[str] = Field(None, description="Instance 路径")
    thumbnail_path: Optional[str] = Field(None, description="缩略图路径")
    specifications: Optional[Dict[str, Any]] = Field(None, description="规格参数")
    status: Optional[str] = Field(None, description="模型状态：DRAFT/ACTIVE/INACTIVE/ARCHIVED")
    version_tag: Optional[str] = Field(None, description="版本标签")


class AssetCategoryTreeVo(BaseModel):
    """资产分类树形响应 VO"""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )

    id: str = Field(..., description="主键ID（雪花算法，字符串格式）")
    name: str = Field(..., description="分类名称")
    code: str = Field(..., description="分类编码")
    type: str = Field(..., description="分类类型")
    parent_id: Optional[str] = Field(None, description="父级分类ID（雪花算法，字符串格式）")
    description: Optional[str] = Field(None, description="分类描述")
    thumbnail_path: Optional[str] = Field(None, description="分类缩略图路径")
    asset_total_count: Optional[int] = Field(default=0, description="树节点叶子节点个数")

    # 核心修改：detail 字段现在是一个联合类型，可以是线体详情、设备详情或者空
    detail: Optional[LineModelSpecialVo | EquipmentModelSpecialVo] = Field(None, description="详细信息")
    children: list["AssetCategoryTreeVo"] = Field(default_factory=list, description="子分类列表")

AssetCategoryTreeVo.model_rebuild()

class AssetCategoryFilterVo(BaseModel):
    """资产分类过滤结果 VO"""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )
    line_models: List["LineModelDetailVo"] = Field(default_factory=list, description="线体模型详情列表")
    equipment_models: List["EquipmentModelDetailVo"] = Field(default_factory=list, description="设备模型详情列表")


# 延迟导入，避免循环依赖
from models.vo.LineModelDetailVo import LineModelDetailVo  # noqa: E402
from models.vo.EquipmentModelDetailVo import EquipmentModelDetailVo  # noqa: E402

AssetCategoryFilterVo.model_rebuild()
