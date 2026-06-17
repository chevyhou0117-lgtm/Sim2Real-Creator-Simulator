from enum import Enum


class BaseStatus(str, Enum):
    """
    基础状态枚举（工厂/制程通用）
    对应数据库 CHECK 约束: status IN ('ACTIVE', 'INACTIVE')
    """

    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
