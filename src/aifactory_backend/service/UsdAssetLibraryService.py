import io
import math
import logging
import mimetypes
import zipfile
from typing import List, Optional, Dict, Any
import time
from fastapi import UploadFile
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.UsdAssetLibraryDto import AssetLibraryCreateDto, AssetLibraryUpdateDto, AssetLibraryQueryDto
from models.entity.UsdAssetLibraryEntity import UsdAssetLibrary
from models.vo.UsdAssetLibraryVo import (
    AssetLibraryVo,
    AssetFileUploadVo,
    AssetFolderUploadVo,
    AssetPresignedUrlVo,
)
from service.MinioService import MinioManagerService

init_logging()
logger = logging.getLogger(__name__)


class UsdAssetLibraryService:
    """
    USD 资产库业务服务
    负责 DB CRUD 操作 + MinIO 文件管理的联动
    """

    def __init__(self):
        self.minio_service = MinioManagerService()

    async def upload_asset_files(
            self,
            files: List[UploadFile],
            location_path: str,
    ) -> AssetFolderUploadVo:
        """
        批量上传文件到 MinIO，支持单文件和整个文件夹两种模式。

        路径拼接规则（防止浏览器文件夹上传时文件名已含文件夹名导致重复前缀）：
          1. 如果 filename 的首级目录 == location_path 的最后一级目录
             → 自动去除 filename 中的文件夹名，再拼接 location_path
             示例: location_path='Collected_xxx/', filename='Collected_xxx/sub/a.usd'
                    → object_name='Collected_xxx/sub/a.usd'
          2. 否则直接拼接 location_path + filename
             示例: location_path='Collected_xxx/', filename='sub/a.usd'
                    → object_name='Collected_xxx/sub/a.usd'
             示例: location_path='Collected_xxx/', filename='a.usd'
                    → object_name='Collected_xxx/a.usd'

        :param files:         上传文件列表
        :param location_path: MinIO 存储前缀，例如 'Collected_a_L_HST_Dis_Assy_Sub/'
        :return: AssetFolderUploadVo
        """
        if not files:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="上传文件列表不能为空")

        normalized_prefix = location_path if location_path.endswith("/") else location_path + "/"
        # 取 location_path 最后一级目录名，用于判断浏览器上传时的文件名是否已含该前缀
        prefix_folder_name = normalized_prefix.rstrip("/").split("/")[-1]

        results: List[AssetFileUploadVo] = []
        total_size = 0

        for file in files:
            filename = file.filename or "unknown"
            # 防重复前缀逻辑：浏览器文件夹上传时 filename = 'FolderName/sub/file.usd'
            filename_parts = filename.split("/")
            if len(filename_parts) > 1 and filename_parts[0] == prefix_folder_name:
                # filename 首级目录与 location_path 末级目录相同，去除重复前缀
                relative_path = "/".join(filename_parts[1:])
                object_name = f"{normalized_prefix}{relative_path}"
            else:
                # 单文件或子路径，直接拼接 location_path
                object_name = f"{normalized_prefix}{filename}"
            logger.info(f"上传: '{filename}' → MinIO '{object_name}'")
            result_dict = await self.minio_service.upload_file_to_path(file, object_name)
            results.append(AssetFileUploadVo(**result_dict))
            total_size += result_dict["file_size"]

        file_list = [r.object_name for r in results]
        logger.info(f"'{normalized_prefix}' 下共上传 {len(results)} 个文件，总大小 {total_size} 字节")

        return AssetFolderUploadVo(
            location_path=normalized_prefix,
            total_files=len(results),
            file_list=file_list,
            total_size=total_size,
            files=results,
        )

    async def extract_zip_and_upload(
            self,
            zip_file: UploadFile,
            location_path: str,
    ) -> AssetFolderUploadVo:
        """
        解压 ZIP 文件并将其中所有文件上传到 MinIO，保留目录结构。

        路径处理规则：
          - 若 ZIP 内所有文件均在同一顶级目录下（如 MyAsset/），自动去除该顶级目录
            示例： ZIP 内 MyAsset/textures/a.png → MinIO: location_path/textures/a.png
          - 若 ZIP 内文件直接在根目录，直接拼接 location_path
            示例： ZIP 内 a.usd → MinIO: location_path/a.usd
          - 自动过滤 __MACOSX/、.DS_Store 、隐藏文件等干扰条目
        :param zip_file:      ZIP 文件上传对象
        :param location_path: MinIO 存储前缀，例如 'Collected_xxx/'
        :return: AssetFolderUploadVo
        """


        if not zip_file.filename:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ZIP 文件名不能为空")

        # 1. 读取 ZIP 内容
        zip_bytes = await zip_file.read()
        try:
            zf = zipfile.ZipFile(io.BytesIO(zip_bytes))
        except zipfile.BadZipFile as e:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg=f"不是有效的 ZIP 文件: {e}")

        # 2. 过滤有效文件条目（跳过目录、macOS 垃圾文件、隐藏文件）
        SKIP_PREFIXES = ("__MACOSX/", ".DS_Store")
        all_entries = [
            name for name in zf.namelist()
            if not name.endswith("/")
            and not any(name.startswith(p) or name == p for p in SKIP_PREFIXES)
            and not name.split("/")[-1].startswith(".")
        ]
        if not all_entries:
            zf.close()
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ZIP 文件为空或不包含有效文件")

        # 3. 检测共同顶级目录前缀（自动去除重复层级）
        common_prefix = self._detect_zip_prefix(all_entries)
        normalized_location = location_path if location_path.endswith("/") else location_path + "/"
        logger.info(f"ZIP内公共前缀: '{common_prefix}', MinIO目标前缀: '{normalized_location}'")

        # 4. 逐一解压并上传
        results: List[AssetFileUploadVo] = []
        total_size = 0

        for entry_name in all_entries:
            # 去除公共顶级目录前缀，得到相对路径
            relative_path = entry_name[len(common_prefix):] if common_prefix else entry_name
            if not relative_path:
                continue
            object_name = normalized_location + relative_path
            # 解压文件内容
            file_bytes = zf.read(entry_name)
            # 猜测 MIME 类型
            content_type, _ = mimetypes.guess_type(entry_name)
            content_type = content_type or "application/octet-stream"
            logger.info(f"ZIP解压上传: '{entry_name}' → MinIO '{object_name}'")
            result_dict = self.minio_service.upload_bytes_to_path(file_bytes, object_name, content_type)
            results.append(AssetFileUploadVo(**result_dict))
            total_size += result_dict["file_size"]

        zf.close()
        file_list = [r.object_name for r in results]
        logger.info(f"ZIP 解压上传完成: 共 {len(results)} 个文件, 总大小 {total_size} 字节")

        return AssetFolderUploadVo(
            location_path=normalized_location,
            total_files=len(results),
            file_list=file_list,
            total_size=total_size,
            files=results,
        )

    @staticmethod
    def _detect_zip_prefix(entries: List[str]) -> str:
        """
        检测 ZIP 内所有文件是否共享同一顶级目录。
        如果是，返回该目录名（如 'MyAsset/''）；否则返回空字符串。
        示例： ['MyAsset/a.usd', 'MyAsset/tex/b.png'] → 'MyAsset/'
                 ['a.usd', 'b.png']                       → ''
        """
        if not entries:
            return ""
        first_components: set = set()
        for name in entries:
            normalized = name.replace("\\", "/")
            parts = normalized.split("/")
            if len(parts) > 1:
                first_components.add(parts[0])
            else:
                # 有文件在根目录，无公共前缀
                return ""
        if len(first_components) == 1:
            return list(first_components)[0] + "/"
        return ""

    async def upload_thumbnail(
            self,
            file: UploadFile,
            thumbnail_prefix: str = "thumbnails/",
    ) -> AssetFileUploadVo:
        """
        上传资产缩略图到 MinIO。
        :param file: 缩略图文件（推荐 PNG/JPG）
        :param thumbnail_prefix: 缩略图存储前缀，默认 'thumbnails/'
        :return: AssetFileUploadVo 上传信息（含 object_name）
        """
        if not file.filename:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="缩略图文件名不能为空")
        object_name = f"{thumbnail_prefix}{file.filename}"
        result_dict = await self.minio_service.upload_file_to_path(file, object_name)
        logger.info(f"缩略图上传成功: {object_name}")
        return AssetFileUploadVo(**result_dict)

    async def get_presigned_url(
            self,
            asset_id: int,
            db: AsyncSession,
            expires_seconds: int = 3600,
    ) -> AssetPresignedUrlVo:
        """
        获取资产根USD文件的预签名下载URL。
        :param asset_id: 资产 ID
        :param db: 数据库会话
        :param expires_seconds: URL有效期（秒），默认1小时
        :return: AssetPresignedUrlVo
        """
        asset = await self._get_asset_or_raise(asset_id, db)
        url = self.minio_service.generate_presigned_url(asset.root_usd_path, expires_seconds)
        return AssetPresignedUrlVo(
            asset_id=asset.id,
            object_name=asset.root_usd_path,
            presigned_url=url,
            expires_in_seconds=expires_seconds,
        )

    async def upload_and_create_asset(
            self,
            name: str,
            location_path: str,
            category_l1: str,
            zip_file: UploadFile,
            root_usd_filename: Optional[str] = None,
            storage_type: Optional[str] = None,
            category_l2: Optional[str] = None,
            category_l3: Optional[str] = None,
            tags: Optional[List[str]] = None,
            open_config: Optional[Dict[str, Any]] = None,
            thumbnail: Optional[UploadFile] = None,
            thumbnail_prefix: str = "thumbnails/",
            db: AsyncSession = None,
    ) -> AssetLibraryVo:
        """
        【主创建入口】接收 ZIP 包解压并上传到 MinIO，同步创建数据库记录。

        流程：
          1. 解压 ZIP 并批量上传到 MinIO（自动处理顶级目录重复前缀）
          2. 若提供缩略图，同步上传缩略图
          3. 自动推断 storage_type：1个文件='file'，多个='folder'（可覆盖）
          4. 自动确定 root_usd_path：指定 > 单文件 > 自动检测 .usd/.usda
          5. 将文件列表及元数据一次性写入数据库

        :param name:              资产名称
        :param location_path:     MinIO 存储前缀，例如 'Collected_xxx/'
        :param category_l1:       主分类
        :param zip_file:          ZIP 文件（包含资产文件夹或单文件）
        :param root_usd_filename: 根 USD 文件名（可选），不填时自动检测
        :param storage_type:      存储类型（可选），不填时根据文件数自动判断
        :param category_l2:       子分类（可选）
        :param category_l3:       三级分类（可选）
        :param tags:              标签列表（可选）
        :param open_config:       打开方式配置 JSON（可选）
        :param thumbnail:         缩略图文件（可选）
        :param thumbnail_prefix:  缩略图存储前缀，默认 'thumbnails/'
        :param db:                数据库会话
        :return: AssetLibraryVo 创建结果
        """
        start_time = time.time()
        logger.info("="*60)
        logger.info(f"[upload_and_create_asset] 开始创建资产")
        logger.info(f"  资产名称 : {name}")
        logger.info(f"  主分类   : {category_l1}")
        logger.info(f"  子分类   : {category_l2} / {category_l3}")
        logger.info(f"  存储前缀 : {location_path}")
        logger.info(f"  ZIP 文件 : {zip_file.filename}")
        logger.info(f"  缩略图   : {thumbnail.filename if thumbnail and thumbnail.filename else '未提供'}")
        logger.info(f"  标签     : {tags}")
        logger.info("="*60)

        # ── 前置校验：在上传文件之前先检查重复 ──
        logger.info(f"[Step 0] 前置校验: 检查 name='{name}' 和 location_path='{location_path}' 是否重复...")
        await self._validate_name_and_path(
            name=name,
            location_path=location_path,
            db=db,
        )
        logger.info(f"[Step 0] 前置校验通过，无重复记录")

        # 缩略图未上传提示
        if not thumbnail or not thumbnail.filename:
            logger.warning(f"[Step 0] 资产 '{name}' 未上传缩略图，建议上传以便前端展示")
            raise BusinessException(
                ErrorCode.PARAMS_ERROR,
                extra_msg=(
                    f"未上传缩略图，建议上传以便前端展示"
                )
            )
        # ── Step 1: 解压 ZIP 并上传到 MinIO ──
        logger.info(f"[Step 1] 开始解压 ZIP 并上传到 MinIO, 存储前缀='{location_path}'...")
        step1_start = time.time()
        folder_result = await self.extract_zip_and_upload(zip_file, location_path)
        normalized_prefix = folder_result.location_path  # 已经标准化结尾 '/'
        step1_elapsed = time.time() - step1_start
        logger.info(
            f"[Step 1] ZIP 解压上传完成"
            f"文件数={folder_result.total_files}, "
            f"总大小={folder_result.total_size:,} 字节, "
            f"耗时={step1_elapsed:.2f}s"
        )
        logger.info(f"[Step 1] MinIO 存储前缀：{normalized_prefix}")
        logger.info(f"[Step 1] 已上传文件列表:")
        for idx, f in enumerate(folder_result.file_list, 1):
            logger.info(f"         [{idx}] {f}")

        # ── Step 2: 自动推断 storage_type ──
        if storage_type is None:
            storage_type = "file" if len(folder_result.file_list) == 1 else "folder"
            logger.info(f"[Step 2] 自动判断 storage_type={storage_type}（ZIP内文件数={len(folder_result.file_list)}）")
        else:
            logger.info(f"[Step 2] 使用用户指定的 storage_type={storage_type}")

        # ── Step 3: 确定 root_usd_path ──
        logger.info(f"[Step 3] 开始确定 root_usd_path，用户指定文件名='{root_usd_filename}'...")
        root_usd_path = None

        if root_usd_filename:
            # 用户明确指定：在上传结果中匹配
            for obj_name in folder_result.file_list:
                if obj_name.endswith("/" + root_usd_filename) or obj_name == root_usd_filename:
                    root_usd_path = obj_name
                    logger.info(f"[Step 3] 匹配到用户指定的 root_usd_filename: {root_usd_path}")
                    break

        if root_usd_path is None:
            if len(folder_result.file_list) == 1:
                root_usd_path = folder_result.file_list[0]
                logger.info(f"[Step 3] 单文件 ZIP，自动设置 root_usd_path={root_usd_path}")
            else:
                usd_files = [
                    f for f in folder_result.file_list
                    if f.lower().endswith(".usd") or f.lower().endswith(".usda")
                ]
                if usd_files:
                    root_usd_path = usd_files[0]
                    logger.info(f"[Step 3] 自动检测到根USD文件: {root_usd_path}")
                    if len(usd_files) > 1:
                        logger.warning(f"[Step 3] 检测到多个 USD 文件，取第一个作为根文件: {usd_files}")
                    if root_usd_filename:
                        logger.warning(
                            f"[Step 3] root_usd_filename='{root_usd_filename}' 未匹配到上传文件，"
                            f"自动回退为: {root_usd_path}"
                        )
                else:
                    logger.error(
                        f"[Step 3] ZIP 中未找到 .usd/.usda 文件，已上传文件: {folder_result.file_list}"
                    )
                    raise BusinessException(
                        ErrorCode.PARAMS_ERROR,
                        extra_msg=(
                            f"ZIP 中未找到 .usd/.usda 文件且未指定 root_usd_filename。"
                            f"已上传文件: {folder_result.file_list}"
                        )
                    )
        logger.info(f"[Step 3] 最终 root_usd_path={root_usd_path}")

        # ── Step 4: 上传缩略图 ──
        thumbnail_path = None
        if thumbnail and thumbnail.filename:
            logger.info(f"[Step 4] 开始上传缩略图: {thumbnail.filename}, 存储前缀='{thumbnail_prefix}'...")
            step4_start = time.time()
            thumb_result = await self.upload_thumbnail(thumbnail, thumbnail_prefix)
            thumbnail_path = thumb_result.object_name
            logger.info(f"[Step 4] 缩略图上传完成耗时={time.time()-step4_start:.2f}s, 路径={thumbnail_path}")
        else:
            logger.info(f"[Step 4] 无缩略图，跳过")

        # ── Step 5: 写入数据库 ──
        logger.info(f"[Step 5] 开始写入数据库...")
        dto = AssetLibraryCreateDto(
            name=name,
            storage_type=storage_type,
            root_usd_path=root_usd_path,
            location_path=normalized_prefix,
            thumbnail_path=thumbnail_path,
            category_l1=category_l1,
            category_l2=category_l2,
            category_l3=category_l3,
            tags=tags,
            open_config=open_config,
            file_list=folder_result.file_list,
        )
        result = await self.create_asset(dto, db)

        total_elapsed = time.time() - start_time
        logger.info("="*60)
        logger.info(f"[upload_and_create_asset] 资产创建全流程完成 ✔")
        logger.info(f"  资产 ID    : {result.id}")
        logger.info(f"  资产名称  : {result.name}")
        logger.info(f"  存储类型  : {result.storage_type}")
        logger.info(f"  MinIO 前缀 : {result.location_path}")
        logger.info(f"  根USD文件 : {result.root_usd_path}")
        logger.info(f"  缩略图路径 : {result.thumbnail_path}")
        logger.info(f"  总耗时    : {total_elapsed:.2f}s")
        logger.info("="*60)
        return result


    async def create_asset(
            self,
            dto: AssetLibraryCreateDto,
            db: AsyncSession,
    ) -> AssetLibraryVo:
        """
        创建 USD 资产库记录（仅写数据库，MinIO 文件需提前上传）。
        """
        try:
            entity = UsdAssetLibrary(
                name=dto.name,
                storage_type=dto.storage_type or "folder",
                root_usd_path=dto.root_usd_path,
                location_path=dto.location_path,
                thumbnail_path=dto.thumbnail_path,
                category_l1=dto.category_l1,
                category_l2=dto.category_l2,
                category_l3=dto.category_l3,
                tags=dto.tags,
                open_config=dto.open_config,
                file_list=dto.file_list,
            )
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            logger.info(f"创建资产记录成功: id={entity.id}, name={entity.name}")
            return AssetLibraryVo.model_validate(entity)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create_asset]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建资产记录失败: {e}")

    async def get_asset_by_id(
            self,
            asset_id: int,
            db: AsyncSession,
    ) -> AssetLibraryVo:
        """
        根据 ID 查询单个资产。
        """
        asset = await self._get_asset_or_raise(asset_id, db)
        return AssetLibraryVo.model_validate(asset)

    async def list_assets(
            self,
            query: AssetLibraryQueryDto,
            db: AsyncSession,
    ) -> Page[AssetLibraryVo]:
        """
        分页查询资产列表，支持多条件过滤。
        """
        try:
            stmt = select(UsdAssetLibrary)
            count_stmt = select(func.count()).select_from(UsdAssetLibrary)

            # 动态拼接过滤条件
            conditions = []
            if query.name:
                conditions.append(UsdAssetLibrary.name.ilike(f"%{query.name}%"))
            if query.storage_type:
                conditions.append(UsdAssetLibrary.storage_type == query.storage_type)
            if query.category_l1:
                conditions.append(UsdAssetLibrary.category_l1 == query.category_l1)
            if query.category_l2:
                conditions.append(UsdAssetLibrary.category_l2 == query.category_l2)
            if query.category_l3:
                conditions.append(UsdAssetLibrary.category_l3 == query.category_l3)
            if query.tags:
                # 包含任意一个标签即匹配（PostgreSQL ARRAY && 操作符）
                conditions.append(UsdAssetLibrary.tags.overlap(query.tags))

            if conditions:
                from sqlalchemy import and_
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))

            # 排序：默认按 created_at 倒序
            stmt = stmt.order_by(UsdAssetLibrary.created_at.desc())

            # 分页
            offset = (query.current - 1) * query.pageSize
            stmt = stmt.offset(offset).limit(query.pageSize)

            # 执行查询
            total_result = await db.execute(count_stmt)
            total = total_result.scalar_one()

            result = await db.execute(stmt)
            entities = result.scalars().all()

            items = [AssetLibraryVo.model_validate(e) for e in entities]
            totalPages = math.ceil(total / query.pageSize) if query.pageSize > 0 else 0
            logger.info(f"查询资产列表: total={total}, current={query.current}, pageSize={query.pageSize}")
            return Page(
                items=items,
                total=total,
                current=query.current,
                pageSize=query.pageSize,
                totalPages=totalPages,
            )
        except Exception as e:
            logger.error(f"[Error in list_assets]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询资产列表失败: {e}")

    async def update_asset(
            self,
            asset_id: int,
            dto: AssetLibraryUpdateDto,
            db: AsyncSession,
    ) -> AssetLibraryVo:

        """
        更新资产元数据
        """
        # 1. 获取现有资产
        asset = await self._get_asset_or_raise(asset_id, db)

        # 2. 获取更新数据，并强制排除 id
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("id", None)

        if not update_data:
            logger.warning(f"更新资产 {asset_id}: 未提供任何有效更新数据")
            return AssetLibraryVo.model_validate(asset)

        # 3. 提前预处理 location_path
        if "location_path" in update_data and update_data["location_path"] is not None:
            path = update_data["location_path"]
            update_data["location_path"] = path if path.endswith("/") else path + "/"
        try:

            allowed_fields = {
                "name", "storage_type", "root_usd_path", "location_path",
                "thumbnail_path", "category_l1", "category_l2", "category_l3",
                "tags", "open_config", "file_list",
            }

            # 4. 唯一性校验：Name
            if "name" in update_data and update_data["name"] != asset.name:
                stmt = select(UsdAssetLibrary.id).where(
                    UsdAssetLibrary.name == update_data["name"],
                    UsdAssetLibrary.id != asset_id,
                ).limit(1)

                exists = (await db.execute(stmt)).scalar_one_or_none()
                if exists:
                    raise BusinessException(
                        ErrorCode.DATA_ALREADY_EXISTS,
                        extra_msg=f"资产名称 '{update_data['name']}' 已存在，请更换其他名称",
                    )
            # 5. 唯一性校验：Location Path
            if "location_path" in update_data and update_data["location_path"] != asset.location_path:
                # update_data["location_path"]
                stmt = select(UsdAssetLibrary.id).where(
                    UsdAssetLibrary.location_path == update_data["location_path"],
                    UsdAssetLibrary.id != asset_id,
                ).limit(1)
                exists = (await db.execute(stmt)).scalar_one_or_none()
                if exists:
                    raise BusinessException(
                        ErrorCode.DATA_ALREADY_EXISTS,
                        extra_msg=f"存储路径 '{update_data['location_path']}' 已被其他资产占用",
                    )
            # 6. 执行字段更新
            for field, value in update_data.items():
                if field in allowed_fields:
                    setattr(asset, field, value)
            # 7. 提交事务
            await db.commit()
            await db.refresh(asset)

            logger.info(f"更新资产成功: id={asset_id}, fields={list(update_data.keys())}")
            return AssetLibraryVo.model_validate(asset)

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[出现错误 在更新资产{asset_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新资产失败: {e}")

    async def delete_asset(
            self,
            asset_id: int,
            db: AsyncSession,
            delete_minio_files: bool = True,
    ) -> int:

        """
        删除资产记录，并可选同步删除 MinIO 中的对应文件。
        :param asset_id: 资产 ID
        :param db: 数据库会话
        :param delete_minio_files: 是否同步删除 MinIO 文件（默认 True）
        :return: 删除资产的id
        """
        # 获取当前要删除的资产
        asset = await self._get_asset_or_raise(asset_id, db)
        deleted_minio_count = 0
        try:
            # 1. 删除 MinIO 文件
            if delete_minio_files:
                location_path = asset.location_path
                # 同步删除缩略图
                if asset.thumbnail_path:
                    try:
                        await self.minio_service.delete_file(asset.thumbnail_path)
                        logger.info(f"已删除缩略图: {asset.thumbnail_path}")
                    except Exception as thumb_err:
                        logger.warning(f"删除缩略图失败: {thumb_err}")
                # 批量删除 location_path 前缀下所有文件
                deleted_minio_count = await self.minio_service.delete_files_by_prefix(location_path)
            # 2. 删除数据库记录，去删除数据库服务
            await db.delete(asset)
            await db.commit()
            logger.info(f"资产删除成功: id={asset_id}, MinIO删除文件数={deleted_minio_count}")
            # 返回删除资产的id
            return asset_id
        except BusinessException:
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete_asset]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除资产失败: {e}")


    async def delete_asset_thumbnail_path(
            self,
            asset_id: int,
            db: AsyncSession,
    ) -> dict:
        """
        删除资产缩略图
        :param asset_id:
        :param db:
        :return:
        """
        asset = await self._get_asset_or_raise(asset_id, db)
        try:
            # 同步删除缩略图
            if asset.thumbnail_path:
                try:
                    # 删除minio 的图片
                    await self.minio_service.delete_file(asset.thumbnail_path)
                    logger.info(f"已删除缩略图: {asset.thumbnail_path}")
                except Exception as thumb_err:
                    logger.warning(f"删除缩略图失败: {thumb_err}")
                    raise BusinessException(ErrorCode.SYSTEM_ERROR, extra_msg=f"删除缩略图失败: {thumb_err}")
            return {
                "asset_id": asset_id,
                "is_delete": True,
            }
        except BusinessException:
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete_asset]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除资产失败: {e}")


    async def _validate_name_and_path(
            self,
            name: str,
            location_path: str,
            db: AsyncSession,
            exclude_id: Optional[int] = None,
    ) -> None:
        """
        校验资产名称和路径是否已存在。
        """
        # 1. 预处理路径
        normalized_path = location_path if location_path.endswith("/") else location_path + "/"
        # 2. 构建查询条件：name 相同 OR path 相同
        # 使用 or_ 连接两个条件
        conditions = [
            UsdAssetLibrary.name == name,
            UsdAssetLibrary.location_path == normalized_path
        ]
        # 如果是更新操作，排除当前 ID
        if exclude_id is not None:
            conditions.append(UsdAssetLibrary.id != exclude_id)
        # 注意：这里前两个条件用 or_ 包裹，exclude_id 条件是 AND 关系
        stmt = select(UsdAssetLibrary).where(
            or_(*conditions[:2]),  # name == x OR path == y
            *conditions[2:]  # AND id != exclude_id
        )
        # 3. 执行查询
        result = await db.execute(stmt)
        existing_record = result.scalar_one_or_none()
        # 4. 如果查到了记录，抛出异常
        if existing_record:
            # 优先检查 name
            if existing_record.name == name:
                raise BusinessException(
                    ErrorCode.DATA_ALREADY_EXISTS,
                    extra_msg=f"资产名称 '{name}' 已存在，请更换其他名称"
                )
            # 其次检查 path
            if existing_record.location_path == normalized_path:
                raise BusinessException(
                    ErrorCode.DATA_ALREADY_EXISTS,
                    extra_msg=f"存储路径 '{normalized_path}' 已被其他资产占用，请更换 location_path"
                )
    async def _get_asset_or_raise(
            self,
            asset_id: int,
            db: AsyncSession,
    ) -> UsdAssetLibrary:
        """
        根据 ID 查询资产实体，若不存在则抛出 NOT_FOUND_ERROR 异常，根据id查出来对应的错误
        """
        result = await db.execute(
            select(UsdAssetLibrary).where(UsdAssetLibrary.id == asset_id)
        )
        asset = result.scalar_one_or_none()
        if asset is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"资产不存在: id={asset_id}",
            )
        return asset