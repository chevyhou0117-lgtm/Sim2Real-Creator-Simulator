from enum import Enum


class AssetModelType(str, Enum):
    """
    资产模型类型枚举，用于统一状态管理接口路径参数区分。
    - LINE      → 线体模型 (line_model_details)
    - EQUIPMENT → 设备模型 (equipment_model_details)
    """
    LINE = "line"
    EQUIPMENT = "equipment"
