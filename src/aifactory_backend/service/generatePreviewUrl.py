"""本地化后保留的占位实现（原先用 MinIO 预签名 URL）。

MinIO 已移除，文件改为本地存储并通过 /static 挂载访问。此函数当前无调用方，
仅保留签名以兼容历史 import；返回 /static 前缀的相对 URL。
"""
import os

STATIC_BASE = os.getenv("AIFACTORY_STATIC_BASE", "/static").rstrip("/")


def generate_usd_download_url(bucket_name: str, object_name: str, expires: int = 36000) -> str:
    """返回本地 /static 访问 URL（bucket_name 参数已无意义，保留以兼容签名）。"""
    rel = (object_name or "").replace("\\", "/").lstrip("/")
    return f"{STATIC_BASE}/{rel}"
