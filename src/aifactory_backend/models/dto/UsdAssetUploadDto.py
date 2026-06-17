from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel
from common.PageRequest import PageRequest

from commonutils.SnowflakeUtils import SnowflakeIdIn
from models.enums.CategoryEnum import AssetUploadType


class UsdPresignedUrlDto(BaseModel):
    """根据 root_usd_path 生成 MinIO 预签名下载链接请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    root_usd_path: str = Field(..., description="USD 文件在 MinIO 中的完整路径", min_length=1, max_length=1024)
    expires_seconds: Optional[int] = Field(default=36000, description="预签名 URL 有效期（秒），默认 36000 秒")


class AssetVersionUpdateDto(BaseModel):
    """
    更新资产模型版本请求 DTO（创建已有资产的新版本）。

    基于源详情记录（detail_id）派生一条新版本详情行：
    - 复制源行的元数据字段，覆盖请求中提供的非空字段
    - 新行沿用源行的 asset_version_id 谱系（源行 asset_version_id 为空时回退为源行 id）
    - 新行 is_current=True，同谱系其余 is_current=True 行置为 False

    注意：本地存储版（非 MinIO），仅做 DB 行派生；如需更换 USD/缩略图文件，
    由前端先上传文件后将路径通过本 DTO 传入。
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    asset_type: AssetUploadType = Field(..., description="资产类型：line（线体模型） / equipment（设备模型）")
    detail_id: SnowflakeIdIn = Field(
        ...,
        description="源版本详情主键ID（基于该行派生新版本；line_model_details.id 或 equipment_model_details.id）",
    )
    version_tag: str = Field(
        ..., description="新版本标签，如 v2.0、v1.1，同一逻辑资产（asset_version_id）下不允许重复",
        min_length=1, max_length=50,
    )
    remark: Optional[str] = Field(default=None, description="版本备注 / 修改内容记录")
    created_by: Optional[str] = Field(default=None, description="版本创建人", max_length=100)

    # 新版本可选覆盖字段（不传则沿用源行值）
    root_usd_path: Optional[str] = Field(default=None, description="新版本根USD文件路径", max_length=1024)
    location_path: Optional[str] = Field(default=None, description="新版本位置路径", max_length=1024)
    thumbnail_path: Optional[str] = Field(default=None, description="新版本缩略图路径", max_length=1024)

