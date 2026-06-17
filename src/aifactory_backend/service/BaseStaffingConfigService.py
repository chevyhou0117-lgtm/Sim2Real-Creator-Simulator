import math, logging
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.BaseStaffingConfigDto import BaseStaffingConfigCreateDto, BaseStaffingConfigUpdateDto, BaseStaffingConfigQueryDto
from models.entity.BaseStaffingConfigEntity import BaseStaffingConfig
from models.vo.BaseStaffingConfigVo import BaseStaffingConfigVo

init_logging()
logger = logging.getLogger(__name__)


class BaseStaffingConfigService:
    async def create(self, dto: BaseStaffingConfigCreateDto, db: AsyncSession) -> str:
        try:
            if dto is None: raise BusinessException(ErrorCode.PARAMS_ERROR, "请求参数不能为空")
            entity = BaseStaffingConfig(**dto.model_dump(exclude_unset=True))
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.staffing_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建人员配置失败: {e}")

    async def update(self, staffing_id: int, dto: BaseStaffingConfigUpdateDto, db: AsyncSession) -> str:
        entity = await self._get_or_raise(staffing_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("staffing_id", None)
        if not update_data: return str(staffing_id)
        allowed = {"factory_id", "operation_id", "worker_type_id", "worker_count", "ct_with_this_count", "is_standard", "effective_date"}
        try:
            for field, value in update_data.items():
                if field in allowed: setattr(entity, field, value)
            await db.commit()
            return str(staffing_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新人员配置失败: {e}")

    async def delete(self, staffing_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(staffing_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(staffing_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除人员配置失败: {e}")

    async def get_by_id(self, staffing_id: int, db: AsyncSession) -> BaseStaffingConfigVo:
        entity = await self._get_or_raise(staffing_id, db)
        return BaseStaffingConfigVo.model_validate(entity)

    async def query(self, query: BaseStaffingConfigQueryDto, db: AsyncSession) -> Page[BaseStaffingConfigVo]:
        try:
            stmt, count_stmt = select(BaseStaffingConfig), select(func.count()).select_from(BaseStaffingConfig)
            conditions = []
            if query.factory_id: conditions.append(BaseStaffingConfig.factory_id == query.factory_id)
            if query.operation_id: conditions.append(BaseStaffingConfig.operation_id == query.operation_id)
            if query.worker_type_id: conditions.append(BaseStaffingConfig.worker_type_id == query.worker_type_id)
            if query.is_standard is not None: conditions.append(BaseStaffingConfig.is_standard == query.is_standard)
            if conditions: stmt, count_stmt = stmt.where(and_(*conditions)), count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(BaseStaffingConfig.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [BaseStaffingConfigVo.model_validate(r) for r in result.scalars().all()]
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize, totalPages=math.ceil(total / query.pageSize) if query.pageSize > 0 else 0)
        except BusinessException: raise
        except Exception as e:
            logger.error(f"[Error in query]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询人员配置失败: {e}")

    async def _get_or_raise(self, staffing_id: int, db: AsyncSession) -> BaseStaffingConfig:
        result = await db.execute(select(BaseStaffingConfig).where(BaseStaffingConfig.staffing_id == staffing_id))
        entity = result.scalar_one_or_none()
        if entity is None: raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"人员配置不存在: staffing_id={staffing_id}")
        return entity
