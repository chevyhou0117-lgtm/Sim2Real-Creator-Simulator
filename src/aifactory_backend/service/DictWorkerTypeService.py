import math
import logging

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.DictWorkerTypeDto import (
    DictWorkerTypeCreateDto,
    DictWorkerTypeUpdateDto,
    DictWorkerTypeQueryDto,
)
from models.entity.DictWorkerTypeEntity import DictWorkerType
from models.vo.DictWorkerTypeVo import DictWorkerTypeVo
from models.enums.BaseStatusEnum import BaseStatus

init_logging()
logger = logging.getLogger(__name__)


class DictWorkerTypeService:

    async def create(self, dto: DictWorkerTypeCreateDto, db: AsyncSession) -> str:
        try:
            if dto is None:
                raise BusinessException(ErrorCode.PARAMS_ERROR, "请求参数不能为空")
            stmt = select(DictWorkerType).where(DictWorkerType.worker_type_code == dto.worker_type_code)
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                raise BusinessException(ErrorCode.DB_ERROR, extra_msg="工种编码已存在")
            entity = DictWorkerType(**dto.model_dump(exclude_unset=True))
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.worker_type_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in DictWorkerTypeService.create]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建工种失败: {e}")

    async def update(self, type_id: int, dto: DictWorkerTypeUpdateDto, db: AsyncSession) -> str:
        entity = await self._get_or_raise(type_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("worker_type_id", None)
        if not update_data:
            return str(type_id)
        allowed_fields = {"worker_type_code", "worker_type_name", "description", "status"}
        try:
            for field, value in update_data.items():
                if field in allowed_fields:
                    if field == "status" and isinstance(value, BaseStatus):
                        value = value.value
                    setattr(entity, field, value)
            await db.commit()
            return str(type_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in DictWorkerTypeService.update {type_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新工种失败: {e}")

    async def delete(self, type_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(type_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(type_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in DictWorkerTypeService.delete]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除工种失败: {e}")

    async def get_by_id(self, type_id: int, db: AsyncSession) -> DictWorkerTypeVo:
        entity = await self._get_or_raise(type_id, db)
        return DictWorkerTypeVo.model_validate(entity)

    async def query(self, query: DictWorkerTypeQueryDto, db: AsyncSession) -> Page[DictWorkerTypeVo]:
        try:
            stmt = select(DictWorkerType)
            count_stmt = select(func.count()).select_from(DictWorkerType)
            conditions = []
            if query.worker_type_code:
                conditions.append(DictWorkerType.worker_type_code.ilike(f"%{query.worker_type_code}%"))
            if query.worker_type_name:
                conditions.append(DictWorkerType.worker_type_name.ilike(f"%{query.worker_type_name}%"))
            if query.status is not None:
                conditions.append(DictWorkerType.status == query.status.value)
            if conditions:
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(DictWorkerType.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [DictWorkerTypeVo.model_validate(r) for r in result.scalars().all()]
            total_pages = math.ceil(total / query.pageSize) if query.pageSize > 0 else 0
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize, totalPages=total_pages)
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in DictWorkerTypeService.query]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询工种失败: {e}")

    async def _get_or_raise(self, type_id: int, db: AsyncSession) -> DictWorkerType:
        result = await db.execute(select(DictWorkerType).where(DictWorkerType.worker_type_id == type_id))
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"工种不存在: worker_type_id={type_id}")
        return entity
