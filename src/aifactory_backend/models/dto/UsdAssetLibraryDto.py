from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict,Field
from pydantic.alias_generators import to_camel
from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn


class AssetLibraryCreateDto(BaseModel):
    """创建 USD 资产库记录请求 DTO"""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        json_schema_extra={
            "example": {
                "name": "发动机散热器组件",
                "storage_type": "folder",
                "root_usd_path": "Collected_a_L_HST_Dis_Assy_Sub/a_L_HST_Dis_Assy_Sub.usd",
                "location_path": "Collected_a_L_HST_Dis_Assy_Sub/",
                "thumbnail_path": "thumbnails/a_L_HST_Dis_Assy_Sub.png",
                "category_l1": "机械零件",
                "category_l2": "发动机",
                "category_l3": "散热系统",
                "tags": ["发动机", "散热", "装配体"],
                "open_config": {"app": "usd_viewer", "version": "1.0"},
                "file_list": ["a_L_HST_Dis_Assy_Sub.usd", "textures/diffuse.png"]
            }
        }
    )

    name: str = Field(..., description="资产名称", min_length=1, max_length=255)
    storage_type: Optional[str] = Field(default="folder", description="存储类型: file 或 folder")
    root_usd_path: str = Field(..., description="根USD文件路径，例如: folder/asset.usd")
    location_path: str = Field(..., description="存储位置路径，例如: folder/")
    thumbnail_path: Optional[str] = Field(default=None, description="缩略图在MinIO中的路径")
    category_l1: str = Field(..., description="主分类", max_length=50)
    category_l2: Optional[str] = Field(default=None, description="子分类", max_length=50)
    category_l3: Optional[str] = Field(default=None, description="三级分类", max_length=50)
    tags: Optional[List[str]] = Field(default=None, description="标签列表")
    open_config: Optional[Dict[str, Any]] = Field(default=None, description="打开方式配置(JSON)")
    file_list: Optional[Any] = Field(default=None, description="文件夹内所有文件列表(JSON)")


class AssetLibraryUpdateDto(BaseModel):
    """更新 USD 资产库记录请求 DTO（所有字段均为可选）"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: SnowflakeIdIn = Field(..., description="资产主键ID（雪花算法，18~19位整数）")
    name: Optional[str] = Field(default=None, description="资产名称", max_length=255)
    storage_type: Optional[str] = Field(default=None, description="存储类型: file 或 folder")
    root_usd_path: Optional[str] = Field(default=None, description="根USD文件路径")
    location_path: Optional[str] = Field(default=None, description="存储位置路径")
    thumbnail_path: Optional[str] = Field(default=None, description="缩略图路径")
    category_l1: Optional[str] = Field(default=None, description="主分类", max_length=50)
    category_l2: Optional[str] = Field(default=None, description="子分类", max_length=50)
    category_l3: Optional[str] = Field(default=None, description="三级分类", max_length=50)
    tags: Optional[List[str]] = Field(default=None, description="标签列表")
    open_config: Optional[Dict[str, Any]] = Field(default=None, description="打开方式配置(JSON)")
    file_list: Optional[Any] = Field(default=None, description="文件夹内所有文件列表(JSON)")


class AssetLibraryPresignedUrlDto(BaseModel):
    """获取预签名 URL 请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: SnowflakeIdIn = Field(..., description="资产主键ID（雪花算法，18~19位整数）")
    expires_seconds: int = Field(
        default=36000, ge=60, le=86400,
        description="URL 有效期（秒），默认 36000（10小时），最大 86400（24小时）"
    )

class AssetLibraryQueryDto(PageRequest):
    """分页查询 USD 资产库请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    name: Optional[str] = Field(default=None, description="资产名称（模糊搜索）")
    storage_type: Optional[str] = Field(default=None, description="存储类型过滤: file 或 folder")
    category_l1: Optional[str] = Field(default=None, description="主分类过滤")
    category_l2: Optional[str] = Field(default=None, description="子分类过滤")
    category_l3: Optional[str] = Field(default=None, description="三级分类过滤")
    tags: Optional[List[str]] = Field(default=None, description="标签过滤（包含任意一个即匹配）")


class AssetLibraryDeleteDto(BaseModel):
    """删除 USD 资产请求 DTO"""
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: SnowflakeIdIn = Field(..., description="资产主键ID（雪花算法，18~19位整数）")
    delete_minio_files: bool = Field(default=True, description="是否同步删除 MinIO 文件，默认 True")
