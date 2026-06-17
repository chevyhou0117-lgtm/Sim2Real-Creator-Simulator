"""Seed script: insert Main Module + Packaging stages with multiple lines each.

Run: cd sim_backend && .venv/bin/python seed.py
"""

import uuid
from datetime import date, datetime, time
from decimal import Decimal

from app.database import SessionLocal
from app.models.biz import ProductionTask, WorkOrder
from app.models.md import (
    BOP,
    BOPProcess,
    CreatorProject,
    Equipment,
    EquipmentProcessParameters,
    Factory,
    Operation,
    Product,
    ProductionLine,
    Shift,
    Stage,
    StageTransition,
    WorkCalendar,
)
from app.models.sim import SimulationPlan

db = SessionLocal()


def uid() -> str:
    return str(uuid.uuid4())


# ============================================================================
# 1. Factory
# ============================================================================
factory_id = uid()
db.add(Factory(
    factory_id=factory_id,
    factory_code="FOXCONN-NME",
    factory_name="富士康烟台",
    location="山东烟台",
    timezone="Asia/Shanghai",
    status="ACTIVE",
))

# ============================================================================
# 1b. Creator Projects (Omniverse Kit 已发布的工厂 USD 项目，前端关联下拉用)
# ============================================================================
creator_project_id = uid()
db.add(CreatorProject(
    creator_project_id=creator_project_id,
    project_name="富士康烟台 — Main Module + Packaging",
    project_version="v1.2.8",
    project_status="PUBLISHED",
    factory_id=factory_id,
    description="主模组 + 包装 双制程，含 4 条产线（MM01/MM02/PK01/PK02）",
    creator_url="/home/remond/Downloads/sim_test.usd",
    published_at=datetime(2026, 4, 10, 8, 30),
))
db.add(CreatorProject(
    creator_project_id=uid(),
    project_name="富士康烟台 — Main Module only (旧版)",
    project_version="v1.0.3",
    project_status="DEPRECATED",
    factory_id=factory_id,
    description="仅含主模组制程的早期 USD scene，已弃用",
    creator_url="omniverse://localhost/Projects/FOXCONN-NME/legacy_mm.usd",
    published_at=datetime(2025, 11, 2, 14, 15),
))

# ============================================================================
# 2. Stages — Main Module & Packaging
# ============================================================================
main_module_stage_id = uid()
packaging_stage_id = uid()

db.add(Stage(
    stage_id=main_module_stage_id,
    factory_id=factory_id,
    stage_code="MAIN_MODULE",
    stage_name="Main Module Assembly",
    sequence=1,
    stage_type="ASSEMBLY",
    status="ACTIVE",
))
db.add(Stage(
    stage_id=packaging_stage_id,
    factory_id=factory_id,
    stage_code="PACKAGING",
    stage_name="Packaging",
    sequence=2,
    stage_type="PACKAGING",
    status="ACTIVE",
))

# ============================================================================
# 3. Production Lines — 2 per stage
# ============================================================================
mm_line_01_id = uid()
mm_line_02_id = uid()
pk_line_01_id = uid()
pk_line_02_id = uid()

db.add(ProductionLine(
    line_id=mm_line_01_id,
    stage_id=main_module_stage_id,
    line_code="L_HST_MM_01",
    line_name="Main Module Line 01",
    status="ACTIVE",
    sort_order=1,
))
db.add(ProductionLine(
    line_id=mm_line_02_id,
    stage_id=main_module_stage_id,
    line_code="L_HST_MM_02",
    line_name="Main Module Line 02",
    status="ACTIVE",
    sort_order=2,
))
db.add(ProductionLine(
    line_id=pk_line_01_id,
    stage_id=packaging_stage_id,
    line_code="L_HST_PK_01",
    line_name="Packaging Line 01",
    status="ACTIVE",
    sort_order=1,
))
db.add(ProductionLine(
    line_id=pk_line_02_id,
    stage_id=packaging_stage_id,
    line_code="L_HST_PK_02",
    line_name="Packaging Line 02",
    status="ACTIVE",
    sort_order=2,
))

# ============================================================================
# 4. Products — 双产品（用于多 WO + 多 BoP 场景）
# ============================================================================
product_id = uid()       # PG548
pg549_id = uid()
db.add(Product(
    product_id=product_id,
    product_code="PG548",
    product_name="NVD Bianca PG548 UT3.0B",
    product_category="GPU Module",
    unit="PCS",
    status="ACTIVE",
))
db.add(Product(
    product_id=pg549_id,
    product_code="PG549",
    product_name="NVD Bianca PG549 UT3.0C",
    product_category="GPU Module",
    unit="PCS",
    status="ACTIVE",
))

# ============================================================================
# 5. Main Module Stage — Operations & Equipment
# ============================================================================
# Each tuple: (operation_name, equipment_list, actual_ct, design_ct, workers, operation_type)
MODULE_DATA = [
    ("Carrier Tray Loading", [
        ("上下料治具回收机（上料）", "ROBOT", "t_id_CT_HOUM548ZPRL_01_ZPRL01"),
    ], 15.0, 31.0, 0, "OTHER"),
    ("TOP Stiffener Assembly", [
        ("顶部加强件组装机", "ROBOT", "t_id_CT_HOUM548TS1_TS01"),
        ("缓存机（顶部加强件）", "OTHER", "t_id_CT_HOUM548TPSL_R_BF01"),
    ], 11.7, 31.0, 0, "OTHER"),
    ("Thermal Adhesive Application S2", [
        ("导热胶涂布机 S2", "ROBOT", "t_id_CT_HOUM548DRJ2_DRJ01"),
    ], 15.8, 31.0, 0, "OTHER"),
    ("Thermal Adhesive Application S3", [
        ("导热胶涂布机 S3", "ROBOT", "t_id_CT_HOUM548DRJ2_DRJ02"),
    ], 16.4, 31.0, 0, "OTHER"),
    ("Thermal Adhesive Application S4", [
        ("导热胶涂布机 S4", "ROBOT", "t_id_CT_HOUM548DRJ2_DRJ03"),
    ], 19.2, 31.0, 0, "OTHER"),
    ("Thermal Adhesive Application S5", [
        ("导热胶涂布机 S5", "ROBOT", "t_id_CT_HOUM548DRJ2_DRJ04"),
    ], 16.0, 31.0, 0, "OTHER"),
    ("Thermal Adhesive Application S6", [
        ("导热胶涂布机 S6", "ROBOT", "t_id_CT_HOUM548DRJ2_DRJ05"),
    ], 14.8, 31.0, 0, "OTHER"),
    ("Thermal Adhesive Application S7", [
        ("导热胶涂布机 S7", "ROBOT", "t_id_CT_HOUM548DRJ2_DRJ06"),
    ], 12.0, 31.0, 0, "OTHER"),
    ("PCBA Board Assembly", [
        ("PCBA 组装机", "ROBOT", "t_id_CT_HOUM548PCB_PCB01"),
        ("缓存机（PCBA）", "OTHER", "t_id_CT_HOUM548TPSL_L_BF02"),
    ], 24.4, 31.0, 0, "OTHER"),
    ("PCBA Pressing", [
        ("PCBA 压合机", "ROBOT", "t_id_CT_HOUM548YH11_YH01"),
    ], 15.0, 31.0, 0, "OTHER"),
    ("FA Maintenance Inspection 1", [
        ("人工 FA 检验工位 1", "WORKSTATION", "t_id_CT_HOUM548HM_HM01"),
    ], 9.97, 31.0, 1, "MANUAL"),
    ("Thermal Adhesive Application S11", [
        ("导热胶涂布机 S11", "ROBOT", "t_id_CT_HOUM548DRJ2_DRJ09"),
    ], 19.3, 31.0, 0, "OTHER"),
    ("Thermal Adhesive Application S12", [
        ("导热胶涂布机 S12", "ROBOT", "t_id_CT_HOUM548DRJ2_DRJ10"),
    ], 19.2, 31.0, 0, "OTHER"),
    ("Thermal Adhesive Application S13", [
        ("导热胶涂布机 S13", "ROBOT", "t_id_CT_HOUM548DRJ2_DRJ11"),
    ], 18.1, 31.0, 0, "OTHER"),
    ("Thermal Adhesive Application S14", [
        ("导热胶涂布机 S14", "ROBOT", "t_id_CT_HOUM548DRJ2_DRJ12"),
    ], 15.0, 31.0, 0, "OTHER"),
    ("BOT Stiffener Assembly", [
        ("底部加强件组装机", "ROBOT", "t_id_CT_HOUM548TPSL_L_BF03"),
        ("缓存机（底部加强件）", "OTHER", "t_id_CT_HOUM548BS_BS01"),
    ], 28.5, 31.0, 0, "OTHER"),
    ("BOT Stiffener Pressing", [
        ("底部加强件压合机", "ROBOT", "t_id_CT_HOUM548YH11_YH02"),
    ], 15.0, 31.0, 0, "OTHER"),
    ("BOT Screw Pre-Lock S17", [
        ("螺丝预锁机 S17", "ROBOT", "t_id_CT_HOUM548CNTSC12_CNTSC01"),
    ], 26.0, 31.0, 0, "OTHER"),
    ("BOT Screw Pre-Lock S18", [
        ("螺丝预锁机 S18", "ROBOT", "t_id_CT_HOUM548CNTSC12_CNTSC02"),
    ], 28.4, 31.0, 0, "OTHER"),
    ("BOT Screw Lock S19", [
        ("螺丝锁附机 S19", "ROBOT", "t_id_CT_HOUM548CNTSC12_CNTSC03"),
    ], 19.9, 31.0, 0, "OTHER"),
    ("BOT Screw Lock S20", [
        ("螺丝锁附机 S20", "ROBOT", "t_id_CT_HOUM548BSSC20_BSSC01"),
    ], 24.0, 31.0, 0, "OTHER"),
    ("BOT Screw Lock S21", [
        ("螺丝锁附机 S21", "ROBOT", "t_id_CT_HOUM548BSSC20_BSSC02"),
    ], 22.3, 31.0, 0, "OTHER"),
    ("FA Maintenance Inspection 2", [
        ("人工 FA 检验工位 2", "WORKSTATION", "t_id_CT_HOUM548HM_HM02"),
    ], 9.97, 31.0, 1, "MANUAL"),
    ("Board Flip", [
        ("翻面机", "ROBOT", "t_id_CT_HOUM548FM_FM01"),
    ], 17.2, 31.0, 0, "OTHER"),
    ("PCBA Screw Locking", [
        ("PCBA 锁螺丝机", "ROBOT", "t_id_CT_HOUM548PCBSC24_PCBSC01"),
    ], 24.6, 31.0, 0, "OTHER"),
    ("Final Inspection", [
        ("人工终检工位", "WORKSTATION", "t_id_CT_HOUM548HM_HM03"),
    ], 9.97, 31.0, 1, "MANUAL"),
    ("Automatic Sorting", [
        ("自动分拣机", "ROBOT", "t_id_CT_HOUM548SFL_SFL01"),
        ("缓存机（分拣）", "OTHER", "t_id_CT_HOUM548TPSL_L_BF04"),
    ], 19.0, 31.0, 0, "OTHER"),
    ("Carrier Tray Unloading", [
        ("上下料治具回收机（下料）", "ROBOT", "t_id_CT_HOUM548ZPRL_02_ZPRL02"),
    ], 9.97, 31.0, 0, "OTHER"),
]

# ============================================================================
# 6. Packaging Stage — Operations & Equipment
# ============================================================================
PACK_DATA = [
    ("Inbound Loading", [
        ("上料料车", "ROBOT", "t_id_CT_HST_Pack_Trolley_TR01"),
        ("搬运机（上料）", "ROBOT", "t_id_CT_HOPBLSI_LD01"),
    ], 29.0, 19.0, 0, "OTHER"),
    ("Transfer to Line", [
        ("中转机 1", "OTHER", "t_id_CT_HOPBYZ_CV01"),
    ], 12.0, 10.0, 0, "OTHER"),
    ("Manual Packing A1", [
        ("人工包装工位 A1", "WORKSTATION", "t_id_CT_HOPBHM_A_HM01"),
    ], 7.0, 6.0, 1, "MANUAL"),
    ("AOI Carrier Conveyor", [
        ("AOI 治具横移机", "OTHER", "t_id_TR7700L_QH_SI_AOI01"),
    ], 7.0, 20.0, 0, "OTHER"),
    ("Manual Packing A2", [
        ("人工包装工位 A2", "WORKSTATION", "t_id_CT_HOPBHM_A_HM02"),
    ], 7.0, 6.0, 1, "MANUAL"),
    ("Cross Transfer", [
        ("中转机 2", "OTHER", "t_id_CT_HOPBCRO_CV02"),
    ], 12.0, 10.0, 0, "OTHER"),
    ("Manual Packing B1", [
        ("人工包装工位 B1", "WORKSTATION", "t_id_CT_HOPBHM_B_HM03"),
    ], 24.0, 6.0, 0, "MANUAL"),
    ("Manual Packing B2", [
        ("人工包装工位 B2", "WORKSTATION", "t_id_CT_HOPBHM_B_HM04"),
    ], 15.0, 10.0, 1, "MANUAL"),
    ("Auto AOI Inspection", [
        ("自动 AOI 检测机", "AOI", "t_id_CT_HOPBAOI_AOI02"),
    ], 45.5, 40.0, 0, "AOI"),
    ("Manual Packing C1", [
        ("人工包装工位 C1", "WORKSTATION", "t_id_CT_HOPBHM_C_HM05"),
    ], 7.0, 10.0, 1, "MANUAL"),
    ("Manual Packing C2", [
        ("人工包装工位 C2", "WORKSTATION", "t_id_CT_HOPBHM_C_HM06"),
    ], 7.0, 10.0, 1, "MANUAL"),
    ("Edge Folding and Sealing", [
        ("自动折边封箱机", "ROBOT", "t_id_CT_HOPBFWX1_X01"),
    ], 6.0, 6.0, 0, "OTHER"),
    ("Corner Turning", [
        ("翻角机", "OTHER", "t_id_CT_HOPBWST_W01"),
    ], 7.0, 6.0, 0, "OTHER"),
    ("Top Corner Sealing", [
        ("自动顶角封口机", "ROBOT", "t_id_CT_HOPBFWX2_X02"),
    ], 6.0, 3.3, 0, "OTHER"),
    ("Seal Label Application", [
        ("自动封口贴标机", "ROBOT", "t_id_CT_HOPBFKB_LB01"),
    ], 6.8, 5.0, 0, "OTHER"),
    ("Palletizing", [
        ("自动码垛机", "ROBOT", "t_id_CT_HOPBMD_MD01"),
    ], 45.0, 17.0, 0, "OTHER"),
    ("Outbound Transfer", [
        ("中转机 3", "OTHER", "t_id_CT_HOPBYZ_CV03"),
    ], 9.98, 5.0, 0, "OTHER"),
    ("Outbound Unloading", [
        ("搬运机（下料）", "ROBOT", "t_id_CT_HOPBLSJ_LD02"),
        ("下料料车", "ROBOT", "t_id_CT_HST_Pack_Trolley_TR02"),
    ], 22.5, 9.0, 0, "OTHER"),
]

PACK_PANEL_QTY = [1] * 13 + [2] * 5


# ============================================================================
# USD prim_path 前缀（每条产线在 Kit USD scene 中的根 prim 不同；后缀沿用 MODULE_DATA / PACK_DATA 里的 t_id_CT_*）
# ============================================================================
MM_LINE_01_PRIM_PREFIX = "/World/a_L_HST_Module/t_id_L_HST_Module_AA01/id_L_HST_Module_AA01/L_HST_Module/L_HST_Module/ASSET_PROD/asset_L_HST_Module_PROD/"
MM_LINE_02_PRIM_PREFIX = "/World/a_L_HST_Module_01/t_id_L_HST_Module_AA01/id_L_HST_Module_AA01/L_HST_Module/L_HST_Module/ASSET_PROD/asset_L_HST_Module_PROD/"
PK_LINE_01_PRIM_PREFIX = "/World/a_L_HST_PACK/t_id_L_HST_PACK_PACK01/id_L_HST_PACK_PACK01/L_HST_PACK/L_HST_PACK/ASSET_PROD/asset_L_HST_PACK_PROD/"
PK_LINE_02_PRIM_PREFIX = "/World/a_L_HST_PACK_01/t_id_L_HST_PACK_PACK01/id_L_HST_PACK_PACK01/L_HST_PACK/L_HST_PACK/ASSET_PROD/asset_L_HST_PACK_PROD/"


# ============================================================================
# Helpers
# ============================================================================
def insert_stage_operations(stage_id: str, code_prefix: str, data: list):
    """Insert Operation rows under a stage（**不再创建 Equipment，equipment 改为 per-line**）。

    Returns: [(op_id, actual_ct, workers, eq_list, design_ct), ...] preserving input order;
             eq_list & design_ct 留给 insert_equipment_for_line 使用。
    """
    results = []
    for seq, (op_name, eq_list, actual_ct, design_ct, workers, op_type) in enumerate(data, 1):
        op_id = uid()
        op_code = f"{code_prefix}_OP{seq:03d}"
        db.add(Operation(
            operation_id=op_id,
            stage_id=stage_id,
            operation_code=op_code,
            operation_name=op_name,
            sequence=seq,
            operation_type=op_type,
            is_key_operation=False,
            status="ACTIVE",
        ))
        results.append((op_id, actual_ct, workers, eq_list, design_ct))
    return results


def insert_equipment_for_line(
    line_id: str,
    line_short_code: str,
    operations: list,
    prim_path_prefix: str,
):
    """Create Equipment rows for a specific line, one Equipment per (op, eq_idx).

    每条 line 独立物理 equipment 实例（数据模型 v2：line_id 必填，equipment ↔ line 1:1）。
    `prim_path_prefix` 是该产线在 USD scene 中的根 prim 路径（每条线不同），
    与 MODULE_DATA / PACK_DATA 里的 `t_id_CT_*` 后缀拼成完整 USD prim path。
    顺便给每台 equipment 创建一行 EquipmentProcessParameters（standard_ct = design_ct）。
    """
    for op_seq, (op_id, _actual_ct, workers, eq_list, design_ct) in enumerate(operations, 1):
        # 设备级人员配置：op 总需求人数 ÷ 该 op 下设备台数（向上取整，最少 1 人）
        eq_count = max(1, len(eq_list))
        per_eq_workers = max(1, -(-workers // eq_count)) if workers > 0 else 0
        for eq_idx, (eq_name, eq_type, prim_suffix) in enumerate(eq_list):
            eq_id = uid()
            # 设备编码全厂唯一 → 加 line 短码前缀
            eq_code = f"{line_short_code}_EQ{op_seq:03d}_{eq_idx + 1:02d}"
            # 完整 USD prim path = 该产线根 prefix + 该设备 t_id_CT_* 后缀
            full_prim_path = f"{prim_path_prefix}{prim_suffix}"
            db.add(Equipment(
                equipment_id=eq_id,
                operation_id=op_id,
                line_id=line_id,
                equipment_code=eq_code,
                equipment_name=eq_name,
                equipment_type=eq_type,
                status="ACTIVE",
                sort_order=eq_idx + 1,
                creator_binding_id=full_prim_path,
            ))
            # 同时建一行 EquipmentProcessParameters，把 design_ct 作为设备级 standard_ct
            # WORKSTATION 设备（人工工位）效率/良率天然更易波动，给稍低的默认值
            is_manual = eq_type == "WORKSTATION"
            db.add(EquipmentProcessParameters(
                id=uid(),
                equipment_id=eq_id,
                standard_ct=design_ct,
                standard_yield_rate=Decimal("0.98") if is_manual else Decimal("0.995"),
                standard_work_efficiency=Decimal("0.90") if is_manual else Decimal("1.00"),
                standard_worker_count=per_eq_workers,
            ))


def insert_bop_for_line(
    line_id: str,
    prod_id: str,
    version: str,
    operations: list,
    panel_qtys: list[int] | None = None,
):
    """Create a BOP for a (line, product) pair referencing the given stage operations."""
    bop_id = uid()
    db.add(BOP(
        bop_id=bop_id,
        product_id=prod_id,
        line_id=line_id,
        bop_version=version,
        is_active=True,
        created_by="seed_script",
    ))

    for idx, (op_id, actual_ct, workers, _eq_list, _design_ct) in enumerate(operations):
        seq = idx + 1
        panel_qty = panel_qtys[idx] if panel_qtys else 1

        db.add(BOPProcess(
            bop_process_id=uid(),
            bop_id=bop_id,
            operation_id=op_id,
            sequence=seq,
            standard_ct=actual_ct,
            panel_qty=panel_qty if panel_qty > 1 else None,
            ct_per_panel=actual_ct * panel_qty if panel_qty > 1 else None,
            yield_rate=1.0,
            standard_worker_count=workers,
        ))


# ============================================================================
# 7a. Insert Operations per stage（共享：MM 28 道、PK 18 道）
# ============================================================================
mm_ops = insert_stage_operations(main_module_stage_id, "MM", MODULE_DATA)
pk_ops = insert_stage_operations(packaging_stage_id, "PK", PACK_DATA)

# ============================================================================
# 7b. Insert Equipment per (line, operation) — 每条线独立物理 equipment
# ============================================================================
insert_equipment_for_line(mm_line_01_id, "MM01", mm_ops, MM_LINE_01_PRIM_PREFIX)
insert_equipment_for_line(mm_line_02_id, "MM02", mm_ops, MM_LINE_02_PRIM_PREFIX)
insert_equipment_for_line(pk_line_01_id, "PK01", pk_ops, PK_LINE_01_PRIM_PREFIX)
insert_equipment_for_line(pk_line_02_id, "PK02", pk_ops, PK_LINE_02_PRIM_PREFIX)

# ============================================================================
# 8. BOP per (line, product) — 每个 (line, product) 组合各有一份 active BoP
# ============================================================================
# PG548 覆盖四条线
insert_bop_for_line(mm_line_01_id, product_id, "v1.0", mm_ops)
insert_bop_for_line(mm_line_02_id, product_id, "v1.0", mm_ops)
insert_bop_for_line(pk_line_01_id, product_id, "v1.0", pk_ops, PACK_PANEL_QTY)
insert_bop_for_line(pk_line_02_id, product_id, "v1.0", pk_ops, PACK_PANEL_QTY)

# PG549 同样覆盖四条线（共用 operation + CT；仅产品 FK 不同）
insert_bop_for_line(mm_line_01_id, pg549_id, "v1.0", mm_ops)
insert_bop_for_line(mm_line_02_id, pg549_id, "v1.0", mm_ops)
insert_bop_for_line(pk_line_01_id, pg549_id, "v1.0", pk_ops, PACK_PANEL_QTY)
insert_bop_for_line(pk_line_02_id, pg549_id, "v1.0", pk_ops, PACK_PANEL_QTY)

# Update line operation counts
db.query(ProductionLine).filter(
    ProductionLine.line_id.in_([mm_line_01_id, mm_line_02_id])
).update({"operation_count": len(MODULE_DATA)}, synchronize_session=False)
db.query(ProductionLine).filter(
    ProductionLine.line_id.in_([pk_line_01_id, pk_line_02_id])
).update({"operation_count": len(PACK_DATA)}, synchronize_session=False)

# Update stage line_count
db.query(Stage).filter(Stage.stage_id == main_module_stage_id).update({"line_count": 2})
db.query(Stage).filter(Stage.stage_id == packaging_stage_id).update({"line_count": 2})

# ============================================================================
# 8b. Stage Transition —— 跨制程接续（E2S 批量：上游 task 全部完工后整批过 connection_time 进入下游）
# ============================================================================
db.add(StageTransition(
    id=uid(),
    from_stage_id=main_module_stage_id,
    to_stage_id=packaging_stage_id,
    connection_type="E2S",
    connection_time=30,  # 秒；上游批次整批过 30s 接续时间到下游入口
))

# ============================================================================
# 9. Work Calendar + Shift
# ============================================================================
cal_id = uid()
db.add(WorkCalendar(
    calendar_id=cal_id,
    factory_id=factory_id,
    calendar_date=date(2026, 4, 15),
    is_working_day=True,
    day_type="WEEKDAY",
    total_work_hours=11.0,
))
db.add(Shift(
    shift_id=uid(),
    calendar_id=cal_id,
    shift_name="Day Shift",
    start_time=time(8, 0),
    end_time=time(20, 0),
    work_hours=11.0,
    break_minutes=60,
    shift_order=1,
))

# ============================================================================
# 10. Simulation Plan + WorkOrders + Production Tasks (WO-linked default)
# ============================================================================
plan_id = uid()
db.add(SimulationPlan(
    plan_id=plan_id,
    plan_name="Main Module + Packaging WO-linked Baseline",
    plan_description="两条 MM 线 × 两条 PK 线 · WO 链式跨制程 · PG548 + PG549 各一 WO",
    factory_id=factory_id,
    status="DRAFT",
    enabled_simulators=["PRODUCTION", "LINE_BALANCE"],
    simulation_duration_hours=11.0,
    created_by="seed_script",
    # ignore_wo=False 走默认（WO 模式）
))
db.flush()  # 确保 plan_id 在 WO 插入前可用于 FK 校验

# 两个 WorkOrder —— 当全局主数据（plan_id=None）：建方案时随快照克隆进各方案，
# 像 BoP 一样。ERP/MES 未对接前由 seed 提供，不支持手工导入。
wo_001_id = uid()
wo_002_id = uid()
db.add(WorkOrder(
    wo_id=wo_001_id, plan_id=None, wo_no="WO-001",
    product_code="PG548", product_name="NVD Bianca PG548 UT3.0B",
    plan_qty=500, data_source="MANUAL_IMPORT",
))
db.add(WorkOrder(
    wo_id=wo_002_id, plan_id=None, wo_no="WO-002",
    product_code="PG549", product_name="NVD Bianca PG549 UT3.0C",
    plan_qty=500, data_source="MANUAL_IMPORT",
))

# 4 条 ProductionTask —— 每 WO 各 MM + PK 1 条，严格 1:1 跨制程链
task_plan = [
    # (wo_id, product_code, stage_id, line_id, production_sequence)
    (wo_001_id, "PG548", main_module_stage_id, mm_line_01_id, 1),
    (wo_001_id, "PG548", packaging_stage_id,   pk_line_01_id, 2),
    (wo_002_id, "PG549", main_module_stage_id, mm_line_02_id, 3),
    (wo_002_id, "PG549", packaging_stage_id,   pk_line_02_id, 4),
]
for wo_id_, pcode, stage_id_, line_id_, seq in task_plan:
    db.add(ProductionTask(
        task_id=uid(),
        plan_id=plan_id,
        wo_id=wo_id_,
        stage_id=stage_id_,
        line_id=line_id_,
        product_code=pcode,
        plan_quantity=500,
        production_sequence=seq,
        data_source="MANUAL_IMPORT",
    ))

# ============================================================================
# Commit
# ============================================================================
db.commit()

# Print summary
mm_ops_count = db.query(Operation).filter(Operation.stage_id == main_module_stage_id).count()
pk_ops_count = db.query(Operation).filter(Operation.stage_id == packaging_stage_id).count()
mm_eq_count = db.query(Equipment).join(Operation).filter(
    Operation.stage_id == main_module_stage_id
).count()
pk_eq_count = db.query(Equipment).join(Operation).filter(
    Operation.stage_id == packaging_stage_id
).count()
bop_count = db.query(BOP).count()

wo_count = db.query(WorkOrder).count()
task_count = db.query(ProductionTask).count()
print("Seed complete:")
print("  Factory:     1 (富士康烟台)")
print("  Stages:      2 (Main Module, Packaging)")
print("  Lines:       4 (MM-01, MM-02, PK-01, PK-02)")
print(f"  Main Module: {mm_ops_count} operations, {mm_eq_count} equipment")
print(f"  Packaging:   {pk_ops_count} operations, {pk_eq_count} equipment")
print("  Products:    2 (PG548, PG549)")
print(f"  BOPs:        {bop_count} (2 products × 4 lines)")
print("  StageTrans:  1 (MM → PK, E2S, 30s)")
print("  Calendar:    1 day, 1 shift (11h)")
print("  Plan:        1 (DRAFT, WO-linked)")
print(f"  WorkOrders:  {wo_count} (WO-001 PG548 × 500 MM-01→PK-01; WO-002 PG549 × 500 MM-02→PK-02)")
print(f"  Tasks:       {task_count} (4 linked via wo_id)")
print(f"  Plan ID:     {plan_id}")

db.close()
