from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class NodeIssueVo(BaseModel):
    """单个节点的校验问题"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    node_id: str = Field(..., description="节点ID（雪花算法）")
    node_name: str = Field(..., description="节点名称")
    node_type: str = Field(..., description="节点类型：FACTORY / STAGE / LINE / EQUIPMENT")
    bind_status: str = Field(..., description="当前绑定状态")
    issue_type: str = Field(
        ...,
        description=(
            "问题类型：\n"
            "- UNBOUND：节点未绑定\n"
            "- BIND_FAILED：节点绑定失败（name/code 不匹配）\n"
            "- PARTIALLY_BOUND：非叶子节点下存在未绑定完成的子节点\n"
            "- MISSING_REQUIRED_FIELD：绑定数据存在必填项为空\n"
            "- INVALID_FORMAT：字段格式不符合要求"
        ),
    )
    field: Optional[str] = Field(default=None, description="出错字段名（字段级问题时填写）")
    message: str = Field(..., description="问题详细描述")


class ValidationSummaryVo(BaseModel):
    """校验汇总统计"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    total_nodes: int = Field(..., description="参与校验的节点总数（不含 FACTORY 根节点）")
    bound_count: int = Field(..., description="成功绑定节点数（bind_status=BOUND）")
    unbound_count: int = Field(..., description="未绑定节点数（bind_status=UNBOUND）")
    bind_failed_count: int = Field(..., description="绑定失败节点数（bind_status=BIND_FAILED）")
    partially_bound_count: int = Field(..., description="未绑定完节点数（bind_status=PARTIALLY_BOUND，非叶子节点）")
    field_error_count: int = Field(..., description="存在必填项或格式问题的节点数")


class ValidationReportVo(BaseModel):
    """工厂项目校验报告"""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    project_id: str = Field(..., description="项目ID")
    project_name: str = Field(..., description="项目名称")
    version_id: Optional[str] = Field(default=None, description="当前校验版本ID")
    version_number: Optional[int] = Field(default=None, description="版本号")
    validated_at: datetime = Field(..., description="校验时间（UTC）")
    is_valid: bool = Field(..., description="是否校验通过（true=通过，false=不通过）")
    final_status: str = Field(
        ...,
        description="校验后项目最终状态：active（通过）/ draft（未通过）",
    )
    summary: ValidationSummaryVo = Field(..., description="节点绑定汇总统计")
    issues: List[NodeIssueVo] = Field(
        default_factory=list,
        description="校验问题列表（为空列表时表示无任何问题，全部通过）",
    )
