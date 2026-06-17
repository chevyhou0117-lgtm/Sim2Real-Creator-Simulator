"""PRD §2.1.x 基础数据快照机制：READY→RUNNING 时把方案关联的所有 md_* 行复制一份。

复制策略（简化版，按整厂复制；对 FOXCONN-NME 这种 ~150 行的工厂足够）：
- 拉 plan_id IS NULL 的所有相关行
- 为每行生成新 UUID 作 PK，plan_id=X
- 维护 old_id → new_id 的 mapping
- 复制时按 FK 依赖顺序，把外键列从旧 ID 改写为新 ID
- 全部在单事务内完成（PRD R411）

跨方案修改不冲突：每个方案有自己的快照 + ParameterOverride，互相独立。
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.md import (
    BOP,
    BOPProcess,
    BOPProcessNGType,
    BOPProcessParam,
    Equipment,
    EquipmentBOMPart,
    EquipmentFailureParam,
    EquipmentOperationRecords,
    EquipmentProcessParameters,
    EquipmentSOP,
    EquipmentTechnicalSpecification,
    Factory,
    Material,
    NGType,
    Operation,
    OperationTransition,
    Product,
    ProductionLine,
    Shift,
    StaffingConfig,
    Stage,
    StageTransition,
    Warehouse,
    WIPBuffer,
    WorkCalendar,
    WorkerType,
)
from app.models.biz import WorkOrder
from app.models.sim import SimulationPlan

# (Model, pk_attr_name, [(fk_attr_name, target_Model)]) —— 顺序就是复制顺序
# FK 不在 mapping 里的（如外部表）维持原值。
_CLONE_PLAN = [
    # WorkOrder：当主数据看，无 md FK，独立克隆（plan_id IS NULL → 方案副本）
    (WorkOrder, "wo_id", []),
    # 独立表（无 md_* FK 依赖）
    # 注：Factory 是单例、不可变的主数据根（全软件只服务 P9 一个工厂），
    #     永久全局（plan_id IS NULL），不参与 per-plan 克隆。子表的 factory_id
    #     直接指向那唯一的全局 Factory。
    (Product,          "product_id",          []),
    (Material,         "material_id",         []),
    (NGType,           "ng_code",             []),
    # 依赖 Factory
    (Stage,            "stage_id",            [("factory_id", Factory)]),
    (Warehouse,        "warehouse_id",        [("factory_id", Factory)]),
    (WorkCalendar,     "calendar_id",         [("factory_id", Factory)]),
    (WorkerType,       "worker_type_id",      [("factory_id", Factory)]),
    # 依赖 Stage / Calendar
    (ProductionLine,   "line_id",             [("stage_id", Stage)]),
    (Operation,        "operation_id",        [("stage_id", Stage)]),
    (Shift,            "shift_id",            [("calendar_id", WorkCalendar)]),
    # 依赖 Operation / Line
    (Equipment,        "equipment_id",        [("operation_id", Operation), ("line_id", ProductionLine)]),
    (WIPBuffer,        "wip_id",              [("line_id", ProductionLine), ("pre_operation_id", Operation), ("post_operation_id", Operation)]),
    # Equipment 子表
    (EquipmentTechnicalSpecification, "id", [("equipment_id", Equipment)]),
    (EquipmentProcessParameters,      "id", [("equipment_id", Equipment)]),
    (EquipmentFailureParam,           "param_id", [("equipment_id", Equipment)]),
    (EquipmentBOMPart,                "id", [("equipment_id", Equipment)]),  # parent_part_id 见后续二次重写
    (EquipmentSOP,                    "id", [("equipment_id", Equipment)]),
    (EquipmentOperationRecords,       "id", [("equipment_id", Equipment)]),
    # BOP 链
    (BOP,                "bop_id",         [("product_id", Product), ("line_id", ProductionLine)]),
    (BOPProcess,         "bop_process_id", [("bop_id", BOP), ("operation_id", Operation)]),
    (BOPProcessParam,    "param_id",       [("bop_process_id", BOPProcess)]),
    (BOPProcessNGType,   "id",             [("bop_process_id", BOPProcess), ("ng_code", NGType)]),
    # Transition
    (OperationTransition, "transition_id",  [("bop_id", BOP), ("from_operation_id", Operation), ("to_operation_id", Operation)]),
    (StageTransition,     "id",  [("from_stage_id", Stage), ("to_stage_id", Stage)]),
    # Staffing
    (StaffingConfig,      "staffing_id",      [("operation_id", Operation), ("worker_type_id", WorkerType)]),
]


def _safe_pk(model: type, pk_attr: str) -> str:
    """容错：有些模型 PK 列名不一定跟 pk_attr 一致。直接取 inspect。"""
    try:
        getattr(model, pk_attr)
        return pk_attr
    except AttributeError:
        # 尝试从 mapper 找
        from sqlalchemy import inspect as sql_inspect
        cols = sql_inspect(model).primary_key
        if not cols:
            raise RuntimeError(f"{model.__name__} 无 PK")
        return cols[0].name


def clone_master_data_for_plan(db: Session, plan_id: str, force: bool = False) -> dict[str, int]:
    """整厂级快照复制：把所有 plan_id IS NULL 的 md_* 行复制一份打上 plan_id=X。

    返回 {table_name: rows_copied}。单事务（caller 负责 commit）。

    行为：
      - 若 plan.base_data_version 已记录快照时刻 → 视为已快照，直接 return（保护用户
        在 DRAFT 期间手动新增/修改的 plan-scoped 行不被覆盖）。force=True 时强制重做。
      - 复制范围：仅 plan_id IS NULL 的主数据行（不动用户已建的 plan-scoped 行）。
      - 不清旧快照行（force 模式才清，用于异常恢复）。
    """
    plan = db.query(SimulationPlan).filter(SimulationPlan.plan_id == plan_id).first()
    if plan is None:
        raise ValueError(f"plan {plan_id} not found")

    if not force and plan.base_data_version and plan.base_data_version.startswith("snapshot:"):
        return {}

    if force:
        # 异常重快照场景：清旧 plan-scoped 行（用户数据也会丢，仅用于回滚/重置）
        for model, _, _ in reversed(_CLONE_PLAN):
            db.query(model).filter(model.plan_id == plan_id).delete(synchronize_session=False)

    # Factory 永久全局单例，不克隆。plan.factory_id 恒指向那唯一的 canonical Factory。
    canon_factory_id = plan.factory_id
    if db.query(Factory).filter(Factory.factory_id == canon_factory_id).first() is None:
        raise ValueError(f"plan {plan_id} 的 factory_id 无对应 Factory")

    # 工厂作用域模型集：任一 FK（直接或拓扑传递）指向 Factory 的模型。
    # Factory 本身不在 _CLONE_PLAN（全局单例）；无工厂归属的全局表
    # （Product/Material/NGType/WorkOrder）不在此集 → 整表克隆。
    factory_scoped: set[type] = set()
    for _m, _pk, _fkr in _CLONE_PLAN:
        if any(tm is Factory or tm in factory_scoped for _fa, tm in _fkr):
            factory_scoped.add(_m)

    # 全表 mapping：{model_class: {old_pk: new_pk}}
    id_map: dict[type, dict[str, str]] = {}
    counts: dict[str, int] = {}

    for model, pk_attr, fk_remaps in _CLONE_PLAN:
        pk_name = _safe_pk(model, pk_attr)
        all_rows = db.query(model).filter(model.plan_id.is_(None)).all()
        # 按工厂限范围：只克隆 plan 自己工厂的 md 子树，避免跨工厂污染
        # （多工厂下整库克隆会把别厂 md 混进 plan，且 stage_code 等跨厂重名导致引用解析歧义）。
        if model in factory_scoped:
            # 工厂链 FK：指向 Factory 的判 == canon_factory_id（Factory 不克隆，
            # 不在 id_map）；指向其它工厂作用域模型的判其父已被克隆（在 id_map）。
            scoped_fks = [
                (fa, tm) for fa, tm in fk_remaps
                if tm is Factory or tm in factory_scoped
            ]
            rows = []
            for r in all_rows:
                checks = [
                    (getattr(r, fa), tm) for fa, tm in scoped_fks
                    if getattr(r, fa) is not None
                ]
                if not checks:
                    continue  # 工厂链 FK 全空 → 不属任何工厂子树，跳过
                if all(
                    (v == canon_factory_id) if tm is Factory
                    else (v in id_map.get(tm, {}))
                    for v, tm in checks
                ):
                    rows.append(r)
        else:
            rows = all_rows  # 全局表（无工厂归属）：整表克隆，保持原行为
        m: dict[str, str] = {}
        for old in rows:
            old_pk = getattr(old, pk_name)
            new_pk = str(uuid.uuid4())
            m[old_pk] = new_pk
            # 拷贝所有列值，重写 PK / plan_id / FK
            data: dict[str, Any] = {}
            for col in model.__table__.columns:
                cn = col.name
                # created_at / updated_at 留给 server_default
                if cn in ("created_at", "updated_at"):
                    continue
                data[cn] = getattr(old, cn)
            data[pk_name] = new_pk
            data["plan_id"] = plan_id
            # 重写 md_ 引用
            for fk_attr, target_model in fk_remaps:
                fk_val = data.get(fk_attr)
                if fk_val is None:
                    continue
                mapped = id_map.get(target_model, {}).get(fk_val)
                if mapped is not None:
                    data[fk_attr] = mapped
            db.add(model(**data))
        id_map[model] = m
        counts[model.__tablename__] = len(rows)

    # Session autoflush=False：上面都是 pending add，未落库。后面 bom 自引用修复、
    # factory 重指、以及调用方紧接着的 rewrite_plan_biz_refs 都要按 plan_id/编码
    # 查这些 scoped 行——不 flush 就全查不到，导致 task 引用没被重指 → 引擎
    # 隔离视图找不到线 → NO_BOP_SKIP。这里强制 flush 一次。
    db.flush()

    # 3) 二次修复：EquipmentBOMPart.parent_part_id 是 self-reference，第一次复制时引用还指向旧 ID
    bom_map = id_map.get(EquipmentBOMPart, {})
    if bom_map:
        new_parts = (
            db.query(EquipmentBOMPart)
            .filter(EquipmentBOMPart.plan_id == plan_id)
            .all()
        )
        for p in new_parts:
            if p.parent_part_id and p.parent_part_id in bom_map:
                p.parent_part_id = bom_map[p.parent_part_id]

    # （Factory 永久全局单例，不克隆 → plan.factory_id 无需重指，恒指向 canonical；
    #   scoped 子表的 factory_id 也保持指向那唯一全局 Factory，查询天然命中。）

    # 4) 写 base_data_version 记录快照时刻（PRD R411）
    from datetime import datetime
    plan.base_data_version = f"snapshot:{datetime.utcnow().isoformat(timespec='seconds')}"

    # autoflush=False：plan.factory_id / base_data_version 还是 pending。调用方紧接着
    # 调 rewrite_plan_biz_refs，其 _is_snapshotted 会发新 SQL 查 base_data_version——
    # 不 flush 就读到旧值(None) → 误判未快照 → biz 引用不重指 → 引擎 NO_BOP_SKIP。
    # 末尾再 flush 一次，确保整个快照状态对后续同事务查询可见。
    db.flush()

    return counts


# ===========================================================================
# 引用解析 / biz 引用重写
# ---------------------------------------------------------------------------
# biz 层按 id 硬引用 md 的全部 4 处（其余走 product_code 等字符串，免疫 id 变更）。
# 每个 md 模型用「业务编码」作稳定锚点：incoming_id（全局或上一次 scoped）→ 取其编码
# → 查本方案 scoped 同编码行 → 返回其 id。未快照方案原样返回（seed/老方案兜底）。
# ===========================================================================
from app.models.biz import (  # noqa: E402
    InventorySnapshot,
    MaterialSupply,
    ProductionTask,
    WIPBufferSnapshot,
)

# 模型 → 业务编码列名（解析锚点；WO 当主数据看，锚点 wo_no）
_MD_CODE_ATTR: dict[type, str] = {
    Stage: "stage_code",
    ProductionLine: "line_code",
    Warehouse: "warehouse_code",
    WIPBuffer: "wip_code",
    WorkOrder: "wo_no",
}

# biz 模型 → [(fk 列名, 目标模型)]；resync 换 id 后按编码重指
_BIZ_MD_REFS: list[tuple[type, list[tuple[str, type]]]] = [
    (ProductionTask, [("stage_id", Stage), ("line_id", ProductionLine), ("wo_id", WorkOrder)]),
    (MaterialSupply, [("target_warehouse_id", Warehouse)]),
    (InventorySnapshot, [("warehouse_id", Warehouse)]),
    (WIPBufferSnapshot, [("wip_id", WIPBuffer)]),
]


def _pk_name(model: type) -> str:
    from sqlalchemy import inspect as sql_inspect

    return sql_inspect(model).primary_key[0].name


def _is_snapshotted(db: Session, plan_id: str) -> bool:
    bdv = (
        db.query(SimulationPlan.base_data_version)
        .filter(SimulationPlan.plan_id == plan_id)
        .scalar()
    )
    return bool(bdv and bdv.startswith("snapshot:"))


def resolve_scoped_md_id(
    db: Session, plan_id: str, model: type, incoming_id: str | None
) -> str | None:
    """把传入的 md id（全局或旧 scoped）解析为本方案 scoped 同编码行的 id。

    未快照方案 / 无编码锚点 / 解析不到 → 原样返回 incoming_id（不破坏存量行为）。
    """
    if incoming_id is None or not _is_snapshotted(db, plan_id):
        return incoming_id
    code_attr = _MD_CODE_ATTR.get(model)
    if code_attr is None:
        return incoming_id
    pk = _pk_name(model)
    src = db.query(model).filter(getattr(model, pk) == incoming_id).first()
    if src is None:
        return incoming_id
    code_val = getattr(src, code_attr)
    scoped = (
        db.query(model)
        .filter(model.plan_id == plan_id, getattr(model, code_attr) == code_val)
        .first()
    )
    return getattr(scoped, pk) if scoped else incoming_id


def find_orphan_biz_refs(db: Session, plan_id: str) -> list[str]:
    """resync 前置检查：列出引用了「全局主数据中已不存在该编码」的 biz 行。

    resync 是纯按全局(plan_id IS NULL)重建 scoped；若 biz 当前引用的 md 行编码
    在全局集合里没有（典型：用户在方案内手加、全局无孪生的产线/设备），
    同步后该 scoped 行消失 → biz 引用悬空。返回人类可读描述；空 = 安全。
    """
    if not _is_snapshotted(db, plan_id):
        return []
    problems: list[str] = []
    for biz_model, refs in _BIZ_MD_REFS:
        biz_pk = _pk_name(biz_model)
        for row in db.query(biz_model).filter(biz_model.plan_id == plan_id).all():
            for fk_attr, md_model in refs:
                cur = getattr(row, fk_attr)
                if cur is None:
                    continue
                code_attr = _MD_CODE_ATTR[md_model]
                pk = _pk_name(md_model)
                src = db.query(md_model).filter(getattr(md_model, pk) == cur).first()
                if src is None:
                    continue
                code_val = getattr(src, code_attr)
                in_global = (
                    db.query(md_model)
                    .filter(
                        md_model.plan_id.is_(None),
                        getattr(md_model, code_attr) == code_val,
                    )
                    .first()
                )
                if in_global is None:
                    problems.append(
                        f"{biz_model.__tablename__}.{biz_pk}="
                        f"{getattr(row, biz_pk)} 引用了全局已不存在的"
                        f" {md_model.__tablename__} 编码 {code_val!r}"
                    )
    return problems


def _resolve_md_id(
    db: Session, model: type, incoming_id: str, *, plan_id: str | None
) -> str | None:
    """按编码把 incoming_id 解析到目标作用域的同编码行（plan_id=None → 全局行）。"""
    code_attr = _MD_CODE_ATTR.get(model)
    if code_attr is None or incoming_id is None:
        return incoming_id
    pk = _pk_name(model)
    src = db.query(model).filter(getattr(model, pk) == incoming_id).first()
    if src is None:
        return incoming_id
    code_val = getattr(src, code_attr)
    q = db.query(model).filter(getattr(model, code_attr) == code_val)
    q = q.filter(model.plan_id.is_(None)) if plan_id is None else q.filter(
        model.plan_id == plan_id
    )
    hit = q.first()
    return getattr(hit, pk) if hit else incoming_id


def _repoint_biz_refs(db: Session, plan_id: str, *, to_plan: str | None) -> int:
    """把本方案 biz 行的 4 处 md 外键整体重指到 to_plan 作用域（None=全局）。"""
    changed = 0
    for biz_model, refs in _BIZ_MD_REFS:
        for row in db.query(biz_model).filter(biz_model.plan_id == plan_id).all():
            touched = False
            for fk_attr, md_model in refs:
                cur = getattr(row, fk_attr)
                new = _resolve_md_id(db, md_model, cur, plan_id=to_plan)
                if new != cur:
                    setattr(row, fk_attr, new)
                    touched = True
            if touched:
                changed += 1
    db.flush()
    return changed


def rewrite_plan_biz_refs(db: Session, plan_id: str) -> int:
    """把本方案 biz 行的 4 处 md 外键，按编码重指到当前 scoped md 行。返回改写行数。"""
    if not _is_snapshotted(db, plan_id):
        return 0
    return _repoint_biz_refs(db, plan_id, to_plan=plan_id)


def resync_master_data_for_plan(db: Session, plan_id: str) -> dict[str, int]:
    """用户「全局同步」：从当前主数据重灌本方案 md 快照，再把 biz 引用按编码重指。

    语义 = reclone(换新 id) + biz 引用按编码重指（task 经同步不断）。
    调用方须先 find_orphan_biz_refs 做前置校验。caller 负责 commit。

    顺序关键：reclone 会 DELETE 旧 scoped md，但 biz FK 仍指着它会被 PG 挡下。
    故先把 biz 引用临时摘到全局行（同编码、必存在——前置校验已保证），
    删旧 scoped → 建新 scoped → 再把 biz 重指到新 scoped。
    """
    _repoint_biz_refs(db, plan_id, to_plan=None)        # biz → 全局行（解除对旧 scoped 的 FK）
    counts = clone_master_data_for_plan(db, plan_id, force=True)  # 删旧 scoped + 建新 scoped
    db.flush()  # SessionLocal autoflush=False：强制把新 scoped 行落到事务，下一步才查得到
    rewritten = _repoint_biz_refs(db, plan_id, to_plan=plan_id)   # biz → 新 scoped
    counts["_biz_refs_rewritten"] = rewritten
    return counts
