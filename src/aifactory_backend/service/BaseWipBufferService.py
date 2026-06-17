import math, logging
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.BaseWipBufferDto import BaseWipBufferCreateDto, BaseWipBufferUpdateDto, BaseWipBufferQueryDto
from models.entity.BaseWipBufferEntity import BaseWipBuffer
from models.vo.BaseWipBufferVo import BaseWipBufferVo
from models.enums.BaseStatusEnum import BaseStatus

init_logging()
logger = logging.getLogger(__name__)


class BaseWipBufferService:
    async def create(self, dto: BaseWipBufferCreateDto, db: AsyncSession) -> str:
        try:
            if dto is None: raise BusinessException(ErrorCode.PARAMS_ERROR, "请求参数不能为空")
            entity = BaseWipBuffer(**dto.model_dump(exclude_unset=True))
            entity.plan_id = None
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.wip_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建线边仓失败: {e}")

    async def update(self, wip_id: int, dto: BaseWipBufferUpdateDto, db: AsyncSession) -> str:
        entity = await self._get_or_raise(wip_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("wip_id", None)
        if not update_data: return str(wip_id)
        allowed = {"line_id", "wip_code", "wip_name", "capacity_volume", "capacity_qty", "pre_operation_id", "post_operation_id", "location", "status"}
        try:
            for field, value in update_data.items():
                if field in allowed:
                    if field == "status" and isinstance(value, BaseStatus): value = value.value
                    setattr(entity, field, value)
            await db.commit()
            return str(wip_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新线边仓失败: {e}")

    async def delete(self, wip_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(wip_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(wip_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除线边仓失败: {e}")

    async def get_by_id(self, wip_id: int, db: AsyncSession) -> BaseWipBufferVo:
        entity = await self._get_or_raise(wip_id, db)
        return BaseWipBufferVo.model_validate(entity)

    async def query(self, query: BaseWipBufferQueryDto, db: AsyncSession) -> Page[BaseWipBufferVo]:
        try:
            stmt, count_stmt = select(BaseWipBuffer).where(BaseWipBuffer.plan_id.is_(None)), select(func.count()).select_from(BaseWipBuffer).where(BaseWipBuffer.plan_id.is_(None))
            conditions = []
            if query.line_id: conditions.append(BaseWipBuffer.line_id == query.line_id)
            if query.wip_code: conditions.append(BaseWipBuffer.wip_code.ilike(f"%{query.wip_code}%"))
            if query.wip_name: conditions.append(BaseWipBuffer.wip_name.ilike(f"%{query.wip_name}%"))
            if query.status is not None: conditions.append(BaseWipBuffer.status == query.status.value)
            if conditions: stmt, count_stmt = stmt.where(and_(*conditions)), count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(BaseWipBuffer.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [BaseWipBufferVo.model_validate(r) for r in result.scalars().all()]
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize, totalPages=math.ceil(total / query.pageSize) if query.pageSize > 0 else 0)
        except BusinessException: raise
        except Exception as e:
            logger.error(f"[Error in query]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询线边仓失败: {e}")

    async def _get_or_raise(self, wip_id: int, db: AsyncSession) -> BaseWipBuffer:
        result = await db.execute(select(BaseWipBuffer).where(BaseWipBuffer.wip_id == wip_id, BaseWipBuffer.plan_id.is_(None)))
        entity = result.scalar_one_or_none()
        if entity is None: raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"线边仓不存在: wip_id={wip_id}")
        return entity
