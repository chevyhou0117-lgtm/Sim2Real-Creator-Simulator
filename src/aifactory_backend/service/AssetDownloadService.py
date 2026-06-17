import io
import zipfile
import logging
from typing import List, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.entity.EquipmentModelDetailEntity import EquipmentModelDetail
from models.entity.LineModelDetailEntity import LineModelDetail
from models.enums.AssetModelStatusEnum import AssetModelStatus
from models.enums.AssetModelTypeEnum import AssetModelType
from service.MinioService import MinioManagerService

init_logging()
logger = logging.getLogger(__name__)


class AssetDownloadService:
    """
    资产模型文件夹下载服务：
    - 根据 root_usd_path 定位 MinIO 文件夹前缀
    - 将整个文件夹打包为 ZIP 流，ZIP 内路径保留最后 2 个目录层级
    """

    # 内部工具
    @staticmethod
    def _compute_folder_info(root_usd_path: str) -> Tuple[str, str, str]:
        """
        解析 root_usd_path，计算下载所需的三个信息。

        设备规则（路径以 Library/Asset/ 开头）：
          input  : Library/Asset/MBD_NV/FCCATMH100/FCCATMH100.usd
          prefix : Library/Asset/MBD_NV/FCCATMH100/   （.usd 文件所在目录）
          strip  : Library/Asset/                       （固定去除）
          ZIP 内 : MBD_NV/FCCATMH100/...
          文件名 : MBD_NV.zip                           （strip 后首级目录）

        线体规则（路径以 Line_Library/ 开头）：
          input  : Line_Library/ProdLine/L_MBD_6S/L_MBD_6S.usd
          prefix : Line_Library/ProdLine/L_MBD_6S/     （.usd 文件所在目录）
          strip  : （无，保留完整路径）
          ZIP 内 : Line_Library/ProdLine/L_MBD_6S/...
          文件名 : Line_Library.zip

        :return: (folder_prefix, strip_prefix, zip_filename)
        """
        normalized = root_usd_path.replace("\\", "/").strip("/")
        parts = [p for p in normalized.split("/") if p]

        if len(parts) < 2:
            raise BusinessException(
                ErrorCode.PARAMS_ERROR,
                extra_msg=f"root_usd_path 格式不合法（路径层级不足）: {root_usd_path}",
            )

        # 去掉 .usd 文件名，保留目录部分
        dir_parts = parts[:-1]
        folder_prefix = "/".join(dir_parts) + "/"

        # 设备：Library/Asset/{vendor}/{model}/...
        _EQUIP_PREFIX = "Library/Asset/"
        if normalized.startswith(_EQUIP_PREFIX):
            strip_prefix = _EQUIP_PREFIX
            # strip 后首个目录 = vendor（如 MBD_NV）
            after_strip_parts = [p for p in normalized[len(_EQUIP_PREFIX):].split("/") if p]
            zip_filename = after_strip_parts[0] if after_strip_parts else dir_parts[-1]
            return folder_prefix, strip_prefix, zip_filename

        # 线体：Line_Library/ProdLine/{line_name}/...
        _LINE_PREFIX = "Line_Library/"
        if normalized.startswith(_LINE_PREFIX):
            strip_prefix = ""           # 不去除任何前缀，完整保留 Line_Library/*
            zip_filename = "Line_Library"
            return folder_prefix, strip_prefix, zip_filename

        # 兜底：保留最后 2 个目录层级
        if len(dir_parts) >= 2:
            strip_count = len(dir_parts) - 2
            strip_prefix = "/".join(dir_parts[:strip_count]) + "/" if strip_count > 0 else ""
        else:
            strip_prefix = ""
        zip_filename = dir_parts[-1]
        return folder_prefix, strip_prefix, zip_filename

    @staticmethod
    def _get_model_table(asset_type: AssetModelType):
        """返回对应资产类型的表模型"""
        return LineModelDetail if asset_type == AssetModelType.LINE else EquipmentModelDetail

    async def _get_root_usd_path(
            self,
            asset_type: AssetModelType,
            category_id: int,
            db: AsyncSession,
    ) -> str:
        """
        根据 asset_type 和 category_id 查询 root_usd_path。
        同时校验模型状态：只有 ACTIVE 才允许下载。
        """
        table = self._get_model_table(asset_type)
        result = await db.execute(
            select(table.root_usd_path, table.status)
            .where(table.category_id == category_id)
        )
        row = result.first()
        if not row:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"未找到 category_id={category_id} 对应的资产模型",
            )
        path, status = row.root_usd_path, row.status
        if not path:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"category_id={category_id} 的 root_usd_path 为空",
            )
        if status != AssetModelStatus.ACTIVE.value:
            raise BusinessException(
                ErrorCode.OPERATION_ERROR,
                extra_msg=f"当前资产状态为「{status}」，仅激活状态的模型允许下载，请先激活后再下载",
            )
        return path

    def _pack_folders_to_zip(self, root_usd_paths: List[str]) -> Tuple[bytes, str]:
        """
        将多个模型文件夹打包为单一 ZIP。
        每个模型文件夹在 ZIP 内的路径结构：保留最后 2 个目录层级。
        批量时多个模型共存于同一 ZIP，以各自的文件夹名作为一级目录。

        关键约束：
        - 同一 folder_prefix 仅遍历一次（避免不同 category_id 落到同一目录时重复打包）
        - ZIP 内 arc_name 全局去重（避免不同模型计算出同名 arcname 时产生重复条目导致 ZIP 损坏）
        - arcname 强制 UTF-8 编码（flag_bits |= 0x800），防止中文路径解压乱码
        :return: (zip_bytes, zip_filename)
        """
        minio = MinioManagerService()
        buf = io.BytesIO()
        zip_names: List[str] = []
        # 已处理的 MinIO 前缀（防止同一目录多次列举/读取）
        processed_prefixes: set = set()
        # 已写入 ZIP 的 arc_name（防止跨模型路径冲突导致重复条目）
        written_arc_names: set = set()

        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for root_usd_path in root_usd_paths:
                folder_prefix, strip_prefix, model_name = self._compute_folder_info(root_usd_path)
                if model_name not in zip_names:
                    zip_names.append(model_name)

                if folder_prefix in processed_prefixes:
                    logger.info(f"跳过重复前缀（已打包过）: {folder_prefix} ← {root_usd_path}")
                    continue
                processed_prefixes.add(folder_prefix)

                object_keys = minio.list_objects_by_prefix(folder_prefix)
                if not object_keys:
                    logger.warning(
                        f"MinIO 中未找到前缀 '{folder_prefix}' 下的任何文件，跳过: {root_usd_path}"
                    )
                    continue

                for key in object_keys:
                    # 去除 strip_prefix → 得到 ZIP 内相对路径
                    if strip_prefix and key.startswith(strip_prefix):
                        arc_name = key[len(strip_prefix):]
                    else:
                        arc_name = key

                    if arc_name in written_arc_names:
                        logger.warning(f"跳过重复 arcname（已写入 ZIP）: {arc_name} ← {key}")
                        continue
                    written_arc_names.add(arc_name)

                    obj_bytes = minio.get_object_bytes(key)
                    # 显式构造 ZipInfo 并设置 UTF-8 文件名标志位（0x800），避免中文路径乱码
                    info = zipfile.ZipInfo(filename=arc_name)
                    info.compress_type = zipfile.ZIP_DEFLATED
                    info.flag_bits |= 0x800
                    zf.writestr(info, obj_bytes)
                    logger.debug(f"已打包到ZIP: {key} → {arc_name}")
        # with 块关闭后 ZipFile 已完整写入，此时再 seek(0)
        buf.seek(0)
        logger.info(
            f"ZIP 打包完成: 模型数={len(zip_names)}, 文件数={len(written_arc_names)}, 模型列表={zip_names}"
        )

        if len(zip_names) == 1:
            zip_filename = f"{zip_names[0]}.zip"
        else:
            zip_filename = "batch_download.zip"

        return buf.getvalue(), zip_filename

    # 公开接口
    async def download_single(
            self,
            asset_type: AssetModelType,
            category_id: int,
            db: AsyncSession,
    ) -> Tuple[bytes, str]:
        """
        单个资产模型文件夹下载。
        :return: (zip_bytes, zip_filename)
        """
        root_usd_path = await self._get_root_usd_path(asset_type, category_id, db)
        try:
            return self._pack_folders_to_zip([root_usd_path])
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in download_single category_id={category_id}]: {e}")
            raise BusinessException(ErrorCode.OPERATION_ERROR, extra_msg=f"下载资产文件夹失败: {e}")

    async def batch_download(
            self,
            asset_type: AssetModelType,
            category_ids: List[int],
            db: AsyncSession,
    ) -> Tuple[bytes, str]:
        """
        批量资产模型文件夹下载，所有模型合并为单个 ZIP。
        :return: (zip_bytes, zip_filename)
        """
        if not category_ids:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="category_ids 不能为空")

        # 批量查询 root_usd_path + status
        table = self._get_model_table(asset_type)
        result = await db.execute(
            select(table.category_id, table.root_usd_path, table.status)
            .where(table.category_id.in_(category_ids))
        )

        rows = result.fetchall()
        found_map: dict = {}
        for row in rows:
            cid, path, status = row.category_id, row.root_usd_path, row.status
            if status != AssetModelStatus.ACTIVE.value:
                raise BusinessException(
                    ErrorCode.OPERATION_ERROR,
                    extra_msg=f"category_id={cid} 的资产状态为「{status}」，仅激活状态的模型允许下载，请先激活后重试",
                )
            if path:
                found_map[cid] = path

        missing = [cid for cid in category_ids if cid not in found_map]
        if missing:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"以下 category_id 未找到对应的资产模型: {missing}",
            )

        paths = [found_map[cid] for cid in category_ids if found_map.get(cid)]
        if not paths:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg="所有记录的 root_usd_path 均为空，无法下载",
            )

        try:
            return self._pack_folders_to_zip(paths)
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in batch_download category_ids={category_ids}]: {e}")
            raise BusinessException(ErrorCode.OPERATION_ERROR, extra_msg=f"批量下载资产文件夹失败: {e}")
