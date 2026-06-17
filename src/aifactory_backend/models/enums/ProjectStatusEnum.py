from enum import Enum


class ProjectStatus(str, Enum):
    """
    工厂项目状态枚举
    对应 PostgreSQL 枚举类型: project_status
    """

    ACTIVE = "active"
    INACTIVE = "inactive"
    ARCHIVED = "archived"
    DRAFT = "draft"
