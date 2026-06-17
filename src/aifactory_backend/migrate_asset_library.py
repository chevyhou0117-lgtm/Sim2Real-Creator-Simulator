"""一次性：从 Creator 远端库(192.168.40.127:8015) 迁移 USD 资产库到本地 aifactory_simulation。

- 远端主键是 BigInteger 雪花，本地是 VARCHAR(36) UUID：做全局 BigInt→UUID 重映射(PK+FK)。
- 只迁本地表已有的列(交集)，远端多出的列(asset_version_id 等)自动忽略。
- root_usd_path/location_path 原样迁移(路径解析问题单独处理)。
- asset_type_dict / instance_asset_type_dict 用自然键 code，原样复制。
- 幂等：每次先清空目标表(按 FK 反序)再灌。

用法： .venv\Scripts\python.exe migrate_asset_library.py
"""
import asyncio
import uuid
import asyncpg

REMOTE = dict(user="postgres", password="JymAdmin1357!!", host="192.168.40.127",
              port=8015, database="postgres", ssl="prefer", timeout=15)
LOCAL = dict(user="postgres", password="postgres", host="localhost",
             port=5432, database="aifactory_simulation", timeout=15)

# 复制顺序(满足 FK 依赖)
NATURAL = ["asset_type_dict", "instance_asset_type_dict"]          # 自然键，原样
SNOWFLAKE_ORDER = ["asset_categories", "equipment_model_details",
                   "line_model_details", "line_model_equipment_rel"]
# 每表中需要 BigInt→UUID 重映射的列(PK + 指向上述雪花表的 FK)
REMAP_COLS = {
    "asset_categories":         ["id", "parent_id"],
    "equipment_model_details":  ["id", "category_id"],
    "line_model_details":       ["id", "category_id"],
    "line_model_equipment_rel": ["id", "line_model_id", "equipment_model_id"],
}


async def local_columns(local, table):
    rows = await local.fetch(
        "select column_name from information_schema.columns where table_name=$1", table)
    return [r["column_name"] for r in rows]


async def connect_with_retry(params, label, attempts=8, delay=3):
    last = None
    for i in range(attempts):
        try:
            c = await asyncpg.connect(**params)
            print(f"connected {label} (attempt {i+1})")
            return c
        except Exception as e:
            last = e
            print(f"  {label} connect attempt {i+1} failed: {type(e).__name__}; retry in {delay}s")
            await asyncio.sleep(delay)
    raise last


async def main():
    # 先连本地，拿到每张表的列(交集用)
    local = await asyncpg.connect(**LOCAL)
    local_cols = {}
    for t in NATURAL + SNOWFLAKE_ORDER:
        local_cols[t] = await local_columns(local, t)

    # 远端：带重试连一次，一次性把所有需要的数据读进内存，立刻断开(压缩远端窗口)
    remote = await connect_with_retry(REMOTE, "remote")
    snapshot = {}
    use_cols = {}
    try:
        for t in NATURAL + SNOWFLAKE_ORDER:
            rc = await remote.fetch(
                "select column_name from information_schema.columns where table_name=$1", t)
            remote_set = {r["column_name"] for r in rc}
            # 只迁本地与远端都存在的列(交集)；本地独有列(如 asset_type)留默认/NULL
            cols = [c for c in local_cols[t] if c in remote_set]
            use_cols[t] = cols
            snapshot[t] = await remote.fetch(f"select {','.join(cols)} from {t}")
            print(f"  read remote {t}: {len(snapshot[t])} (cols={len(cols)})")
    finally:
        await remote.close()
        print("remote closed (all data in memory)")

    # 全局 BigInt→UUID 映射(覆盖 4 张雪花表所有 PK)
    id_map = {}
    for t in SNOWFLAKE_ORDER:
        for r in snapshot[t]:
            id_map[r["id"]] = str(uuid.uuid4())
    print(f"id map built: {len(id_map)} ids")

    def remap(val):
        if val is None:
            return None
        return id_map.get(val, val if isinstance(val, str) else str(val))

    # 清空目标表(FK 反序)
    for t in reversed(NATURAL + SNOWFLAKE_ORDER):
        await local.execute(f'TRUNCATE TABLE {t} CASCADE')
    print("local target tables truncated")

    total = 0
    for t in NATURAL + SNOWFLAKE_ORDER:
        cols = use_cols[t]
        rows = snapshot[t]
        if not rows:
            print(f"  {t}: 0"); continue
        remap_set = set(REMAP_COLS.get(t, []))
        ph = ",".join(f"${i+1}" for i in range(len(cols)))
        data = [tuple(remap(r[c]) if c in remap_set else r[c] for c in cols) for r in rows]
        await local.executemany(
            f'INSERT INTO {t} ({",".join(cols)}) VALUES ({ph})', data)
        print(f"  insert {t}: {len(rows)}"); total += len(rows)

    print(f"DONE. migrated {total} rows.")
    await local.close()


asyncio.run(main())
