from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn
from models.enums.CategoryEnum import AssetCategoryType, Category, AssetUploadType


class AssetCategoryCreateDto(BaseModel):
    """创建资产分类请求 DTO"""
    name: str = Field(..., description="分类名称", min_length=1, max_length=255)
    code: str = Field(..., description="分类编码（全局唯一）", min_length=1, max_length=100)
    type: AssetCategoryType = Field(
        ...,
        description="分类类型: process / line_type / equipment_type / line_model / equipment_model"
    )
    parent_id: Optional[SnowflakeIdIn] = Field(default=None, description="父级分类ID（雪花算法），顶级节点为空")
    description: Optional[str] = Field(default=None, description="分类描述")
    thumbnail_path: Optional[str] = Field(default=None, description="分类缩略图路径", max_length=1024)
    asset_total_count: Optional[int] = Field(default=0, description="树节点叶子节点个数")

class AssetCategoryUpdateDto(BaseModel):
    """更新资产分类请求 DTO（id 必填）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: SnowflakeIdIn = Field(..., description="分类主键ID（雪花算法，18~19位整数）")
    name: Optional[str] = Field(default=None, description="分类名称", max_length=255)
    code: Optional[str] = Field(default=None, description="分类编码", max_length=100)
    parent_id: Optional[SnowflakeIdIn] = Field(default=None, description="父级分类ID（雪花算法）")
    description: Optional[str] = Field(default=None, description="分类描述")
    thumbnail_path: Optional[str] = Field(default=None, description="分类缩略图路径", max_length=1024)


class AssetCategoryDeleteDto(BaseModel):

    """
    删除资产分类以及资产模型
    """
    id: SnowflakeIdIn = Field(..., description="分类主键ID（雪花算法，18~19位整数）")



class AssetCategoryQueryDto(BaseModel):
    """ 根据模型名搜索对应的结构 """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    # 搜索关键词
    keyword: Optional[str] = Field(
        default=None,
        description="搜索匹配资产模型节点的名称",
        max_length=255
    )

    # 制程名称
    process_name: Optional[str] = Field(
        default=None,
        description="制程名称，例如 'SMT Process'",
        max_length=255
    )

    # 资产类型
    type: Optional[str] = Field(
        default=None,
        description="资产类型（line_model / equipment_model）",
        max_length=50
    )


class AssetCategoryFilterDto(BaseModel):
    """制程 + 类型 + 状态进行过滤操作（三种模式自动匹配）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    # 制程名称（模糊匹配，选填）
    process_name: Optional[str] = Field(
        default=None,
        description="制程名称，例如 'SMT Process'（模糊匹配，选填）",
        max_length=255,
    )

    # 资产类型（仅在制程模式下生效）
    type: Optional[str] = Field(
        default=None,
        description="资产类型（line_model / equipment_model），选填，仅在制程模式下生效",
        max_length=50,
    )

    # 模型状态（DRAFT / ACTIVE / INACTIVE / ARCHIVED）
    status: Optional[str] = Field(
        default=None,
        description="模型状态：DRAFT / ACTIVE / INACTIVE / ARCHIVED（选填）",
        max_length=50,
    )


class AssetCategoryMoveDto(BaseModel):
    """拖拽移动叶子节点请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: SnowflakeIdIn = Field(..., description="被移动的叶子节点ID")
    new_parent_id: SnowflakeIdIn = Field(..., description="目标父节点ID")


class AssetCopyModelDto(BaseModel):
    """复制资产模型节点为新版本请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    category_id: SnowflakeIdIn = Field(
        ...,
        description="源资产模型节点ID（asset_categories.id），类型必须为 line_model 或 equipment_model"
    )
    new_asset_name: str = Field(
        ...,
        description="新资产名称（新分类节点名称）",
        min_length=1,
        max_length=255,
    )
    new_version_tag: str = Field(
        ...,
        description="新版本标签，如 v2.0、v1.1，同一逻辑资产下不允许重复",
        min_length=1,
        max_length=50,
    )
    asset_type: AssetUploadType = Field(
        ...,
        description="资产类型：line（线体模型）/ equipment（设备模型）"
    )
