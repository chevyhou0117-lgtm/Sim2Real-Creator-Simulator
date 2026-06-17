"""一次性生成器：全厂 富士康烟台 seed_data/*.csv。

数据源（自包含，运行时直接读）：
  - demo520.usd：/home/remond/Workspace/P9_animations/Houston_F_NV/demo520.usd
    → 每条线的设备 prim（**完整路径**，按 USD 子节点顺序≈产线排布顺序）
  - FXPG548 Detail CT…xlsx：/home/remond/Downloads/...
    → 每个制程的工序（一站=一工序，按表内顺序）+ Cycle time

决策（用户 2026-05-19 确认，详见记忆 project-fullfactory-seed）：
  9 制程 / 10 线（SMT 2 条同构并行）；制程→FXPG548 段映射见 STAGES；
  设备→工序：每线设备按 prim 顺序均摊到该线工序序列（首猜，用户后调）；
  单产品 PG548，每线 1 BoP，CT 来自 FXPG548；工单 1000（SMT 两线各 500 在
  建方案/任务层处理，work_order.csv 只记总量 1000）；binding 写完整路径；
  设备数据 xlsx 仅参考，空缺自动补（只测试不用细）。

重跑：cd sim_backend && .venv/bin/python seed_data/_generate_fullfactory.py
之后：python load_seed.py --reset  （--with-demo 视需要）
"""
import csv
import pathlib
import re

import openpyxl
from pxr import Usd

HERE = pathlib.Path(__file__).parent
USD = "/home/remond/Workspace/P9_animations/Houston_F_NV/demo520.usd"
FXPG = "/home/remond/Downloads/FXPG548 Detail CT update-20250905-MP-GB300.xlsx"
FXPG_SHEET = "900-2G548-0081-XXX"

FACTORY_CODE = "FOXCONN-NME"
PRODUCT_CODE = "PG548"
PRODUCT_NAME = "NVD Bianca PG548 GB300"
BOP_VER = "v1.0"
WO_QTY = 1000

# 制程：code, 名称, sequence, FXPG548 段标识, 段内切片(slice 或 None=整段)
# "Assy Auto (Main)" 前 11 站→Main Assy，其余→Tray Assy
# "Dis-Assy Auto" 前 N 站→Tray Dis-Assy，"Manual-Remove L&R Cold plate pipelines"
#   及之后→Cold Plate Dis-Assy（运行时按站名定位切点）
STAGES = [
    ("SMT",        "表面贴装",            1, "SMT",                None),
    ("PTH",        "插件",               2, "PTH",                None),
    ("ModuleAssy", "自动模块组装",         3, "Assy Auto (Module)", None),
    ("MainAssy",   "自动主组装",          4, "Assy Auto (Main)",   ("head", 11)),
    ("TrayAssy",   "托盘组装",            5, "Assy Auto (Main)",   ("tail", 11)),
    ("FT",         "成品测试",            6, "FT TEST",            None),
    ("TrayDisAssy","托盘拆解(含分拣)",     7, "Dis-Assy Auto",      ("cp_before", None)),
    ("CPDisAssy",  "冷板拆解",            8, "Dis-Assy Auto",      ("cp_from", None)),
    ("Packing",    "包装",               9, "Packing Line",       None),
]
CP_SPLIT_PREFIX = "Manual-Remove L&R Cold plate pipelines"

# 线：code, stage_code, 名称, sort_order
LINES = [
    ("SMT01",        "SMT",         "SMT 线 01",        1),
    ("SMT02",        "SMT",         "SMT 线 02",        2),
    ("PTH01",        "PTH",         "PTH 线",           1),
    ("ModuleAssy01", "ModuleAssy",  "模块组装线",        1),
    ("MainAssy01",   "MainAssy",    "主组装线",          1),
    ("TrayAssy01",   "TrayAssy",    "托盘组装线",        1),
    ("FT01",         "FT",          "成品测试线",        1),
    ("TrayDisAssy01","TrayDisAssy", "托盘拆解线(分拣)",   1),
    ("CPDisAssy01",  "CPDisAssy",   "冷板拆解线",        1),
    ("Packing01",    "Packing",     "包装线",            1),
]

PL = "/World/ProdLine"


# ── FXPG548 → 每制程工序(站名, CT) ─────────────────────────────────────────────
def read_fxpg():
    wb = openpyxl.load_workbook(FXPG, read_only=True, data_only=True)
    ws = wb[FXPG_SHEET]
    seg_rows = {}  # 段标识 → [(station, ct), ...] 按表内顺序
    cur = None
    for r in ws.iter_rows(min_row=5, max_row=119, values_only=True):
        proc, stn, ct = r[1], r[2], r[6]
        if proc and str(proc).strip():
            cur = str(proc).replace("\n", " ").strip()
        if not (stn and str(stn).strip()):
            continue
        name = str(stn).replace("\n", " ").strip()
        try:
            ctv = round(float(ct), 3)
        except (TypeError, ValueError):
            ctv = 30.0
        seg_rows.setdefault(cur, []).append((name, ctv))
    wb.close()

    stage_ops = {}  # stage_code → [(op_name, ct), ...]
    for code, _nm, _seq, seg, sl in STAGES:
        rows = seg_rows.get(seg, [])
        if sl is None:
            sel = rows
        elif sl[0] == "head":
            sel = rows[: sl[1]]
        elif sl[0] == "tail":
            sel = rows[sl[1] :]
        elif sl[0] in ("cp_before", "cp_from"):
            idx = next((i for i, (n, _) in enumerate(rows)
                        if n.startswith(CP_SPLIT_PREFIX)), len(rows))
            sel = rows[:idx] if sl[0] == "cp_before" else rows[idx:]
        else:
            sel = rows
        stage_ops[code] = sel
    return stage_ops


# ── demo520.usd → 每条线有序设备 prim 完整路径 ────────────────────────────────
def read_devices(stage):
    """返回 {line_code: [(device_name, full_prim_path), ...]}（按 USD 子节点顺序）。"""
    def container_children(group_root, sub_filter=None):
        """group_root 下 ASSET_PROD/asset_*_PROD 容器的直接子(设备)，保序。
        sub_filter: 仅取路径含该子串的容器（SMT 用 S01/S02 区分）。"""
        out = []
        for p in stage.Traverse():
            ps = p.GetPath().pathString
            if not re.search(r"/ASSET_PROD/asset_[^/]+_PROD$", ps):
                continue
            if not ps.startswith(group_root + "/") and ps != group_root:
                continue
            if sub_filter and sub_filter not in ps:
                continue
            for c in p.GetChildren():
                out.append((c.GetName(), c.GetPath().pathString))
        return out

    dev = {}
    # SMT01/02：HST_Assy 的 S01/S02 子树 + Bianca 对应 BX
    hst = f"{PL}/a_L_SMT_HST_Assy"
    bia = f"{PL}/a_L_SMT_Bianca_Xray"
    bx = {n: pth for n, pth in container_children(bia)}  # BX01/BX02
    for lc, sub, bxkey in (("SMT01", "t_id_L_SMT_HST_S01", "BX01"),
                           ("SMT02", "t_id_L_SMT_HST_S02", "BX02")):
        lst = container_children(hst, sub_filter="/" + sub + "/")
        for n, pth in bx.items():
            if n.endswith(bxkey):
                lst.append((n, pth))
        dev[lc] = lst
    # 其余 8 线：组根下唯一 asset_*_PROD 容器
    GRP = {
        "PTH01": "a_L_HST_PTH__B", "ModuleAssy01": "a_L_HST_Module",
        "MainAssy01": "a_L_HST_TestAssy_Sub", "TrayAssy01": "a_L_HST_TestAssy_Main",
        "FT01": "a_L_HST_POD", "TrayDisAssy01": "a_L_HST_SORTING",
        "CPDisAssy01": "a_L_HST_Dis_Assy_Sub", "Packing01": "a_L_HST_PACK",
    }
    for lc, g in GRP.items():
        dev[lc] = container_children(f"{PL}/{g}")
    return dev


def guess_type(name: str) -> str:
    u = name.upper()
    for k, t in (("CONV", "CONVEYOR"), ("AOI", "AOI"), ("SPI", "AOI"),
                 ("XRAY", "XRAY"), ("X_RAY", "XRAY"), ("RO0", "ROBOT"),
                 ("RB0", "ROBOT"), ("PP0", "ROBOT"), ("WS0", "WORKSTATION"),
                 ("MD0", "ROBOT"), ("LD0", "ROBOT")):
        if k in u:
            return t
    return "OTHER"


def w(name, header, rows):
    with open(HERE / name, "w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(header)
        wr.writerows(rows)
    print(f"  {name:34s} {len(rows):4d} rows")


def main():
    stage_ops = read_fxpg()
    st = Usd.Stage.Open(USD, Usd.Stage.LoadAll)
    dev = read_devices(st)

    print("=== 生成全厂 seed_data ===")
    # factory
    w("factory.csv", ["factory_code", "factory_name", "location", "timezone", "status"],
      [[FACTORY_CODE, "富士康烟台", "山东烟台", "Asia/Shanghai", "ACTIVE"]])
    # creator_project（全局；plan 关联它 → 前端按 creator_url 开 demo520.usd）
    w("creator_project.csv",
      ["project_name", "project_version", "project_status", "creator_url", "description"],
      [["富士康烟台 全厂 — demo520", "v1.0", "PUBLISHED", USD,
        "富士康烟台 全厂 OV 场景（10 线/9 制程，含内建动画）"]])
    # stage
    w("stage.csv", ["stage_code", "stage_name", "sequence", "stage_type", "status"],
      [[c, nm, seq, "", "ACTIVE"] for c, nm, seq, _s, _sl in STAGES])
    # production_line
    w("production_line.csv", ["line_code", "stage_code", "line_name", "status", "sort_order"],
      [[lc, sc, nm, "ACTIVE", so] for lc, sc, nm, so in LINES])

    # operation（每制程：FXPG548 站 → 工序，全局唯一 code）
    op_rows = []
    stage_opcodes = {}  # stage_code → [(op_code, ct), ...] 按序
    for sc, _nm, _seq, _seg, _sl in STAGES:
        ops = stage_ops.get(sc, [])
        lst = []
        for i, (oname, ct) in enumerate(ops, 1):
            oc = f"{sc}_OP{i:02d}"
            op_rows.append([oc, sc, oname[:120], i, "", "", "ACTIVE"])
            lst.append((oc, ct))
        stage_opcodes[sc] = lst
    w("operation.csv",
      ["operation_code", "stage_code", "operation_name", "sequence",
       "operation_type", "is_key_operation", "status"], op_rows)

    # equipment：每线设备按 prim 顺序均摊到该线工序
    eq_rows = []
    stage_of = {lc: sc for lc, sc, _n, _o in LINES}
    summary = []
    for lc, sc, _n, _o in LINES:
        devs = dev.get(lc, [])
        ops = stage_opcodes.get(sc, [])
        M = max(1, len(ops))
        D = len(devs)
        per_op_seq = {}
        for i, (dn, dpath) in enumerate(devs):
            oi = min(M - 1, i * M // D) if D else 0
            ocode = ops[oi][0] if ops else f"{sc}_OP01"
            n = per_op_seq.get(ocode, 0) + 1
            per_op_seq[ocode] = n
            ecode = f"{lc}_E{i + 1:03d}"
            ename = re.sub(r"^t_id_", "", dn)[:80]
            eq_rows.append([ecode, lc, ocode, ename, guess_type(dn),
                            dpath, n, "ACTIVE"])
        summary.append((lc, sc, D, len(ops)))
    w("equipment.csv",
      ["equipment_code", "line_code", "operation_code", "equipment_name",
       "equipment_type", "creator_binding_id", "sort_order", "status"], eq_rows)

    # equipment_process_params：留空(仅表头)，CT 走 bop_process
    w("equipment_process_params.csv",
      ["equipment_code", "standard_ct", "standard_yield_rate",
       "standard_work_efficiency", "standard_worker_count"], [])

    # product / bop / bop_process
    w("product.csv", ["product_code", "product_name", "product_category", "unit", "status"],
      [[PRODUCT_CODE, PRODUCT_NAME, "GB300", "pcs", "ACTIVE"]])
    w("bop.csv", ["bop_version", "product_code", "line_code", "is_active", "created_by"],
      [[BOP_VER, PRODUCT_CODE, lc, "TRUE", "gen_fullfactory"] for lc, *_ in LINES])
    bp_rows = []
    for lc, sc, _n, _o in LINES:
        for i, (oc, ct) in enumerate(stage_opcodes.get(sc, []), 1):
            bp_rows.append([BOP_VER, lc, oc, i, ct, 1, ct, 1.0, 0])
    w("bop_process.csv",
      ["bop_version", "line_code", "operation_code", "sequence",
       "standard_ct", "panel_qty", "ct_per_panel", "yield_rate",
       "standard_worker_count"], bp_rows)

    # work_order（总量 1000）
    w("work_order.csv", ["wo_no", "product_code", "product_name", "plan_qty"],
      [["WO0001", PRODUCT_CODE, PRODUCT_NAME, WO_QTY]])

    # production_task：导入端点 /imports section=production-tasks 兼容格式。
    # 表头固定中文 4 列；production_sequence 由**行顺序**自动赋（故按制程流排序）；
    # stage 由产线反推。SMT 两线各 500，其余各 1000，全挂 WO0001（须方案内已存在）。
    stage_seq = {c: seq for c, _nm, seq, _s, _sl in STAGES}
    ordered = sorted(LINES, key=lambda L: (stage_seq[L[1]], L[0]))
    task_rows = [["WO0001", lc, PRODUCT_CODE,
                  WO_QTY // 2 if sc == "SMT" else WO_QTY]
                 for lc, sc, _n, _o in ordered]
    w("production_task.csv",
      ["工单号", "产线", "产品型号", "计划产量"], task_rows)

    # work_calendar / shift：1 个通用工作日 + 1 班(8h)
    day = "2026-05-20"
    w("work_calendar.csv",
      ["calendar_date", "is_working_day", "day_type", "total_work_hours"],
      [[day, "TRUE", "WORKDAY", 8]])
    w("shift.csv",
      ["calendar_date", "shift_name", "start_time", "end_time",
       "work_hours", "break_minutes", "shift_order"],
      [[day, "白班", "08:00:00", "17:00:00", 8, 60, 1]])

    print("\n=== 每线 设备数 / 工序数 ===")
    for lc, sc, D, O in summary:
        print(f"  {lc:14s} stage={sc:12s} devs={D:3d} ops={O:3d}")
    print(f"\n总设备={sum(s[2] for s in summary)}  总工序={len(op_rows)}  线={len(LINES)}  制程={len(STAGES)}")


if __name__ == "__main__":
    main()
