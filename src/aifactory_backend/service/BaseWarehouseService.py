import math, logging
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.BaseWarehouseDto import BaseWarehouseCreateDto, BaseWarehouseUpdateDto, BaseWarehouseQueryDto
from models.entity.BaseWarehouseEntity import BaseWarehouse
from models.vo.BaseWarehouseVo import BaseWarehouseVo
from models.enums.BaseStatusEnum import BaseStatus

init_logging()
logger = logging.getLogger(__name__)


class BaseWarehouseService:
    async def create(self, dto: BaseWarehouseCreateDto, db: AsyncSession) -> str:
        try:
            if dto is None: raise BusinessException(ErrorCode.PARAMS_ERROR, "请求参数不能为空")
            entity = BaseWarehouse(**dto.model_dump(exclude_unset=True))
            entity.plan_id = None
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.warehouse_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建仓库失败: {e}")

    async def update(self, warehouse_id: int, dto: BaseWarehouseUpdateDto, db: AsyncSession) -> str:
        entity = await self._get_or_raise(warehouse_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("warehouse_id", None)
        if not update_data: return str(warehouse_id)
        allowed = {"factory_id", "warehouse_code", "warehouse_name", "warehouse_type", "location", "total_capacity", "status"}
        try:
            for field, value in update_data.items():
                if field in allowed:
                    if field == "status" and isinstance(value, BaseStatus): value = value.value
                    setattr(entity, field, value)
            await db.commit()
            return str(warehouse_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新仓库失败: {e}")

    async def delete(self, warehouse_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(warehouse_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(warehouse_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除仓库失败: {e}")

    async def get_by_id(self, warehouse_id: int, db: AsyncSession) -> BaseWarehouseVo:
        entity = await self._get_or_raise(warehouse_id, db)
        return BaseWarehouseVo.model_validate(entity)

    async def query(self, query: BaseWarehouseQueryDto, db: AsyncSession) -> Page[BaseWarehouseVo]:
        try:
            stmt, count_stmt = select(BaseWarehouse), select(func.count()).select_from(BaseWarehouse)
            stmt, count_stmt = stmt.where(BaseWarehouse.plan_id.is_(None)), count_stmt.where(BaseWarehouse.plan_id.is_(None))
            conditions = []
            if query.factory_id: conditions.append(BaseWarehouse.factory_id == query.factory_id)
            if query.warehouse_code: conditions.append(BaseWarehouse.warehouse_code.ilike(f"%{query.warehouse_code}%"))
            if query.warehouse_name: conditions.append(BaseWarehouse.warehouse_name.ilike(f"%{query.warehouse_name}%"))
            if query.warehouse_type: conditions.append(BaseWarehouse.warehouse_type == query.warehouse_type)
            if query.status is not None: conditions.append(BaseWarehouse.status == query.status.value)
            if conditions: stmt, count_stmt = stmt.where(and_(*conditions)), count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(BaseWarehouse.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [BaseWarehouseVo.model_validate(r) for r in result.scalars().all()]
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize, totalPages=math.ceil(total / query.pageSize) if query.pageSize > 0 else 0)
        except BusinessException: raise
        except Exception as e:
            logger.error(f"[Error in query]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询仓库失败: {e}")

    async def _get_or_raise(self, warehouse_id: int, db: AsyncSession) -> BaseWarehouse:
        result = await db.execute(select(BaseWarehouse).where(BaseWarehouse.warehouse_id == warehouse_id, BaseWarehouse.plan_id.is_(None)))
        entity = result.scalar_one_or_none()
        if entity is None: raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"仓库不存在: warehouse_id={warehouse_id}")
        return entity
