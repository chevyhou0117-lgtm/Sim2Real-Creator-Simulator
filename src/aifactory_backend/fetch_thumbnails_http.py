"""把 DB 引用的缩略图从 MinIO 经 S3 HTTP(公开读) 拉到本地 STORAGE_ROOT，覆盖 0 字节空壳。

不依赖 minio 包(其原生依赖会让本机段错误)，纯 urllib + asyncpg。
对象公开读：https://192.168.40.127:9000/ov-usd-bucket/<thumbnail_path>
"""
import asyncio
import os
import shutil
import ssl
import urllib.request

import asyncpg
from urllib.parse import quote

BASE = "https://192.168.40.127:9000/ov-usd-bucket/"
ST = r"d:/Sim2Real/storage"
TABLES = ("equipment_model_details", "line_model_details", "asset_categories")
_CTX = ssl.create_default_context()
_CTX.check_hostname = False
_CTX.verify_mode = ssl.CERT_NONE


async def main():
    c = await asyncpg.connect(user="postgres", password="postgres", host="localhost",
                              port=5432, database="aifactory_simulation", timeout=8)
    paths = set()
    for t in TABLES:
        for r in await c.fetch(
                f"select distinct thumbnail_path from {t} "
                f"where thumbnail_path is not null and thumbnail_path<>''"):
            paths.add(r["thumbnail_path"])
    await c.close()
    print(f"DB 引用缩略图 {len(paths)} 张，开始拉取…")

    ok = fail = 0
    for p in sorted(paths):
        rel = p.replace("\\", "/").lstrip("/")
        url = BASE + quote(rel, safe="/")   # 中文等非 ASCII 文件名需 URL 编码
        dest = os.path.join(ST, *rel.split("/"))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        try:
            with urllib.request.urlopen(url, timeout=20, context=_CTX) as resp:
                data = resp.read()
            # MinIO 挂载拷贝把每个对象存成同名"目录"(xl.meta+数据块)，先删目录/空壳再写真文件
            if os.path.isdir(dest):
                shutil.rmtree(dest, ignore_errors=True)
            with open(dest, "wb") as f:
                f.write(data)
            ok += 1
            if ok % 20 == 0:
                print(f"  ...{ok} 张")
        except Exception as e:
            fail += 1
            print(f"  FAIL {rel}: {type(e).__name__}: {str(e)[:60]}")
    print(f"DONE. ok={ok}, fail={fail}")


asyncio.run(main())
