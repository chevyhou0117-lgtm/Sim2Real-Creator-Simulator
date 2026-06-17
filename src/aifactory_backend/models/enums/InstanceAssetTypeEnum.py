from enum import Enum


class InstanceAssetType(str, Enum):
    """
    工厂资产节点类型枚举
    对应表: instance_asset_type_dict
    """
    STAGE = "STAGE"         # 制程节点，对应 base_stage
    LINE = "LINE"           # 线体节点，对应 base_production_line
    EQUIPMENT = "EQUIPMENT" # 设备节点，对应 base_equipment
    FACTORY ="FACTORY" # 根节点信息 对应 base_factory
