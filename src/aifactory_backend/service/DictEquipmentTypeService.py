import math
import logging

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.DictEquipmentTypeDto import (
    DictEquipmentTypeCreateDto,
    DictEquipmentTypeUpdateDto,
    DictEquipmentTypeQueryDto,
)
from models.entity.DictEquipmentTypeEntity import DictEquipmentType
from models.vo.DictEquipmentTypeVo import DictEquipmentTypeVo
from models.enums.BaseStatusEnum import BaseStatus

init_logging()
logger = logging.getLogger(__name__)


class DictEquipmentTypeService:

    async def create(self, dto: DictEquipmentTypeCreateDto, db: AsyncSession) -> str:
        try:
            if dto is None:
                raise BusinessException(ErrorCode.PARAMS_ERROR, "请求参数不能为空")
            stmt = select(DictEquipmentType).where(DictEquipmentType.equipment_type_code == dto.equipment_type_code)
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                raise BusinessException(ErrorCode.DB_ERROR, extra_msg="类型编码已存在")
            entity = DictEquipmentType(**dto.model_dump(exclude_unset=True))
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.equipment_type_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in DictEquipmentTypeService.create]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建设备类型失败: {e}")

    async def update(self, type_id: int, dto: DictEquipmentTypeUpdateDto, db: AsyncSession) -> str:
        entity = await self._get_or_raise(type_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("equipment_type_id", None)
        if not update_data:
            return str(type_id)
        allowed_fields = {"equipment_type_code", "equipment_type_name", "description", "status"}
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
            logger.error(f"[Error in DictEquipmentTypeService.update {type_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新设备类型失败: {e}")

    async def delete(self, type_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(type_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(type_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in DictEquipmentTypeService.delete]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除设备类型失败: {e}")

    async def get_by_id(self, type_id: int, db: AsyncSession) -> DictEquipmentTypeVo:
        entity = await self._get_or_raise(type_id, db)
        return DictEquipmentTypeVo.model_validate(entity)

    async def query(self, query: DictEquipmentTypeQueryDto, db: AsyncSession) -> Page[DictEquipmentTypeVo]:
        try:
            stmt = select(DictEquipmentType)
            count_stmt = select(func.count()).select_from(DictEquipmentType)
            conditions = []
            if query.equipment_type_code:
                conditions.append(DictEquipmentType.equipment_type_code.ilike(f"%{query.equipment_type_code}%"))
            if query.equipment_type_name:
                conditions.append(DictEquipmentType.equipment_type_name.ilike(f"%{query.equipment_type_name}%"))
            if query.status is not None:
                conditions.append(DictEquipmentType.status == query.status.value)
            if conditions:
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(DictEquipmentType.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [DictEquipmentTypeVo.model_validate(r) for r in result.scalars().all()]
            total_pages = math.ceil(total / query.pageSize) if query.pageSize > 0 else 0
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize, totalPages=total_pages)
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in DictEquipmentTypeService.query]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询设备类型失败: {e}")

    async def _get_or_raise(self, type_id: int, db: AsyncSession) -> DictEquipmentType:
        result = await db.execute(select(DictEquipmentType).where(DictEquipmentType.equipment_type_id == type_id))
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"设备类型不存在: equipment_type_id={type_id}")
        return entity
