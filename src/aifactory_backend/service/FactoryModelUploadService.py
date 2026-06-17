"""
工厂模型 ZIP 上传服务

ZIP 目录约定：
  <folder_name>/
  ├── <folder_name>_V01.usd          # 工厂入口 USD（存入 FACTORY 根节点 3D 模型）
  ├── Data/
  │   ├── Assembly/
  │   │   └── a_<name>.csv           # 列：Line_name, Line_id（无表头，每行一条线体）
  │   └── ProdLine/
  │       └── <Line_name>.csv        # 每个 Line_name 对应一个 CSV，含设备列表
  └── ProdLine/
      └── ...                       # 线体/设备 USD 文件

处理流程：
  1. 解压 ZIP，读取全部文件到内存
  2. 上传所有文件到 MinIO（以 ZIP 根目录名为顶级文件夹，如 MBD_NV/MBD_NV_V01.usd）
  3. 解析 Data/Assembly/*.csv → 线体列表（每行 = Line_name, Line_id）
  4. 对每条线体，根据 Line_name 查找 Data/ProdLine/{Line_name}.csv → 设备列表
  5. 查找 project_id 对应的 default_stage 节点（type=STAGE, code=default_stage）
  6. 创建 LINE 节点 + FactoryLineDetails + FactoryAsset3dModel
  7. 在每个 LINE 下创建 EQUIPMENT 节点 + FactoryEquipmentDetails + FactoryAsset3dModel
  8. 为 FACTORY 根节点写入入口 USD 3D 模型记录
  9. Commit
"""

import asyncio
import csv
import io
import logging
import zipfile
from typing import Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from commonutils.Logs import init_logging
from config.MinioConfig import minioConfig
from exception.ExceptionClass import BusinessException
from models.entity.FactoryAsset3dModelEntity import FactoryAsset3dModel
from models.entity.FactoryAssetNodeEntity import FactoryAssetNode
from models.entity.FactoryEquipmentDetailsEntity import FactoryEquipmentDetails
from models.entity.FactoryLineDetailsEntity import FactoryLineDetails
from models.entity.FactoryProcessDetailsEntity import FactoryProcessDetails
from models.entity.FactoryProjectEntity import FactoryProject
from models.entity.FactoryProjectVersionEntity import FactoryProjectVersion
from models.enums.BindStatusEnum import BindStatus
from models.enums.InstanceAssetTypeEnum import InstanceAssetType
from service.MinioService import MinioManagerService

init_logging()
logger = logging.getLogger(__name__)


class FactoryModelUploadService:

    def __init__(self):
        self.minio = MinioManagerService()

    async def _check_folder_name_duplicate(
        self,
        project_id: int,
        folder_name: str,
        db: AsyncSession,
    ) -> None:
        """
        校验上传的文件夹名是否与项目已有工厂建模文件重名。
        通过查询 factory_asset_3d_model 中 FACTORY 根节点的 root_usd_path 进行比对：
          - root_usd_path 格式为 "MBD_NV_V1/MBD_NV_V1_V01.usd"
          - 提取中间文件夹名（如 "MBD_NV_V1"）与当前 folder_name 比较
        若重名则抛出 BusinessException。
        """
        # 查找项目的 FACTORY 根节点
        factory_root_result = await db.execute(
            select(FactoryAssetNode).where(
                FactoryAssetNode.factory_projects_id == project_id,
                FactoryAssetNode.type == InstanceAssetType.FACTORY.value,
                FactoryAssetNode.is_deleted == False,
            )
        )
        factory_root = factory_root_result.scalar_one_or_none()
        if factory_root is None:
            return  # 无 FACTORY 根节点，无需校验

        # 查找该根节点下所有 3D 模型记录的 root_usd_path
        model_result = await db.execute(
            select(FactoryAsset3dModel.root_usd_path).where(
                FactoryAsset3dModel.factory_asset_id == factory_root.id,
                FactoryAsset3dModel.is_deleted == False,
            )
        )
        existing_paths = [row[0] for row in model_result.all() if row[0]]

        # 从 root_usd_path 提取文件夹名
        # root_usd_path 如 "MBD_NV_V1/MBD_NV_V1_V01.usd" → 提取 "MBD_NV_V1"
        for path in existing_paths:
            # 去掉文件名（最后一段含 .usd 后缀的），取上级文件夹名
            parts = path.strip("/").split("/")
            if len(parts) >= 2:
                # parts[-1] 是文件名 "MBD_NV_V1_V01.usd"，parts[-2] 是文件夹名 "MBD_NV_V1"
                existing_folder = parts[-2]
            else:
                # 兼容只有一段的情况
                existing_folder = parts[0]
            if existing_folder == folder_name:
                raise BusinessException(
                    ErrorCode.PARAMS_ERROR,
                    extra_msg=f"已存在相同名称的工厂建模文件: {folder_name}，不允许重复上传",
                )

    async def _ensure_factory_skeleton(
        self,
        project_id: int,
        factory_name: str,
        db: AsyncSession,
    ) -> FactoryAssetNode:
        """确保项目存在 FACTORY 根节点 + default_stage 节点（缺失则补建），返回 default_stage。

        上传依赖项目预置「FACTORY 根 + default_stage」骨架：全新工厂建项目时已预置，但
        「有基线」复制了空树、或历史遗留项目可能缺失。此处自愈补齐，使上传不再依赖建项目流程。
        节点 version_id 取项目 current_version_id（兜底取最新版本）。
        """
        proj = (await db.execute(
            select(FactoryProject).where(FactoryProject.project_id == project_id).limit(1)
        )).scalar_one_or_none()
        if proj is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"工厂项目不存在: project_id={project_id}")
        version_id = proj.current_version_id
        if not version_id:
            version_id = (await db.execute(
                select(FactoryProjectVersion.version_id)
                .where(FactoryProjectVersion.project_id == project_id)
                .order_by(FactoryProjectVersion.version_number.desc())
                .limit(1)
            )).scalar_one_or_none()
        if not version_id:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"项目无可用版本: project_id={project_id}")

        # FACTORY 根节点（缺则建）
        root = (await db.execute(
            select(FactoryAssetNode).where(
                FactoryAssetNode.factory_projects_id == project_id,
                FactoryAssetNode.type == InstanceAssetType.FACTORY.value,
                FactoryAssetNode.is_deleted == False,
            ).limit(1)
        )).scalar_one_or_none()
        if root is None:
            root = FactoryAssetNode(
                factory_projects_id=project_id,
                version_id=version_id,
                name=factory_name,
                type=InstanceAssetType.FACTORY.value,
                parent_id=None,
                bind_status=BindStatus.UNBOUND.value,
            )
            db.add(root)
            await db.flush()
            logger.info(f"[FactoryUpload] 自愈补建 FACTORY 根节点: id={root.id}, name={factory_name}")

        # default_stage 默认制程节点（缺则建）
        default_stage = (await db.execute(
            select(FactoryAssetNode).where(
                FactoryAssetNode.factory_projects_id == project_id,
                FactoryAssetNode.type == InstanceAssetType.STAGE.value,
                FactoryAssetNode.code == "default_stage",
                FactoryAssetNode.is_deleted == False,
            ).limit(1)
        )).scalar_one_or_none()
        if default_stage is None:
            default_stage = FactoryAssetNode(
                factory_projects_id=project_id,
                version_id=version_id,
                name="default_stage",
                code="default_stage",
                type=InstanceAssetType.STAGE.value,
                parent_id=root.id,
                bind_status=BindStatus.UNBOUND.value,
            )
            db.add(default_stage)
            await db.flush()
            db.add(FactoryProcessDetails(factory_asset_id=default_stage.id, ref_id=None))
            await db.flush()
            logger.info(f"[FactoryUpload] 自愈补建 default_stage 节点: id={default_stage.id}")

        return default_stage

    async def upload_factory_model(
        self,
        project_id: int,
        file_bytes: bytes,
        db: AsyncSession,
    ) -> Dict:
        """
        上传工厂模型 ZIP，完成解压 → MinIO 上传 → CSV 解析 → 资产树节点写入。
        :param project_id:  目标工厂项目 ID（用于查找 FACTORY 根节点和 default_stage 节点）
        :param file_bytes:  ZIP 文件字节内容
        :param db:          异步数据库会话
        :return:            统计信息字典
        """
        try:
            # 阶段1：解压 ZIP
            try:
                zf_obj = zipfile.ZipFile(io.BytesIO(file_bytes))
            except zipfile.BadZipFile:
                raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="上传文件不是合法的 ZIP 压缩包")
            with zf_obj as zf:
                all_names = zf.namelist()
                root_dir = _get_zip_root_dir(all_names)
                if not root_dir:
                    raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ZIP 文件结构异常：未找到根目录")

                folder_name = root_dir.rstrip("/")       # e.g. "MBD"
                folder_00   = f"{folder_name}_V01"       # e.g. "MBD_V01"（USD prim 根标识）

                file_entries: List[Tuple[str, bytes]] = []
                for name in all_names:
                    if name.endswith("/"):
                        continue
                    file_entries.append((name, zf.read(name)))

            all_names_flat = [n for n, _ in file_entries]
            logger.info(f"[FactoryUpload] ZIP 解压完成: folder={folder_name}, 文件数={len(file_entries)}")

            # 阶段1.5：校验文件夹名是否与已有工厂建模文件重名
            await self._check_folder_name_duplicate(project_id, folder_name, db)

            # 阶段2：上传所有文件到 MinIO
            minio_entries: List[Tuple[str, bytes]] = [
                (name, data)
                for name, data in file_entries
            ]
            uploaded_count = await asyncio.to_thread(
                _batch_upload_to_minio, self.minio, minio_entries
            )
            logger.info(f"[FactoryUpload] MinIO 上传完成: 共 {uploaded_count} 个文件")

            # 阶段3：定位工厂入口 USD  <folder_name>_00.usd
            factory_entry_usd_name   = f"{folder_00}.usd"
            factory_entry_usd_minio: Optional[str] = None
            for name in all_names_flat:
                # 支持在根目录直接出现，或者在任意子目录下
                if name.endswith(factory_entry_usd_name):
                    factory_entry_usd_minio = name
                    break
            logger.info(f"[FactoryUpload] 工厂入口 USD: {factory_entry_usd_minio}")

            # 阶段4：解析 Data/Assembly/*.csv
            assembly_map = _collect_assembly_csv(
                file_entries,
                f"{root_dir}Data/Assembly/",
                log_tag="FactoryUpload",
            )
            # 阶段5：解析 Data/ProdLine/*.csv
            prodline_map = _collect_prodline_csv(
                file_entries,
                f"{root_dir}Data/ProdLine/",
                log_tag="FactoryUpload",
            )

            # 阶段6：查找 default_stage 节点
            ds_result = await db.execute(
                select(FactoryAssetNode).where(
                    FactoryAssetNode.factory_projects_id == project_id,
                    FactoryAssetNode.type == InstanceAssetType.STAGE.value,
                    FactoryAssetNode.code == "default_stage",
                    FactoryAssetNode.is_deleted == False,
                ).limit(1)
            )
            default_stage = ds_result.scalar_one_or_none()
            if default_stage is None:
                # 项目缺少 default_stage（全新工厂未预置 / 有基线但复制了空树 / 历史遗留项目）：
                # 自愈补建 FACTORY 根 + default_stage，使上传不依赖建项目时的骨架预置。
                logger.info(f"[FactoryUpload] 项目 {project_id} 缺少 default_stage，自愈补建骨架")
                default_stage = await self._ensure_factory_skeleton(project_id, folder_name, db)
            project_id = default_stage.factory_projects_id

            # 阶段7：查找 FACTORY 根节点，写入入口 USD
            factory_root_result = await db.execute(
                select(FactoryAssetNode).where(
                    FactoryAssetNode.factory_projects_id == project_id,
                    FactoryAssetNode.type == InstanceAssetType.FACTORY.value,
                    FactoryAssetNode.is_deleted == False,
                ).limit(1)
            )
            factory_root = factory_root_result.scalar_one_or_none()
            if factory_root and factory_entry_usd_minio:
                db.add(FactoryAsset3dModel(
                    factory_asset_id=factory_root.id,
                    usd_name=factory_entry_usd_name,
                    root_usd_path=_to_host_abs(factory_entry_usd_minio),
                    bucket_name=minioConfig.bucket_name,
                    prim_path=f"/{folder_00}",
                    location_path=f"/{folder_00}",
                ))
                await db.flush()
                logger.info(f"[FactoryUpload] 工厂入口 USD 已记录: {factory_entry_usd_minio}")
            # 阶段8：遍历 Assembly CSV → 创建 LINE / EQUIPMENT 节点
            total_lines   = 0
            total_equips  = 0

            for assembly_csv_stem, line_list in assembly_map.items():

                for line_name, line_id in line_list:
                    if not line_name:
                        continue
                    # 8.1 构建 LINE prim_path（assembly_csv_stem 为 Assembly CSV 文件名不含 .csv 后缀）
                    line_prim = _build_line_prim_path(assembly_csv_stem, line_id, line_name)
                    # 8.2 查找线体 USD 文件
                    line_usd_minio: Optional[str] = _find_line_usd_minio(
                        all_names_flat, root_dir, assembly_csv_stem, line_name, line_id
                    )

                    # 8.3 创建 LINE 节点
                    line_node = FactoryAssetNode(
                        factory_projects_id=project_id,
                        version_id=default_stage.version_id,
                        name=line_name,
                        code=line_id if line_id else line_name,
                        type=InstanceAssetType.LINE.value,
                        parent_id=default_stage.id,
                        bind_status=BindStatus.UNBOUND.value,
                    )
                    db.add(line_node)
                    await db.flush()

                    # 8.4 创建 FactoryLineDetails
                    db.add(FactoryLineDetails(
                        factory_asset_id=line_node.id,
                        ref_id=None,
                    ))
                    await db.flush()

                    # 8.5 创建 LINE 3D 模型记录
                    db.add(FactoryAsset3dModel(
                        factory_asset_id=line_node.id,
                        usd_name=f"{line_name}.usd",
                        root_usd_path=_to_host_abs(line_usd_minio or factory_entry_usd_minio or ""),
                        bucket_name=minioConfig.bucket_name,
                        prim_path=line_prim,
                        location_path="/World",
                    ))
                    await db.flush()

                    total_lines += 1
                    logger.info(f"[FactoryUpload] LINE 节点已创建: name={line_name}, prim={line_prim}")

                    # 8.6 根据 Line_name 查找对应 ProdLine CSV 获取设备列表
                    equip_rows = prodline_map.get(line_name, [])

                    for eq in equip_rows:
                        eq_name = eq.get("equipment_name", "").strip()
                        eq_id   = eq.get("equipment_id",   "").strip()
                        if not eq_name:
                            continue

                        # 8.7 构建 EQUIPMENT prim_path
                        eq_prim = _build_equipment_prim_path(
                            assembly_csv_stem, line_id, line_name, eq_id, eq_name
                        )

                        # 8.8 创建 EQUIPMENT 节点
                        eq_node = FactoryAssetNode(
                            factory_projects_id=project_id,
                            version_id=default_stage.version_id,
                            name=eq_name,
                            code=eq_id if eq_id else eq_name,
                            type=InstanceAssetType.EQUIPMENT.value,
                            parent_id=line_node.id,
                            bind_status=BindStatus.UNBOUND.value,
                        )
                        db.add(eq_node)
                        await db.flush()

                        # 8.9 创建 FactoryEquipmentDetails
                        db.add(FactoryEquipmentDetails(
                            factory_asset_id=eq_node.id,
                            ref_id=None,
                        ))
                        await db.flush()

                        # 8.10 创建 EQUIPMENT 3D 模型记录
                        db.add(FactoryAsset3dModel(
                            factory_asset_id=eq_node.id,
                            usd_name=eq_name,
                            root_usd_path=_to_host_abs(factory_entry_usd_minio or ""),
                            bucket_name=minioConfig.bucket_name,
                            prim_path=eq_prim,
                            location_path="/World",
                        ))
                        await db.flush()

                        total_equips += 1
                        logger.info(f"[FactoryUpload] EQUIPMENT 节点已创建: name={eq_name}, prim={eq_prim}")


            # 阶段9：提交事务
            await db.commit()
            logger.info(
                f"[FactoryUpload] 完成: folder={folder_name}, "
                f"uploaded={uploaded_count}, lines={total_lines}, equipments={total_equips}"
            )
            return {
                "folder_name":       folder_name,
                "uploaded_files":    uploaded_count,
                "lines_created":     total_lines,
                "equipments_created": total_equips,
                "factory_usd":       factory_entry_usd_minio,
            }

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[FactoryUpload] 异常: {e}", exc_info=True)
            raise BusinessException(ErrorCode.SYSTEM_ERROR, extra_msg=f"工厂模型上传失败: {e}")

    async def upload_omniverse_usd(
        self,
        project_id: int,
        file_bytes: bytes,
        db: AsyncSession,
    ) -> Dict:
        """
        上传 Omniverse USD ZIP，逻辑与 upload_factory_model 一致：
          - 解压 ZIP，自动发现工厂数据文件夹（包含 Data/Assembly/ 的顶层文件夹）
          - 将全部文件上传到 MinIO（直接以 ZIP 路径上传，无额外前缀）
          - 工厂入口 USD（<folder_name>_V01.usd）写入 FACTORY 根节点 3D 模型记录
          - 解析 <factory_folder>/Data/Assembly/*.csv → 线体列表
          - 解析 <factory_folder>/Data/ProdLine/*.csv  → 设备列表
          - 在 default_stage 节点下创建 LINE / EQUIPMENT 节点

        :param project_id:  目标工厂项目 ID（用于查找 FACTORY 根节点和 default_stage 节点）

        ZIP 结构约定（2个顶层文件夹）：
          ├── Houston_F_NV/              # 工厂数据文件夹（名称不固定，自动发现）
          │   ├── Houston_F_NV_V01.usd   # 工厂入口 USD
          │   ├── Data/
          │   │   ├── Assembly/*.csv
          │   │   └── ProdLine/*.csv
          │   └── ProdLine/              # 线体/设备 USD 文件
          └── Library/                   # 资产库文件
        """
        try:
            # 阶段1：解压 ZIP
            try:
                zf_obj = zipfile.ZipFile(io.BytesIO(file_bytes))
            except zipfile.BadZipFile:
                raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="上传文件不是合法的 ZIP 压缩包")

            with zf_obj as zf:
                all_names = zf.namelist()
                file_entries: List[Tuple[str, bytes]] = []
                for name in all_names:
                    if name.endswith("/"):
                        continue
                    file_entries.append((name, zf.read(name)))

            all_names_flat = [n for n, _ in file_entries]
            logger.info(f"[OmniverseUpload] ZIP 解压完成: 文件数={len(file_entries)}")

            # 阶段1.5：自动发现工厂数据文件夹（包含 Data/Assembly/ 的文件夹）
            factory_folder_prefix: Optional[str] = None
            factory_folder_name: Optional[str] = None
            for name in all_names_flat:
                idx = name.find("/Data/Assembly/")
                if idx != -1:
                    factory_folder_prefix = name[:idx + 1]  # e.g. "Houston_F_NV/"
                    # 提取文件夹名（取最后一段路径）
                    factory_folder_name = factory_folder_prefix.rstrip("/").rsplit("/", 1)[-1]
                    break
            if not factory_folder_prefix or not factory_folder_name:
                raise BusinessException(
                    ErrorCode.PARAMS_ERROR,
                    extra_msg="ZIP 中未找到包含 Data/Assembly/ 的工厂数据文件夹，请检查 ZIP 结构",
                )
            folder_00 = f"{factory_folder_name}_V01"
            logger.info(
                f"[OmniverseUpload] 工厂数据文件夹: name={factory_folder_name}, prefix={factory_folder_prefix}"
            )

            # 校验文件夹名是否与已有工厂建模文件重名
            await self._check_folder_name_duplicate(project_id, factory_folder_name, db)

            # 阶段2：上传所有文件到 MinIO（直接以 ZIP 路径上传，无额外前缀）
            minio_entries: List[Tuple[str, bytes]] = [
                (name, data) for name, data in file_entries
            ]
            uploaded_count = await asyncio.to_thread(
                _batch_upload_to_minio, self.minio, minio_entries
            )
            logger.info(f"[OmniverseUpload] MinIO 上传完成: 共 {uploaded_count} 个文件")

            # 阶段3：定位工厂入口 USD（<folder_name>_V01.usd）
            factory_entry_usd_name = f"{folder_00}.usd"
            factory_entry_usd_minio: Optional[str] = None
            for name in all_names_flat:
                if name.endswith(factory_entry_usd_name):
                    factory_entry_usd_minio = name
                    break
            logger.info(f"[OmniverseUpload] 工厂入口 USD: {factory_entry_usd_minio}")

            # 阶段4：解析 Data/Assembly/*.csv
            assembly_map = _collect_assembly_csv(
                file_entries,
                f"{factory_folder_prefix}Data/Assembly/",
                log_tag="OmniverseUpload",
            )

            # 阶段5：解析 Data/ProdLine/*.csv
            prodline_map = _collect_prodline_csv(
                file_entries,
                f"{factory_folder_prefix}Data/ProdLine/",
                log_tag="OmniverseUpload",
            )

            # 阶段6：查找 default_stage 节点
            ds_result = await db.execute(
                select(FactoryAssetNode).where(
                    FactoryAssetNode.factory_projects_id == project_id,
                    FactoryAssetNode.type == InstanceAssetType.STAGE.value,
                    FactoryAssetNode.code == "default_stage",
                    FactoryAssetNode.is_deleted == False,
                ).limit(1)
            )
            default_stage = ds_result.scalar_one_or_none()
            if default_stage is None:
                logger.info(f"[OmniverseUpload] 项目 {project_id} 缺少 default_stage，自愈补建骨架")
                default_stage = await self._ensure_factory_skeleton(project_id, factory_folder_name, db)
            project_id = default_stage.factory_projects_id

            # ── 阶段7：查找 FACTORY 根节点，写入入口 USD
            factory_root_result = await db.execute(
                select(FactoryAssetNode).where(
                    FactoryAssetNode.factory_projects_id == project_id,
                    FactoryAssetNode.type == InstanceAssetType.FACTORY.value,
                    FactoryAssetNode.is_deleted == False,
                ).limit(1)
            )
            factory_root = factory_root_result.scalar_one_or_none()
            if factory_root and factory_entry_usd_minio:
                db.add(FactoryAsset3dModel(
                    factory_asset_id=factory_root.id,
                    usd_name=factory_entry_usd_name,
                    root_usd_path=_to_host_abs(factory_entry_usd_minio),
                    bucket_name=minioConfig.bucket_name,
                    prim_path=f"/{folder_00}",
                    location_path=f"/{folder_00}",
                ))
                await db.flush()
                logger.info(f"[OmniverseUpload] 工厂入口 USD 已记录: {factory_entry_usd_minio}")

            #  阶段8：遍历 Assembly CSV → 创建 LINE / EQUIPMENT 节点
            total_lines  = 0
            total_equips = 0

            for assembly_csv_stem, line_list in assembly_map.items():

                for line_name, line_id in line_list:
                    if not line_name:
                        continue

                    line_prim = _build_line_prim_path(assembly_csv_stem, line_id, line_name)

                    # 查找线体 USD
                    line_usd_minio: Optional[str] = _find_line_usd_minio(
                        all_names_flat, factory_folder_prefix, assembly_csv_stem, line_name, line_id
                    )

                    # 创建 LINE 节点
                    line_node = FactoryAssetNode(
                        factory_projects_id=project_id,
                        version_id=default_stage.version_id,
                        name=line_name,
                        code=line_id if line_id else line_name,
                        type=InstanceAssetType.LINE.value,
                        parent_id=default_stage.id,
                        bind_status=BindStatus.UNBOUND.value,
                    )
                    db.add(line_node)
                    await db.flush()

                    db.add(FactoryLineDetails(
                        factory_asset_id=line_node.id,
                        ref_id=None,
                    ))
                    await db.flush()

                    db.add(FactoryAsset3dModel(
                        factory_asset_id=line_node.id,
                        usd_name=f"{line_name}.usd",
                        root_usd_path=_to_host_abs(line_usd_minio or factory_entry_usd_minio or ""),
                        bucket_name=minioConfig.bucket_name,
                        prim_path=line_prim,
                        location_path="/World",
                    ))
                    await db.flush()

                    total_lines += 1
                    logger.info(f"[OmniverseUpload] LINE 节点已创建: name={line_name}, prim={line_prim}")

                    # 根据 Line_name 查找对应 ProdLine CSV 获取设备列表
                    equip_rows = prodline_map.get(line_name, [])

                    for eq in equip_rows:
                        eq_name = eq.get("equipment_name", "").strip()
                        eq_id   = eq.get("equipment_id",   "").strip()
                        if not eq_name:
                            continue

                        eq_prim = _build_equipment_prim_path(
                            assembly_csv_stem, line_id, line_name, eq_id, eq_name
                        )

                        eq_node = FactoryAssetNode(
                            factory_projects_id=project_id,
                            version_id=default_stage.version_id,
                            name=eq_name,
                            code=eq_id if eq_id else eq_name,
                            type=InstanceAssetType.EQUIPMENT.value,
                            parent_id=line_node.id,
                            bind_status=BindStatus.UNBOUND.value,
                        )
                        db.add(eq_node)
                        await db.flush()

                        db.add(FactoryEquipmentDetails(
                            factory_asset_id=eq_node.id,
                            ref_id=None,
                        ))
                        await db.flush()

                        db.add(FactoryAsset3dModel(
                            factory_asset_id=eq_node.id,
                            usd_name=eq_name,
                            root_usd_path=_to_host_abs(factory_entry_usd_minio or ""),
                            bucket_name=minioConfig.bucket_name,
                            prim_path=eq_prim,
                            location_path="/World",
                        ))
                        await db.flush()

                        total_equips += 1
                        logger.info(f"[OmniverseUpload] EQUIPMENT 节点已创建: name={eq_name}, prim={eq_prim}")

            # ── 阶段9：提交事务
            await db.commit()
            logger.info(
                f"[OmniverseUpload] 完成: folder={factory_folder_name}, "
                f"uploaded={uploaded_count}, lines={total_lines}, equipments={total_equips}"
            )
            return {
                "folderName":       factory_folder_name,
                "uploadedFiles":    uploaded_count,
                "linesCreated":     total_lines,
                "equipmentsCreated": total_equips,
                "factoryUsd":       factory_entry_usd_minio,
            }

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[OmniverseUpload] 异常: {e}", exc_info=True)
            raise BusinessException(ErrorCode.SYSTEM_ERROR, extra_msg=f"Omniverse USD 上传失败: {e}")


def _collect_assembly_csv(
    file_entries: List[Tuple[str, bytes]],
    dir_prefix: str,
    log_tag: str = "Upload",
) -> Dict[str, List[Tuple[str, str]]]:
    """
    扫描指定目录下的所有 Assembly CSV，返回 {csv_stem: [(line_name, line_id), ...]}.

    csv_stem 为 Assembly CSV 文件名（不含 .csv 后缀），
    如 a_L_HST_ Warehouse.csv → key = "a_L_HST_ Warehouse"，
    用于 prim_path 拼接。
    :param file_entries:  ZIP 文件条目列表 [(zip_path, bytes), ...]
    :param dir_prefix:    Assembly CSV 目录前缀，如 "MBD/Data/Assembly/"
    :param log_tag:       日志标识前缀，如 "FactoryUpload" / "OmniverseUpload"
    """
    result: Dict[str, List[Tuple[str, str]]] = {}
    for name, data in file_entries:
        if not name.startswith(dir_prefix) or not name.lower().endswith(".csv"):
            continue
        rel = name[len(dir_prefix):]
        if "/" in rel:  # 跳过子目录
            continue
        csv_stem = rel[:-4] if rel.lower().endswith(".csv") else rel
        lines = _parse_assembly_csv(data)
        result[csv_stem] = lines
        logger.info(f"[{log_tag}] Assembly CSV [{csv_stem}]: {len(lines)} 条线体")
    return result


def _collect_prodline_csv(
    file_entries: List[Tuple[str, bytes]],
    dir_prefix: str,
    log_tag: str = "Upload",
) -> Dict[str, List[Dict]]:
    """
    扫描指定目录下的所有 ProdLine CSV，返回 {csv_stem: [{line_ref, equipment_name, ...}, ...]}.
    :param file_entries:  ZIP 文件条目列表 [(zip_path, bytes), ...]
    :param dir_prefix:    ProdLine CSV 目录前缀，如 "MBD/Data/ProdLine/"
    :param log_tag:       日志标识前缀，如 "FactoryUpload" / "OmniverseUpload"
    """
    result: Dict[str, List[Dict]] = {}
    for name, data in file_entries:
        if not name.startswith(dir_prefix) or not name.lower().endswith(".csv"):
            continue
        rel = name[len(dir_prefix):]
        if "/" in rel:  # 跳过子目录
            continue
        csv_stem = rel[:-4] if rel.lower().endswith(".csv") else rel
        equips = _parse_prodline_csv(data)
        result[csv_stem] = equips
        logger.info(f"[{log_tag}] ProdLine CSV [{csv_stem}]: {len(equips)} 条设备")
    return result


def _get_zip_root_dir(names: List[str]) -> str:
    """获取 ZIP 顶级根目录，返回形如 'FolderName/' 的字符串。"""
    for name in names:
        parts = name.split("/")
        if parts[0]:
            return parts[0] + "/"
    return ""


def _to_host_abs(rel_path: str) -> str:
    """zip 内相对路径 → Kit 可直接打开的【宿主绝对路径】（USD_HOST_ROOT + rel）。

    Kit 的 _build_full_url 对绝对路径（C:/... 或 C:\\...）原样打开、绕开其 USD_ROOT，故后端文件
    即便落在与 Kit USD_ROOT 不同的盘也能被 Kit 直接打开。空值 / 已是绝对路径或 URL 则原样返回。
    """
    rel = (rel_path or "").strip()
    if not rel:
        return rel
    if rel.startswith(("http://", "https://", "s3://", "file://", "omniverse://")) or (len(rel) >= 2 and rel[1] == ":"):
        return rel
    return f"{minioConfig.usd_host_root}/{rel.lstrip('/')}"


def _batch_upload_to_minio(
    minio: MinioManagerService,
    entries: List[Tuple[str, bytes]],
) -> int:
    """在线程池中同步批量上传文件到 MinIO。"""
    count = 0
    for object_name, data in entries:
        minio.upload_bytes_to_path(data, object_name)
        count += 1
    return count


def _parse_assembly_csv(data: bytes) -> List[Tuple[str, str]]:
    """
    解析 Assembly CSV，返回 [(line_name, line_id), ...] 列表。
    CSV 格式：无表头，第一列为线体名（Line_name），第二列为线体ID（Line_id）
    示例行：L_MBD_6S,E01
    """
    rows: List[Tuple[str, str]] = []
    try:
        text = data.decode("utf-8-sig")   # 支持 BOM
        reader = csv.reader(io.StringIO(text))
        for line in reader:
            if not line or all(c.strip() == "" for c in line):
                continue
            line_name = line[0].strip() if len(line) > 0 else ""
            line_id   = line[1].strip() if len(line) > 1 else ""
            if line_name:
                rows.append((line_name, line_id))
    except Exception as e:
        logger.warning(f"[FactoryUpload] 解析 Assembly CSV 失败: {e}")
    return rows


def _parse_prodline_csv(data: bytes) -> List[Dict]:
    """
    解析 ProdLine CSV，返回设备行列表。
    CSV 格式（4列，可能含标题行）：
      line_ref  |  equipment_name  |  equipment_id  |  Machine
    """
    rows: List[Dict] = []
    try:
        text = data.decode("utf-8-sig")
        reader = csv.reader(io.StringIO(text))
        for line in reader:
            if not line or all(c.strip() == "" for c in line):
                continue
            # 如果第一行看起来像标题（非数字/路径
            if len(rows) == 0:
                first_cell = line[0].strip()
                if not first_cell.startswith("/") and not any(c.isdigit() for c in first_cell):
                    continue  # header row
            if len(line) >= 3:
                rows.append({
                    "line_ref":       line[0].strip() if len(line) > 0 else "",
                    "equipment_name": line[1].strip() if len(line) > 1 else "",
                    "equipment_id":   line[2].strip() if len(line) > 2 else "",
                    "machine_type":   line[3].strip() if len(line) > 3 else "",
                })
    except Exception as e:
        logger.warning(f"[FactoryUpload] 解析 ProdLine CSV 失败: {e}")
    return rows



def _build_line_prim_path(
    assembly_csv_stem: str,
    line_id: str,
    line_name: str,
) -> str:
    """
    构建线体 prim_path：
      /World/ProdLine/{assembly_csv_stem}/t_id_{line_name}_{line_id}
    assembly_csv_stem 为 Assembly CSV 文件名（不含 .csv 后缀），如 "a_L_HST_ Warehouse"
    """
    return f"/World/ProdLine/{assembly_csv_stem}/t_id_{line_name}_{line_id}"


def _build_equipment_prim_path(
    assembly_csv_stem: str,
    line_id: str,
    line_name: str,
    equip_id: str,
    equip_name: str,
) -> str:
    """
    构建设备 prim_path：
      /World/ProdLine/{assembly_csv_stem}
        /t_id_{line_name}_{line_id}
        /id_{line_name}_{line_id}
        /{line_name}/{line_name}
        /ASSET_PROD/asset_{line_name}_PROD
        /t_id_{equip_name}_{equip_id}
    assembly_csv_stem 为 Assembly CSV 文件名（不含 .csv 后缀）
    """
    return (
        f"/World/ProdLine/{assembly_csv_stem}"
        f"/t_id_{line_name}_{line_id}"
        f"/id_{line_name}_{line_id}"
        f"/{line_name}/{line_name}"
        f"/ASSET_PROD/asset_{line_name}_PROD"
        f"/t_id_{equip_name}_{equip_id}"
    )


def _find_line_usd_minio(
    all_names: List[str],
    root_dir: str,
    assembly_name: str,
    line_name: str,
    line_id: str,
) -> Optional[str]:
    """
    在 ZIP 文件列表中查找线体对应的主 USD 文件，返回 MinIO 路径（直接使用 ZIP 路径，无额外前缀）。
    搜索规则：
      - 优先在 ProdLine/<assembly_name>/ 目录下查找包含 line_name 或 line_id 的 .usd 文件
      - 次选：在整个 ProdLine/ 下匹配
    """
    # 优先搜索 ProdLine/<assembly_name>/ 下
    search_prefix = f"{root_dir}ProdLine/{assembly_name}/"
    for name in all_names:
        if not name.startswith(search_prefix) or not name.lower().endswith(".usd"):
            continue
        rel = name[len(search_prefix):]
        parts = rel.split("/")
        # 检查路径中是否包含 line_name 或 line_id
        if any(
            (line_name and line_name.lower() in p.lower())
            or (line_id and line_id.lower() in p.lower())
            for p in parts
        ):
            return name

    # 次选：整个 ProdLine/ 下
    broad_prefix = f"{root_dir}ProdLine/"
    for name in all_names:
        if not name.startswith(broad_prefix) or not name.lower().endswith(".usd"):
            continue
        filename = name.split("/")[-1]
        stem = filename[:-4] if filename.lower().endswith(".usd") else filename
        if (line_name and line_name.lower() == stem.lower()) or \
           (line_id   and line_id.lower()   == stem.lower()):
            return name

    return None



