import math
import logging

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.LineLeaderDto import (
    LineLeaderCreateDto,
    LineLeaderUpdateDto,
    LineLeaderQueryDto,
)
from models.entity.LineLeaderEntity import LineLeader
from models.entity.FactoryAssetNodeEntity import FactoryAssetNode
from models.vo.LineLeaderVo import LineLeaderVo

init_logging()
logger = logging.getLogger(__name__)


class LineLeaderService:

    async def create_line_leader(
            self,
            dto: LineLeaderCreateDto,
            db: AsyncSession,
    ) -> str:
        try:
            if dto is None:
                raise BusinessException(ErrorCode.PARAMS_ERROR, "请求参数不能为空")
            if not dto.factory_asset_id:
                raise BusinessException(ErrorCode.PARAMS_ERROR, "factory_asset_id不能为空")

            if not dto.line_leader_name:
                raise BusinessException(ErrorCode.PARAMS_ERROR, "负责人姓名不能为空")

            stmt = select(FactoryAssetNode.id).where(
                FactoryAssetNode.id == dto.factory_asset_id
            )
            result = await db.execute(stmt)
            asset_node = result.scalar_one_or_none()
            if not asset_node:
                raise BusinessException(ErrorCode.DATA_NOT_FOUND, "线体资产节点不存在")

            stmt = select(LineLeader.id).where(
                LineLeader.factory_asset_id == dto.factory_asset_id
            )
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing:
                raise BusinessException(ErrorCode.DB_ERROR, "该线体负责人已存在")

            if dto.employee_id:
                stmt = select(LineLeader.id).where(
                    LineLeader.employee_id == dto.employee_id
                )
                result = await db.execute(stmt)
                if result.scalar_one_or_none():
                    raise BusinessException(ErrorCode.DB_ERROR, "员工ID已存在")

            entity = LineLeader(
                factory_asset_id=dto.factory_asset_id,
                line_leader_name=dto.line_leader_name,
                employee_id=dto.employee_id,
                contact_number=dto.contact_number,
                email=dto.email,
                shift_schedule=dto.shift_schedule,
                shift_a_leader=dto.shift_a_leader,
                shift_b_leader=dto.shift_b_leader,
                shift_c_leader=dto.shift_c_leader,
            )
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create_line_leader]: {e}")
            raise BusinessException(
                ErrorCode.DB_ERROR,
                extra_msg=f"创建线体负责人信息失败: {e}"
            )

    async def update_line_leader(
        self,
        leader_id: int,
        dto: LineLeaderUpdateDto,
        db: AsyncSession,
    ) -> str:
        entity = await self._get_or_raise(leader_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("id", None)
        if not update_data:
            return leader_id

        allowed_fields = {
            "factory_asset_id",
            "line_leader_name",
            "employee_id",
            "contact_number",
            "email",
            "shift_schedule",
            "shift_a_leader",
            "shift_b_leader",
            "shift_c_leader",
        }
        try:
            for field, value in update_data.items():
                if field in allowed_fields:
                    setattr(entity, field, value)
            await db.commit()
            return str(leader_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_line_leader {leader_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新线体负责人信息失败: {e}")

    async def delete_line_leader(
        self,
        leader_id: int,
        db: AsyncSession,
    ) -> str:
        entity = await self._get_or_raise(leader_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(leader_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete_line_leader]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除线体负责人信息失败: {e}")

    async def get_line_leader_by_id(
        self,
        leader_id: int,
        db: AsyncSession,
    ) -> LineLeaderVo:
        entity = await self._get_or_raise(leader_id, db)
        return LineLeaderVo.model_validate(entity)

    async def query_line_leaders(
        self,
        query: LineLeaderQueryDto,
        db: AsyncSession,
    ) -> Page[LineLeaderVo]:
        try:
            stmt = select(LineLeader)
            count_stmt = select(func.count()).select_from(LineLeader)
            conditions = []

            if query.factory_asset_id:
                conditions.append(LineLeader.factory_asset_id == query.factory_asset_id)
            if query.line_leader_name:
                conditions.append(LineLeader.line_leader_name.ilike(f"%{query.line_leader_name}%"))
            if query.employee_id:
                conditions.append(LineLeader.employee_id == query.employee_id)
            if query.email:
                conditions.append(LineLeader.email == query.email)
            if conditions:
                from sqlalchemy import and_
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))

            stmt = stmt.order_by(LineLeader.created_at.desc())
            total_result = await db.execute(count_stmt)
            total = total_result.scalar_one()

            filter_field_names = {"factory_asset_id", "line_leader_name", "employee_id", "contact_number", "email"}
            has_filter = any(
                getattr(query, name) is not None and getattr(query, name) != ""
                for name in filter_field_names
            )
            is_body_empty = not bool(query.model_fields_set)
            if not has_filter and is_body_empty:
                result = await db.execute(stmt)
                items = [LineLeaderVo.model_validate(r) for r in result.scalars().all()]
                return Page(items=items, total=total, current=1, pageSize=total if total > 0 else 10, totalPages=1)

            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [LineLeaderVo.model_validate(r) for r in result.scalars().all()]
            total_pages = math.ceil(total / query.pageSize) if query.pageSize > 0 else 0
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize, totalPages=total_pages)
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in query_line_leaders]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询线体负责人信息失败: {e}")

    async def _get_or_raise(
        self,
        leader_id: int,
        db: AsyncSession,
    ) -> LineLeader:
        result = await db.execute(
            select(LineLeader).where(LineLeader.id == leader_id)
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"线体负责人信息不存在: id={leader_id}")
        return entity
