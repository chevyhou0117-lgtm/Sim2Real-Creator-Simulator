import math, logging
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.BaseEquipmentProcessParamDto import (
    BaseEquipmentProcessParamCreateDto,
    BaseEquipmentProcessParamUpdateDto,
    BaseEquipmentProcessParamQueryDto,
)
from models.entity.BaseEquipmentProcessParamEntity import BaseEquipmentProcessParam
from models.vo.BaseEquipmentProcessParamVo import BaseEquipmentProcessParamVo

init_logging()
logger = logging.getLogger(__name__)

_ALLOWED = {"equipment_id", "standard_ct", "standard_yield_rate", "standard_work_efficiency"}


class BaseEquipmentProcessParamService:

    async def create(self, dto: BaseEquipmentProcessParamCreateDto, db: AsyncSession) -> str:
        try:
            entity = BaseEquipmentProcessParam(**dto.model_dump(exclude_unset=True))
            entity.plan_id = None  # master data only
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create ProcessParam]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建过程参数失败: {e}")

    async def update(self, record_id: int, dto: BaseEquipmentProcessParamUpdateDto, db: AsyncSession) -> str:
        entity = await self._get_or_raise(record_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("id", None)
        if not update_data:
            return str(record_id)
        try:
            for field, value in update_data.items():
                if field in _ALLOWED:
                    setattr(entity, field, value)
            await db.commit()
            return str(record_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update ProcessParam {record_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新过程参数失败: {e}")

    async def delete(self, record_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(record_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(record_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete ProcessParam]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除过程参数失败: {e}")

    async def get_by_id(self, record_id: int, db: AsyncSession) -> BaseEquipmentProcessParamVo:
        entity = await self._get_or_raise(record_id, db)
        return BaseEquipmentProcessParamVo.model_validate(entity)

    async def query(self, query: BaseEquipmentProcessParamQueryDto, db: AsyncSession) -> Page[BaseEquipmentProcessParamVo]:
        try:
            stmt = select(BaseEquipmentProcessParam).where(BaseEquipmentProcessParam.plan_id.is_(None))
            count_stmt = select(func.count()).select_from(BaseEquipmentProcessParam).where(BaseEquipmentProcessParam.plan_id.is_(None))
            conditions = []
            if query.equipment_id:
                conditions.append(BaseEquipmentProcessParam.equipment_id == query.equipment_id)
            if conditions:
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(BaseEquipmentProcessParam.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [BaseEquipmentProcessParamVo.model_validate(r) for r in result.scalars().all()]
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize,
                        totalPages=math.ceil(total / query.pageSize) if query.pageSize > 0 else 0)
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in query ProcessParam]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询过程参数失败: {e}")

    async def _get_or_raise(self, record_id: int, db: AsyncSession) -> BaseEquipmentProcessParam:
        result = await db.execute(
            select(BaseEquipmentProcessParam).where(
                BaseEquipmentProcessParam.id == record_id,
                BaseEquipmentProcessParam.plan_id.is_(None),
            )
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"过程参数不存在: id={record_id}")
        return entity

    async def upsert_by_equipment_id(
        self,
        equipment_id: str,
        db: AsyncSession,
        *,
        standard_ct: float = None,
        standard_yield_rate: float = None,
        standard_work_efficiency: float = None,
        standard_worker_count: int = None,
        commit: bool = True,
    ) -> str:
        """Upsert the master (plan_id IS NULL) process-param row for an equipment.

        Finds the existing master row by equipment_id + plan_id IS NULL; updates it
        in place if present, otherwise inserts a new master row. Only non-None values
        are applied; standard_worker_count is left at its default (None) when not given.
        Used by BaseEquipmentService to push standard_ct into the process-param table.
        """
        try:
            result = await db.execute(
                select(BaseEquipmentProcessParam).where(
                    BaseEquipmentProcessParam.equipment_id == equipment_id,
                    BaseEquipmentProcessParam.plan_id.is_(None),
                )
            )
            entity = result.scalar_one_or_none()
            updates = {
                "standard_ct": standard_ct,
                "standard_yield_rate": standard_yield_rate,
                "standard_work_efficiency": standard_work_efficiency,
                "standard_worker_count": standard_worker_count,
            }
            if entity is None:
                entity = BaseEquipmentProcessParam(equipment_id=equipment_id)
                entity.plan_id = None  # master data only
                for field, value in updates.items():
                    if value is not None:
                        setattr(entity, field, value)
                db.add(entity)
            else:
                for field, value in updates.items():
                    if value is not None:
                        setattr(entity, field, value)
            if commit:
                await db.commit()
                await db.refresh(entity)
            else:
                await db.flush()
            return str(entity.id)
        except BusinessException:
            if commit:
                await db.rollback()
            raise
        except Exception as e:
            if commit:
                await db.rollback()
            logger.error(f"[Error in upsert ProcessParam for equipment {equipment_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"写入过程参数失败: {e}")
