from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn
from models.enums.InstanceAssetTypeEnum import InstanceAssetType


class FactoryAssetNodeCreateDto(BaseModel):
    """创建工厂资产节点请求 DTO（v2 - ref_id 移至详情表）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    factory_projects_id: SnowflakeIdIn = Field(..., description="关联工厂项目ID（雪花算法）")
    version_id: SnowflakeIdIn = Field(..., description="关联项目版本ID（雪花算法）")
    name: str = Field(..., description="节点名称", min_length=1, max_length=255)
    code: Optional[str] = Field(default=None, description="节点编码", max_length=100)
    type: InstanceAssetType = Field(..., description="节点类型：STAGE（制程）/ LINE（线体）/ EQUIPMENT（设备）")
    parent_id: Optional[SnowflakeIdIn] = Field(default=None, description="父节点ID（雪花算法）")
    description: Optional[str] = Field(default=None, description="描述")


class FactoryAssetNodeUpdateDto(BaseModel):
    """更新工厂资产节点请求 DTO（id 必填）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: SnowflakeIdIn = Field(..., description="节点主键ID（雪花算法，18~19位整数）")
    factory_projects_id: Optional[SnowflakeIdIn] = Field(default=None, description="关联工厂项目ID（雪花算法）")
    version_id: Optional[SnowflakeIdIn] = Field(default=None, description="关联项目版本ID（雪花算法）")
    name: Optional[str] = Field(default=None, description="节点名称", max_length=255)
    code: Optional[str] = Field(default=None, description="节点编码", max_length=100)
    type: Optional[InstanceAssetType] = Field(default=None, description="节点类型：STAGE（制程）/ LINE（线体）/ EQUIPMENT（设备）")
    parent_id: Optional[SnowflakeIdIn] = Field(default=None, description="父节点ID（雪花算法）")
    description: Optional[str] = Field(default=None, description="描述")


class FactoryAssetNodeDeleteDto(BaseModel):
    """删除工厂资产节点请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: SnowflakeIdIn = Field(..., description="节点主键ID（雪花算法，18~19位整数）")


class FactoryAssetNodeBindDto(BaseModel):
    """统一绑定 DTO：将 LINE 或 EQUIPMENT 资产节点绑定到对应业务实体"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    factory_asset_id: SnowflakeIdIn = Field(..., description="资产节点ID（LINE 或 EQUIPMENT 类型）")
    ref_id: SnowflakeIdIn = Field(..., description="要绑定的业务实体ID：LINE 节点传 line_id，EQUIPMENT 节点传 equipment_id")


class FactoryAssetNodeUnbindDto(BaseModel):
    """统一解绑 DTO：将 LINE 或 EQUIPMENT 资产节点解绑"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    factory_asset_id: SnowflakeIdIn = Field(..., description="资产节点ID（LINE 或 EQUIPMENT 类型）")


class AddLineNodeDto(BaseModel):
    """在 default 制程下新增线体节点 DTO（拖拉拽资产库线体）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    factory_project_id: SnowflakeIdIn = Field(..., description="工厂项目ID（雪花算法）")
    prim_path: str = Field(..., description="线体节点在 USD 场景中的 Prim 路径")
    line_id: SnowflakeIdIn = Field(..., description="资产库线体模型ID（line_model_details.id），拖拉拽来源")
