from typing import Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from common.PageRequest import PageRequest
from commonutils.SnowflakeUtils import SnowflakeIdIn
from models.enums.ProjectStatusEnum import ProjectStatus


class FactoryProjectCreateDto(BaseModel):
    """创建工厂项目请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    # 工厂信息：二选一
    # - 传 factory_id：选择已有工厂，自动加载工厂参数，版本递增
    # - 不传 factory_id：传 factory_name + factory_code 新建工厂（factory_id 雪花自动生成）
    factory_id: Optional[SnowflakeIdIn] = Field(default=None, description="所属工厂ID（选择已有工厂时传入）")
    factory_name: Optional[str] = Field(default=None, description="工厂名称（新建工厂时必填）", max_length=200)
    factory_code: Optional[str] = Field(default=None, description="工厂编号（新建工厂时必填，对应 md_factory.factory_code）", max_length=50)
    site_length: Optional[float] = Field(default=None, description="现实物理长度")
    site_width: Optional[float] = Field(default=None, description="现实物理宽度")
    location: Optional[str] = Field(default=None, description="工厂地理位置")

    # 项目信息
    project_name: str = Field(..., description="项目名称", min_length=1, max_length=255)
    status: ProjectStatus = Field(default=ProjectStatus.ACTIVE, description="项目状态")
    owner_id: Optional[str] = Field(default=None, description="项目负责人ID", max_length=100)
    description: Optional[str] = Field(default=None, description="项目描述")

    # 版本相关
    copy_from_version_id: Optional[SnowflakeIdIn] = Field(
        default=None,
        description="从哪个版本复制资产树（不传则基于该工厂最新版本的资产树复制；若工厂无历史项目则创建空版本）"
    )


class FactoryProjectUpdateDto(BaseModel):
    """更新工厂项目请求 DTO（project_id 必填）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    project_id: SnowflakeIdIn = Field(..., description="项目主键ID（雪花算法，18~19位整数）")
    project_name: Optional[str] = Field(default=None, description="项目名称", max_length=255)
    thumbnail_url: Optional[str] = Field(default=None, description="项目缩略图地址", max_length=2048)
    status: Optional[ProjectStatus] = Field(default=None, description="项目状态")
    owner_id: Optional[str] = Field(default=None, description="项目负责人ID", max_length=100)
    description: Optional[str] = Field(default=None, description="项目描述")


class FactoryProjectDeleteDto(BaseModel):
    """删除工厂项目请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
    project_id: SnowflakeIdIn = Field(..., description="项目主键ID（雪花算法，18~19位整数）")


class FactoryProjectCopyDto(BaseModel):
    """复制工厂项目请求 DTO（生成新版本）"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    source_project_id: SnowflakeIdIn = Field(..., description="源项目主键ID（雪花/UUID 字符串）")


class FactoryProjectQueryDto(PageRequest):
    """分页查询工厂项目请求 DTO"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    factory_id: Optional[SnowflakeIdIn] = Field(default=None, description="所属工厂ID过滤")
    project_name: Optional[str] = Field(default=None, description="项目名称（模糊搜索）")
    status: Optional[ProjectStatus] = Field(default=None, description="项目状态过滤")
    owner_id: Optional[str] = Field(default=None, description="项目负责人ID过滤")
