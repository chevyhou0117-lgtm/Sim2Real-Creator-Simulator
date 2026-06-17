"""一次性生成器：把"单条 Packing 线"主数据写成 seed_data/*.csv。

数据与公式 1:1 复刻原 seed.py 的 PACK 部分（prim 路径 = 现 PK 线，逐字一致），
只是**只保留一条** packing 线（line_code=L_HST_PK_01，short=PK01）。

CSV 是 load_seed.py 的唯一可信源；本脚本仅用于据结构化定义重生成 CSV
（真实 P9 数据到位后，直接替换 CSV 即可，不必再跑本脚本）。

Run: cd sim_backend && .venv/Scripts/python.exe seed_data/_generate.py
"""
import csv
import math
import pathlib

HERE = pathlib.Path(__file__).parent

# ── 单条 Packing 线 ───────────────────────────────────────────────────────────
LINE_CODE = "L_HST_PK_01"
LINE_NAME = "Packaging Line 01"
LINE_SHORT = "PK01"
STAGE_CODE = "PACKAGING"
STAGE_NAME = "Packaging"
PK_PRIM_PREFIX = (
    "/World/a_L_HST_PACK/t_id_L_HST_PACK_PACK01/id_L_HST_PACK_PACK01/"
    "L_HST_PACK/L_HST_PACK/ASSET_PROD/asset_L_HST_PACK_PROD/"
)
PRODUCT_CODE = "PG548"
PRODUCT_NAME = "NVD Bianca PG548 UT3.0B"
BOP_VERSION = "v1.0"

# (operation_name, [(eq_name, eq_type, prim_suffix)...], actual_ct, design_ct, workers, op_type)
PACK_DATA = [
    ("Inbound Loading", [("上料料车", "ROBOT", "t_id_CT_HST_Pack_Trolley_TR01"),
                         ("搬运机（上料）", "ROBOT", "t_id_CT_HOPBLSJ_LD01")], 29.0, 19.0, 0, "OTHER"),
    ("Transfer to Line", [("中转机 1", "OTHER", "t_id_CT_HOPBYZ_CV01")], 12.0, 10.0, 0, "OTHER"),
    ("Manual Packing A1", [("人工包装工位 A1", "WORKSTATION", "t_id_CT_HOPBHM_A_HM01")], 7.0, 6.0, 1, "MANUAL"),
    ("AOI Carrier Conveyor", [("AOI 治具横移机", "OTHER", "t_id_TR7700L_QH_SII_AOI01")], 7.0, 20.0, 0, "OTHER"),
    ("Manual Packing A2", [("人工包装工位 A2", "WORKSTATION", "t_id_CT_HOPBHM_A_HM02")], 7.0, 6.0, 1, "MANUAL"),
    ("Cross Transfer", [("中转机 2", "OTHER", "t_id_CT_HOPBCRO_CV02")], 12.0, 10.0, 0, "OTHER"),
    ("Manual Packing B1", [("人工包装工位 B1", "WORKSTATION", "t_id_CT_HOPBHM_B_HM03")], 24.0, 6.0, 0, "MANUAL"),
    ("Manual Packing B2", [("人工包装工位 B2", "WORKSTATION", "t_id_CT_HOPBHM_B_HM04")], 15.0, 10.0, 1, "MANUAL"),
    ("Auto AOI Inspection", [("自动 AOI 检测机", "AOI", "t_id_CT_HOPBAOI_AOI02")], 45.5, 40.0, 0, "AOI"),
    ("Manual Packing C1", [("人工包装工位 C1", "WORKSTATION", "t_id_CT_HOPBHM_C_HM05")], 7.0, 10.0, 1, "MANUAL"),
    ("Manual Packing C2", [("人工包装工位 C2", "WORKSTATION", "t_id_CT_HOPBHM_C_HM06")], 7.0, 10.0, 1, "MANUAL"),
    ("Edge Folding and Sealing", [("自动折边封箱机", "ROBOT", "t_id_CT_HOPBFWX1_X01")], 6.0, 6.0, 0, "OTHER"),
    ("Corner Turning", [("翻角机", "OTHER", "t_id_CT_HOPBWST_W01")], 7.0, 6.0, 0, "OTHER"),
    ("Top Corner Sealing", [("自动顶角封口机", "ROBOT", "t_id_CT_HOPBFWX2_X02")], 6.0, 3.3, 0, "OTHER"),
    ("Seal Label Application", [("自动封口贴标机", "ROBOT", "t_id_CT_HOPBFKB_LB01")], 6.8, 5.0, 0, "OTHER"),
    ("Palletizing", [("自动码垛机", "ROBOT", "t_id_CT_HOPBMD_MD01")], 45.0, 17.0, 0, "OTHER"),
    ("Outbound Transfer", [("中转机 3", "OTHER", "t_id_CT_HOPBYZ_CV03")], 9.98, 5.0, 0, "OTHER"),
    ("Outbound Unloading", [("搬运机（下料）", "ROBOT", "t_id_CT_HOPBLSJ_LD02"),
                            ("下料料车", "ROBOT", "t_id_CT_HST_Pack_Trolley_TR02")], 22.5, 9.0, 0, "OTHER"),
]
PACK_PANEL_QTY = [1] * 13 + [2] * 5  # 与原 seed 一致


def _w(name, header, rows):
    with open(HERE / name, "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(header)
        wr.writerows(rows)
    print(f"  {name}: {len(rows)} rows")


def main():
    _w("factory.csv",
       ["factory_code", "factory_name", "location", "timezone", "status"],
       [["FOXCONN-NME", "富士康烟台", "山东烟台", "Asia/Shanghai", "ACTIVE"]])

    _w("stage.csv",
       ["stage_code", "stage_name", "sequence", "stage_type", "status"],
       [[STAGE_CODE, STAGE_NAME, 1, "PACKAGING", "ACTIVE"]])

    _w("production_line.csv",
       ["line_code", "stage_code", "line_name", "status", "sort_order"],
       [[LINE_CODE, STAGE_CODE, LINE_NAME, "ACTIVE", 1]])

    _w("product.csv",
       ["product_code", "product_name", "product_category", "unit", "status"],
       [[PRODUCT_CODE, PRODUCT_NAME, "GPU Module", "PCS", "ACTIVE"]])

    op_rows, eq_rows, ep_rows, bp_rows = [], [], [], []
    for seq, (op_name, eq_list, actual_ct, design_ct, workers, op_type) in enumerate(PACK_DATA, 1):
        op_code = f"PK_OP{seq:03d}"
        op_rows.append([op_code, STAGE_CODE, op_name, seq, op_type, False, "ACTIVE"])

        eq_count = max(1, len(eq_list))
        per_eq_workers = max(1, math.ceil(workers / eq_count)) if workers > 0 else 0
        for eq_idx, (eq_name, eq_type, prim_suffix) in enumerate(eq_list):
            eq_code = f"{LINE_SHORT}_EQ{seq:03d}_{eq_idx + 1:02d}"
            full_prim = f"{PK_PRIM_PREFIX}{prim_suffix}"
            eq_rows.append([eq_code, LINE_CODE, op_code, eq_name, eq_type,
                            full_prim, eq_idx + 1, "ACTIVE"])
            is_manual = eq_type == "WORKSTATION"
            ep_rows.append([eq_code, design_ct,
                            "0.98" if is_manual else "0.995",
                            "0.90" if is_manual else "1.00",
                            per_eq_workers])

        panel_qty = PACK_PANEL_QTY[seq - 1]
        bp_rows.append([
            BOP_VERSION, LINE_CODE, op_code, seq, actual_ct,
            panel_qty if panel_qty > 1 else "",
            round(actual_ct * panel_qty, 4) if panel_qty > 1 else "",
            1.0, workers,
        ])

    _w("operation.csv",
       ["operation_code", "stage_code", "operation_name", "sequence",
        "operation_type", "is_key_operation", "status"], op_rows)
    _w("equipment.csv",
       ["equipment_code", "line_code", "operation_code", "equipment_name",
        "equipment_type", "creator_binding_id", "sort_order", "status"], eq_rows)
    _w("equipment_process_params.csv",
       ["equipment_code", "standard_ct", "standard_yield_rate",
        "standard_work_efficiency", "standard_worker_count"], ep_rows)
    _w("bop.csv",
       ["bop_version", "product_code", "line_code", "is_active", "created_by"],
       [[BOP_VERSION, PRODUCT_CODE, LINE_CODE, True, "seed_loader"]])
    _w("bop_process.csv",
       ["bop_version", "line_code", "operation_code", "sequence", "standard_ct",
        "panel_qty", "ct_per_panel", "yield_rate", "standard_worker_count"], bp_rows)

    # 全局工单（plan_id=NULL，建方案随快照克隆；ERP/MES 未对接前 seed 提供）
    _w("work_order.csv",
       ["wo_no", "product_code", "product_name", "plan_qty"],
       [["WO-001", PRODUCT_CODE, PRODUCT_NAME, 500]])

    _w("work_calendar.csv",
       ["calendar_date", "is_working_day", "day_type", "total_work_hours"],
       [["2026-04-15", True, "WEEKDAY", 11.0]])
    _w("shift.csv",
       ["calendar_date", "shift_name", "start_time", "end_time",
        "work_hours", "break_minutes", "shift_order"],
       [["2026-04-15", "Day Shift", "08:00", "20:00", 11.0, 60, 1]])

    print("seed_data CSV 生成完成（单条 Packing 线，prim=PK 线）")


if __name__ == "__main__":
    main()
