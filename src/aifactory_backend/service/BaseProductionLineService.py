import math, logging
from typing import List
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.BaseProductionLineDto import BaseProductionLineCreateDto, BaseProductionLineUpdateDto, BaseProductionLineQueryDto, BaseProductionLineBatchCreateDto
from models.entity.BaseProductionLineEntity import BaseProductionLine
from models.vo.BaseProductionLineVo import BaseProductionLineVo
from models.enums.BaseStatusEnum import BaseStatus

init_logging()
logger = logging.getLogger(__name__)


class BaseProductionLineService:
    async def create(self, dto: BaseProductionLineCreateDto, db: AsyncSession) -> str:
        try:
            if dto is None: raise BusinessException(ErrorCode.PARAMS_ERROR, "请求参数不能为空")
            entity = BaseProductionLine(**dto.model_dump(exclude_unset=True))
            entity.plan_id = None
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.line_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建线体失败: {e}")

    async def batch_create(self, dto: BaseProductionLineBatchCreateDto, db: AsyncSession) -> List[str]:
        try:
            if dto is None or not dto.items:
                raise BusinessException(ErrorCode.PARAMS_ERROR, "批量创建列表不能为空")
            ids = []
            for item in dto.items:
                entity = BaseProductionLine(**item.model_dump(exclude_unset=True))
                entity.plan_id = None
                db.add(entity)
                await db.flush()
                ids.append(str(entity.line_id))
            await db.commit()
            return ids
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in batch_create]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"批量创建线体失败: {e}")

    async def update(self, line_id: int, dto: BaseProductionLineUpdateDto, db: AsyncSession) -> str:
        entity = await self._get_or_raise(line_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("line_id", None)
        if not update_data: return str(line_id)
        allowed = {"stage_id", "line_code", "line_name", "smt_pph", "operation_count", "status", "sort_order"}
        try:
            for field, value in update_data.items():
                if field in allowed:
                    if field == "status" and isinstance(value, BaseStatus): value = value.value
                    setattr(entity, field, value)
            await db.commit()
            return str(line_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新线体失败: {e}")

    async def delete(self, line_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(line_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(line_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除线体失败: {e}")

    async def get_by_id(self, line_id: int, db: AsyncSession) -> BaseProductionLineVo:
        entity = await self._get_or_raise(line_id, db)
        return BaseProductionLineVo.model_validate(entity)

    async def query(self, query: BaseProductionLineQueryDto, db: AsyncSession) -> Page[BaseProductionLineVo]:
        try:
            stmt, count_stmt = select(BaseProductionLine), select(func.count()).select_from(BaseProductionLine)
            conditions = [BaseProductionLine.plan_id.is_(None)]
            if query.stage_id: conditions.append(BaseProductionLine.stage_id == query.stage_id)
            if query.line_code: conditions.append(BaseProductionLine.line_code.ilike(f"%{query.line_code}%"))
            if query.line_name: conditions.append(BaseProductionLine.line_name.ilike(f"%{query.line_name}%"))
            if query.status is not None: conditions.append(BaseProductionLine.status == query.status.value)
            if conditions: stmt, count_stmt = stmt.where(and_(*conditions)), count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(BaseProductionLine.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [BaseProductionLineVo.model_validate(r) for r in result.scalars().all()]
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize, totalPages=math.ceil(total / query.pageSize) if query.pageSize > 0 else 0)
        except BusinessException: raise
        except Exception as e:
            logger.error(f"[Error in query]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询线体失败: {e}")

    async def _get_or_raise(self, line_id: int, db: AsyncSession) -> BaseProductionLine:
        result = await db.execute(select(BaseProductionLine).where(BaseProductionLine.line_id == line_id, BaseProductionLine.plan_id.is_(None)))
        entity = result.scalar_one_or_none()
        if entity is None: raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"线体不存在: line_id={line_id}")
        return entity
