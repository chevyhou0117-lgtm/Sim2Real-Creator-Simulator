"""本地文件存储服务（替代原 MinIO 客户端）。

类名 / 方法名沿用历史的 MinioManagerService，底层改为本地文件系统操作，
存储根 = config.MinioConfig.minioConfig.storage_root（AIFACTORY_STORAGE_ROOT）。

object_name 语义不变：相对存储根的路径（如 thumbnails/xxx.png）。
build_full_url / generate_presigned_url 返回 /static 前缀的 HTTP URL（浏览器可直接 <img src>）。
"""
import os
import shutil
import logging
from datetime import datetime
from typing import List, Optional

from fastapi import UploadFile, File

from common.ErrorCode import ErrorCode
from config.MinioConfig import minioConfig
from exception.ExceptionClass import BusinessException
from commonutils.GenerateFileNameUtils import generate_date_filename
from commonutils.Logs import init_logging
from commonutils.StoragePathUtils import resolve_path_within_root

init_logging()
logger = logging.getLogger(__name__)


class MinioManagerService:
    """本地文件存储管理。所有路径以 storage_root 为根；URL 以 static_base 为前缀。"""

    def __init__(self):
        self.storage_root = minioConfig.storage_root
        self.static_base = minioConfig.static_base
        self.asset_library_root = minioConfig.asset_library_root  # USD 资产库根（下载用）
        self.bucket_name = minioConfig.bucket_name  # 兼容历史属性，本地化后为 ""
        self.minio_client = None  # 不再有客户端

    # ── 路径工具 ─────────────────────────────────────────────────────────────
    def _local_path(self, object_name: str) -> str:
        return resolve_path_within_root(self.storage_root, object_name)

    def build_full_url(self, object_name: str, bucket_name: Optional[str] = None) -> str:
        """返回 /static 前缀的访问 URL（浏览器用）。"""
        rel = (object_name or "").replace("\\", "/").lstrip("/")
        return f"{self.static_base}/{rel}"

    def generate_presigned_url(
        self,
        object_name: str,
        expires_seconds: int = 3600,
        bucket_name: Optional[str] = None,
    ) -> str:
        """本地存储无签名概念；返回 /static URL（与 build_full_url 等价）。"""
        return self.build_full_url(object_name)

    # ── 写入 ─────────────────────────────────────────────────────────────────
    async def upload_file(self, file: UploadFile = File(...)):
        try:
            unique_filename, file_type = generate_date_filename(file.filename)
            logger.info(f"上传文件生成别名：{unique_filename}，类型：{file_type}")
            file_content = await file.read()
            dest = self._local_path(unique_filename)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(file_content)
            return {
                "filename": unique_filename,
                "originalFilename": file.filename,
                "contentType": file.content_type,
                "fileSize": len(file_content),
                "fileType": file_type,
                "bucketName": self.bucket_name,
                "objectName": unique_filename,
                "minioVersionId": None,
                "minioEtag": None,
            }
        except Exception as e:
            logger.error(f"[Error in upload_file: {e}]")
            raise BusinessException(ErrorCode.SYSTEM_ERROR, extra_msg=f"上传文件失败： {e}")

    async def upload_file_to_path(self, file: UploadFile, object_name: str) -> dict:
        try:
            file_content = await file.read()
            dest = self._local_path(object_name)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(file_content)
            logger.info(f"[LocalStore] write → {dest}")
            return {
                "object_name": object_name,
                "original_filename": file.filename,
                "file_size": len(file_content),
                "content_type": file.content_type or "application/octet-stream",
                "bucket_name": self.bucket_name,
                "etag": None,
            }
        except Exception as e:
            logger.error(f"[Error in upload_file_to_path: {e}]")
            raise BusinessException(ErrorCode.OPERATION_ERROR, extra_msg=f"写入指定路径失败: {e}")

    def upload_bytes_to_path(
        self,
        data: bytes,
        object_name: str,
        content_type: str = "application/octet-stream",
    ) -> dict:
        try:
            dest = self._local_path(object_name)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(data)
            logger.info(f"[LocalStore] write bytes → {dest}")
            return {
                "object_name": object_name,
                "original_filename": object_name.split("/")[-1],
                "file_size": len(data),
                "content_type": content_type,
                "bucket_name": self.bucket_name,
                "etag": None,
            }
        except Exception as e:
            logger.error(f"[Error in upload_bytes_to_path: {e}]")
            raise BusinessException(ErrorCode.OPERATION_ERROR, extra_msg=f"字节写入失败: {e}")

    async def upload_multiple_files(self, files: List[UploadFile] = File(...)):
        results = []
        for file in files:
            try:
                results.append(await self.upload_file(file))
            except Exception as e:
                logger.error(f"[Error in upload_multiple_files: {e}]")
                raise BusinessException(ErrorCode.OPERATION_ERROR, extra_msg=f"上传多个文件失败！")
        return {"records": results}

    async def upload_thumbnail_file(self, file: UploadFile) -> str:
        """缩略图落到 storage_root/thumbnails/，返回相对 object name（thumbnails/xxx）。"""
        try:
            unique_filename, _ = generate_date_filename(file.filename)
            object_name = f"thumbnails/{unique_filename}"
            file_content = await file.read()
            dest = self._local_path(object_name)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(file_content)
            logger.info(f"缩略图保存成功: {dest}")
            return object_name
        except Exception as e:
            logger.error(f"[Error in upload_thumbnail_file]: {e}")
            raise BusinessException(ErrorCode.OPERATION_ERROR, extra_msg=f"缩略图保存失败: {e}")

    # ── 读取 ─────────────────────────────────────────────────────────────────
    async def download_file(self, filename: str):
        try:
            with open(self._local_path(filename), "rb") as f:
                return {"filename": filename, "file_data": f.read()}
        except Exception as e:
            logger.error(f"[Error in download_file: {e}]")
            raise BusinessException(ErrorCode.OPERATION_ERROR, extra_msg=f"下载文件失败")

    async def read_file_content(self, bucketName: str, filename: str) -> bytes:
        try:
            with open(self._local_path(filename), "rb") as f:
                return f.read()
        except Exception as e:
            logger.error(f"[Error in read_file_content: {e}]")
            raise BusinessException(ErrorCode.OPERATION_ERROR, extra_msg=f"获取文件内容失败")

    # ── 资产库（USD 模型文件夹）读取：基于 asset_library_root，用于下载打包 ──────────
    def _asset_library_path(self, object_name: str) -> str:
        return resolve_path_within_root(self.asset_library_root, object_name)

    def list_objects_by_prefix(self, prefix: str) -> List[str]:
        """列出资产库根下 prefix（目录前缀）下的所有文件，返回相对资产库根的 key 列表（正斜杠）。"""
        base = self._asset_library_path(prefix)
        keys: List[str] = []
        if os.path.isdir(base):
            for r, _, fnames in os.walk(base):
                for fn in fnames:
                    full = os.path.join(r, fn)
                    rel = os.path.relpath(full, self.asset_library_root).replace("\\", "/")
                    keys.append(rel)
        return keys

    def get_object_bytes(self, key: str) -> bytes:
        """读取资产库根下 key 的字节。"""
        with open(self._asset_library_path(key), "rb") as f:
            return f.read()

    async def list_files(self):
        try:
            files = []
            for root, _, fnames in os.walk(self.storage_root):
                for fn in fnames:
                    full = os.path.join(root, fn)
                    rel = os.path.relpath(full, self.storage_root).replace("\\", "/")
                    st = os.stat(full)
                    files.append({
                        "filename": rel,
                        "size": st.st_size,
                        "content_type": None,
                        "last_modified": datetime.fromtimestamp(st.st_mtime),
                    })
            return {"records": files}
        except Exception as e:
            logger.error(f"[Error in list_files: {e}]")
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"获取所有文件失败！")

    async def get_file_info(self, filename: str):
        try:
            full = self._local_path(filename)
            st = os.stat(full)
            return {
                "filename": filename,
                "size": st.st_size,
                "content_type": None,
                "last_modified": datetime.fromtimestamp(st.st_mtime),
            }
        except Exception as e:
            logger.error(f"[Error in get_file_info: {e}]")
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"获取某一个文件失败！")

    # ── 删除 ─────────────────────────────────────────────────────────────────
    async def delete_file(self, filename: str):
        try:
            full = self._local_path(filename)
            if os.path.exists(full):
                os.remove(full)
            logger.info(f"File '{filename}' 删除成功！")
        except Exception as e:
            logger.error(f"[Error in delete_file: {e}]")
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"删除文件失败！")

    async def delete_files_by_prefix(self, prefix: str) -> int:
        try:
            base = self._local_path(prefix)
            deleted = 0
            if os.path.isdir(base):
                for root, _, fnames in os.walk(base):
                    for fn in fnames:
                        os.remove(os.path.join(root, fn))
                        deleted += 1
                shutil.rmtree(base, ignore_errors=True)
            elif os.path.isfile(base):
                os.remove(base)
                deleted = 1
            logger.info(f"前缀 '{prefix}' 下共删除 {deleted} 个文件")
            return deleted
        except Exception as e:
            logger.error(f"[Error in delete_files_by_prefix: {e}]")
            raise BusinessException(ErrorCode.OPERATION_ERROR, extra_msg=f"批量删除文件失败: {e}")
