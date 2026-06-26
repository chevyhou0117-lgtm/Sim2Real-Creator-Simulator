"""Pydantic schemas for master data API responses."""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class FactoryOut(BaseModel):
    factory_id: str
    factory_code: str
    factory_name: str
    location: str | None = None
    timezone: str
    status: str

    plan_id: str | None = None
    model_config = {"from_attributes": True}


class StageOut(BaseModel):
    stage_id: str
    factory_id: str
    stage_code: str
    stage_name: str
    sequence: int
    stage_type: str
    line_count: int | None = None
    status: str
    creator_binding_id: str | None = None

    plan_id: str | None = None
    model_config = {"from_attributes": True}


class ProductionLineOut(BaseModel):
    line_id: str
    stage_id: str
    line_code: str
    line_name: str
    smt_pph: Decimal | None = None
    operation_count: int | None = None
    status: str
    creator_binding_id: str | None = None

    plan_id: str | None = None
    model_config = {"from_attributes": True}


class OperationOut(BaseModel):
    operation_id: str
    stage_id: str
    operation_code: str
    operation_name: str
    # 中文展示名；为空时前端 fallback 用 operation_name
    operation_name_cn: str | None = None
    sequence: int
    operation_type: str | None = None
    is_key_operation: bool | None = False
    status: str
    creator_binding_id: str | None = None

    plan_id: str | None = None
    model_config = {"from_attributes": True}


class EquipmentOut(BaseModel):
    equipment_id: str
    operation_id: str
    line_id: str
    equipment_code: str
    equipment_name: str
    equipment_type: str
    manufacturer: str | None = None
    model_no: str | None = None
    status: str
    creator_binding_id: str | None = None
    # 工艺参数从 md_equipment_process_parameters 联表填充（端点会做 outerjoin）
    standard_ct: Decimal | None = None
    standard_yield_rate: Decimal | None = None
    standard_work_efficiency: Decimal | None = None
    standard_worker_count: int | None = None

    plan_id: str | None = None
    model_config = {"from_attributes": True}


class BOPProcessOut(BaseModel):
    bop_process_id: str
    bop_id: str
    operation_id: str
    sequence: int
    standard_ct: Decimal
    panel_qty: int | None = None
    ct_per_panel: Decimal | None = None
    yield_rate: Decimal
    standard_worker_count: int
    min_worker_count: int | None = None
    primary_material_type: str | None = None
    material_usage: dict | None = None  # {物料编码: 件用量}，可含原料 + 上游半成品(SF-*)

    plan_id: str | None = None
    model_config = {"from_attributes": True}


class BOPOut(BaseModel):
    bop_id: str
    product_id: str
    line_id: str
    bop_version: str
    is_active: bool
    processes: list[BOPProcessOut] = []

    plan_id: str | None = None
    model_config = {"from_attributes": True}


class ProductOut(BaseModel):
    product_id: str
    product_code: str
    product_name: str
    product_category: str | None = None
    unit: str
    status: str

    plan_id: str | None = None
    model_config = {"from_attributes": True}


class CreatorProjectOut(BaseModel):
    creator_project_id: str
    project_name: str
    project_version: str | None = None
    project_status: str
    factory_id: str | None = None
    description: str | None = None
    creator_url: str | None = None
    published_at: datetime | None = None

    model_config = {"from_attributes": True}


class OperationTransitionOut(BaseModel):
    transition_id: str
    bop_id: str
    from_operation_id: str
    to_operation_id: str
    transfer_time: Decimal
    mandatory_wait_time: Decimal
    transfer_mode: str | None = None
    wait_reason: str | None = None

    plan_id: str | None = None
    model_config = {"from_attributes": True}


class EquipmentFailureParamOut(BaseModel):
    param_id: str
    equipment_id: str
    mtbf_hours: Decimal
    mttr_minutes: Decimal
    failure_distribution: str | None = None
    data_source: str | None = None

    plan_id: str | None = None
    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Aggregated views for config page panels
# ---------------------------------------------------------------------------
class LineEquipmentConfigItem(BaseModel):
    """Flattened equipment row joined with operation / line / stage info."""

    equipment_id: str
    equipment_code: str
    equipment_name: str
    equipment_type: str
    manufacturer: str | None = None
    model_no: str | None = None
    standard_ct: Decimal | None = None
    standard_yield_rate: Decimal | None = None
    standard_work_efficiency: Decimal | None = None
    standard_worker_count: int | None = None
    operation_id: str
    operation_code: str
    operation_name: str
    operation_name_cn: str | None = None
    operation_sequence: int
    line_id: str
    line_code: str
    line_name: str
    stage_id: str
    stage_name: str


class LineEquipmentConfigOut(BaseModel):
    """Dedicated payload for the 产线设备配置 section on the plan config page."""

    factory_id: str
    line_count: int
    operation_count: int
    equipment_count: int
    last_updated: datetime | None = None
    items: list[LineEquipmentConfigItem]


# ---------------------------------------------------------------------------
# Work Calendar + Shift (aggregated for plan config 工作日历 panel)
# ---------------------------------------------------------------------------
class ShiftItem(BaseModel):
    shift_id: str
    shift_name: str
    start_time: str             # HH:MM
    end_time: str               # HH:MM
    work_hours: Decimal
    break_minutes: int | None = None
    shift_order: int

    plan_id: str | None = None
    model_config = {"from_attributes": True}


class WorkCalendarOut(BaseModel):
    """工作日历概览：日期范围 + 工作日数 + 班次列表。

    数据模型里 Shift 直接挂在 WorkCalendar 上、WorkCalendar 挂在 Factory 上，
    Shift 与 Line 没有显式关联 —— 所以 "适用产线" 一律为整厂所有 ACTIVE 产线。
    """
    factory_id: str
    date_start: str | None = None    # YYYY-MM-DD
    date_end: str | None = None      # YYYY-MM-DD
    total_days: int
    working_days: int
    line_count: int                  # 整厂适用的 ACTIVE 产线数
    shifts: list[ShiftItem]          # 去重后的唯一班次列表（按 shift_name 去重）
