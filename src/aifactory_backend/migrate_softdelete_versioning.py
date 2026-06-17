"""一次性迁移：给 Creator-only 表加 is_deleted + 资产版本/扩展列（UUID 适配）。

遵循 SimulationService 的 sql/3d_library2.sql + migration_add_is_deleted.sql 设计，
但 asset_version_id 用 VARCHAR(36)（保留 UUID 主键），md_* 合并表不动。
status 列默认值改 DRAFT（新建走草稿），存量行保持原值（ACTIVE）。
可重复执行（ADD COLUMN IF NOT EXISTS 幂等）。
"""
import asyncio
import asyncpg

CREATOR_TABLES = [
    "asset_type_dict", "asset_categories", "line_model_details", "equipment_model_details",
    "line_model_equipment_rel", "instance_asset_type_dict", "factory_projects", "factory_asset_node",
    "factory_process_details", "factory_line_details", "factory_equipment_details", "factory_asset_3d_model",
]

VERSION_EXT = """
ALTER TABLE {t}
    ADD COLUMN IF NOT EXISTS category VARCHAR(100),
    ADD COLUMN IF NOT EXISTS model VARCHAR(100),
    ADD COLUMN IF NOT EXISTS format VARCHAR(50),
    ADD COLUMN IF NOT EXISTS poly_count INTEGER,
    ADD COLUMN IF NOT EXISTS prim_path VARCHAR(255),
    ADD COLUMN IF NOT EXISTS instance_path VARCHAR(255),
    ADD COLUMN IF NOT EXISTS width NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS depth NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS height NUMERIC(10,2),
    ADD COLUMN IF NOT EXISTS asset_version_id VARCHAR(36),
    ADD COLUMN IF NOT EXISTS version_tag VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS remark TEXT,
    ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);
"""


async def main():
    conn = await asyncpg.connect(user="postgres", password="postgres", host="localhost", port=5432, database="aifactory_simulation")
    for t in CREATOR_TABLES:
        try:
            await conn.execute(f"ALTER TABLE {t} ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;")
        except Exception as e:
            print(f"  [skip is_deleted] {t}: {e}")

    # 软删除唯一性保证：line_model_equipment_rel 同一线体的同一设备实例活跃行至多一条。
    # 注意：建索引前须确保无重复活跃行，否则 CREATE UNIQUE INDEX 会失败。
    try:
        await conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS uq_line_model_equipment_rel_live "
            "ON line_model_equipment_rel (line_model_id, equipment_model_id, instance_name) "
            "WHERE is_deleted = false;"
        )
    except Exception as e:
        print(f"  [skip uq_line_model_equipment_rel_live]: {e}")

    await conn.execute("ALTER TABLE line_model_details ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100);")
    await conn.execute(VERSION_EXT.format(t="line_model_details"))
    await conn.execute("UPDATE line_model_details SET asset_version_id = id WHERE asset_version_id IS NULL;")
    await conn.execute("ALTER TABLE line_model_details ALTER COLUMN status SET DEFAULT 'DRAFT';")

    await conn.execute(VERSION_EXT.format(t="equipment_model_details"))
    await conn.execute("UPDATE equipment_model_details SET asset_version_id = id WHERE asset_version_id IS NULL;")
    await conn.execute("ALTER TABLE equipment_model_details ALTER COLUMN status SET DEFAULT 'DRAFT';")

    for t in ("line_model_details", "equipment_model_details", "asset_categories", "factory_asset_node", "line_model_equipment_rel"):
        cols = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_name=$1", t)
        names = {c["column_name"] for c in cols}
        flags = [c for c in ("is_deleted", "is_current", "asset_version_id", "version_tag", "status", "model") if c in names]
        print(f"{t}: {flags}")
    for t in ("line_model_details", "equipment_model_details"):
        rows = await conn.fetch(f"SELECT status, count(*) AS n FROM {t} GROUP BY status")
        print(f"  {t} status:", {r["status"]: r["n"] for r in rows})
    await conn.close()
    print("MIGRATION DONE")


if __name__ == "__main__":
    asyncio.run(main())
