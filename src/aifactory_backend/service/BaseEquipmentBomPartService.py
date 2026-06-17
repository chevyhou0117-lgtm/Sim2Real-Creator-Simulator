import math, logging
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.BaseEquipmentBomPartDto import (
    BaseEquipmentBomPartCreateDto,
    BaseEquipmentBomPartUpdateDto,
    BaseEquipmentBomPartQueryDto,
)
from models.entity.BaseEquipmentBomPartEntity import BaseEquipmentBomPart
from models.vo.BaseEquipmentBomPartVo import BaseEquipmentBomPartVo

init_logging()
logger = logging.getLogger(__name__)

_ALLOWED = {
    "equipment_id", "part_code", "part_name", "part_model", "part_manufacturer",
    "part_qty", "unit", "parent_part_id", "part_position", "part_photo_url",
    "part_theoretical_life", "part_remaining_life",
}


class BaseEquipmentBomPartService:

    async def create(self, dto: BaseEquipmentBomPartCreateDto, db: AsyncSession) -> str:
        try:
            entity = BaseEquipmentBomPart(**dto.model_dump(exclude_unset=True))
            entity.plan_id = None
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create BomPart]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建BOM备件失败: {e}")

    async def update(self, record_id: int, dto: BaseEquipmentBomPartUpdateDto, db: AsyncSession) -> str:
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
            logger.error(f"[Error in update BomPart {record_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新BOM备件失败: {e}")

    async def delete(self, record_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(record_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(record_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete BomPart]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除BOM备件失败: {e}")

    async def get_by_id(self, record_id: int, db: AsyncSession) -> BaseEquipmentBomPartVo:
        entity = await self._get_or_raise(record_id, db)
        return BaseEquipmentBomPartVo.model_validate(entity)

    async def query(self, query: BaseEquipmentBomPartQueryDto, db: AsyncSession) -> Page[BaseEquipmentBomPartVo]:
        try:
            stmt = select(BaseEquipmentBomPart).where(BaseEquipmentBomPart.plan_id.is_(None))
            count_stmt = select(func.count()).select_from(BaseEquipmentBomPart).where(BaseEquipmentBomPart.plan_id.is_(None))
            conditions = []
            if query.equipment_id:
                conditions.append(BaseEquipmentBomPart.equipment_id == query.equipment_id)
            if query.part_code:
                conditions.append(BaseEquipmentBomPart.part_code.ilike(f"%{query.part_code}%"))
            if query.part_name:
                conditions.append(BaseEquipmentBomPart.part_name.ilike(f"%{query.part_name}%"))
            if query.parent_part_id is not None:
                conditions.append(BaseEquipmentBomPart.parent_part_id == query.parent_part_id)
            if conditions:
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(BaseEquipmentBomPart.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [BaseEquipmentBomPartVo.model_validate(r) for r in result.scalars().all()]
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize,
                        totalPages=math.ceil(total / query.pageSize) if query.pageSize > 0 else 0)
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in query BomPart]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询BOM备件失败: {e}")

    async def _get_or_raise(self, record_id: int, db: AsyncSession) -> BaseEquipmentBomPart:
        result = await db.execute(
            select(BaseEquipmentBomPart).where(
                BaseEquipmentBomPart.id == record_id,
                BaseEquipmentBomPart.plan_id.is_(None),
            )
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"BOM备件不存在: id={record_id}")
        return entity
