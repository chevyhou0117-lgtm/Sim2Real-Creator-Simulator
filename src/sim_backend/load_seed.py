"""数据文件驱动的主数据 loader。

读 seed_data/*.csv → 按业务编码 upsert 进**全局 md**（plan_id IS NULL）。
幂等、可重跑、可增量（真实 P9 数据到位后替换/追加 CSV 再跑即可）。
建方案时这些全局 md 由快照机制克隆为方案专属副本（Factory 永久全局除外）。

用法（venv）：
  python load_seed.py                # upsert（不破坏现有，增量）
  python load_seed.py --reset        # drop schema + alembic upgrade + 全量灌
  python load_seed.py --with-demo    # 额外建 1 个 DRAFT 方案 + WO-linked 单 packing task
  python load_seed.py --reset --with-demo
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import pathlib
import sys

from app.database import SessionLocal
from app.models.biz import ProductionTask, WorkOrder
from app.models.md import (
    BOP,
    BOPProcess,
    CreatorProject,
    Equipment,
    EquipmentProcessParameters,
    Factory,
    Material,
    Operation,
    Product,
    ProductionLine,
    Shift,
    Stage,
    StageTransition,
    Warehouse,
    WorkCalendar,
)
from app.models.sim import SimulationPlan

DATA = pathlib.Path(__file__).parent / "seed_data"


def _rows(name: str) -> list[dict]:
    with open(DATA / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _b(v: str) -> bool:
    return str(v).strip().lower() in ("1", "true", "yes")


def _num(v: str):
    if v is None or str(v).strip() == "":
        return None
    return float(v)


def _upsert(db, model, key_filter: dict, mutable: dict):
    """按 key_filter（含 plan_id IS NULL）找全局行：有则更新 mutable，无则新建。返回行。"""
    q = db.query(model).filter(model.plan_id.is_(None))
    for k, v in key_filter.items():
        q = q.filter(getattr(model, k) == v)
    row = q.first()
    if row is None:
        row = model(plan_id=None, **key_filter, **mutable)
        db.add(row)
    else:
        for k, v in mutable.items():
            setattr(row, k, v)
    db.flush()  # SessionLocal autoflush=False：后续按 id 解析 FK 需要它落地
    return row


def load_master_data(db) -> dict:
    # ── Factory（永久全局单例）──
    f = _rows("factory.csv")[0]
    fac = _upsert(db, Factory, {"factory_code": f["factory_code"]}, {
        "factory_name": f["factory_name"], "location": f["location"],
        "timezone": f["timezone"], "status": f["status"],
    })

    # ── CreatorProject（全局；plan 关联它取 creator_url 开 USD）──
    # 文件可选：没有 creator_project.csv 就跳过（不报错）。
    try:
        cp_rows = _rows("creator_project.csv")
    except FileNotFoundError:
        cp_rows = []
    for c in cp_rows:
        # CreatorProject 无 plan_id 列，不能用通用 _upsert（它 filter plan_id IS NULL）。
        cp = (
            db.query(CreatorProject)
            .filter(CreatorProject.factory_id == fac.factory_id,
                    CreatorProject.project_name == c["project_name"])
            .first()
        )
        vals = {
            "project_version": c.get("project_version") or None,
            "project_status": c.get("project_status") or "PUBLISHED",
            "creator_url": c["creator_url"],
            "description": c.get("description") or None,
        }
        if cp is None:
            cp = CreatorProject(factory_id=fac.factory_id,
                                project_name=c["project_name"], **vals)
            db.add(cp)
        else:
            for k, v in vals.items():
                setattr(cp, k, v)
        db.flush()

    # ── Product ──
    prod_by_code = {}
    for p in _rows("product.csv"):
        prod_by_code[p["product_code"]] = _upsert(
            db, Product, {"product_code": p["product_code"]}, {
                "product_name": p["product_name"],
                "product_category": p["product_category"],
                "unit": p["unit"], "status": p["status"],
            })

    # ── 全局 WorkOrder（plan_id=NULL，建方案随快照克隆）──
    for w in _rows("work_order.csv"):
        _upsert(db, WorkOrder, {"wo_no": w["wo_no"]}, {
            "product_code": w["product_code"],
            "product_name": w.get("product_name") or None,
            "plan_qty": int(float(w["plan_qty"])),
            "data_source": "SEED",
        })

    # ── Stage（按 factory + stage_code）──
    stage_by_code = {}
    for s in _rows("stage.csv"):
        stage_by_code[s["stage_code"]] = _upsert(
            db, Stage,
            {"factory_id": fac.factory_id, "stage_code": s["stage_code"]}, {
                "stage_name": s["stage_name"], "sequence": int(s["sequence"]),
                "stage_type": s["stage_type"], "status": s["status"],
            })

    # ── StageTransition（相邻 sequence 自动建 S2S 接续）──
    # 按 stage.sequence 升序串连相邻对，写 S2S + 30min 接续时间（单件流，30min
    # = 1800s 缓冲，模拟跨制程运输 + WIP 暂存）。原默认 fallback 是 ('E2S', 0)。
    stages_sorted = sorted(stage_by_code.values(), key=lambda s: s.sequence)
    for src, dst in zip(stages_sorted, stages_sorted[1:]):
        _upsert(
            db, StageTransition,
            {"from_stage_id": src.stage_id, "to_stage_id": dst.stage_id},
            {"connection_type": "S2S", "connection_time": 1800},
        )

    # ── ProductionLine（按 line_code）──
    line_by_code = {}
    for ln in _rows("production_line.csv"):
        st = stage_by_code[ln["stage_code"]]
        line_by_code[ln["line_code"]] = _upsert(
            db, ProductionLine, {"line_code": ln["line_code"]}, {
                "stage_id": st.stage_id, "line_name": ln["line_name"],
                "status": ln["status"], "sort_order": int(ln["sort_order"]),
            })

    # ── Operation（按 stage + operation_code）──
    op_by_code = {}
    for o in _rows("operation.csv"):
        st = stage_by_code[o["stage_code"]]
        op_by_code[o["operation_code"]] = _upsert(
            db, Operation,
            {"stage_id": st.stage_id, "operation_code": o["operation_code"]}, {
                "operation_name": o["operation_name"],
                # CSV 后续追加 operation_name_cn 列后即可生效；当前缺列/空值留 NULL
                "operation_name_cn": (o.get("operation_name_cn") or None),
                "sequence": int(o["sequence"]),
                "operation_type": o["operation_type"],
                "is_key_operation": _b(o["is_key_operation"]),
                "status": o["status"],
            })

    # ── Equipment（按 equipment_code）+ ProcessParameters ──
    eq_by_code = {}
    for e in _rows("equipment.csv"):
        ln = line_by_code[e["line_code"]]
        op = op_by_code[e["operation_code"]]
        eq_by_code[e["equipment_code"]] = _upsert(
            db, Equipment, {"equipment_code": e["equipment_code"]}, {
                "operation_id": op.operation_id, "line_id": ln.line_id,
                "equipment_name": e["equipment_name"],
                "equipment_type": e["equipment_type"],
                "creator_binding_id": e["creator_binding_id"],
                "sort_order": int(e["sort_order"]), "status": e["status"],
            })
    for ep in _rows("equipment_process_params.csv"):
        eq = eq_by_code[ep["equipment_code"]]
        _upsert(db, EquipmentProcessParameters,
                {"equipment_id": eq.equipment_id}, {
                    "standard_ct": _num(ep["standard_ct"]),
                    "standard_yield_rate": _num(ep["standard_yield_rate"]),
                    "standard_work_efficiency": _num(ep["standard_work_efficiency"]),
                    "standard_worker_count": int(float(ep["standard_worker_count"])),
                })

    # ── BOP + BOPProcess ──
    bop_by_key = {}
    for b in _rows("bop.csv"):
        pr = prod_by_code[b["product_code"]]
        ln = line_by_code[b["line_code"]]
        bop = _upsert(
            db, BOP,
            {"product_id": pr.product_id, "line_id": ln.line_id,
             "bop_version": b["bop_version"]},
            {"is_active": _b(b["is_active"]), "created_by": b["created_by"]})
        bop_by_key[(b["bop_version"], b["line_code"])] = bop
    for bp in _rows("bop_process.csv"):
        bop = bop_by_key[(bp["bop_version"], bp["line_code"])]
        op = op_by_code[bp["operation_code"]]
        _upsert(db, BOPProcess,
                {"bop_id": bop.bop_id, "sequence": int(bp["sequence"])}, {
                    "operation_id": op.operation_id,
                    "standard_ct": _num(bp["standard_ct"]),
                    "panel_qty": int(float(bp["panel_qty"])) if bp["panel_qty"] else None,
                    "ct_per_panel": _num(bp["ct_per_panel"]),
                    "yield_rate": _num(bp["yield_rate"]),
                    "standard_worker_count": int(float(bp["standard_worker_count"])),
                })

    # 线边仓（线边仓定义=虚拟线边仓 + 半成品物料）不再手工 seed，改由 load BoP 后
    # services.wip_topology.regenerate_wip_topology 按 BoP 自动生成（见 main()）。

    # ── MATERIAL_SUPPLY 最小演示：1 原料仓 + 几个原料 + 给几道 PTH 工序填 material_usage ──
    # 初始库存/到货由用户在方案内导入 inventory / material-supply。material_usage 里可含上游半成品
    # （仅作配方记录；引擎只对【原料】扣库存，半成品走线边仓）。
    _upsert(db, Warehouse, {"warehouse_code": "RAW-WH"}, {
        "factory_id": fac.factory_id, "warehouse_name": "原料仓",
        "warehouse_type": "RAW_MATERIAL", "status": "ACTIVE",
    })
    for mc, mn, mt in [
        ("MAT-PCB", "PCB 裸板", "RAW_MATERIAL"),
        ("MAT-SCREW", "螺丝", "RAW_MATERIAL"),
        ("MAT-GLUE", "点胶胶水", "CONSUMABLE"),
    ]:
        _upsert(db, Material, {"material_code": mc}, {
            "material_name": mn, "material_type": mt, "unit": "PCS", "status": "ACTIVE",
        })
    pth_bop = bop_by_key.get(("v1.0", "PTH01"))
    if pth_bop:
        for op_code, usage in {
            "PTH_OP02": {"MAT-PCB": 1},
            "PTH_OP03": {"MAT-GLUE": 1, "SF-PG548-PTH_OP02": 1},
            "PTH_OP09": {"MAT-SCREW": 12, "SF-PG548-PTH_OP08": 1},
        }.items():
            op = op_by_code.get(op_code)
            if not op:
                continue
            bp = (db.query(BOPProcess)
                  .filter(BOPProcess.bop_id == pth_bop.bop_id,
                          BOPProcess.operation_id == op.operation_id,
                          BOPProcess.plan_id.is_(None))
                  .first())
            if bp:
                bp.material_usage = usage
        db.flush()

    # ── WorkCalendar + Shift ──
    cal_by_date = {}
    for crow in _rows("work_calendar.csv"):
        d = dt.date.fromisoformat(crow["calendar_date"])
        cal_by_date[crow["calendar_date"]] = _upsert(
            db, WorkCalendar,
            {"factory_id": fac.factory_id, "calendar_date": d}, {
                "is_working_day": _b(crow["is_working_day"]),
                "day_type": crow["day_type"],
                "total_work_hours": _num(crow["total_work_hours"]),
            })
    for srow in _rows("shift.csv"):
        cal = cal_by_date[srow["calendar_date"]]
        _upsert(db, Shift,
                {"calendar_id": cal.calendar_id, "shift_name": srow["shift_name"]}, {
                    "start_time": dt.time.fromisoformat(srow["start_time"]),
                    "end_time": dt.time.fromisoformat(srow["end_time"]),
                    "work_hours": _num(srow["work_hours"]),
                    "break_minutes": int(float(srow["break_minutes"])),
                    "shift_order": int(srow["shift_order"]),
                })

    return {"factory": fac, "lines": line_by_code}


def make_demo_plan(db, factory: Factory, line_code: str) -> str:
    """建 1 个 DRAFT 方案 → 快照克隆 → 1 条 WO-linked packing task。返回 plan_id。"""
    from app.services.snapshot import clone_master_data_for_plan, resolve_scoped_md_id

    plan = SimulationPlan(
        plan_name="Single Packing Line — OV Demo",
        plan_description="单条 Packing 线，prim=PK 线，用于 OV 动画驱动测试",
        factory_id=factory.factory_id,
        status="DRAFT",
        enabled_simulators=["PRODUCTION", "LINE_BALANCE"],
        simulation_duration_hours=11.0,
        created_by="load_seed",
    )
    db.add(plan)
    db.flush()
    clone_master_data_for_plan(db, plan.plan_id)
    db.flush()

    g_line = (
        db.query(ProductionLine)
        .filter(ProductionLine.plan_id.is_(None),
                ProductionLine.line_code == line_code)
        .first()
    )
    g_stage = db.query(Stage).filter(Stage.stage_id == g_line.stage_id).first()
    sc_line_id = resolve_scoped_md_id(db, plan.plan_id, ProductionLine, g_line.line_id)
    sc_stage_id = resolve_scoped_md_id(db, plan.plan_id, Stage, g_stage.stage_id)
    sc_wo = (
        db.query(WorkOrder)
        .filter(WorkOrder.plan_id == plan.plan_id, WorkOrder.wo_no == "WO-001")
        .first()
    )
    db.add(ProductionTask(
        plan_id=plan.plan_id, wo_id=sc_wo.wo_id if sc_wo else None,
        stage_id=sc_stage_id, line_id=sc_line_id,
        product_code="PG548", plan_quantity=500,
        production_sequence=1, data_source="MANUAL_IMPORT",
    ))
    db.commit()
    return plan.plan_id


def reset_schema():
    from sqlalchemy import text

    from alembic import command
    from alembic.config import Config

    db = SessionLocal()
    db.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    db.commit()
    db.close()
    command.upgrade(Config("alembic.ini"), "head")


# 资产库数据表（FK 依赖顺序：被引用表在前）。CSV 由 export_asset_library.py 生成。
ASSET_LIBRARY_TABLES = [
    "asset_type_dict",
    "instance_asset_type_dict",
    "asset_categories",
    "line_model_details",
    "equipment_model_details",
    "line_model_equipment_rel",
]


def load_asset_library(db) -> None:
    """灌入资产库数据（seed_data/asset_library/*.csv）到 Creator 表。

    表由 creator_tables.sql 建好（本函数须在 run_creator_table_ddl 之后调用）。
    幂等：某表非空则跳过该表（避免 PK 冲突）；全量刷新请用 `--reset`。
    用 COPY 批量灌；导入前临时 `DISABLE TRIGGER ALL` 绕过 FK 即时校验
    （数据来自一致的导出，无需逐行 FK 检查；postgres 超级用户可执行）。
    """
    al_dir = DATA / "asset_library"
    if not al_dir.exists():
        print(f"[asset_library] 跳过：未找到 {al_dir}（先跑 export_asset_library.py）")
        return
    raw = db.connection().connection
    cur = raw.cursor()
    try:
        for table in ASSET_LIBRARY_TABLES:
            csv_path = al_dir / f"{table}.csv"
            if not csv_path.exists():
                print(f"[asset_library] 跳过 {table}：无 CSV")
                continue
            cur.execute(f"SELECT count(*) FROM {table}")
            existing = cur.fetchone()[0]
            if existing > 0:
                print(f"[asset_library] 跳过 {table}：已有 {existing} 行（非空；--reset 可全量刷新）")
                continue
            with open(csv_path, encoding="utf-8", newline="") as f:
                header = f.readline().rstrip("\r\n")
                cols = ", ".join('"' + c.strip() + '"' for c in header.split(","))
                f.seek(0)
                cur.execute(f"ALTER TABLE {table} DISABLE TRIGGER ALL")
                cur.copy_expert(
                    f"COPY {table} ({cols}) FROM STDIN WITH (FORMAT csv, HEADER true)", f)
                cur.execute(f"ALTER TABLE {table} ENABLE TRIGGER ALL")
            cur.execute(f"SELECT count(*) FROM {table}")
            print(f"[asset_library] 灌入 {table}: {cur.fetchone()[0]} 行")
        raw.commit()
    finally:
        cur.close()


def run_creator_table_ddl(db) -> None:
    """执行 seed_data/creator_tables.sql，建 Creator(aiFactory) 专有表。

    本地化迁移 Phase 2：aiFactory 自有表（factory_*/dict_*/asset 库/base_equipment_sop 等）
    的 DDL 由 sim_backend 统一拥有。文件内全是 CREATE TABLE IF NOT EXISTS，幂等。
    与 md_* 的引用均为逻辑外键（无 REFERENCES），故不依赖 md_* 是否已建。
    """
    sql_path = DATA / "creator_tables.sql"
    if not sql_path.exists():
        print(f"[creator_tables] 跳过：未找到 {sql_path}")
        return
    sql = sql_path.read_text(encoding="utf-8")
    # 用底层 psycopg2 连接整体执行多语句脚本
    raw = db.connection().connection
    cur = raw.cursor()
    try:
        cur.execute(sql)
        raw.commit()
        print("[creator_tables] Creator 专有表已建/校验 (creator_tables.sql)")
    finally:
        cur.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true",
                    help="drop schema + alembic upgrade 后全量灌")
    ap.add_argument("--with-demo", action="store_true",
                    help="额外建 1 个 DRAFT 方案 + 单 packing task")
    args = ap.parse_args()

    if args.reset:
        print("== reset: drop schema + alembic upgrade head ==")
        reset_schema()

    db = SessionLocal()
    try:
        run_creator_table_ddl(db)   # 先建 Creator 专有表（幂等）
        load_asset_library(db)      # 灌资产库数据（分类树/线体·设备模型/挂载关系）
        ctx = load_master_data(db)
        db.commit()
        print("master data loaded (全局 md, plan_id=NULL)")
        # L1：按 BoP 自动生成半成品物料 + 虚拟线边仓（默认无限容量）
        from app.services.wip_topology import regenerate_wip_topology
        wt = regenerate_wip_topology(db)
        db.commit()
        print(f"wip topology generated: {wt}")
        if args.with_demo:
            pid = make_demo_plan(db, ctx["factory"], "Packing01")
            print(f"demo plan created: {pid}")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print("DONE")


if __name__ == "__main__":
    sys.exit(main())
