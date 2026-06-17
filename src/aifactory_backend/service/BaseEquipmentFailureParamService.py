import math, logging
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.BaseEquipmentFailureParamDto import BaseEquipmentFailureParamCreateDto, BaseEquipmentFailureParamUpdateDto, BaseEquipmentFailureParamQueryDto
from models.entity.BaseEquipmentFailureParamEntity import BaseEquipmentFailureParam
from models.vo.BaseEquipmentFailureParamVo import BaseEquipmentFailureParamVo

init_logging()
logger = logging.getLogger(__name__)


class BaseEquipmentFailureParamService:
    async def create(self, dto: BaseEquipmentFailureParamCreateDto, db: AsyncSession) -> str:
        try:
            if dto is None: raise BusinessException(ErrorCode.PARAMS_ERROR, "请求参数不能为空")
            entity = BaseEquipmentFailureParam(**dto.model_dump(exclude_unset=True))
            entity.plan_id = None
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.param_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建故障参数失败: {e}")

    async def update(self, param_id: int, dto: BaseEquipmentFailureParamUpdateDto, db: AsyncSession) -> str:
        entity = await self._get_or_raise(param_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("param_id", None)
        if not update_data: return str(param_id)
        allowed = {"equipment_id", "mtbf_hours", "mttr_minutes", "failure_distribution", "data_source", "effective_date"}
        try:
            for field, value in update_data.items():
                if field in allowed: setattr(entity, field, value)
            await db.commit()
            return str(param_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新故障参数失败: {e}")

    async def delete(self, param_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(param_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(param_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除故障参数失败: {e}")

    async def get_by_id(self, param_id: int, db: AsyncSession) -> BaseEquipmentFailureParamVo:
        entity = await self._get_or_raise(param_id, db)
        return BaseEquipmentFailureParamVo.model_validate(entity)

    async def query(self, query: BaseEquipmentFailureParamQueryDto, db: AsyncSession) -> Page[BaseEquipmentFailureParamVo]:
        try:
            stmt, count_stmt = select(BaseEquipmentFailureParam), select(func.count()).select_from(BaseEquipmentFailureParam)
            stmt, count_stmt = stmt.where(BaseEquipmentFailureParam.plan_id.is_(None)), count_stmt.where(BaseEquipmentFailureParam.plan_id.is_(None))
            conditions = []
            if query.equipment_id: conditions.append(BaseEquipmentFailureParam.equipment_id == query.equipment_id)
            if query.failure_distribution: conditions.append(BaseEquipmentFailureParam.failure_distribution == query.failure_distribution)
            if conditions: stmt, count_stmt = stmt.where(and_(*conditions)), count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(BaseEquipmentFailureParam.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [BaseEquipmentFailureParamVo.model_validate(r) for r in result.scalars().all()]
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize, totalPages=math.ceil(total / query.pageSize) if query.pageSize > 0 else 0)
        except BusinessException: raise
        except Exception as e:
            logger.error(f"[Error in query]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询故障参数失败: {e}")

    async def _get_or_raise(self, param_id: int, db: AsyncSession) -> BaseEquipmentFailureParam:
        result = await db.execute(select(BaseEquipmentFailureParam).where(BaseEquipmentFailureParam.param_id == param_id, BaseEquipmentFailureParam.plan_id.is_(None)))
        entity = result.scalar_one_or_none()
        if entity is None: raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"故障参数不存在: param_id={param_id}")
        return entity
