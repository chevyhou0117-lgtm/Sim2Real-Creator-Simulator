import math
import logging

from sqlalchemy import and_, select, func
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
from models.entity.FactoryProjectEntity import FactoryProject
from models.entity.FactoryProjectVersionEntity import FactoryProjectVersion
from models.enums.InstanceAssetTypeEnum import InstanceAssetType
from models.vo.LineLeaderVo import LineLeaderVo
from service.FactoryAssetNodeService import FactoryAssetNodeService

init_logging()
logger = logging.getLogger(__name__)

_asset_node_service = FactoryAssetNodeService()


class LineLeaderService:

    @staticmethod
    def _active_current_draft_select(*columns):
        """Build the common readable LineLeader scope.

        Line leaders belong to versioned LINE nodes. Historical, published,
        soft-deleted, or deleted-project rows must never leak through the
        unversioned LineLeader endpoints.
        """
        return (
            select(*columns)
            .select_from(LineLeader)
            .join(
                FactoryAssetNode,
                LineLeader.factory_asset_id == FactoryAssetNode.id,
            )
            .join(
                FactoryProjectVersion,
                and_(
                    FactoryProjectVersion.version_id == FactoryAssetNode.version_id,
                    FactoryProjectVersion.project_id
                    == FactoryAssetNode.factory_projects_id,
                ),
            )
            .join(
                FactoryProject,
                FactoryProject.project_id == FactoryAssetNode.factory_projects_id,
            )
            .where(
                FactoryAssetNode.is_deleted == False,
                FactoryAssetNode.type == InstanceAssetType.LINE.value,
                FactoryProjectVersion.is_current == True,
                FactoryProjectVersion.version_status == "DRAFT",
                FactoryProject.is_deleted == False,
            )
        )

    async def create_line_leader(
            self,
            dto: LineLeaderCreateDto,
            db: AsyncSession,
    ) -> str:
        try:
            if dto is None:
                raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="请求参数不能为空")
            if not dto.factory_asset_id:
                raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="factory_asset_id不能为空")

            if not dto.line_leader_name:
                raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="负责人姓名不能为空")

            await _asset_node_service.ensure_node_editable(
                dto.factory_asset_id,
                db,
                InstanceAssetType.LINE,
            )

            stmt = self._active_current_draft_select(LineLeader.id).where(
                LineLeader.factory_asset_id == dto.factory_asset_id
            )
            result = await db.execute(stmt)
            existing = result.scalar_one_or_none()
            if existing:
                raise BusinessException(ErrorCode.DATA_ALREADY_EXISTS, extra_msg="该线体负责人已存在")

            if dto.employee_id:
                stmt = self._active_current_draft_select(LineLeader.id).where(
                    LineLeader.employee_id == dto.employee_id
                )
                result = await db.execute(stmt)
                if result.scalar_one_or_none():
                    raise BusinessException(ErrorCode.DATA_ALREADY_EXISTS, extra_msg="员工ID已存在")

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
        leader_id: str,
        dto: LineLeaderUpdateDto,
        db: AsyncSession,
    ) -> str:
        entity = await self._get_for_write_or_raise(leader_id, db)
        await _asset_node_service.ensure_node_editable(
            entity.factory_asset_id,
            db,
            InstanceAssetType.LINE,
        )
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("id", None)
        if not update_data:
            return str(leader_id)

        target_asset_id = update_data.get("factory_asset_id")
        if "factory_asset_id" in update_data:
            if not target_asset_id:
                raise BusinessException(
                    ErrorCode.PARAMS_ERROR,
                    extra_msg="factory_asset_id不能为空",
                )
            await _asset_node_service.ensure_node_editable(
                target_asset_id,
                db,
                InstanceAssetType.LINE,
            )
            if str(target_asset_id) != str(entity.factory_asset_id):
                existing = (await db.execute(
                    self._active_current_draft_select(LineLeader.id).where(
                        LineLeader.factory_asset_id == target_asset_id,
                        LineLeader.id != entity.id,
                    )
                )).scalar_one_or_none()
                if existing is not None:
                    raise BusinessException(
                        ErrorCode.DATA_ALREADY_EXISTS,
                        extra_msg="目标线体已存在负责人",
                    )

        if "employee_id" in update_data and update_data["employee_id"]:
            duplicate_employee = (await db.execute(
                self._active_current_draft_select(LineLeader.id).where(
                    LineLeader.employee_id == update_data["employee_id"],
                    LineLeader.id != entity.id,
                )
            )).scalar_one_or_none()
            if duplicate_employee is not None:
                raise BusinessException(
                    ErrorCode.DATA_ALREADY_EXISTS,
                    extra_msg="员工ID已存在",
                )

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
        leader_id: str,
        db: AsyncSession,
    ) -> str:
        entity = await self._get_for_write_or_raise(leader_id, db)
        await _asset_node_service.ensure_node_editable(
            entity.factory_asset_id,
            db,
            InstanceAssetType.LINE,
        )
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
        leader_id: str,
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
            stmt = self._active_current_draft_select(LineLeader)
            count_stmt = self._active_current_draft_select(func.count())
            conditions = []

            if query.factory_asset_id:
                conditions.append(LineLeader.factory_asset_id == query.factory_asset_id)
            if query.line_leader_name:
                conditions.append(LineLeader.line_leader_name.ilike(f"%{query.line_leader_name}%"))
            if query.employee_id:
                conditions.append(LineLeader.employee_id == query.employee_id)
            if query.contact_number:
                conditions.append(LineLeader.contact_number.ilike(f"%{query.contact_number}%"))
            if query.email:
                conditions.append(LineLeader.email == query.email)
            if conditions:
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))

            stmt = stmt.order_by(LineLeader.created_at.desc())
            total_result = await db.execute(count_stmt)
            total = total_result.scalar_one()

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
        leader_id: str,
        db: AsyncSession,
    ) -> LineLeader:
        result = await db.execute(
            self._active_current_draft_select(LineLeader).where(
                LineLeader.id == leader_id
            )
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"线体负责人信息不存在: id={leader_id}")
        return entity

    async def _get_for_write_or_raise(
        self,
        leader_id: str,
        db: AsyncSession,
    ) -> LineLeader:
        """Load the association, then let the node guard explain write denial."""
        result = await db.execute(
            select(LineLeader).where(LineLeader.id == leader_id)
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"线体负责人信息不存在: id={leader_id}",
            )
        return entity
