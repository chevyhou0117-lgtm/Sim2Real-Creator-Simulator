"""Pydantic schemas for simulation plan API."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# SimulationPlan
# ---------------------------------------------------------------------------
class PlanCreate(BaseModel):
    plan_name: str
    factory_id: str
    enabled_simulators: list[str]
    simulation_duration_hours: float
    plan_description: str | None = None
    created_by: str
    ignore_wo: bool = False
    creator_project_id: str | None = None


class PlanUpdate(BaseModel):
    plan_name: str | None = None
    plan_description: str | None = None
    enabled_simulators: list[str] | None = None
    simulation_duration_hours: float | None = None
    ignore_wo: bool | None = None
    creator_project_id: str | None = None


class PlanOut(BaseModel):
    plan_id: str
    plan_name: str
    plan_description: str | None = None
    factory_id: str
    status: str
    enabled_simulators: list[str]
    ignore_wo: bool
    simulation_duration_hours: Decimal
    creator_project_id: str | None = None
    base_data_version: str | None = None  # "snapshot:<ts>" 表示已建基础数据快照
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# SoftConstraintConfig
# ---------------------------------------------------------------------------
class ConstraintSet(BaseModel):
    constraint_type: str
    is_enabled: bool


class ConstraintOut(BaseModel):
    constraint_id: str
    plan_id: str
    constraint_type: str
    is_enabled: bool

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# ParameterOverride
# ---------------------------------------------------------------------------
class OverrideCreate(BaseModel):
    scope_type: str
    scope_id: str | None = None
    param_key: str
    param_value: str
    time_range_start: float | None = None
    time_range_end: float | None = None


class OverrideOut(BaseModel):
    override_id: str
    plan_id: str
    scope_type: str
    scope_id: str | None = None
    param_key: str
    param_value: str
    time_range_start: Decimal | None = None
    time_range_end: Decimal | None = None

    model_config = {"from_attributes": True}


class OverrideUpsert(BaseModel):
    """PUT /plans/{id}/overrides 用：按 (plan_id, scope_type, scope_id, param_key) upsert。
    param_value 为空字符串时视为删除（恢复 BoP 默认）。"""
    scope_type: str
    scope_id: str | None = None
    param_key: str
    param_value: str
    time_range_start: float | None = None
    time_range_end: float | None = None


class OverrideBatchUpsert(BaseModel):
    """POST /plans/{id}/overrides:batch 用：一次性 upsert 多条 override。
    每条 item 语义同 OverrideUpsert。param_value 为空字符串视为删除。"""
    items: list[OverrideUpsert]


# ---------------------------------------------------------------------------
# Effective parameters (per equipment × param_key, with inheritance chain)
# ---------------------------------------------------------------------------
class EffectiveParam(BaseModel):
    """单台设备单个参数的当前生效值 + 来源层级。

    source 取值：
      - OVERRIDE_{EQUIPMENT|OPERATION|BOP_PROCESS|LINE|STAGE|GLOBAL}: 本 plan 的覆盖
      - BASELINE_{EQUIPMENT|BOP_PROCESS|FAILURE_PARAM|DEFAULT}: 主数据基线
    """
    equipment_id: str
    operation_id: str
    line_id: str
    stage_id: str
    factory_id: str
    # 该 (line, operation) 在当前 BoP 视图下对应的 BOPProcess.id；用于前端写
    # BOP_PROCESS scope override 时定位 scope_id。该产线无激活 BoP 时为 None。
    bop_process_id: str | None = None
    param_key: str
    value: Decimal | None = None
    source: str
    override_scope_id: str | None = None
    override_id: str | None = None
    baseline_value: Decimal | None = None


class EffectiveParamsOut(BaseModel):
    plan_id: str
    factory_id: str
    # line_id → product_code（该线在本视图下采用的激活 BoP 对应产品；无激活 BoP 则为 None）
    used_product_by_line: dict[str, str | None]
    items: list[EffectiveParam]


# ---------------------------------------------------------------------------
# Plan readiness (3 维度 + 整体百分比，供前端就绪 chip)
# ---------------------------------------------------------------------------
class ReadinessSection(BaseModel):
    section_id: str
    label: str
    pct: int       # 0-100
    status: str    # ok / warning / missing
    detail: str


class ReadinessOut(BaseModel):
    plan_id: str
    input_pct: int          # 输入数据
    params_pct: int         # 参数配置
    constraints_pct: int    # 约束设置
    overall_pct: int
    sections: list[ReadinessSection]


# ---------------------------------------------------------------------------
# Data Import (Excel/CSV 上传 → 校验 → 落库 两步式)
# ---------------------------------------------------------------------------
class ImportIssue(BaseModel):
    row: int          # 1-based 行号（含表头时表头算第 1 行；data 行从 2 起）
    field: str        # 列名（或 "row" 表示整行级错误）
    message: str


class ImportValidationResult(BaseModel):
    section_id: str
    valid: bool                          # 无 errors 时 True
    total_rows: int                      # data 行总数（不含表头）
    valid_rows: int                      # 通过校验的行数
    errors: list[ImportIssue]            # 阻塞错误
    warnings: list[ImportIssue]          # 非阻塞警告
    columns: list[str]                   # 解析出的列头
    preview_rows: list[list[str]]        # 前 N 行预览（最多 5 行，字符串形式）


class ImportCommitResult(BaseModel):
    section_id: str
    inserted: int           # 实际入库行数
    skipped: int            # 跳过行数（错误或重复）
    plan_id: str | None = None
    message: str


# ---------------------------------------------------------------------------
# 保存并就绪 校验门（POST /plans/{id}/ready 失败时 422 body）
# ---------------------------------------------------------------------------
class ReadyRuleReport(BaseModel):
    rule_id: str
    dimension: str           # input / params / constraints
    label: str
    passed: bool
    blocking: bool
    issues: list[ImportIssue]


class ReadyValidationError(BaseModel):
    plan_id: str
    ok: bool = False
    failed_rules: list[ReadyRuleReport]   # 阻塞且未过
    warnings: list[ReadyRuleReport]       # 非阻塞且未过


# ---------------------------------------------------------------------------
# ProductionTask
# ---------------------------------------------------------------------------
class TaskCreate(BaseModel):
    wo_id: str | None = None
    stage_id: str
    line_id: str
    product_code: str
    plan_quantity: int
    production_sequence: int
    data_source: str = "MANUAL_IMPORT"


class TaskOut(BaseModel):
    task_id: str
    plan_id: str
    wo_id: str | None = None
    stage_id: str
    line_id: str
    product_code: str
    plan_quantity: int
    completed_qty: int | None = None
    production_sequence: int
    # 联表附带字段（list_tasks 端点填充；createTask/replaceTasks 留空）
    line_code: str | None = None
    line_name: str | None = None
    wo_no: str | None = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# AnomalyInjection
# ---------------------------------------------------------------------------
class AnomalyCreate(BaseModel):
    anomaly_type: str
    target_id: str
    start_sim_hour: float
    duration_minutes: float
    description: str | None = None


class AnomalyUpdate(BaseModel):
    anomaly_type: str | None = None
    target_id: str | None = None
    start_sim_hour: float | None = None
    duration_minutes: float | None = None
    description: str | None = None


class AnomalyOut(BaseModel):
    anomaly_id: str
    plan_id: str
    anomaly_type: str
    target_id: str
    start_sim_hour: Decimal
    duration_minutes: Decimal
    description: str | None = None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Plan Version
# ---------------------------------------------------------------------------
class VersionCreate(BaseModel):
    version_name: str
    notes: str | None = None


class VersionOut(BaseModel):
    version_id: str
    plan_id: str
    version_name: str
    version_no: int
    is_baseline: bool
    key_metrics: dict | None = None
    notes: str | None = None
    archived_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Parameter Template
# ---------------------------------------------------------------------------
class TemplateCreate(BaseModel):
    template_name: str
    template_description: str | None = None
    factory_id: str | None = None
    is_public: bool = True
    template_content: dict
    created_by: str


class TemplateOut(BaseModel):
    template_id: str
    template_name: str
    template_type: str
    template_description: str | None = None
    factory_id: str | None = None
    is_public: bool
    template_content: dict
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------
class ExportRequest(BaseModel):
    modules: list[str]
    format: str = "json"
    title: str | None = None
    language: str = "en"


# ---------------------------------------------------------------------------
# Business snapshots (plan-scoped)
# ---------------------------------------------------------------------------
class MaterialSupplyOut(BaseModel):
    supply_id: str
    plan_id: str
    material_code: str
    material_name: str | None = None
    supply_quantity: Decimal
    arrival_sim_hour: Decimal
    target_warehouse_id: str
    data_source: str

    model_config = {"from_attributes": True}


class InventorySnapshotOut(BaseModel):
    snapshot_id: str
    plan_id: str
    warehouse_id: str
    material_code: str
    total_quantity: Decimal
    available_quantity: Decimal
    snapshot_time: datetime
    data_source: str

    model_config = {"from_attributes": True}


class WIPBufferSnapshotOut(BaseModel):
    wip_snapshot_id: str
    plan_id: str
    wip_id: str
    material_code: str
    current_quantity: Decimal
    current_volume: Decimal
    snapshot_time: datetime
    data_source: str

    model_config = {"from_attributes": True}


class WIPBufferOut(BaseModel):
    """线边仓"定义"（虚拟线边仓拓扑）：供 2D 俯视图画工序间缓冲 + 容量。"""
    wip_id: str
    wip_code: str
    wip_name: str
    line_id: str
    pre_operation_id: str | None = None
    post_operation_id: str | None = None
    capacity_qty: int | None = None  # None=无限（默认）；有数=勾选 WIP_CAPACITY 后导入的件数上限

    model_config = {"from_attributes": True}


class StageTransitionOut(BaseModel):
    """制程（线）间接续：供 2D 俯视图画跨线连接（S2S 流式 / E2S 批量）+ 接续时长。"""
    from_stage_id: str
    to_stage_id: str
    connection_type: str  # S2S / E2S
    connection_time: Decimal  # 秒

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Batch operations
# ---------------------------------------------------------------------------
class BatchIds(BaseModel):
    plan_ids: list[str]
