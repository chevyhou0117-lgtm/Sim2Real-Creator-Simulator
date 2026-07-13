"""Master data read-only API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from loguru import logger
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.api.scope import scoped
from app.models.md import (
    BOP,
    BOPProcess,
    CreatorProject,
    Equipment,
    EquipmentFailureParam,
    EquipmentProcessParameters,
    Factory,
    Operation,
    OperationTransition,
    Product,
    ProductionLine,
    Shift,
    Stage,
    WorkCalendar,
)
from app.schemas.md import (
    BOPOut,
    CreatorProjectOut,
    EquipmentFailureParamOut,
    EquipmentOut,
    FactoryOut,
    LineEquipmentConfigItem,
    LineEquipmentConfigOut,
    OperationOut,
    OperationTransitionOut,
    ProductionLineOut,
    ProductOut,
    ShiftItem,
    StageOut,
    WorkCalendarOut,
)

router = APIRouter(prefix="/factories", tags=["Master Data"])


@router.get("", response_model=list[FactoryOut])
def list_factories(plan_id: str | None = None, db: Session = Depends(get_db)):
    # Factory 永久全局单例（全软件只服务 P9 一个工厂），不参与 per-plan 快照克隆。
    # 恒返全局行；plan_id 入参保留仅为兼容前端调用签名，对 Factory 无意义。
    return (
        db.query(Factory)
        .filter(Factory.status == "ACTIVE", Factory.plan_id.is_(None))
        .all()
    )


@router.get("/{factory_id}/stages", response_model=list[StageOut])
def list_stages(factory_id: str, plan_id: str | None = None, db: Session = Depends(get_db)):
    q = (
        db.query(Stage)
        .filter(Stage.factory_id == factory_id, Stage.status == "ACTIVE")
    )
    return scoped(q, Stage, plan_id).order_by(Stage.sequence).all()


@router.get("/stages/{stage_id}/lines", response_model=list[ProductionLineOut])
def list_lines(stage_id: str, plan_id: str | None = None, db: Session = Depends(get_db)):
    q = (
        db.query(ProductionLine)
        .filter(ProductionLine.stage_id == stage_id, ProductionLine.status == "ACTIVE")
    )
    return scoped(q, ProductionLine, plan_id).order_by(ProductionLine.sort_order).all()


@router.get("/lines/{line_id}/operations", response_model=list[OperationOut])
def list_operations(line_id: str, plan_id: str | None = None, db: Session = Depends(get_db)):
    # Operation 通过 BOP → BOPProcess 关联到 line。plan-scope 同时对 Operation 和 BOP 生效。
    q = (
        db.query(Operation)
        .join(BOPProcess, BOPProcess.operation_id == Operation.operation_id)
        .join(BOP, BOP.bop_id == BOPProcess.bop_id)
        .filter(BOP.line_id == line_id, BOP.is_active == True, Operation.status == "ACTIVE")  # noqa: E712
    )
    q = scoped(q, Operation, plan_id)
    q = scoped(q, BOP, plan_id)
    return q.order_by(Operation.sequence).all()


@router.get("/lines/{line_id}/products", response_model=list[str])
def list_line_products(
    line_id: str,
    plan_id: str | None = None,
    db: Session = Depends(get_db),
):
    """该 line 当前激活 BoP 对应的全部 product_code 列表（去重，按 product_code 排序）。

    场景：参数面板的产品下拉用——选具体产品 → 写 BOP_PROCESS scope override。
    数据源用 BoP 表（不依赖 plan_tasks），未投产产品也能显示，避免 plan 早期 DRAFT
    阶段 task 还没建时下拉只剩「全部」。
    """
    q = (
        db.query(Product.product_code)
        .join(BOP, BOP.product_id == Product.product_id)
        .filter(BOP.line_id == line_id, BOP.is_active == True)  # noqa: E712
        .distinct()
        .order_by(Product.product_code)
    )
    q = scoped(q, BOP, plan_id)
    q = scoped(q, Product, plan_id)
    return [row[0] for row in q.all()]


@router.get("/lines/{line_id}/bop", response_model=BOPOut | None)
def get_active_bop(
    line_id: str,
    product_code: str | None = None,
    plan_id: str | None = None,
    db: Session = Depends(get_db),
):
    """Return the active BoP for this line. Pass ?product_code= to disambiguate when the line has multiple active BoPs (multi-product seed)."""
    logger.debug(
        "get_active_bop line={} product={} plan={}", line_id, product_code, plan_id,
    )
    q = db.query(BOP).filter(BOP.line_id == line_id, BOP.is_active == True)  # noqa: E712
    q = scoped(q, BOP, plan_id)
    if product_code:
        q = q.join(Product, Product.product_id == BOP.product_id).filter(
            Product.product_code == product_code,
        )
    # plan 覆盖优先
    bop = q.order_by(BOP.plan_id.desc().nullslast()).first()
    if not bop:
        msg = f"No active BOP for line={line_id}"
        if product_code:
            msg += f" product={product_code}"
        logger.warning("active BOP miss: {}", msg)
        raise HTTPException(404, msg)
    logger.info(
        "active BOP hit line={} product={} -> bop_id={}",
        line_id, product_code, bop.bop_id,
    )
    return bop


@router.get("/operations/{operation_id}/equipment", response_model=list[EquipmentOut])
def list_equipment(
    operation_id: str,
    line_id: str | None = None,
    plan_id: str | None = None,
    db: Session = Depends(get_db),
):
    """List equipment under an operation. Optional line_id filter narrows to one line.

    自数据模型变更后，equipment 与 line 1:1 绑定，所以同一 operation 在 N 条线上有 N 个实例。
    plan-scope 同时对 Equipment 与 process_params 生效。
    """
    q = (
        db.query(Equipment, EquipmentProcessParameters)
        .outerjoin(
            EquipmentProcessParameters,
            EquipmentProcessParameters.equipment_id == Equipment.equipment_id,
        )
        .filter(Equipment.operation_id == operation_id, Equipment.status == "ACTIVE")
    )
    if line_id:
        q = q.filter(Equipment.line_id == line_id)
    q = scoped(q, Equipment, plan_id)
    rows = q.order_by(Equipment.sort_order).all()
    out: list[EquipmentOut] = []
    for eq, pp in rows:
        out.append(EquipmentOut(
            equipment_id=eq.equipment_id,
            operation_id=eq.operation_id,
            line_id=eq.line_id,
            equipment_code=eq.equipment_code,
            equipment_name=eq.equipment_name,
            equipment_type=eq.equipment_type,
            manufacturer=eq.manufacturer,
            model_no=eq.model_no,
            status=eq.status,
            creator_binding_id=eq.creator_binding_id,
            standard_ct=pp.standard_ct if pp else None,
            standard_yield_rate=pp.standard_yield_rate if pp else None,
            standard_work_efficiency=pp.standard_work_efficiency if pp else None,
            standard_worker_count=pp.standard_worker_count if pp else None,
        ))
    return out


@router.get("/lines/{line_id}/transitions", response_model=list[OperationTransitionOut])
def list_transitions(line_id: str, db: Session = Depends(get_db)):
    """List operation transitions for the active BOP on a production line."""
    bop = (
        db.query(BOP)
        .filter(BOP.line_id == line_id, BOP.is_active == True)  # noqa: E712
        .first()
    )
    if not bop:
        return []
    return db.query(OperationTransition).filter(OperationTransition.bop_id == bop.bop_id).all()


@router.get("/{factory_id}/equipment-failure-params", response_model=list[EquipmentFailureParamOut])
def list_equipment_failure_params(
    factory_id: str, plan_id: str | None = None, db: Session = Depends(get_db)
):
    """List MTBF/MTTR params for all equipment in a factory（plan-scoped）。"""
    q = (
        db.query(EquipmentFailureParam)
        .join(Equipment, Equipment.equipment_id == EquipmentFailureParam.equipment_id)
        .join(Operation, Operation.operation_id == Equipment.operation_id)
        .join(Stage, Stage.stage_id == Operation.stage_id)
        .filter(Stage.factory_id == factory_id)
    )
    q = scoped(q, EquipmentFailureParam, plan_id)
    q = scoped(q, Equipment, plan_id)
    q = scoped(q, Operation, plan_id)
    q = scoped(q, Stage, plan_id)
    return q.all()


@router.get("/{factory_id}/equipment-config", response_model=LineEquipmentConfigOut)
def get_line_equipment_config(
    factory_id: str, plan_id: str | None = None, db: Session = Depends(get_db)
):
    """Aggregated payload for 产线设备配置 panel（plan-scoped）.

    自数据模型变更后 Equipment.line_id 直挂 ProductionLine —— 不再需要绕 BOP。
    standard_ct 从 EquipmentProcessParameters outer join 取（设备级标准节拍）。
    Factory 全局单例后 scoped/global 行 factory_id 相同，必须按 plan 过滤
    （否则同时捞到全局 + 方案副本 → 数量翻倍）。EPP outerjoin 用 plan_id 与
    Equipment 同作用域绑定（同为 scoped X 或同为全局 NULL）。
    """
    rows = (
        scoped(
            scoped(
                scoped(
                    scoped(
                        db.query(
                            Equipment, Operation, ProductionLine, Stage,
                            EquipmentProcessParameters,
                        )
                        .join(Operation, Operation.operation_id == Equipment.operation_id)
                        .join(ProductionLine, ProductionLine.line_id == Equipment.line_id)
                        .join(Stage, Stage.stage_id == ProductionLine.stage_id)
                        .outerjoin(
                            EquipmentProcessParameters,
                            and_(
                                EquipmentProcessParameters.equipment_id
                                == Equipment.equipment_id,
                                EquipmentProcessParameters.plan_id
                                == Equipment.plan_id,
                            ),
                        )
                        .filter(
                            Stage.factory_id == factory_id,
                            Equipment.status == "ACTIVE",
                            Operation.status == "ACTIVE",
                            ProductionLine.status == "ACTIVE",
                        ),
                        Equipment, plan_id,
                    ),
                    Operation, plan_id,
                ),
                ProductionLine, plan_id,
            ),
            Stage, plan_id,
        )
        .order_by(ProductionLine.sort_order, Operation.sequence, Equipment.sort_order)
        .all()
    )

    items: list[LineEquipmentConfigItem] = []
    line_ids: set[str] = set()
    op_ids: set[str] = set()
    last_updated = None

    for eq, op, line, stage, pp in rows:
        line_ids.add(line.line_id)
        op_ids.add(op.operation_id)
        if eq.updated_at and (last_updated is None or eq.updated_at > last_updated):
            last_updated = eq.updated_at
        items.append(LineEquipmentConfigItem(
            equipment_id=eq.equipment_id,
            equipment_code=eq.equipment_code,
            equipment_name=eq.equipment_name,
            equipment_type=eq.equipment_type,
            manufacturer=eq.manufacturer,
            model_no=eq.model_no,
            standard_ct=pp.standard_ct if pp else None,
            standard_yield_rate=pp.standard_yield_rate if pp else None,
            standard_work_efficiency=pp.standard_work_efficiency if pp else None,
            standard_worker_count=pp.standard_worker_count if pp else None,
            operation_id=op.operation_id,
            operation_code=op.operation_code,
            operation_name=op.operation_name,
            operation_name_cn=op.operation_name_cn,
            operation_sequence=op.sequence,
            line_id=line.line_id,
            line_code=line.line_code,
            line_name=line.line_name,
            stage_id=stage.stage_id,
            stage_name=stage.stage_name,
        ))

    logger.info(
        "equipment-config factory={} plan={} -> lines={} ops={} eqs={}",
        factory_id, plan_id, len(line_ids), len(op_ids), len(items),
    )
    return LineEquipmentConfigOut(
        factory_id=factory_id,
        line_count=len(line_ids),
        operation_count=len(op_ids),
        equipment_count=len(items),
        last_updated=last_updated,
        items=items,
    )


@router.get("/{factory_id}/work-calendar", response_model=WorkCalendarOut)
def get_work_calendar(
    factory_id: str, plan_id: str | None = None, db: Session = Depends(get_db)
):
    """工厂工作日历 + 班次概览（供 PlanConfig 工作日历面板，plan-scoped）。

    - 日期范围：min/max(calendar_date)
    - 工作日数：is_working_day = TRUE 计数
    - 班次：跨日历去重（按 shift_name），返回唯一班次列表
    - 适用产线：当前数据模型里 Shift 不直接绑定产线，整厂统一 ⇒ 给个 ACTIVE 产线计数
    Factory 全局单例后须按 plan 过滤，否则全局+方案副本同时计入翻倍。
    """
    cals = scoped(
        db.query(WorkCalendar).filter(WorkCalendar.factory_id == factory_id),
        WorkCalendar, plan_id,
    ).all()
    total_days = len(cals)
    working_days = sum(1 for c in cals if c.is_working_day)
    dates = [c.calendar_date for c in cals]
    date_start = min(dates).isoformat() if dates else None
    date_end = max(dates).isoformat() if dates else None

    # 收集所有班次，按 shift_name 去重
    cal_ids = [c.calendar_id for c in cals]
    shift_rows = (
        scoped(
            db.query(Shift).filter(Shift.calendar_id.in_(cal_ids)),
            Shift, plan_id,
        ).order_by(Shift.shift_order).all() if cal_ids else []
    )
    seen: set[str] = set()
    shifts: list[ShiftItem] = []
    for s in shift_rows:
        if s.shift_name in seen:
            continue
        seen.add(s.shift_name)
        shifts.append(ShiftItem(
            shift_id=s.shift_id,
            shift_name=s.shift_name,
            start_time=s.start_time.strftime("%H:%M"),
            end_time=s.end_time.strftime("%H:%M"),
            work_hours=s.work_hours,
            break_minutes=s.break_minutes,
            shift_order=s.shift_order,
        ))

    line_count = (
        db.query(ProductionLine)
        .join(Stage, Stage.stage_id == ProductionLine.stage_id)
        .filter(Stage.factory_id == factory_id, ProductionLine.status == "ACTIVE")
        .count()
    )

    return WorkCalendarOut(
        factory_id=factory_id,
        date_start=date_start,
        date_end=date_end,
        total_days=total_days,
        working_days=working_days,
        line_count=line_count,
        shifts=shifts,
    )


products_router = APIRouter(prefix="/products", tags=["Master Data"])


@products_router.get("", response_model=list[ProductOut])
def list_products(plan_id: str | None = None, db: Session = Depends(get_db)):
    """产品字典。缺省只回全局主数据行（plan_id IS NULL）——此前不过滤会把每个方案的
    克隆副本全吐出来（N 个方案 = N+1 个同名 PG548，前端下拉重复）。传 plan_id 时
    额外带上该方案的专属副本（RunningPage 需要 scoped product_id → name 映射）。"""
    q = db.query(Product).filter(Product.status == "ACTIVE")
    if plan_id:
        q = q.filter((Product.plan_id == plan_id) | (Product.plan_id.is_(None)))
    else:
        q = q.filter(Product.plan_id.is_(None))
    return q.all()


creator_projects_router = APIRouter(prefix="/creator-projects", tags=["Master Data"])


@creator_projects_router.get("", response_model=list[CreatorProjectOut])
def list_creator_projects(
    status: str | None = None,
    factory_id: str | None = None,
    db: Session = Depends(get_db),
):
    """List Omniverse Creator/Kit 工厂项目。
    可选过滤：status (PUBLISHED/DRAFT/DEPRECATED) + factory_id。"""
    q = db.query(CreatorProject)
    if status:
        q = q.filter(CreatorProject.project_status == status)
    if factory_id:
        q = q.filter(CreatorProject.factory_id == factory_id)
    result  = q.order_by(CreatorProject.published_at.desc().nullslast()).all()
    logger.info("project list:\n{}", "\n".join(repr(p) for p in result))
    return result
