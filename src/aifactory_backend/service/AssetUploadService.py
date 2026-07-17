import asyncio
import io
import logging
import zipfile
from typing import List, Dict, Any, Tuple, Optional

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from commonutils.Logs import init_logging
from commonutils.SnowflakeUtils import generate_snowflake_id
from exception.ExceptionClass import BusinessException
from models.constant.DefaultTypeConstant import DEFAULT_LINE_TYPE_CODE, DEFAULT_EQUIPMENT_TYPE_CODE
from models.constant.ThumbnailConstant import DEFAULT_LINE_THUMBNAIL, DEFAULT_EQUIPMENT_THUMBNAIL
from models.entity.AssetCategoryEntity import AssetCategory
from models.entity.EquipmentModelDetailEntity import EquipmentModelDetail
from models.entity.LineModelDetailEntity import LineModelDetail
from models.entity.LineModelEquipmentRelEntity import LineModelEquipmentRel
from models.enums.CategoryEnum import AssetCategoryType, AssetUploadType
from fastapi import UploadFile
from service.MinioService import MinioManagerService
from config.MinioConfig import minioConfig

init_logging()
logger = logging.getLogger(__name__)

THUMBNAIL_LINE = f"thumbnails/{DEFAULT_LINE_THUMBNAIL}"
THUMBNAIL_EQUIPMENT = f"thumbnails/{DEFAULT_EQUIPMENT_THUMBNAIL}"

# 默认缩略图集合（更新缩略图时，旧图若为默认图则不删除）
_DEFAULT_THUMBNAILS = {
    THUMBNAIL_LINE,
    THUMBNAIL_EQUIPMENT,
    DEFAULT_LINE_THUMBNAIL,
    DEFAULT_EQUIPMENT_THUMBNAIL,
}


class AssetUploadService:

    def __init__(self):
        self.minio = MinioManagerService()

    def get_presigned_url(self, root_usd_path: str, expires_seconds: int = 3600) -> str:
        """
        根据 root_usd_path 生成 MinIO 预签名下载链接。
        :param root_usd_path: USD 文件在 MinIO 中的完整路径
        :param expires_seconds: URL 有效期（秒），默认 3600 秒
        :return: 预签名下载 URL
        """
        return self.minio.generate_presigned_url(root_usd_path, expires_seconds)

    async def update_thumbnail_by_category(
            self,
            thumbnail_type: str,
            category_id: str,
            file: UploadFile,
            db: AsyncSession,
    ) -> Dict[str, Any]:
        """
        根据 type + category_id 更新对应记录的缩略图。
        - line     : 更新 line_model_details（按 category_id，is_deleted==False）的 thumbnail_path
        - equipment: 更新 equipment_model_details（按 category_id，is_current==True，is_deleted==False）的 thumbnail_path
        - process  : 更新 asset_categories（type=process）的 thumbnail_path
        通用：上传新缩略图到本地存储，更新 thumbnail_path，删除旧缩略图（非默认图），返回 {category_id, thumbnail_path: 完整URL}
        """
        normalized = (thumbnail_type or "").strip().lower()
        if not category_id:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="category_id 不能为空")

        if normalized == "line":
            return await self._update_line_thumbnail(category_id, file, db)
        elif normalized == "process":
            return await self._update_process_thumbnail(category_id, file, db)
        elif normalized == "equipment":
            return await self._update_equipment_thumbnail(category_id, file, db)
        else:
            raise BusinessException(
                ErrorCode.PARAMS_ERROR,
                extra_msg=f"不支持的缩略图类型: {thumbnail_type}（仅支持 line / equipment / process）",
            )

    async def _update_line_thumbnail(
            self, category_id: str, file: UploadFile, db: AsyncSession
    ) -> Dict[str, Any]:
        result = await db.execute(
            select(LineModelDetail).where(
                LineModelDetail.category_id == category_id,
                LineModelDetail.is_deleted == False,
            )
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"未找到 category_id={category_id} 的当前激活版本线体模型详情",
            )

        try:
            new_thumbnail_path = await self.minio.upload_thumbnail_file(file)

            old_thumbnail = entity.thumbnail_path
            if old_thumbnail and old_thumbnail not in _DEFAULT_THUMBNAILS:
                try:
                    await self.minio.delete_file(old_thumbnail)
                except Exception as ex:
                    logger.warning(f"删除旧缩略图失败（忽略）: path={old_thumbnail}, err={ex}")

            entity.thumbnail_path = new_thumbnail_path
            await db.commit()
            await db.refresh(entity)

            full_url = self.minio.build_full_url(
                object_name=new_thumbnail_path,
                bucket_name=entity.bucket_name,
            )
            logger.info(f"更新线体模型缩略图成功: category_id={category_id}, path={new_thumbnail_path}")
            return {"category_id": str(category_id), "thumbnail_path": full_url}
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_thumbnail_by_category(line) category_id={category_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新线体模型缩略图失败: {e}")

    async def _update_equipment_thumbnail(
            self, category_id: str, file: UploadFile, db: AsyncSession
    ) -> Dict[str, Any]:
        result = await db.execute(
            select(EquipmentModelDetail).where(
                EquipmentModelDetail.category_id == category_id,
                EquipmentModelDetail.is_current == True,
                EquipmentModelDetail.is_deleted == False,
            )
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"未找到 category_id={category_id} 的当前激活版本设备模型详情",
            )

        try:
            new_thumbnail_path = await self.minio.upload_thumbnail_file(file)

            old_thumbnail = entity.thumbnail_path
            if old_thumbnail and old_thumbnail not in _DEFAULT_THUMBNAILS:
                try:
                    await self.minio.delete_file(old_thumbnail)
                except Exception as ex:
                    logger.warning(f"删除旧缩略图失败（忽略）: path={old_thumbnail}, err={ex}")

            entity.thumbnail_path = new_thumbnail_path
            await db.commit()
            await db.refresh(entity)

            full_url = self.minio.build_full_url(
                object_name=new_thumbnail_path,
                bucket_name=entity.bucket_name,
            )
            logger.info(f"更新设备模型缩略图成功: category_id={category_id}, path={new_thumbnail_path}")
            return {"category_id": str(category_id), "thumbnail_path": full_url}
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_thumbnail_by_category(equipment) category_id={category_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新设备模型缩略图失败: {e}")

    async def _update_process_thumbnail(
            self, category_id: str, file: UploadFile, db: AsyncSession
    ) -> Dict[str, Any]:
        result = await db.execute(
            select(AssetCategory).where(
                AssetCategory.id == category_id,
                AssetCategory.is_deleted == False,
            )
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"未找到 category_id={category_id} 的分类节点",
            )
        if str(entity.type) != AssetCategoryType.PROCESS.value:
            raise BusinessException(
                ErrorCode.PARAMS_ERROR,
                extra_msg=f"category_id={category_id} 对应的节点类型为 '{entity.type}'，不是制程（process）节点",
            )

        try:
            new_thumbnail_path = await self.minio.upload_thumbnail_file(file)

            old_thumbnail = entity.thumbnail_path
            if old_thumbnail and old_thumbnail not in _DEFAULT_THUMBNAILS:
                try:
                    await self.minio.delete_file(old_thumbnail)
                except Exception as ex:
                    logger.warning(f"删除旧缩略图失败（忽略）: path={old_thumbnail}, err={ex}")

            entity.thumbnail_path = new_thumbnail_path
            await db.commit()
            await db.refresh(entity)

            full_url = self.minio.build_full_url(
                object_name=new_thumbnail_path,
                bucket_name=minioConfig.bucket_name,
            )
            logger.info(f"更新制程缩略图成功: category_id={category_id}, path={new_thumbnail_path}")
            return {"category_id": str(category_id), "thumbnail_path": full_url}
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_process_thumbnail category_id={category_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新制程缩略图失败: {e}")

    async def upload_asset(
            self,
            upload_type: AssetUploadType,
            file_bytes: bytes,
            db: AsyncSession,
    ) -> Dict[str, Any]:

        if upload_type in (AssetUploadType.FACTORY, AssetUploadType.LINE):
            # factory = 整厂快照，镜像同步（删除包内未出现的线体）；
            # line    = 单线/部分上传，纯增量（只新增/更新，绝不删除其他线体）。
            return await self._upload_line_asset(
                file_bytes, db, full_sync=(upload_type == AssetUploadType.FACTORY)
            )
        elif upload_type == AssetUploadType.EQUIPMENT_MODEL:
            return await self._upload_equipment_asset(file_bytes, db)
        else:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg=f"不支持的上传类型: {upload_type}")

    # 工厂 / 线体模型
    async def _upload_line_asset(
            self, file_bytes: bytes, db: AsyncSession, *, full_sync: bool
    ) -> Dict[str, Any]:
        """
        处理流程：
        阶段1 - 解压 ZIP，获取线体集合（new_set）
        阶段2 - 批量上传到 MinIO（线程池，不阻塞事件循环）
        阶段3 - 查询数据库已有线体集合（old_set），根据 location_path 匹配
        阶段4 - 遍历 new_set 处理每个线体：
                  ① 查询 asset_category（name + parent_id），存在则复用，不存在则创建
                  ② 处理 line_model_details：存在则更新，不存在则创建
                  ③ 删除该线体下所有旧关系，根据 ZIP 重新插入新关系
        阶段5 - 仅 full_sync=True（type=factory 整厂快照）时执行：
                  软删除已被移除的线体（old_set - new_set）：删除关系表、删除 line_model_details。
                  full_sync=False（type=line 增量上传）跳过本阶段，包内未出现的线体一律保留。
        阶段6 - 重新统计 asset_total_count
        阶段7 - 提交事务
        """
        try:
            # 阶段1：解压 ZIP，获取线体集合（new_set）
            try:
                zf_obj = zipfile.ZipFile(io.BytesIO(file_bytes))
            except zipfile.BadZipFile:
                raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="上传文件不是合法的 ZIP 压缩包")

            with zf_obj as zf:
                # 过滤目录条目与 macOS 垃圾/隐藏文件（__MACOSX/、.DS_Store、._AppleDouble），
                # 否则 .DS_Store 会被当成 ProdLine 下的一条线体、垃圾文件也会污染 storage。
                valid_names = [n for n in zf.namelist() if _is_valid_zip_entry(n)]
                root_dir = _get_zip_root_dir(valid_names)
                location_path = root_dir.rstrip("/")
                proline_prefix = root_dir + "ProdLine/"

                file_entries: List[Tuple[str, bytes]] = [
                    (name, zf.read(name)) for name in valid_names
                ]

            all_entry_names = [name for name, _ in file_entries]
            # 获取 ZIP 中的线体名集合（new_set）
            new_set = set(_get_direct_subfolders(all_entry_names, proline_prefix))
            logger.info(f"线体模型 ZIP 解压完成: 文件数={len(file_entries)}, root={location_path}, new_set={new_set}")

            if not new_set:
                logger.warning(f"ZIP 内未找到 ProdLine 子文件夹，root_dir={root_dir}")
            # 阶段2：批量上传 MinIO
            minio = self.minio
            uploaded_count = await asyncio.to_thread(
                _batch_upload_to_minio, minio, file_entries, minio_prefix=""
            )
            logger.info(f"线体模型文件上传完成: 共上传 {uploaded_count} 个文件")
            # 阶段3：查询数据库已有线体集合（old_set）
            # 根据 location_path 查询已有的线体详情记录
            old_details_result = await db.execute(
                select(LineModelDetail).where(LineModelDetail.location_path == location_path)
            )
            old_details: List[LineModelDetail] = list(old_details_result.scalars().all())

            # 构建 old_line_map：line_name -> (AssetCategory, LineModelDetail)
            old_line_map: Dict[str, Tuple[AssetCategory, LineModelDetail]] = {}
            existing_parent_id: Optional[int] = None  # 从已有线体获取 parent_id
            for detail in old_details:
                # 通过 category_id 反查 asset_category 获取线体名和 parent_id
                cat_result = await db.execute(
                    select(AssetCategory).where(AssetCategory.id == detail.category_id).limit(1)
                )
                cat = cat_result.scalar_one_or_none()
                if cat:
                    old_line_map[cat.name] = (cat, detail)
                    if existing_parent_id is None:
                        existing_parent_id = cat.parent_id  # 记录已有线体的 parent_id

            old_set = set(old_line_map.keys())

            # 已有线体 parent_id 的存活校验：历史数据可能残留迁移前的失效整型 id（如 2001），
            # 直接复用会把新线体也挂成孤儿（不在任何 line_type 下，前端树中不可见）。
            old_parent_ids = {
                cat.parent_id for cat, _ in old_line_map.values() if cat.parent_id
            }
            alive_parent_ids: set = set()
            if old_parent_ids:
                alive_parent_ids = set((await db.execute(
                    select(AssetCategory.id).where(
                        AssetCategory.id.in_(old_parent_ids),
                        AssetCategory.is_deleted == False,
                    )
                )).scalars().all())

            # 确定新线体的 parent_id：优先复用同 location 已有线体的【存活】parent_id
            # （按 old_details 顺序取第一个存活的）；全部失效则按 code 运行期反查
            # “默认线体类型”节点的真实 UUID（不能用已失效的整型常量）。
            alive_existing_parent = next(
                (
                    cat.parent_id
                    for cat, _ in old_line_map.values()
                    if cat.parent_id and cat.parent_id in alive_parent_ids
                ),
                None,
            )
            if alive_existing_parent is not None:
                target_parent_id = alive_existing_parent
            else:
                if existing_parent_id is not None:
                    logger.warning(
                        f"已有线体的 parent_id={existing_parent_id} 在 asset_categories 中不存在或已删除，"
                        f"回退为按 code 反查默认线体类型节点"
                    )
                target_parent_id = await _resolve_default_type_category_id(
                    DEFAULT_LINE_TYPE_CODE, AssetCategoryType.LINE_TYPE.value, db
                )
            logger.info(f"数据库已有线体集合: old_set={old_set}, target_parent_id={target_parent_id}")

            # 阶段4：遍历 new_set 处理每个线体
            created_items: List[Dict] = []
            updated_items: List[Dict] = []

            for subfolder in new_set:
                usd_dir_prefix = f"{proline_prefix}{subfolder}/"

                # 查找线体主 USD 文件：ProdLine/{subfolder}/{subfolder}.usd
                root_usd_path: Optional[str] = None
                for entry_name in all_entry_names:
                    if entry_name.startswith(usd_dir_prefix):
                        rel = entry_name[len(usd_dir_prefix):]
                        if "/" not in rel and rel.lower().endswith(".usd") and rel == f"{subfolder}.usd":
                            root_usd_path = entry_name
                            break

                if root_usd_path is None:
                    logger.warning(f"未找到线体 USD 文件: ProdLine/{subfolder}/{subfolder}.usd，跳过该线体")
                    continue

                # 步骤4.1：检查线体是否已存在（直接从 old_line_map 查找）
                if subfolder in old_line_map:
                    # 复用已存在的 category 和 detail
                    category, existing_detail = old_line_map[subfolder]
                    logger.info(f"复用已存在的线体分类: name={subfolder}, category_id={category.id}")

                    # 修复孤儿：旧线体若挂在失效父节点下（如迁移残留的整型 id 2001），
                    # 重挂到目标父节点，使其在前端分类树中重新可见
                    if not category.parent_id or category.parent_id not in alive_parent_ids:
                        logger.info(
                            f"修复孤儿线体 parent_id: name={subfolder}, "
                            f"{category.parent_id} -> {target_parent_id}"
                        )
                        category.parent_id = target_parent_id

                    # 更新详情记录
                    existing_detail.root_usd_path = root_usd_path
                    existing_detail.location_path = location_path
                    existing_detail.thumbnail_path = THUMBNAIL_LINE
                    # 复活：若该线体此前被软删除（如曾从上传集移除或经分类删除），
                    # 重新上传应使其恢复可见，否则会复用一条 is_deleted=True 的记录而永久隐藏。
                    # 分类行与详情行都要复活——树查询按 asset_categories.is_deleted 过滤，
                    # 只复活 detail 时分类行仍被过滤，卡片永远不可见。
                    existing_detail.is_deleted = False
                    if category.is_deleted:
                        logger.info(f"复活软删除的线体分类: name={subfolder}, category_id={category.id}")
                        category.is_deleted = False
                    line_model_id = existing_detail.id
                    is_new = False
                    logger.info(f"更新线体详情: name={subfolder}, line_model_id={line_model_id}")
                else:
                    # 创建新的 category
                    code = str(generate_snowflake_id())
                    category = AssetCategory(
                        name=subfolder,
                        code=code,
                        type=AssetCategoryType.LINE_MODEL.value,
                        parent_id=target_parent_id,  # 使用从已有线体获取的 parent_id
                    )
                    db.add(category)
                    await db.flush()
                    logger.info(f"创建新线体分类: name={subfolder}, category_id={category.id}, parent_id={target_parent_id}")

                    # 创建新的详情记录
                    detail = LineModelDetail(
                        category_id=category.id,
                        bucket_name=minioConfig.bucket_name,
                        root_usd_path=root_usd_path,
                        location_path=location_path,
                        thumbnail_path=THUMBNAIL_LINE,
                    )
                    db.add(detail)
                    await db.flush()
                    line_model_id = detail.id
                    is_new = True
                    logger.info(f"创建线体详情: name={subfolder}, line_model_id={line_model_id}")

                # 步骤4.3：软删除该线体下所有旧关系（is_deleted=True），重新插入新关系
                # 软删除而非硬删除：与全仓 Creator 表软删除约定一致（见 AssetCategoryService）。
                # WHERE 仅按 line_model_id，确保 tombstone 该线全部旧活跃行；
                # 配合 uq_line_model_equipment_rel_live 唯一索引防止活跃行重复累积。
                await db.execute(
                    update(LineModelEquipmentRel)
                    .where(LineModelEquipmentRel.line_model_id == line_model_id)
                    .values(is_deleted=True)
                )
                await db.flush()  # 确保软删除先落库，新插入的活跃行不与旧活跃行撞唯一索引
                logger.info(f"已软删除线体 [{subfolder}] 的旧设备关系记录")

                # 遍历 Machine/ 目录，重新绑定设备实例
                machine_prefix = f"{usd_dir_prefix}Machine/"
                machine_usd_files = _get_machine_usd_files(all_entry_names, machine_prefix)
                logger.info(f"线体 [{subfolder}] Machine 设备文件数={len(machine_usd_files)}")

                rel_items: List[Dict] = []
                for machine_usd_path in machine_usd_files:
                    # ① 文件名去后缀 → instance_name
                    filename = machine_usd_path.split("/")[-1]
                    instance_name = filename[:-4] if filename.lower().endswith(".usd") else filename
                    # ② 提取关键词
                    keyword = _extract_model_keyword(instance_name)
                    if not keyword:
                        logger.warning(f"无法从设备文件名提取关键词: {instance_name}，跳过")
                        continue
                    # ③ 反查 equipment_model_id
                    equip_model_id = await _find_equipment_model_id(keyword, db)
                    if equip_model_id is None:
                        logger.warning(
                            f"未找到匹配设备模型 keyword='{keyword}'（来自 {instance_name}），跳过关系绑定"
                        )
                        continue
                    # ④ 插入关系表 line_model_equipment_rel
                    rel = LineModelEquipmentRel(
                        line_model_id=line_model_id,
                        equipment_model_id=equip_model_id,
                        instance_name=instance_name,
                        root_usd_path=machine_usd_path,
                    )
                    db.add(rel)
                    rel_items.append({
                        "instance_name": instance_name,
                        "equipment_model_id": equip_model_id,
                        "root_usd_path": machine_usd_path,
                    })
                    logger.info(
                        f"绑定设备实例: instance={instance_name}, "
                        f"line_model_id={line_model_id}, equipment_model_id={equip_model_id}"
                    )

                item_info = {
                    "name": subfolder,
                    "category_id": str(category.id),
                    "line_model_id": line_model_id,
                    "root_usd_path": root_usd_path,
                    "equipment_instances": rel_items,
                    "status": "created" if is_new else "updated",
                }
                if is_new:
                    created_items.append(item_info)
                else:
                    updated_items.append(item_info)

            # 阶段5：处理已被删除的线体（old_set - new_set）
            # 仅整厂快照（type=factory）执行镜像删除；增量上传（type=line）跳过，
            # 否则上传单条线体会把库里其他所有线体软删除。
            deleted_set = (old_set - new_set) if full_sync else set()
            deleted_items: List[Dict] = []
            if not full_sync and (old_set - new_set):
                logger.info(
                    f"增量上传（type=line），跳过镜像删除: 保留包内未出现的 {len(old_set - new_set)} 条线体"
                )

            for line_name in deleted_set:
                if line_name in old_line_map:
                    category, detail = old_line_map[line_name]
                    line_model_id = detail.id
                    # 软删除关系表数据（与上传重建路径、AssetCategoryService 软删除约定一致）
                    await db.execute(
                        update(LineModelEquipmentRel)
                        .where(LineModelEquipmentRel.line_model_id == line_model_id)
                        .values(is_deleted=True)
                    )
                    # 软删除 line_model_details（保留历史，可经重新上传复活）
                    detail.is_deleted = True
                    logger.info(f"软删除已移除线体: name={line_name}, line_model_id={line_model_id}")
                    deleted_items.append({
                        "name": line_name,
                        "category_id": str(category.id),
                        "line_model_id": line_model_id,
                        "status": "deleted",
                    })

            # 阶段6：重新统计 asset_total_count
            await _refresh_category_ancestor_counts(target_parent_id, db)

            # 阶段7：提交事务
            await db.commit()
            logger.info(
                f"线体模型入库完成: location_path={location_path}, "
                f"新建={len(created_items)}, 更新={len(updated_items)}, 删除={len(deleted_items)}"
            )
            return {
                "location_path": location_path,
                "created_count": len(created_items),
                "updated_count": len(updated_items),
                "deleted_count": len(deleted_items),
                "created_items": created_items,
                "updated_items": updated_items,
                "deleted_items": deleted_items,
            }
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in _upload_line_asset]: {e}")
            raise BusinessException(ErrorCode.SYSTEM_ERROR, extra_msg=f"线体模型上传失败: {e}")

    # 设备模型
    async def _upload_equipment_asset(self, file_bytes: bytes, db: AsyncSession) -> Dict[str, Any]:

        """
        三阶段处理：
        阶段1 - 解压 ZIP，提取所有文件内容到内存
        阶段2 - 批量上传到 MinIO Library/Asset/ 前缀下（线程池）
        阶段3 - 遍历顶级子文件夹，创建 equipment_model 分类 + 详情记录
        """
        try:
            minio_prefix = "Library/Asset/"
            # 阶段1：解压，收集文件内容
            try:
                zf_obj = zipfile.ZipFile(io.BytesIO(file_bytes))
            except zipfile.BadZipFile:
                raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="上传文件不是合法的 ZIP 压缩包")

            with zf_obj as zf:
                # 过滤目录条目与 macOS 垃圾/隐藏文件（__MACOSX/、.DS_Store、._AppleDouble），
                # 否则会污染 storage 且把 .DS_Store 当成设备文件夹。
                valid_names = [n for n in zf.namelist() if _is_valid_zip_entry(n)]
                # 获取 ZIP 根目录（设备文件夹的父目录）
                root_dir = _get_zip_root_dir(valid_names)
                location_path = (minio_prefix + root_dir).rstrip("/")
                file_entries: List[Tuple[str, bytes]] = [
                    (name, zf.read(name)) for name in valid_names
                ]

            logger.info(f"设备模型 ZIP 解压完成: 文件数={len(file_entries)}, root={root_dir}")

            # 阶段2：批量上传 MinIO Library/Asset/ 前缀下
            minio = self.minio
            uploaded_count = await asyncio.to_thread(
                _batch_upload_to_minio, minio, file_entries, minio_prefix=minio_prefix
            )
            logger.info(f"设备模型文件上传完成: 共上传 {uploaded_count} 个文件")

            # 阶段3：根目录下直属子文件夹 = 设备名，写入数据库
            subfolders = _get_direct_subfolders([name for name, _ in file_entries], root_dir)
            if not subfolders:
                logger.warning(f"ZIP 内未找到设备子文件夹，root_dir={root_dir}")

            # 按 code 运行期反查“默认设备类型”节点真实 UUID 作为 parent_id（整型常量已失效）。
            equipment_parent_id = await _resolve_default_type_category_id(
                DEFAULT_EQUIPMENT_TYPE_CODE, AssetCategoryType.EQUIPMENT_TYPE.value, db
            )

            created_items: List[Dict] = []
            for subfolder in subfolders:
                # 在 ZIP 条目中查找 {root_dir}{subfolder}/{subfolder}.usd 的真实路径
                usd_dir_prefix = f"{root_dir}{subfolder}/"
                root_usd_path: str | None = None
                for entry_name, _ in file_entries:
                    if entry_name.startswith(usd_dir_prefix):
                        rel = entry_name[len(usd_dir_prefix):]
                        if "/" not in rel and rel.lower().endswith(".usd") and rel == f"{subfolder}.usd":
                            root_usd_path = minio_prefix + entry_name  # 完整桶路径
                            break
                if root_usd_path is None:
                    logger.warning(f"未找到设备 USD 文件: {root_dir}{subfolder}/{subfolder}.usd，跳过该设备")
                    continue

                # 检查 DB 中是否已存在同名同父的设备模型节点。
                # 不过滤 is_deleted：软删除的同名节点需要被找到并复活；活节点优先匹配。
                existing_cat_result = await db.execute(
                    select(AssetCategory).where(
                        AssetCategory.name == subfolder,
                        AssetCategory.type == AssetCategoryType.EQUIPMENT_MODEL.value,
                        AssetCategory.parent_id == equipment_parent_id,
                    ).order_by(AssetCategory.is_deleted.asc()).limit(1)
                )
                existing_cat = existing_cat_result.scalar_one_or_none()

                if existing_cat is not None:
                    # 已存在：MinIO 文件已上传覆盖，DB 无需重建。
                    # 复活：若该设备此前被批量删除（软删除），重新上传应使其恢复可见，
                    # 否则会匹配到 is_deleted=True 的分类而永久隐藏（与线体上传复活语义一致）。
                    if existing_cat.is_deleted:
                        existing_cat.is_deleted = False
                        detail_result = await db.execute(
                            select(EquipmentModelDetail).where(
                                EquipmentModelDetail.category_id == existing_cat.id,
                                EquipmentModelDetail.is_current == True,
                            ).limit(1)
                        )
                        existing_detail = detail_result.scalar_one_or_none()
                        if existing_detail is not None:
                            existing_detail.is_deleted = False
                            existing_detail.root_usd_path = root_usd_path
                            existing_detail.location_path = location_path
                        else:
                            db.add(EquipmentModelDetail(
                                category_id=existing_cat.id,
                                bucket_name=minioConfig.bucket_name,
                                root_usd_path=root_usd_path,
                                location_path=location_path,
                                thumbnail_path=THUMBNAIL_EQUIPMENT,
                            ))
                        await db.flush()
                        logger.info(f"复活软删除的设备模型: name={subfolder}, category_id={existing_cat.id}")
                        created_items.append({
                            "name": subfolder,
                            "category_id": str(existing_cat.id),
                            "root_usd_path": root_usd_path,
                            "status": "revived",
                        })
                        continue
                    logger.info(f"设备模型已存在，跳过 DB 新建，仅追加 MinIO 文件: name={subfolder}")
                    created_items.append({
                        "name": subfolder,
                        "category_id": str(existing_cat.id),
                        "root_usd_path": root_usd_path,
                        "status": "existing",
                    })
                    continue
                # 不存在：新建分类节点 + 详情记录
                code = str(generate_snowflake_id())
                category = AssetCategory(
                    name=subfolder,
                    code=code,
                    type=AssetCategoryType.EQUIPMENT_MODEL.value,
                    parent_id=equipment_parent_id,
                )
                db.add(category)
                await db.flush()

                detail = EquipmentModelDetail(
                    category_id=category.id,
                    bucket_name=minioConfig.bucket_name,
                    root_usd_path=root_usd_path,
                    location_path=location_path,
                    thumbnail_path=THUMBNAIL_EQUIPMENT,
                )
                db.add(detail)
                created_items.append({
                    "name": subfolder,
                    "category_id": str(category.id),
                    "root_usd_path": root_usd_path,
                    "status": "created",
                })

            await _refresh_category_ancestor_counts(equipment_parent_id, db)
            await db.commit()
            logger.info(f"设备模型入库完成: location_path={location_path}, 创建数={len(created_items)}")
            return {
                "location_path": location_path,
                "created_count": len(created_items),
                "items": created_items,
            }

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in _upload_equipment_asset]: {e}")
            raise BusinessException(ErrorCode.SYSTEM_ERROR, extra_msg=f"设备模型上传失败: {e}")

# 辅助函数
def _batch_upload_to_minio(
        minio: MinioManagerService,
        file_entries: List[Tuple[str, bytes]],
        minio_prefix: str,
) -> int:
    """
    同步批量上传所有文件到 MinIO（在线程池中运行）。
    :param file_entries: [(zip内相对路径, 文件字节内容), ...]
    :param minio_prefix: MinIO 路径前缀，例如 '' 或 'Library/Asset/'
    :return: 成功上传的文件数量
    """
    count = 0
    for name, data in file_entries:
        object_name = minio_prefix + name
        minio.upload_bytes_to_path(data, object_name)
        logger.debug(f"MinIO 上传: {object_name} ({len(data)} bytes)")
        count += 1
    return count

# macOS 打包 ZIP 会夹带 __MACOSX/ 目录与 .DS_Store / ._AppleDouble 元数据文件。
_MACOS_SKIP_PREFIXES = ("__MACOSX/", ".DS_Store")


def _is_valid_zip_entry(name: str) -> bool:
    """
    判断 ZIP 条目是否为需要处理的真实文件。
    过滤：目录条目、macOS 垃圾文件（__MACOSX/、.DS_Store）、以及任何以 '.' 开头的隐藏文件
    （含 ._AppleDouble）。与 UsdAssetLibraryService 的过滤规则保持一致。
    """
    if name.endswith("/"):
        return False
    if any(name.startswith(p) or name == p for p in _MACOS_SKIP_PREFIXES):
        return False
    base = name.split("/")[-1]
    if base.startswith("."):
        return False
    return True


def _get_zip_root_dir(names: List[str]) -> str:
    """获取 ZIP 内顶级根目录，返回形如 'RootFolder/' 的字符串。"""
    for name in names:
        parts = name.split("/")
        if parts[0]:
            return parts[0] + "/"
    return ""


def _get_direct_subfolders(names: List[str], prefix: str) -> List[str]:
    """
    获取指定前缀下的直属子文件夹名（去重、排序）。
    prefix='Root/ProLine/'，'Root/ProLine/Line1/a.usd' → ['Line1']
    """
    subfolders = set()
    for name in names:
        if name.startswith(prefix) and name != prefix:
            rel = name[len(prefix):]
            parts = rel.split("/")
            if parts[0]:
                subfolders.add(parts[0])
    return sorted(subfolders)


def _get_top_level_dirs(names: List[str]) -> List[str]:
    """
    获取 ZIP 内所有顶级目录名（去重、排序）。
    'Equipment1/a.usd', 'Equipment2/b.usd' → ['Equipment1', 'Equipment2']
    """
    dirs = set()
    for name in names:
        parts = name.split("/")
        if len(parts) > 1 and parts[0]:
            dirs.add(parts[0])
    return sorted(dirs)


def _get_machine_usd_files(names: List[str], machine_prefix: str) -> List[str]:
    """
    获取 Machine/ 目录下的所有直属 .usd 文件完整 ZIP 路径（不含子目录）。
    例如: machine_prefix='Root/ProdLine/Line1/Machine/'
          'Root/ProdLine/Line1/Machine/id_FF460Z0018_JY_JY01.usd' → 返回
    """
    result = []
    for name in names:
        if name.startswith(machine_prefix) and not name.endswith("/"):
            rel = name[len(machine_prefix):]
            # 只取直属文件，不含子目录层
            if "/" not in rel and rel.lower().endswith(".usd"):
                result.append(name)
    return sorted(result)

# todo，这里提取的关键词是：id_FF460Z0018_JY_JY01==> FF460Z0018_JY 去掉id_ 和第一个下划线的_JY01
def _extract_model_keyword(instance_name: str) -> str:
    """
    从设备实例名中提取用于模糊查询 asset_categories.name 的关键词。
    命名规则：
      - 若以 'id_' 开头（忽略大小写），去掉该前缀
      - 去掉最后一个 '_xxx' 部分
      - 保留中间部分
    示例：
      'id_FF460Z0018_JY_JY01' → 'FF460Z0018_JY'
      'FF460Z0018_JY_JY01'   → 'FF460Z0018_JY'
      'KUKA_KR6_001'         → 'KUKA_KR6'
    """
    name = instance_name
    # 去掉 id_ 前缀（忽略大小写）
    if name.lower().startswith("id_"):
        name = name[3:]
    # 去掉最后一个 _xxx 部分
    last_underscore = name.rfind("_")
    if last_underscore > 0:
        name = name[:last_underscore]
    return name


async def _resolve_default_type_category_id(code: str, type_value: str, db: AsyncSession) -> str:
    """
    按 code 反查默认类型节点（line_type / equipment_type）的真实 UUID 主键，作为新建
    线体/设备模型的 parent_id。asset_categories.id 为 String(36) UUID 且随环境 seed 变化，
    不能硬编码整型 id（旧 2001/2002 常量已失效）。
    未找到时抛出业务异常，避免静默插入挂在不存在父节点下的孤儿节点。
    """
    result = await db.execute(
        select(AssetCategory.id)
        .where(
            AssetCategory.code == code,
            AssetCategory.type == type_value,
            AssetCategory.is_deleted == False,
        )
        .limit(1)
    )
    category_id = result.scalar_one_or_none()
    if category_id is None:
        raise BusinessException(
            ErrorCode.NOT_FOUND_ERROR,
            extra_msg=f"未找到默认分类节点（code={code}, type={type_value}），无法确定上传归属的父节点",
        )
    return category_id


async def _refresh_category_ancestor_counts(anchor_id: int, db: AsyncSession) -> None:
    """
    从 anchor_id 节点向上遍历祖先链，仅对 process / line_type / equipment_type 节点
    重新统计子树内 line_model / equipment_model 叶子总数，写入 asset_total_count。
    上传接口批量创建模型节点后、commit 之前调用一次即可。
    """
    all_result = await db.execute(
        select(AssetCategory).where(AssetCategory.is_deleted == False)
    )
    all_nodes: List[AssetCategory] = list(all_result.scalars().all())
    entity_map = {n.id: n for n in all_nodes}

    if anchor_id not in entity_map:
        return

    model_leaf_types = {AssetCategoryType.LINE_MODEL, AssetCategoryType.EQUIPMENT_MODEL}
    statistic_types = {AssetCategoryType.LINE_TYPE, AssetCategoryType.EQUIPMENT_TYPE, AssetCategoryType.PROCESS}

    def count_model_leaves(nid: int) -> int:
        node = entity_map.get(nid)
        if not node:
            return 0
        if node.type in model_leaf_types:
            return 1
        return sum(count_model_leaves(c.id) for c in all_nodes if c.parent_id == nid)

    chain: List[int] = []
    cur_id: Optional[int] = anchor_id
    while cur_id is not None and cur_id in entity_map:
        chain.append(cur_id)
        cur_id = entity_map[cur_id].parent_id

    for nid in chain:
        node = entity_map[nid]
        if node.type in statistic_types:
            node.asset_total_count = count_model_leaves(nid)

    await db.flush()


async def _find_equipment_model_id(keyword: str, db: AsyncSession) -> Optional[int]:
    """
    根据关键词三步反查 equipment_model_details.id：
      步骤1 - 在 asset_categories 中按 name 模糊匹配（type = equipment_model），取第一条
      步骤2 - 用 category_id 查询 equipment_model_details，取 id（即 equipment_model_id）
    返回 None 表示未找到匹配记录。
    """

    # 步骤1：模糊查询 asset_categories（排除软删除，避免绑定到已删除的设备模型）
    cat_result = await db.execute(
        select(AssetCategory.id)
        .where(
            AssetCategory.type == AssetCategoryType.EQUIPMENT_MODEL.value,
            AssetCategory.name.ilike(f"%{keyword}%"),
            AssetCategory.is_deleted == False,
        )
        .limit(1)
    )
    category_id = cat_result.scalar_one_or_none()
    if category_id is None:
        return None

    # 步骤2：根据 category_id 反查设备详情表
    detail_result = await db.execute(
        select(EquipmentModelDetail.id)
        .where(EquipmentModelDetail.category_id == category_id)
        .limit(1)
    )
    return detail_result.scalar_one_or_none()



