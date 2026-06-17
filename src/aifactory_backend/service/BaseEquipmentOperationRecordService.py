import math, logging
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.BaseEquipmentOperationRecordDto import (
    BaseEquipmentOperationRecordCreateDto,
    BaseEquipmentOperationRecordUpdateDto,
    BaseEquipmentOperationRecordQueryDto,
)
from models.entity.BaseEquipmentOperationRecordEntity import BaseEquipmentOperationRecord
from models.vo.BaseEquipmentOperationRecordVo import BaseEquipmentOperationRecordVo

init_logging()
logger = logging.getLogger(__name__)

_ALLOWED = {
    "equipment_id", "record_code", "record_type", "related_department",
    "stage_status", "record_description", "created_by",
}


class BaseEquipmentOperationRecordService:

    async def create(self, dto: BaseEquipmentOperationRecordCreateDto, db: AsyncSession) -> str:
        try:
            entity = BaseEquipmentOperationRecord(**dto.model_dump(exclude_unset=True))
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create OperationRecord]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建运行记录失败: {e}")

    async def update(self, record_id: int, dto: BaseEquipmentOperationRecordUpdateDto, db: AsyncSession) -> str:
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
            logger.error(f"[Error in update OperationRecord {record_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新运行记录失败: {e}")

    async def delete(self, record_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(record_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(record_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete OperationRecord]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除运行记录失败: {e}")

    async def get_by_id(self, record_id: int, db: AsyncSession) -> BaseEquipmentOperationRecordVo:
        entity = await self._get_or_raise(record_id, db)
        return BaseEquipmentOperationRecordVo.model_validate(entity)

    async def query(self, query: BaseEquipmentOperationRecordQueryDto, db: AsyncSession) -> Page[BaseEquipmentOperationRecordVo]:
        try:
            stmt = select(BaseEquipmentOperationRecord)
            count_stmt = select(func.count()).select_from(BaseEquipmentOperationRecord)
            conditions = []
            if query.equipment_id:
                conditions.append(BaseEquipmentOperationRecord.equipment_id == query.equipment_id)
            if query.record_code:
                conditions.append(BaseEquipmentOperationRecord.record_code.ilike(f"%{query.record_code}%"))
            if query.record_type:
                conditions.append(BaseEquipmentOperationRecord.record_type == query.record_type)
            if query.stage_status:
                conditions.append(BaseEquipmentOperationRecord.stage_status == query.stage_status)
            if conditions:
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(BaseEquipmentOperationRecord.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [BaseEquipmentOperationRecordVo.model_validate(r) for r in result.scalars().all()]
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize,
                        totalPages=math.ceil(total / query.pageSize) if query.pageSize > 0 else 0)
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in query OperationRecord]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询运行记录失败: {e}")

    async def _get_or_raise(self, record_id: int, db: AsyncSession) -> BaseEquipmentOperationRecord:
        result = await db.execute(select(BaseEquipmentOperationRecord).where(BaseEquipmentOperationRecord.id == record_id))
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"运行记录不存在: id={record_id}")
        return entity
