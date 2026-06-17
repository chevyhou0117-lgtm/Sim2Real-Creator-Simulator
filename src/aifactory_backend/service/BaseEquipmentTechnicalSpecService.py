import math, logging
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.BaseEquipmentTechnicalSpecDto import (
    BaseEquipmentTechnicalSpecCreateDto,
    BaseEquipmentTechnicalSpecUpdateDto,
    BaseEquipmentTechnicalSpecQueryDto,
)
from models.entity.BaseEquipmentTechnicalSpecEntity import BaseEquipmentTechnicalSpec
from models.vo.BaseEquipmentTechnicalSpecVo import BaseEquipmentTechnicalSpecVo

init_logging()
logger = logging.getLogger(__name__)

_ALLOWED = {"equipment_id", "main_parameters", "power", "size", "weight"}


class BaseEquipmentTechnicalSpecService:

    async def create(self, dto: BaseEquipmentTechnicalSpecCreateDto, db: AsyncSession) -> str:
        try:
            entity = BaseEquipmentTechnicalSpec(**dto.model_dump(exclude_unset=True))
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
            logger.error(f"[Error in create TechnicalSpec]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建技术规格失败: {e}")

    async def update(self, record_id: int, dto: BaseEquipmentTechnicalSpecUpdateDto, db: AsyncSession) -> str:
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
            logger.error(f"[Error in update TechnicalSpec {record_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新技术规格失败: {e}")

    async def delete(self, record_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(record_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(record_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete TechnicalSpec]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除技术规格失败: {e}")

    async def get_by_id(self, record_id: int, db: AsyncSession) -> BaseEquipmentTechnicalSpecVo:
        entity = await self._get_or_raise(record_id, db)
        return BaseEquipmentTechnicalSpecVo.model_validate(entity)

    async def query(self, query: BaseEquipmentTechnicalSpecQueryDto, db: AsyncSession) -> Page[BaseEquipmentTechnicalSpecVo]:
        try:
            stmt = select(BaseEquipmentTechnicalSpec).where(BaseEquipmentTechnicalSpec.plan_id.is_(None))
            count_stmt = select(func.count()).select_from(BaseEquipmentTechnicalSpec).where(BaseEquipmentTechnicalSpec.plan_id.is_(None))
            conditions = []
            if query.equipment_id:
                conditions.append(BaseEquipmentTechnicalSpec.equipment_id == query.equipment_id)
            if conditions:
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(BaseEquipmentTechnicalSpec.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [BaseEquipmentTechnicalSpecVo.model_validate(r) for r in result.scalars().all()]
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize,
                        totalPages=math.ceil(total / query.pageSize) if query.pageSize > 0 else 0)
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in query TechnicalSpec]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询技术规格失败: {e}")

    async def _get_or_raise(self, record_id: int, db: AsyncSession) -> BaseEquipmentTechnicalSpec:
        result = await db.execute(select(BaseEquipmentTechnicalSpec).where(BaseEquipmentTechnicalSpec.id == record_id, BaseEquipmentTechnicalSpec.plan_id.is_(None)))
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"技术规格不存在: id={record_id}")
        return entity
