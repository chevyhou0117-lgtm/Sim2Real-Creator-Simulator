import math
import logging
from typing import List, Optional

from sqlalchemy import select, func, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from models.enums.AssetModelStatusEnum import AssetModelStatus
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.constant.ThumbnailConstant import DEFAULT_LINE_THUMBNAIL, DEFAULT_EQUIPMENT_THUMBNAIL
from models.dto.LineModelDetailDto import (
    LineModelDetailCreateDto,
    LineModelDetailUpdateDto,
    LineModelDetailQueryDto,
)
from models.entity.LineModelDetailEntity import LineModelDetail
from models.entity.EquipmentModelDetailEntity import EquipmentModelDetail
from models.entity.LineModelEquipmentRelEntity import LineModelEquipmentRel
from models.entity.AssetCategoryEntity import AssetCategory
from models.vo.LineModelDetailVo import LineModelDetailVo, LineAndEquipmentModelDetailVo
from service.MinioService import MinioManagerService

init_logging()
logger = logging.getLogger(__name__)


class LineModelDetailService:
    """
    线体模型详情业务服务
    负责 line_model_details 表的 CRUD 操作
    """

    async def create_line_model_detail(
            self,
            dto: LineModelDetailCreateDto,
            db: AsyncSession,
    ) -> LineModelDetailVo:
        """创建线体模型详情"""
        try:
            entity = LineModelDetail(
                category_id=dto.category_id,
                bucket_name=dto.bucket_name,
                root_usd_path=dto.root_usd_path,
                location_path=dto.location_path,
                thumbnail_path=dto.thumbnail_path,
                category=dto.category,
                manufacturer=dto.manufacturer,
                model=dto.model,
                format=dto.format,
                poly_count=dto.poly_count,
                prim_path=dto.prim_path,
                instance_path=dto.instance_path,
                width=dto.width,
                depth=dto.depth,
                height=dto.height,
            )
            db.add(entity)
            await db.flush()  # 先 flush 拿到 entity.id
            # 版本谱系：新建线体首版，asset_version_id 回填为自身 id，避免为 NULL
            if entity.asset_version_id is None:
                entity.asset_version_id = entity.id
            await db.commit()
            await db.refresh(entity)
            logger.info(f"创建线体模型详情成功: id={entity.id}, category_id={entity.category_id}, asset_version_id={entity.asset_version_id}")
            return self._build_vo(entity)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create_line_model_detail]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建线体模型详情失败: {e}")

    async def create_new_version(
            self,
            source_detail_id: str,
            version_tag: str,
            remark: Optional[str],
            created_by: Optional[str],
            overrides: Optional[dict],
            db: AsyncSession,
    ) -> LineModelDetailVo:
        """
        基于已有线体详情记录派生一条新版本（本地存储版，仅做 DB 行派生）：
        - 定位源行（is_deleted=False），确定版本谱系 asset_version_id（源行为空则回退为源行 id）
        - 校验 version_tag 在同一谱系下唯一
        - 全量复制源行字段，覆盖 overrides 中提供的字段，is_current=True
        - 同谱系其余 is_current=True 行置为 False（保留历史版本，不删除）

        说明：本地存储版仅派生 line_model_details 行，不重建 line_model_equipment_rel
        设备关联关系（SOURCE 的关系重建依赖 ZIP 路径重映射，此处无文件操作）。
        """
        source = await self._get_or_raise(source_detail_id, db)
        # 谱系 ID：源行 asset_version_id 优先；历史数据可能为空，回退为源行自身 id
        lineage_id = source.asset_version_id or source.id
        # 历史首版可能没有回填 asset_version_id。先补齐源行，否则下面按谱系下线旧版本时
        # 匹配不到 NULL 行，会留下两个 is_current=True。
        if source.asset_version_id is None:
            source.asset_version_id = lineage_id

        # version_tag 在同一谱系下唯一性校验（排除软删除）
        tag_check = await db.execute(
            select(LineModelDetail.id).where(
                LineModelDetail.asset_version_id == lineage_id,
                LineModelDetail.version_tag == version_tag,
                LineModelDetail.is_deleted == False,
            ).limit(1)
        )
        if tag_check.scalar_one_or_none() is not None:
            raise BusinessException(
                ErrorCode.DATA_ALREADY_EXISTS,
                extra_msg=f"版本标签 '{version_tag}' 在同一逻辑资产下已存在",
            )

        overrides = overrides or {}
        try:
            entity = LineModelDetail(
                category_id=source.category_id,
                bucket_name=source.bucket_name,
                root_usd_path=overrides.get("root_usd_path") or source.root_usd_path,
                location_path=overrides.get("location_path") or source.location_path,
                thumbnail_path=overrides.get("thumbnail_path") or source.thumbnail_path,
                status=AssetModelStatus.ACTIVE.value,
                category=source.category,
                manufacturer=source.manufacturer,
                model=source.model,
                format=source.format,
                poly_count=source.poly_count,
                prim_path=source.prim_path,
                instance_path=source.instance_path,
                width=source.width,
                depth=source.depth,
                height=source.height,
                asset_version_id=lineage_id,
                version_tag=version_tag,
                is_current=True,
                remark=remark,
                created_by=created_by if created_by is not None else source.created_by,
            )
            db.add(entity)
            await db.flush()  # 拿到新行 id

            # 同谱系旧的当前版本下线（保留历史，不软删除）
            await db.execute(
                sa_update(LineModelDetail)
                .where(
                    LineModelDetail.asset_version_id == lineage_id,
                    LineModelDetail.is_current == True,
                    LineModelDetail.id != entity.id,
                )
                .values(is_current=False)
            )

            await db.commit()
            await db.refresh(entity)
            logger.info(
                f"创建线体模型新版本成功: new_id={entity.id}, source_id={source_detail_id}, "
                f"asset_version_id={entity.asset_version_id}, version_tag={entity.version_tag}"
            )
            return self._build_vo(entity)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create_new_version(line) source_id={source_detail_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建线体模型新版本失败: {e}")

    async def get_line_model_detail_by_id(
            self,
            detail_id: int,
            db: AsyncSession,
    ) -> LineModelDetailVo:
        """根据主键 ID 查询单条线体模型详情"""
        entity = await self._get_or_raise(detail_id, db)
        return self._build_vo(entity)

    async def list_line_model_details(
            self,
            query: LineModelDetailQueryDto,
            db: AsyncSession,
    ) -> Page[LineModelDetailVo]:
        """
        查询线体模型详情列表（支持分页/全量）：
        - 未传任何参数时：全量返回
        - 传入参数时：按条件过滤 + 分页返回
        """
        try:
            stmt = select(LineModelDetail)
            count_stmt = select(func.count()).select_from(LineModelDetail)
            # 软删除：列表默认排除已删除行（与全仓 is_deleted 约定一致）
            conditions = [LineModelDetail.is_deleted == False]

            if query.category_id is not None:
                conditions.append(LineModelDetail.category_id == query.category_id)

            if conditions:
                from sqlalchemy import and_
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))

            stmt = stmt.order_by(LineModelDetail.created_at.desc())

            total_result = await db.execute(count_stmt)
            total = total_result.scalar_one()

            is_full_query = not bool(query.model_fields_set)
            if is_full_query:
                result = await db.execute(stmt)
                items = [self._build_vo(r) for r in result.scalars().all()]
                return Page(items=items, total=total, current=1,
                            pageSize=total if total > 0 else 10, totalPages=1)

            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [self._build_vo(r) for r in result.scalars().all()]
            total_pages = math.ceil(total / query.pageSize) if query.pageSize > 0 else 0
            logger.info(f"过滤分页查询线体模型详情: total={total}, current={query.current}, pageSize={query.pageSize}")
            return Page(items=items, total=total, current=query.current,
                        pageSize=query.pageSize, totalPages=total_pages)

        except Exception as e:
            logger.error(f"[Error in list_line_model_details]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询线体模型详情列表失败: {e}")

    async def update_line_model_detail(
            self,
            detail_id: int,
            dto: LineModelDetailUpdateDto,
            db: AsyncSession,
    ) -> LineModelDetailVo:
        """部分更新线体模型详情，仅更新请求体中非空的字段。
        先上传缩略图，然后将缩略图路径更新到数据库中。
        若请求中包含新的 thumbnail_path 且当前缩略图不是默认图，则先删除 MinIO 旧缩略图。
        """
        entity = await self._get_or_raise(detail_id, db)
        if entity.status == AssetModelStatus.ARCHIVED.value:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg=f"线体模型已归档（id={detail_id}），不可修改")

        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("id", None)

        if not update_data:
            logger.warning(f"更新线体模型详情 {detail_id}: 未提供任何有效更新数据")
            return self._build_vo(entity)

        allowed_fields = {
            "category_id", "bucket_name", "root_usd_path", "location_path", "thumbnail_path",
            "category", "manufacturer", "model", "format", "poly_count",
            "prim_path", "instance_path", "width", "depth", "height",
        }

        try:
            # 缩略图更新：旧缩略图非默认时删除 MinIO 旧文件
            new_thumbnail = update_data.get("thumbnail_path")
            if new_thumbnail is not None:
                old_thumbnail = entity.thumbnail_path
                default_thumbnails = {DEFAULT_LINE_THUMBNAIL, DEFAULT_EQUIPMENT_THUMBNAIL}
                if old_thumbnail and old_thumbnail not in default_thumbnails:
                    try:
                        await MinioManagerService().delete_file(old_thumbnail)
                    except Exception as ex:
                        logger.warning(f"MinIO 删除旧缩略图失败（忽略）: path={old_thumbnail}, err={ex}")

            for field, value in update_data.items():
                if field in allowed_fields:
                    setattr(entity, field, value)

            await db.commit()
            await db.refresh(entity)
            logger.info(f"更新线体模型详情成功: id={detail_id}, fields={list(update_data.keys())}")
            return self._build_vo(entity)

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_line_model_detail {detail_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新线体模型详情失败: {e}")

    async def delete_line_model_detail(
            self,
            detail_id: int,
            db: AsyncSession,
    ) -> int:
        """
        删除线体模型详情记录。
        :return: 被删除的主键 ID
        """
        entity = await self._get_or_raise(detail_id, db)
        try:
            entity.is_deleted = True  # 软删除（实体仍保留 is_deleted 列，与全仓约定一致）
            await db.commit()
            logger.info(f"软删除线体模型详情成功: id={detail_id}")
            return detail_id
        except BusinessException:
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete_line_model_detail]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除线体模型详情失败: {e}")

    async def _get_or_raise(
            self,
            detail_id: int,
            db: AsyncSession,
    ) -> LineModelDetail:
        """根据主键 ID 查询线体模型详情实体，不存在则抛出 NOT_FOUND_ERROR"""
        result = await db.execute(
            select(LineModelDetail).where(
                LineModelDetail.id == detail_id,
                LineModelDetail.is_deleted == False,
            )
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"线体模型详情不存在: id={detail_id}",
            )
        return entity

    async def get_equipment_by_line_id(
            self,
            line_model_detail_id: str,
            db: AsyncSession,
    ) -> List[LineAndEquipmentModelDetailVo]:
        """
        根据线体详情 ID 查询该线体下挂载的所有设备：
        1. 校验线体是否存在
        2. 查 line_model_equipment_rel 获取关联记录（line_model_id = 传入 id）
        3. 反查 equipment_model_details 获取设备详情
        4. 查 asset_categories 补充 name / type
        5. 组装 LineAndEquipmentModelDetailVo 列表返回
        """
        # 1. 校验线体存在
        line_entity = await self._get_or_raise(line_model_detail_id, db)

        try:
            # 1.1 查线体所属分类名称（用于按上传命名约定还原每个设备实例的 prim_path）
            line_name_row = await db.execute(
                select(AssetCategory.name).where(AssetCategory.id == line_entity.category_id)
            )
            line_name = line_name_row.scalar_one_or_none() or ""

            # 2. 查关联表
            rel_result = await db.execute(
                select(LineModelEquipmentRel).where(
                    LineModelEquipmentRel.line_model_id == line_model_detail_id,
                    LineModelEquipmentRel.is_deleted == False,
                )
            )
            rels: List[LineModelEquipmentRel] = list(rel_result.scalars().all())
            if not rels:
                logger.info(f"线体 {line_model_detail_id} 下未挂载任何设备")
                return []

            # 3. 批量查设备详情
            eq_ids = [rel.equipment_model_id for rel in rels]
            eq_result = await db.execute(
                select(EquipmentModelDetail).where(
                    EquipmentModelDetail.id.in_(eq_ids),
                    EquipmentModelDetail.is_deleted == False,
                )
            )
            eq_map = {eq.id: eq for eq in eq_result.scalars().all()}

            # 4. 批量查资产分类补充 name / type
            cat_ids = list({eq.category_id for eq in eq_map.values()})
            cat_map = {}
            if cat_ids:
                cat_result = await db.execute(
                    select(AssetCategory.id, AssetCategory.name, AssetCategory.type).where(
                        AssetCategory.id.in_(cat_ids),
                        AssetCategory.is_deleted == False,
                    )
                )
                cat_map = {row.id: (row.name, row.type) for row in cat_result.fetchall()}

            # 5. 组装 VO
            minio = MinioManagerService()
            vos: List[LineAndEquipmentModelDetailVo] = []
            for rel in rels:
                eq = eq_map.get(rel.equipment_model_id)
                if eq is None:
                    logger.warning(
                        f"设备详情不存在或已删除: equipment_model_id={rel.equipment_model_id}, 跳过"
                    )
                    continue
                cat_name, cat_type = cat_map.get(eq.category_id, (None, None))
                thumbnail = None
                if eq.thumbnail_path:
                    thumbnail = minio.build_full_url(
                        object_name=eq.thumbnail_path,
                        bucket_name=eq.bucket_name or "ov-usd-bucket",
                    )
                # 按上传时的命名约定还原设备实例在产线 USD 中的 prim_path：
                #   /World/{line}/ASSET_PROD/asset_{line}_PROD/t_{instance_name}
                # 注：迁移时 line_model_equipment_rel.prim_path 列已被删除，故改为读时按约定
                # 计算；缺线体名/实例名时回退到设备自身的 eq.prim_path。
                computed_prim_path = (
                    f"/World/{line_name}/ASSET_PROD/asset_{line_name}_PROD/t_{rel.instance_name}"
                    if line_name and rel.instance_name else None
                )
                vos.append(LineAndEquipmentModelDetailVo(
                    name=cat_name,
                    type=cat_type,
                    instance_name=rel.instance_name or "",
                    root_usd_path=eq.root_usd_path,
                    location_path=eq.location_path,
                    thumbnail_path=thumbnail,
                    instance_path=eq.instance_path,
                    prim_path=computed_prim_path or eq.prim_path,
                ))
            return vos
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in get_equipment_by_line_id]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询线体挂载设备失败: {e}")

    async def enable(self, detail_id: str, db: AsyncSession) -> LineModelDetailVo:
        """启用线体模型：DRAFT/INACTIVE → ACTIVE。ARCHIVED 不允许。"""
        entity = await self._get_or_raise(detail_id, db)
        if entity.status == AssetModelStatus.ARCHIVED.value:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg=f"线体模型已归档（id={detail_id}），无法启用")
        if entity.status == AssetModelStatus.ACTIVE.value:
            return self._build_vo(entity)
        try:
            entity.status = AssetModelStatus.ACTIVE.value
            await db.commit()
            await db.refresh(entity)
            logger.info(f"线体模型启用成功: id={detail_id}")
            return self._build_vo(entity)
        except Exception as e:
            await db.rollback()
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"启用线体模型失败: {e}")

    async def batch_enable(self, ids: List[str], db: AsyncSession) -> List[str]:
        """批量启用：DRAFT/INACTIVE → ACTIVE，跳过 ARCHIVED。返回实际启用的 ID。"""
        if not ids:
            return []
        try:
            result = await db.execute(
                sa_update(LineModelDetail)
                .where(
                    LineModelDetail.id.in_(ids),
                    LineModelDetail.status.in_([AssetModelStatus.DRAFT.value, AssetModelStatus.INACTIVE.value]),
                    LineModelDetail.is_deleted == False,
                )
                .values(status=AssetModelStatus.ACTIVE.value)
                .returning(LineModelDetail.id)
            )
            affected = [row[0] for row in result.fetchall()]
            await db.commit()
            logger.info(f"批量启用线体模型: ids={affected}")
            return affected
        except Exception as e:
            await db.rollback()
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"批量启用线体模型失败: {e}")

    async def disable(self, detail_id: str, db: AsyncSession) -> LineModelDetailVo:
        """禁用线体模型：DRAFT/ACTIVE → INACTIVE。ARCHIVED 不允许；线体下挂载设备时拒绝。"""
        entity = await self._get_or_raise(detail_id, db)
        if entity.status == AssetModelStatus.ARCHIVED.value:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg=f"线体模型已归档（id={detail_id}），无法禁用")
        if entity.status == AssetModelStatus.INACTIVE.value:
            return self._build_vo(entity)
        # 校验：当前线体下是否挂载了设备
        refs = (await db.execute(
            select(LineModelEquipmentRel.equipment_model_id, AssetCategory.name)
            .join(EquipmentModelDetail, LineModelEquipmentRel.equipment_model_id == EquipmentModelDetail.id)
            .join(AssetCategory, EquipmentModelDetail.category_id == AssetCategory.id)
            .where(
                LineModelEquipmentRel.line_model_id == detail_id,
                LineModelEquipmentRel.is_deleted == False,
                EquipmentModelDetail.is_deleted == False,
            )
        )).all()
        if refs:
            ref_items = [f"{cat_name}(设备模型id={eq_id})" for eq_id, cat_name in refs[:5]]
            ref_str = "、".join(ref_items)
            if len(refs) > 5:
                ref_str += f" 等{len(refs)}个设备"
            raise BusinessException(ErrorCode.OPERATION_ERROR, extra_msg=f"无法禁用线体模型(id={detail_id})，当前线体下挂载了 {len(refs)} 个设备模型：{ref_str}")
        try:
            entity.status = AssetModelStatus.INACTIVE.value
            await db.commit()
            await db.refresh(entity)
            logger.info(f"线体模型禁用成功: id={detail_id}")
            return self._build_vo(entity)
        except Exception as e:
            await db.rollback()
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"禁用线体模型失败: {e}")

    async def batch_disable(self, ids: List[str], db: AsyncSession) -> List[str]:
        """批量禁用：DRAFT/ACTIVE → INACTIVE，跳过 ARCHIVED。任一线体挂载设备则整体拒绝。"""
        if not ids:
            return []
        rel_rows = (await db.execute(
            select(LineModelEquipmentRel.line_model_id, AssetCategory.name)
            .join(EquipmentModelDetail, LineModelEquipmentRel.equipment_model_id == EquipmentModelDetail.id)
            .join(AssetCategory, EquipmentModelDetail.category_id == AssetCategory.id)
            .where(
                LineModelEquipmentRel.line_model_id.in_(ids),
                LineModelEquipmentRel.is_deleted == False,
                EquipmentModelDetail.is_deleted == False,
            )
        )).all()
        ref_map: dict = {}
        for line_id, cat_name in rel_rows:
            ref_map.setdefault(line_id, []).append(cat_name)
        if ref_map:
            ref_msgs = [
                f"线体模型 id={lid} 下挂载了 {len(refs)} 个设备：{', '.join(refs[:3])}{'...' if len(refs) > 3 else ''}"
                for lid, refs in ref_map.items()
            ]
            raise BusinessException(ErrorCode.OPERATION_ERROR, extra_msg="以下线体模型存在设备挂载关系，无法批量禁用：\n" + "\n".join(ref_msgs))
        try:
            result = await db.execute(
                sa_update(LineModelDetail)
                .where(
                    LineModelDetail.id.in_(ids),
                    LineModelDetail.status.in_([AssetModelStatus.DRAFT.value, AssetModelStatus.ACTIVE.value]),
                    LineModelDetail.is_deleted == False,
                )
                .values(status=AssetModelStatus.INACTIVE.value)
                .returning(LineModelDetail.id)
            )
            affected = [row[0] for row in result.fetchall()]
            await db.commit()
            logger.info(f"批量禁用线体模型: ids={affected}")
            return affected
        except Exception as e:
            await db.rollback()
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"批量禁用线体模型失败: {e}")

    async def archive(self, detail_id: str, db: AsyncSession) -> LineModelDetailVo:
        """归档线体模型：任意非归档 → ARCHIVED。归档后不可修改。"""
        entity = await self._get_or_raise(detail_id, db)
        if entity.status == AssetModelStatus.ARCHIVED.value:
            return self._build_vo(entity)
        try:
            entity.status = AssetModelStatus.ARCHIVED.value
            await db.commit()
            await db.refresh(entity)
            logger.info(f"线体模型归档成功: id={detail_id}")
            return self._build_vo(entity)
        except Exception as e:
            await db.rollback()
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"归档线体模型失败: {e}")

    def _build_vo(self, entity: LineModelDetail) -> LineModelDetailVo:
        """将实体转换为 VO，并将缩略图路径替换为完整 URL（域名+桶名+路径）"""
        vo = LineModelDetailVo.model_validate(entity)
        if entity.thumbnail_path:
            url = MinioManagerService().build_full_url(
                object_name=entity.thumbnail_path,
                bucket_name=entity.bucket_name,
            )
            vo = vo.model_copy(update={"thumbnail_path": url})
        return vo
