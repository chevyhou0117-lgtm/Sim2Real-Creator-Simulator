import math, logging
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.BaseLineOperationDto import BaseLineOperationCreateDto, BaseLineOperationUpdateDto, BaseLineOperationQueryDto
from models.entity.BaseLineOperationEntity import BaseLineOperation
from models.vo.BaseLineOperationVo import BaseLineOperationVo
from models.enums.BaseStatusEnum import BaseStatus

init_logging()
logger = logging.getLogger(__name__)


class BaseLineOperationService:
    async def create(self, dto: BaseLineOperationCreateDto, db: AsyncSession) -> str:
        try:
            if dto is None: raise BusinessException(ErrorCode.PARAMS_ERROR, "请求参数不能为空")
            entity = BaseLineOperation(**dto.model_dump(exclude_unset=True))
            entity.plan_id = None
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.operation_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建工序失败: {e}")

    async def update(self, operation_id: int, dto: BaseLineOperationUpdateDto, db: AsyncSession) -> str:
        entity = await self._get_or_raise(operation_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("operation_id", None)
        if not update_data: return str(operation_id)
        allowed = {"stage_id", "operation_code", "operation_name", "sequence", "operation_type", "is_key_operation", "status"}
        try:
            for field, value in update_data.items():
                if field in allowed:
                    if field == "status" and isinstance(value, BaseStatus): value = value.value
                    setattr(entity, field, value)
            await db.commit()
            return str(operation_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新工序失败: {e}")

    async def delete(self, operation_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(operation_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(operation_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除工序失败: {e}")

    async def get_by_id(self, operation_id: int, db: AsyncSession) -> BaseLineOperationVo:
        entity = await self._get_or_raise(operation_id, db)
        return BaseLineOperationVo.model_validate(entity)

    async def query(self, query: BaseLineOperationQueryDto, db: AsyncSession) -> Page[BaseLineOperationVo]:
        try:
            stmt, count_stmt = select(BaseLineOperation), select(func.count()).select_from(BaseLineOperation)
            conditions = [BaseLineOperation.plan_id.is_(None)]
            if query.stage_id: conditions.append(BaseLineOperation.stage_id == query.stage_id)
            if query.operation_code: conditions.append(BaseLineOperation.operation_code.ilike(f"%{query.operation_code}%"))
            if query.operation_name: conditions.append(BaseLineOperation.operation_name.ilike(f"%{query.operation_name}%"))
            if query.operation_type: conditions.append(BaseLineOperation.operation_type == query.operation_type)
            if query.status is not None: conditions.append(BaseLineOperation.status == query.status.value)
            if conditions: stmt, count_stmt = stmt.where(and_(*conditions)), count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(BaseLineOperation.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [BaseLineOperationVo.model_validate(r) for r in result.scalars().all()]
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize, totalPages=math.ceil(total / query.pageSize) if query.pageSize > 0 else 0)
        except BusinessException: raise
        except Exception as e:
            logger.error(f"[Error in query]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询工序失败: {e}")

    async def _get_or_raise(self, operation_id: int, db: AsyncSession) -> BaseLineOperation:
        result = await db.execute(select(BaseLineOperation).where(BaseLineOperation.operation_id == operation_id, BaseLineOperation.plan_id.is_(None)))
        entity = result.scalar_one_or_none()
        if entity is None: raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"工序不存在: operation_id={operation_id}")
        return entity
