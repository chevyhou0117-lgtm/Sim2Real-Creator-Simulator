"""导出资产库 6 张 Creator 表为 CSV，供 load_seed.load_asset_library() 注入。

为什么需要它：load_seed 的 creator_tables.sql 只建**空表**，md_*.csv 只灌主数据；
资产库（分类树 / 线体·设备模型 / 挂载关系 + 缩略图/USD 路径）的**数据行**当初是用
aifactory_backend/migrate_asset_library.py 从远程库单独迁的，没进 seed。本脚本把当前库里
这些数据行导出成 CSV 固化进 seed_data/asset_library/，从此可随 load_seed 一键重建。

注意：导出的只是 DB 记录（含 thumbnail_path/root_usd_path 等**相对路径**）。这些路径指向的
实际文件（thumbnails/ + Library/ + Line_Library/）在 AIFACTORY_STORAGE_ROOT 下，需另行打包，
详见 docs/新机器部署指南.md 的「aiFactory 本地文件与资产库」一节。

用法（sim_backend venv）：
  python export_asset_library.py
"""
from __future__ import annotations

import pathlib

from app.database import SessionLocal

# FK 依赖顺序（注入时按此序，导出顺序无所谓但保持一致便于核对）
TABLES = [
    "asset_type_dict",
    "instance_asset_type_dict",
    "asset_categories",
    "line_model_details",
    "equipment_model_details",
    "line_model_equipment_rel",
]

OUT_DIR = pathlib.Path(__file__).parent / "seed_data" / "asset_library"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    db = SessionLocal()
    raw = db.connection().connection  # 底层 psycopg2 连接
    cur = raw.cursor()
    try:
        for table in TABLES:
            path = OUT_DIR / f"{table}.csv"
            with open(path, "w", encoding="utf-8", newline="") as f:
                # COPY ... TO STDOUT：导出全部列（含 is_deleted/版本/扩展列），带表头
                cur.copy_expert(
                    f"COPY (SELECT * FROM {table} ORDER BY 1) "
                    f"TO STDOUT WITH (FORMAT csv, HEADER true)",
                    f,
                )
            cur.execute(f"SELECT count(*) FROM {table}")
            print(f"[export] {table}: {cur.fetchone()[0]} 行 -> {path}")
    finally:
        cur.close()
        db.close()
    print("DONE")


if __name__ == "__main__":
    main()
