import math
import logging

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.DictWarehouseTypeDto import (
    DictWarehouseTypeCreateDto,
    DictWarehouseTypeUpdateDto,
    DictWarehouseTypeQueryDto,
)
from models.entity.DictWarehouseTypeEntity import DictWarehouseType
from models.vo.DictWarehouseTypeVo import DictWarehouseTypeVo
from models.enums.BaseStatusEnum import BaseStatus

init_logging()
logger = logging.getLogger(__name__)


class DictWarehouseTypeService:

    async def create(self, dto: DictWarehouseTypeCreateDto, db: AsyncSession) -> str:
        try:
            if dto is None:
                raise BusinessException(ErrorCode.PARAMS_ERROR, "请求参数不能为空")
            stmt = select(DictWarehouseType).where(DictWarehouseType.warehouse_type_code == dto.warehouse_type_code)
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                raise BusinessException(ErrorCode.DB_ERROR, extra_msg="类型编码已存在")
            entity = DictWarehouseType(**dto.model_dump(exclude_unset=True))
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.warehouse_type_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in DictWarehouseTypeService.create]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建仓库类型失败: {e}")

    async def update(self, type_id: int, dto: DictWarehouseTypeUpdateDto, db: AsyncSession) -> str:
        entity = await self._get_or_raise(type_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("warehouse_type_id", None)
        if not update_data:
            return str(type_id)
        allowed_fields = {"warehouse_type_code", "warehouse_type_name", "description", "status"}
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
            logger.error(f"[Error in DictWarehouseTypeService.update {type_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新仓库类型失败: {e}")

    async def delete(self, type_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(type_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(type_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in DictWarehouseTypeService.delete]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除仓库类型失败: {e}")

    async def get_by_id(self, type_id: int, db: AsyncSession) -> DictWarehouseTypeVo:
        entity = await self._get_or_raise(type_id, db)
        return DictWarehouseTypeVo.model_validate(entity)

    async def query(self, query: DictWarehouseTypeQueryDto, db: AsyncSession) -> Page[DictWarehouseTypeVo]:
        try:
            stmt = select(DictWarehouseType)
            count_stmt = select(func.count()).select_from(DictWarehouseType)
            conditions = []
            if query.warehouse_type_code:
                conditions.append(DictWarehouseType.warehouse_type_code.ilike(f"%{query.warehouse_type_code}%"))
            if query.warehouse_type_name:
                conditions.append(DictWarehouseType.warehouse_type_name.ilike(f"%{query.warehouse_type_name}%"))
            if query.status is not None:
                conditions.append(DictWarehouseType.status == query.status.value)
            if conditions:
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(DictWarehouseType.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [DictWarehouseTypeVo.model_validate(r) for r in result.scalars().all()]
            total_pages = math.ceil(total / query.pageSize) if query.pageSize > 0 else 0
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize, totalPages=total_pages)
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in DictWarehouseTypeService.query]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询仓库类型失败: {e}")

    async def _get_or_raise(self, type_id: int, db: AsyncSession) -> DictWarehouseType:
        result = await db.execute(select(DictWarehouseType).where(DictWarehouseType.warehouse_type_id == type_id))
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"仓库类型不存在: warehouse_type_id={type_id}")
        return entity
