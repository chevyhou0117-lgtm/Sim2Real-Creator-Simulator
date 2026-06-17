from typing import Any, Dict, Optional
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict
from pydantic.alias_generators import to_camel

from commonutils.SnowflakeUtils import SnowflakeIdOut
from models.vo.BaseStageVo import BaseStageVo


class FactoryProcessDetailsVo(BaseModel):
    """
    制程详情响应 VO（驼峰命名）
    重构说明：本 VO 为聚合视图，同时返回基础数据层(base_stage)和实例层信息
    - 带 [基础] 标记的字段来自 base_stage，通过 factory_asset_node.ref_id JOIN 获取
    - 带 [实例] 标记的字段为本表直接存储
    """

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True
    )

    id: SnowflakeIdOut = Field(..., description="主键ID（雪花算法）")
    factory_asset_id: SnowflakeIdOut = Field(..., description="关联工厂资产节点ID（雪花算法）")
    # ===== [基础] 来自 base_stage =====
    process_name: Optional[str] = Field(default=None, description="[基础] 制程名称 → base_stage.stage_name")
    process_code: Optional[str] = Field(default=None, description="[基础] 制程编码 → base_stage.stage_code")
    line_count: Optional[int] = Field(default=None, description="[基础] 线体数量 → base_stage.line_count")

    # ===== [实例] 本表直接存储 =====
    total_capacity: Optional[int] = Field(default=None, description="[实例] 制程总产能（pcs/day）")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="[实例] 扩展元数据")
    description: Optional[str] = Field(default=None, description="[实例] 补充描述")

    created_at: Optional[datetime] = Field(default=None, description="创建时间")
    updated_at: Optional[datetime] = Field(default=None, description="更新时间")

    # 基础制程
    base_process: Optional[BaseStageVo] = Field(
        default=None,
        description="制程的基础vo类型"
    )