from typing import List, Optional
from datetime import datetime

from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.enums.ProjectStatusEnum import ProjectStatus
from models.vo.BaseFactoryVo import BaseFactoryVo
from models.vo.FactoryAssetNodeVo import FactoryAssetNodeTreeVo, FactoryAssetNodeVo


class FactoryProjectVo(BaseModel):
    """工厂项目响应 VO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    project_id: SnowflakeIdOut = Field(..., description="项目主键ID（雪花算法）")
    project_name: str = Field(..., description="项目名称")
    thumbnail_url: Optional[str] = Field(default=None, description="项目缩略图地址")
    status: Optional[ProjectStatus] = Field(default=None, description="项目状态")
    owner_id: Optional[str] = Field(default=None, description="项目负责人ID")
    description: Optional[str] = Field(default=None, description="项目描述")
    # 版本管理冗余字段
    current_version_id: Optional[SnowflakeIdOut] = Field(default=None, description="当前编辑版本ID")
    version_count: Optional[int] = Field(default=None, description="版本总数")

    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")
    last_accessed_at: Optional[datetime] = Field(default=None, description="最后访问时间")

    # 基础工厂的信息，然后返回对应参数
    base_factory: Optional[BaseFactoryVo] = Field(
        default=None,
        description="制程的基础vo类型"
    )


class FactoryProjectAndAssetVo(FactoryProjectVo):
    """工厂项目 + 资产树形结构 响应 VO（用于 /{project_id}/asset-tree）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    asset_tree: List[FactoryAssetNodeTreeVo] = Field(
        default_factory=list,
        description="项目资产树形结构（根节点为 FACTORY，层级 STAGE→LINE→EQUIPMENT）",
    )


class FactoryProjectDetailVo(FactoryProjectVo):
    """工厂项目基础信息 + FACTORY 根节点入口 USD + 完整资产树（用于 GET /{project_id}）。

    前端工厂编辑器据此：① 拿 rootUsdPath 自动打开 OV 场景；② 拿 factoryAssetNodeVo 渲染左侧结构树。
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)

    root_usd_path: Optional[str] = Field(
        default=None,
        description="项目 FACTORY 根节点关联的 3D 资产入口 USD 路径（rootUsdPath）",
    )
    factory_asset_node_vo: Optional[List[FactoryAssetNodeVo]] = Field(
        default=None,
        description="项目资产树（根节点列表，含 children 与 detail；LINE/EQUIPMENT 节点的 detail 带 primPath）",
    )