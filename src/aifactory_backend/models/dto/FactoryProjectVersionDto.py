from typing import Optional
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn


class VersionStatusEnum:
    """版本状态枚举"""
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    ARCHIVED = "ARCHIVED"


# ──────────────── 创建新版本 ────────────────
class FactoryProjectVersionCreateDto(BaseModel):
    """创建项目新版本请求 DTO（基于当前版本或指定基线版本派生）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    project_id: SnowflakeIdIn = Field(..., description="项目ID（雪花算法）")
    version_name: Optional[str] = Field(default=None, description="版本名称，如 V2.0 扩产方案", max_length=255)
    remark: Optional[str] = Field(default=None, description="备注描述", max_length=255)
    base_version_id: Optional[SnowflakeIdIn] = Field(
        default=None,
        description="基线版本ID（不传则基于当前版本派生，传则从指定版本派生）"
    )
    created_by: Optional[str] = Field(default=None, description="创建人", max_length=100)


# ──────────────── 发布版本 ────────────────
class FactoryProjectVersionPublishDto(BaseModel):
    """发布版本请求 DTO（DRAFT → PUBLISHED）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    version_id: SnowflakeIdIn = Field(..., description="版本ID（雪花算法）")
    published_by: Optional[str] = Field(default=None, description="发布人", max_length=100)


# ──────────────── 归档版本 ────────────────
class FactoryProjectVersionArchiveDto(BaseModel):
    """归档版本请求 DTO（PUBLISHED → ARCHIVED）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    version_id: SnowflakeIdIn = Field(..., description="版本ID（雪花算法）")


# ──────────────── 切换当前版本 ────────────────
class FactoryProjectVersionSwitchDto(BaseModel):
    """切换当前编辑版本请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    project_id: SnowflakeIdIn = Field(..., description="项目ID（雪花算法）")
    version_id: SnowflakeIdIn = Field(..., description="目标版本ID（必须为 DRAFT 状态）")


# ──────────────── 更新版本信息 ────────────────
class FactoryProjectVersionUpdateDto(BaseModel):
    """更新版本信息请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    version_id: SnowflakeIdIn = Field(..., description="版本ID（雪花算法）")
    version_name: Optional[str] = Field(default=None, description="版本名称", max_length=255)
    remark: Optional[str] = Field(default=None, description="备注描述", max_length=255)


# ──────────────── 删除版本 ────────────────
class FactoryProjectVersionDeleteDto(BaseModel):
    """删除版本请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    version_id: SnowflakeIdIn = Field(..., description="版本ID（雪花算法）")


# ──────────────── 查询版本列表 ────────────────
class FactoryProjectVersionQueryDto(PageRequest):
    """分页查询项目版本列表请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    project_id: Optional[SnowflakeIdIn] = Field(default=None, description="项目ID过滤")
    version_status: Optional[str] = Field(default=None, description="版本状态过滤（DRAFT/PUBLISHED/ARCHIVED）")
