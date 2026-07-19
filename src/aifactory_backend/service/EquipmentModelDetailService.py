import math
import logging
from typing import List, Optional

from sqlalchemy import select, func, update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.constant.ThumbnailConstant import DEFAULT_LINE_THUMBNAIL, DEFAULT_EQUIPMENT_THUMBNAIL
from models.dto.EquipmentModelDetailDto import (
    EquipmentModelDetailCreateDto,
    EquipmentModelDetailUpdateDto,
    EquipmentModelDetailQueryDto,
)
from models.entity.EquipmentModelDetailEntity import EquipmentModelDetail
from models.entity.LineModelEquipmentRelEntity import LineModelEquipmentRel
from models.entity.LineModelDetailEntity import LineModelDetail
from models.entity.AssetCategoryEntity import AssetCategory
from models.vo.EquipmentModelDetailVo import EquipmentModelDetailVo
from models.enums.AssetModelStatusEnum import AssetModelStatus
from service.MinioService import MinioManagerService

init_logging()
logger = logging.getLogger(__name__)


class EquipmentModelDetailService:
    """
    设备模型详情业务服务
    负责 equipment_model_details 表的 CRUD 操作
    """

    async def create_equipment_model_detail(
            self,
            dto: EquipmentModelDetailCreateDto,
            db: AsyncSession,
    ) -> EquipmentModelDetailVo:
        """创建设备模型详情"""
        try:
            entity = EquipmentModelDetail(
                category_id=dto.category_id,
                manufacturer=dto.manufacturer,
                asset_type=dto.asset_type,
                brand=dto.brand,
                bucket_name=dto.bucket_name,
                root_usd_path=dto.root_usd_path,
                location_path=dto.location_path,
                thumbnail_path=dto.thumbnail_path,
                specifications=dto.specifications,
                category=dto.category,
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
            # 版本谱系：新建资产首版，asset_version_id 回填为自身 id，避免为 NULL
            # （与 migrate_softdelete_versioning.py 的 asset_version_id=id 回填保持一致）
            if entity.asset_version_id is None:
                entity.asset_version_id = entity.id
            await db.commit()
            await db.refresh(entity)
            logger.info(f"创建设备模型详情成功: id={entity.id}, category_id={entity.category_id}, asset_version_id={entity.asset_version_id}")
            return self._build_vo(entity)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create_equipment_model_detail]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建设备模型详情失败: {e}")

    async def create_new_version(
            self,
            source_detail_id: str,
            version_tag: str,
            remark: Optional[str],
            created_by: Optional[str],
            overrides: Optional[dict],
            db: AsyncSession,
    ) -> EquipmentModelDetailVo:
        """
        基于已有设备详情记录派生一条新版本（本地存储版，仅做 DB 行派生）：
        - 定位源行（is_deleted=False），确定版本谱系 asset_version_id（源行为空则回退为源行 id）
        - 校验 version_tag 在同一谱系下唯一
        - 全量复制源行字段，覆盖 overrides 中提供的字段，is_current=True
        - 同谱系其余 is_current=True 行置为 False（保留历史版本，不删除）
        """
        source = await self._get_or_raise(source_detail_id, db)
        # 谱系 ID：源行 asset_version_id 优先；历史数据可能为空，回退为源行自身 id
        lineage_id = source.asset_version_id or source.id
        # 兼容 asset_version_id 尚未回填的历史首版，确保旧 current 行能被同谱系更新命中。
        if source.asset_version_id is None:
            source.asset_version_id = lineage_id

        # version_tag 在同一谱系下唯一性校验（排除软删除）
        tag_check = await db.execute(
            select(EquipmentModelDetail.id).where(
                EquipmentModelDetail.asset_version_id == lineage_id,
                EquipmentModelDetail.version_tag == version_tag,
                EquipmentModelDetail.is_deleted == False,
            ).limit(1)
        )
        if tag_check.scalar_one_or_none() is not None:
            raise BusinessException(
                ErrorCode.DATA_ALREADY_EXISTS,
                extra_msg=f"版本标签 '{version_tag}' 在同一逻辑资产下已存在",
            )

        overrides = overrides or {}
        try:
            entity = EquipmentModelDetail(
                category_id=source.category_id,
                manufacturer=source.manufacturer,
                asset_type=source.asset_type,
                brand=source.brand,
                bucket_name=source.bucket_name,
                root_usd_path=overrides.get("root_usd_path") or source.root_usd_path,
                location_path=overrides.get("location_path") or source.location_path,
                thumbnail_path=overrides.get("thumbnail_path") or source.thumbnail_path,
                status=AssetModelStatus.ACTIVE.value,
                specifications=source.specifications,
                category=source.category,
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
                sa_update(EquipmentModelDetail)
                .where(
                    EquipmentModelDetail.asset_version_id == lineage_id,
                    EquipmentModelDetail.is_current == True,
                    EquipmentModelDetail.id != entity.id,
                )
                .values(is_current=False)
            )

            await db.commit()
            await db.refresh(entity)
            logger.info(
                f"创建设备模型新版本成功: new_id={entity.id}, source_id={source_detail_id}, "
                f"asset_version_id={entity.asset_version_id}, version_tag={entity.version_tag}"
            )
            return self._build_vo(entity)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create_new_version(equipment) source_id={source_detail_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建设备模型新版本失败: {e}")

    async def get_equipment_model_detail_by_id(
            self,
            detail_id: int,
            db: AsyncSession,
    ) -> EquipmentModelDetailVo:
        """根据主键 ID 查询单条设备模型详情"""
        entity = await self._get_or_raise(detail_id, db)
        return self._build_vo(entity)

    async def list_equipment_model_details(
            self,
            query: EquipmentModelDetailQueryDto,
            db: AsyncSession,
    ) -> Page[EquipmentModelDetailVo]:
        """
        查询设备模型详情列表（支持分页/全量）：
        - 未传任何参数时：全量返回
        - 传入参数时：按条件过滤 + 分页返回
        """
        try:
            stmt = select(EquipmentModelDetail)
            count_stmt = select(func.count()).select_from(EquipmentModelDetail)
            # 软删除：列表默认排除已删除行（与全仓 is_deleted 约定一致）
            conditions = [EquipmentModelDetail.is_deleted == False]

            if query.category_id is not None:
                conditions.append(EquipmentModelDetail.category_id == query.category_id)
            if query.manufacturer:
                conditions.append(EquipmentModelDetail.manufacturer.ilike(f"%{query.manufacturer}%"))
            if query.asset_type:
                conditions.append(EquipmentModelDetail.asset_type.ilike(f"%{query.asset_type}%"))
            if query.brand:
                conditions.append(EquipmentModelDetail.brand.ilike(f"%{query.brand}%"))

            if conditions:
                from sqlalchemy import and_
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))

            stmt = stmt.order_by(EquipmentModelDetail.created_at.desc())

            total_result = await db.execute(count_stmt)
            total = total_result.scalar_one()

            is_full_query = not bool(query.model_fields_set)
            if is_full_query:
                result = await db.execute(stmt)
                items = [self._build_vo(r) for r in result.scalars().all()]
                logger.info(f"全量查询设备模型详情: total={total}")
                return Page(items=items, total=total, current=1,
                            pageSize=total if total > 0 else 10, totalPages=1)

            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [self._build_vo(r) for r in result.scalars().all()]
            total_pages = math.ceil(total / query.pageSize) if query.pageSize > 0 else 0
            logger.info(f"过滤分页查询设备模型详情: total={total}, current={query.current}, pageSize={query.pageSize}")
            return Page(items=items, total=total, current=query.current,
                        pageSize=query.pageSize, totalPages=total_pages)

        except Exception as e:
            logger.error(f"[Error in list_equipment_model_details]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询设备模型详情列表失败: {e}")

    async def update_equipment_model_detail(
            self,
            detail_id: int,
            dto: EquipmentModelDetailUpdateDto,
            db: AsyncSession,
    ) -> EquipmentModelDetailVo:
        """部分更新设备模型详情，仅更新请求体中非空的字段。
        若请求中包含新的 thumbnail_path 且当前缩略图不是默认图，则先删除 MinIO 旧缩略图。
        """
        entity = await self._get_or_raise(detail_id, db)
        if entity.status == AssetModelStatus.ARCHIVED.value:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg=f"设备模型已归档（id={detail_id}），不可修改")

        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("id", None)

        if not update_data:
            logger.warning(f"更新设备模型详情 {detail_id}: 未提供任何有效更新数据")
            return self._build_vo(entity)

        allowed_fields = {
            "category_id", "manufacturer", "asset_type", "brand", "bucket_name",
            "root_usd_path", "location_path", "thumbnail_path", "specifications",
            "category", "model", "format", "poly_count",
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
            logger.info(f"更新设备模型详情成功: id={detail_id}, fields={list(update_data.keys())}")
            return self._build_vo(entity)

        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_equipment_model_detail {detail_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新设备模型详情失败: {e}")

    async def delete_equipment_model_detail(
            self,
            detail_id: int,
            db: AsyncSession,
    ) -> int:
        """
        删除设备模型详情记录。
        :return: 被删除的主键 ID
        """
        entity = await self._get_or_raise(detail_id, db)
        try:
            entity.is_deleted = True  # 软删除（实体仍保留 is_deleted 列，与全仓约定一致）
            await db.commit()
            logger.info(f"软删除设备模型详情成功: id={detail_id}")
            return detail_id
        except BusinessException:
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete_equipment_model_detail]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除设备模型详情失败: {e}")

    async def _get_or_raise(
            self,
            detail_id: int,
            db: AsyncSession,
    ) -> EquipmentModelDetail:
        """根据主键 ID 查询设备模型详情实体，不存在则抛出 NOT_FOUND_ERROR"""
        result = await db.execute(
            select(EquipmentModelDetail).where(
                EquipmentModelDetail.id == detail_id,
                EquipmentModelDetail.is_deleted == False,
            )
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"设备模型详情不存在: id={detail_id}",
            )
        return entity

    async def enable(self, detail_id: str, db: AsyncSession) -> EquipmentModelDetailVo:
        """启用设备模型：DRAFT/INACTIVE → ACTIVE。ARCHIVED 不允许。"""
        entity = await self._get_or_raise(detail_id, db)
        if entity.status == AssetModelStatus.ARCHIVED.value:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg=f"设备模型已归档（id={detail_id}），无法启用")
        if entity.status == AssetModelStatus.ACTIVE.value:
            return self._build_vo(entity)
        try:
            entity.status = AssetModelStatus.ACTIVE.value
            await db.commit()
            await db.refresh(entity)
            logger.info(f"设备模型启用成功: id={detail_id}")
            return self._build_vo(entity)
        except Exception as e:
            await db.rollback()
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"启用设备模型失败: {e}")

    async def batch_enable(self, ids: List[str], db: AsyncSession) -> List[str]:
        """批量启用：DRAFT/INACTIVE → ACTIVE，跳过 ARCHIVED。返回实际启用的 ID。"""
        if not ids:
            return []
        try:
            result = await db.execute(
                sa_update(EquipmentModelDetail)
                .where(
                    EquipmentModelDetail.id.in_(ids),
                    EquipmentModelDetail.status.in_([AssetModelStatus.DRAFT.value, AssetModelStatus.INACTIVE.value]),
                    EquipmentModelDetail.is_deleted == False,
                )
                .values(status=AssetModelStatus.ACTIVE.value)
                .returning(EquipmentModelDetail.id)
            )
            affected = [row[0] for row in result.fetchall()]
            await db.commit()
            logger.info(f"批量启用设备模型: ids={affected}")
            return affected
        except Exception as e:
            await db.rollback()
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"批量启用设备模型失败: {e}")

    async def disable(self, detail_id: str, db: AsyncSession) -> EquipmentModelDetailVo:
        """禁用设备模型：DRAFT/ACTIVE → INACTIVE。ARCHIVED 不允许；被线体引用时拒绝。"""
        entity = await self._get_or_raise(detail_id, db)
        if entity.status == AssetModelStatus.ARCHIVED.value:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg=f"设备模型已归档（id={detail_id}），无法禁用")
        if entity.status == AssetModelStatus.INACTIVE.value:
            return self._build_vo(entity)
        # 校验：当前设备是否被某线体挂载
        refs = (await db.execute(
            select(LineModelEquipmentRel.line_model_id, AssetCategory.name)
            .join(LineModelDetail, LineModelEquipmentRel.line_model_id == LineModelDetail.id)
            .join(AssetCategory, LineModelDetail.category_id == AssetCategory.id)
            .where(
                LineModelEquipmentRel.equipment_model_id == detail_id,
                LineModelEquipmentRel.is_deleted == False,
                LineModelDetail.is_deleted == False,
            )
        )).all()
        if refs:
            ref_items = [f"{cat_name}(线体模型id={line_id})" for line_id, cat_name in refs[:5]]
            ref_str = "、".join(ref_items)
            if len(refs) > 5:
                ref_str += f" 等{len(refs)}个线体"
            raise BusinessException(ErrorCode.OPERATION_ERROR, extra_msg=f"无法禁用设备模型(id={detail_id})，当前设备被 {len(refs)} 个线体模型引用：{ref_str}")
        try:
            entity.status = AssetModelStatus.INACTIVE.value
            await db.commit()
            await db.refresh(entity)
            logger.info(f"设备模型禁用成功: id={detail_id}")
            return self._build_vo(entity)
        except Exception as e:
            await db.rollback()
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"禁用设备模型失败: {e}")

    async def batch_disable(self, ids: List[str], db: AsyncSession) -> List[str]:
        """批量禁用：DRAFT/ACTIVE → INACTIVE，跳过 ARCHIVED。任一设备被线体引用则整体拒绝。"""
        if not ids:
            return []
        rel_rows = (await db.execute(
            select(LineModelEquipmentRel.equipment_model_id, AssetCategory.name)
            .join(LineModelDetail, LineModelEquipmentRel.line_model_id == LineModelDetail.id)
            .join(AssetCategory, LineModelDetail.category_id == AssetCategory.id)
            .where(
                LineModelEquipmentRel.equipment_model_id.in_(ids),
                LineModelEquipmentRel.is_deleted == False,
                LineModelDetail.is_deleted == False,
            )
        )).all()
        ref_map: dict = {}
        for eq_id, cat_name in rel_rows:
            ref_map.setdefault(eq_id, []).append(cat_name)
        if ref_map:
            ref_msgs = [
                f"设备模型 id={eid} 被 {len(refs)} 个线体引用：{', '.join(refs[:3])}{'...' if len(refs) > 3 else ''}"
                for eid, refs in ref_map.items()
            ]
            raise BusinessException(ErrorCode.OPERATION_ERROR, extra_msg="以下设备模型被线体引用，无法批量禁用：\n" + "\n".join(ref_msgs))
        try:
            result = await db.execute(
                sa_update(EquipmentModelDetail)
                .where(
                    EquipmentModelDetail.id.in_(ids),
                    EquipmentModelDetail.status.in_([AssetModelStatus.DRAFT.value, AssetModelStatus.ACTIVE.value]),
                    EquipmentModelDetail.is_deleted == False,
                )
                .values(status=AssetModelStatus.INACTIVE.value)
                .returning(EquipmentModelDetail.id)
            )
            affected = [row[0] for row in result.fetchall()]
            await db.commit()
            logger.info(f"批量禁用设备模型: ids={affected}")
            return affected
        except Exception as e:
            await db.rollback()
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"批量禁用设备模型失败: {e}")

    async def archive(self, detail_id: str, db: AsyncSession) -> EquipmentModelDetailVo:
        """归档设备模型：任意非归档 → ARCHIVED。归档后不可修改。"""
        entity = await self._get_or_raise(detail_id, db)
        if entity.status == AssetModelStatus.ARCHIVED.value:
            return self._build_vo(entity)
        try:
            entity.status = AssetModelStatus.ARCHIVED.value
            await db.commit()
            await db.refresh(entity)
            logger.info(f"设备模型归档成功: id={detail_id}")
            return self._build_vo(entity)
        except Exception as e:
            await db.rollback()
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"归档设备模型失败: {e}")

    def _build_vo(self, entity: EquipmentModelDetail) -> EquipmentModelDetailVo:
        """将实体转换为 VO，并将缩略图路径替换为完整 URL（域名+桶名+路径）"""
        vo = EquipmentModelDetailVo.model_validate(entity)
        if entity.thumbnail_path:
            url = MinioManagerService().build_full_url(
                object_name=entity.thumbnail_path,
                bucket_name=entity.bucket_name,
            )
            vo = vo.model_copy(update={"thumbnail_path": url})
        return vo
