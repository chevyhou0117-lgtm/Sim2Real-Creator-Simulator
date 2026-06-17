"""本地文件存储配置（替代原 MinIO）。

用户上传文件与缩略图统一落本地磁盘 AIFACTORY_STORAGE_ROOT，
通过 FastAPI 的 /static 挂载对浏览器提供访问。为减少历史调用点改动，
仍导出 `minioConfig` 符号名，但语义已变为"本地存储"。

环境变量：
  AIFACTORY_STORAGE_ROOT  本地存储根目录（默认 = 本后端目录下的 storage/，跟盘符无关）
  AIFACTORY_STATIC_BASE   对外访问前缀（默认 /static；前端按需 proxy 到 8129）
"""
import os
from dotenv import load_dotenv

# 自己加载 .env，不依赖 import 顺序（否则单独 import 本模块时读不到 AIFACTORY_STORAGE_ROOT）
load_dotenv()

# 默认放在 aifactory_backend/storage（相对本文件计算，迁到任何盘符/机器都不会失效）。
_DEFAULT_STORAGE_ROOT = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "storage"
)
STORAGE_ROOT = os.getenv("AIFACTORY_STORAGE_ROOT") or _DEFAULT_STORAGE_ROOT
STATIC_BASE = os.getenv("AIFACTORY_STATIC_BASE", "/static").rstrip("/")

# USD 资产库根：下载资产模型文件夹时从此根读取。
# DB 里 root_usd_path 形如 Library/Asset/... 和 Line_Library/...，二者与 thumbnails/ 一样都在
# STORAGE_ROOT 下，故默认 = STORAGE_ROOT；如 USD 库单独存放可用 AIFACTORY_ASSET_LIBRARY_ROOT 覆盖。
# 注意：不要指向 Kit 的 P9_animations（那里只有 Library 没有 Line_Library）。
ASSET_LIBRARY_ROOT = os.getenv("AIFACTORY_ASSET_LIBRARY_ROOT") or STORAGE_ROOT

# Kit 端可达的【宿主绝对路径】根：用于给新建项目/上传的工厂 USD 生成【绝对】root_usd_path。
# Kit 的 _build_full_url 对绝对 Windows 路径（C:/... 或 C:\...）原样打开，绕开其 USD_ROOT，
# 故后端文件即便落在与 Kit USD_ROOT 不同的盘，也能被 Kit 直接打开（避免相对路径拼错根的问题）。
#   - 原生运行：STORAGE_ROOT 本身即宿主绝对路径 → 默认 = STORAGE_ROOT。
#   - docker 运行：容器内 STORAGE_ROOT=/data/storage，须用 AIFACTORY_USD_HOST_ROOT 覆盖为宿主真实路径
#     （即 compose 挂载源 AIFACTORY_STORAGE_HOST，如 C:/Workspace/Sim2Real/storage）。
USD_HOST_ROOT = (os.getenv("AIFACTORY_USD_HOST_ROOT") or STORAGE_ROOT).replace("\\", "/").rstrip("/")


class LocalStorageConfig:
    """本地存储配置。属性名沿用旧 MinIO 配置，便于历史调用点平滑过渡。"""

    def __init__(self):
        self.storage_root = STORAGE_ROOT
        self.static_base = STATIC_BASE
        self.asset_library_root = ASSET_LIBRARY_ROOT
        self.usd_host_root = USD_HOST_ROOT
        # 下列属性仅为兼容历史代码保留；本地化后不再用于拼 URL。
        self.bucket_name = ""
        self.minio_endpoint = ""
        self.minio_secure = False

    def get_minio_client(self):
        raise RuntimeError(
            "MinIO 已移除，改为本地文件存储（AIFACTORY_STORAGE_ROOT + /static）。"
            "get_minio_client() 不再可用。"
        )


# 兼容旧 import：from config.MinioConfig import minioConfig
minioConfig = LocalStorageConfig()
