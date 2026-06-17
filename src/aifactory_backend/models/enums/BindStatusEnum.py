from enum import Enum


class BindStatus(str, Enum):
    """
    工厂资产节点数据绑定状态枚举
    对应 factory_asset_node.bind_status 字段
    """
    UNBOUND          = "UNBOUND"           # 未绑定（ref_id = NULL，如 default_stage）
    BOUND            = "BOUND"             # 绑定成功（ref_id 有效，关联数据存在）
    BIND_FAILED      = "BIND_FAILED"       # 绑定失败（ref_id 有值但关联数据已删除/无效）
    PARTIALLY_BOUND  = "PARTIALLY_BOUND"   # 未绑定完（子节点中存在未绑定或绑定失败项）
