import math
import logging

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.DictNgCategoryDto import (
    DictNgCategoryCreateDto,
    DictNgCategoryUpdateDto,
    DictNgCategoryQueryDto,
)
from models.entity.DictNgCategoryEntity import DictNgCategory
from models.vo.DictNgCategoryVo import DictNgCategoryVo
from models.enums.BaseStatusEnum import BaseStatus

init_logging()
logger = logging.getLogger(__name__)


class DictNgCategoryService:

    async def create(self, dto: DictNgCategoryCreateDto, db: AsyncSession) -> str:
        try:
            if dto is None:
                raise BusinessException(ErrorCode.PARAMS_ERROR, "请求参数不能为空")
            stmt = select(DictNgCategory).where(DictNgCategory.ng_code == dto.ng_code)
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                raise BusinessException(ErrorCode.DB_ERROR, extra_msg="不良编码已存在")
            entity = DictNgCategory(**dto.model_dump(exclude_unset=True))
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.ng_category_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in DictNgCategoryService.create]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建不良类型失败: {e}")

    async def update(self, category_id: int, dto: DictNgCategoryUpdateDto, db: AsyncSession) -> str:
        entity = await self._get_or_raise(category_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("ng_category_id", None)
        if not update_data:
            return str(category_id)
        allowed_fields = {"ng_code", "ng_name", "impact_level", "status"}
        try:
            for field, value in update_data.items():
                if field in allowed_fields:
                    if field == "status" and isinstance(value, BaseStatus):
                        value = value.value
                    setattr(entity, field, value)
            await db.commit()
            return str(category_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in DictNgCategoryService.update {category_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新不良类型失败: {e}")

    async def delete(self, category_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(category_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(category_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in DictNgCategoryService.delete]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除不良类型失败: {e}")

    async def get_by_id(self, category_id: int, db: AsyncSession) -> DictNgCategoryVo:
        entity = await self._get_or_raise(category_id, db)
        return DictNgCategoryVo.model_validate(entity)

    async def query(self, query: DictNgCategoryQueryDto, db: AsyncSession) -> Page[DictNgCategoryVo]:
        try:
            stmt = select(DictNgCategory)
            count_stmt = select(func.count()).select_from(DictNgCategory)
            conditions = []
            if query.ng_code:
                conditions.append(DictNgCategory.ng_code.ilike(f"%{query.ng_code}%"))
            if query.ng_name:
                conditions.append(DictNgCategory.ng_name.ilike(f"%{query.ng_name}%"))
            if query.impact_level:
                conditions.append(DictNgCategory.impact_level == query.impact_level)
            if query.status is not None:
                conditions.append(DictNgCategory.status == query.status.value)
            if conditions:
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(DictNgCategory.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [DictNgCategoryVo.model_validate(r) for r in result.scalars().all()]
            total_pages = math.ceil(total / query.pageSize) if query.pageSize > 0 else 0
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize, totalPages=total_pages)
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in DictNgCategoryService.query]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询不良类型失败: {e}")

    async def _get_or_raise(self, category_id: int, db: AsyncSession) -> DictNgCategory:
        result = await db.execute(select(DictNgCategory).where(DictNgCategory.ng_category_id == category_id))
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"不良类型不存在: ng_category_id={category_id}")
        return entity
