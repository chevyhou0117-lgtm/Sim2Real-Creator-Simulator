"""对迁移端点做 in-process 冒烟测试（命中真实 DB，抓运行时 SQL/列名错误）。
只调只读端点；需要 id 的先查库取真实 id。
运行：.venv\\Scripts\\python.exe smoke_test_migrated.py
"""
import asyncio
import os

os.environ.setdefault("AIFACTORY_CREATE_ALL", "false")

import asyncpg
import httpx
from httpx import ASGITransport

import main


async def real_ids():
    conn = await asyncpg.connect(user="postgres", password="postgres", host="localhost", port=5432, database="aifactory_simulation")
    out = {}
    out["line_detail_id"] = await conn.fetchval("SELECT id FROM line_model_details WHERE is_deleted=false LIMIT 1")
    out["equip_detail_id"] = await conn.fetchval("SELECT id FROM equipment_model_details WHERE is_deleted=false LIMIT 1")
    out["line_cat_id"] = await conn.fetchval("SELECT id FROM asset_categories WHERE type='line_model' AND is_deleted=false LIMIT 1")
    out["equip_cat_id"] = await conn.fetchval("SELECT id FROM asset_categories WHERE type='equipment_model' AND is_deleted=false LIMIT 1")
    out["node_id"] = await conn.fetchval("SELECT id FROM factory_asset_node WHERE is_deleted=false LIMIT 1")
    # factory_projects 列校验
    cols = await conn.fetch("SELECT column_name FROM information_schema.columns WHERE table_name='factory_projects'")
    out["_fp_cols"] = sorted(c["column_name"] for c in cols)
    await conn.close()
    return out


async def main_test():
    ids = await real_ids()
    print("real ids:", {k: v for k, v in ids.items() if not k.startswith("_")})
    print("factory_projects has thumbnail_url:", "thumbnail_url" in ids["_fp_cols"], "| thumbnail_path:", "thumbnail_path" in ids["_fp_cols"])

    transport = ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        cases = [
            ("GET",  "/api/v1/asset-category/process/list", None),
            ("POST", "/api/v1/asset-category/filter", {}),
            ("POST", "/api/v1/asset-category/query", {}),
            ("POST", "/api/v1/factory-project/query", {}),
            ("GET",  "/api/v1/factory-project/list-with-version", None),
        ]
        if ids.get("line_detail_id"):
            cases.append(("POST", "/api/v1/line-model-detail/equipment-rel", {"id": ids["line_detail_id"]}))
            # asset-model-status enable 对已 ACTIVE 记录是幂等 no-op（exercise _get_or_raise+状态判断，不改库）
            cases.append(("PUT", f"/api/v1/asset-model-status/line/enable/{ids['line_detail_id']}", {}))
        if ids.get("equip_detail_id"):
            cases.append(("PUT", f"/api/v1/asset-model-status/equipment/enable/{ids['equip_detail_id']}", {}))
        # 带参 filter（按 type 过滤）
        cases.append(("POST", "/api/v1/asset-category/filter", {"type": "line_model"}))
        if ids.get("node_id"):
            cases.append(("POST", "/api/v1/base/equipment/query-by-line", {"parentId": ids["node_id"]}))

        for method, url, body in cases:
            try:
                if method == "GET":
                    r = await c.get(url)
                elif method == "PUT":
                    r = await c.put(url, json=body)
                elif method == "DELETE":
                    r = await c.request("DELETE", url, json=body)
                else:
                    r = await c.post(url, json=body)
                ok = r.status_code == 200
                try:
                    j = r.json()
                    code = j.get("code")
                    msg = j.get("message")
                except Exception:
                    code = msg = None
                tag = "OK " if ok else "ERR"
                print(f"[{tag}] {method} {url} -> http {r.status_code} code={code} msg={msg}")
                if not ok:
                    print("       body:", r.text[:300])
            except Exception as e:
                print(f"[EXC] {method} {url} -> {type(e).__name__}: {e}")


if __name__ == "__main__":
    asyncio.run(main_test())
