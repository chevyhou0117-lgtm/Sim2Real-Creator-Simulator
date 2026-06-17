from enum import IntEnum, Enum


class Category(IntEnum):
    """
    存储类别枚举
    对应数据库字段 storage_category (INT)
    """

    PRODUCTION_LINE = 1  #
    EQUIPMENT = 2        # 设备类
    OTHER = 3        # 其他


class AssetCategoryType(str, Enum):
    """
    资产分类类型枚举
    对应数据库字段 asset_categories.type (VARCHAR)
    """

    PROCESS = "process"                    # 制程
    LINE_TYPE = "line_type"                # 线体类型
    EQUIPMENT_TYPE = "equipment_type"      # 设备类型
    LINE_MODEL = "line_model"              # 线体模型
    EQUIPMENT_MODEL = "equipment_model"    # 设备模型







class AssetUploadType(str, Enum):
    """
    上传资产文件分类
    """
    FACTORY = "factory"          # 工厂模型
    LINE = "line"                # 线体模型
    EQUIPMENT_MODEL = "equipment"    # 设备模型
