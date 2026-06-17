from enum import Enum


class AssetModelStatus(str, Enum):
    """
    资产模型状态枚举（线体模型 / 设备模型通用）
    对应数据库列 status IN ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED')
    """
    DRAFT    = "DRAFT"     # 草稿（新建未发布）
    ACTIVE   = "ACTIVE"    # 激活（正式使用）
    INACTIVE = "INACTIVE"  # 禁用（暂停使用）
    ARCHIVED = "ARCHIVED"  # 归档（只读存档）
