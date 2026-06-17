import math, logging
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.BaseEquipmentSopDto import (
    BaseEquipmentSopCreateDto,
    BaseEquipmentSopUpdateDto,
    BaseEquipmentSopQueryDto,
)
from models.entity.BaseEquipmentSopEntity import BaseEquipmentSop
from models.vo.BaseEquipmentSopVo import BaseEquipmentSopVo

init_logging()
logger = logging.getLogger(__name__)

_ALLOWED = {"equipment_id", "document_no", "document_title", "document_version", "document_url", "created_by"}


class BaseEquipmentSopService:

    async def create(self, dto: BaseEquipmentSopCreateDto, db: AsyncSession) -> str:
        try:
            entity = BaseEquipmentSop(**dto.model_dump(exclude_unset=True))
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create Sop]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建SOP失败: {e}")

    async def update(self, record_id: int, dto: BaseEquipmentSopUpdateDto, db: AsyncSession) -> str:
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
            logger.error(f"[Error in update Sop {record_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新SOP失败: {e}")

    async def delete(self, record_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(record_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(record_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete Sop]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除SOP失败: {e}")

    async def get_by_id(self, record_id: int, db: AsyncSession) -> BaseEquipmentSopVo:
        entity = await self._get_or_raise(record_id, db)
        return BaseEquipmentSopVo.model_validate(entity)

    async def query(self, query: BaseEquipmentSopQueryDto, db: AsyncSession) -> Page[BaseEquipmentSopVo]:
        try:
            stmt = select(BaseEquipmentSop)
            count_stmt = select(func.count()).select_from(BaseEquipmentSop)
            conditions = []
            if query.equipment_id:
                conditions.append(BaseEquipmentSop.equipment_id == query.equipment_id)
            if query.document_no:
                conditions.append(BaseEquipmentSop.document_no.ilike(f"%{query.document_no}%"))
            if query.document_title:
                conditions.append(BaseEquipmentSop.document_title.ilike(f"%{query.document_title}%"))
            if conditions:
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(BaseEquipmentSop.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [BaseEquipmentSopVo.model_validate(r) for r in result.scalars().all()]
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize,
                        totalPages=math.ceil(total / query.pageSize) if query.pageSize > 0 else 0)
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in query Sop]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询SOP失败: {e}")

    async def _get_or_raise(self, record_id: int, db: AsyncSession) -> BaseEquipmentSop:
        result = await db.execute(select(BaseEquipmentSop).where(BaseEquipmentSop.id == record_id))
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"SOP不存在: id={record_id}")
        return entity
