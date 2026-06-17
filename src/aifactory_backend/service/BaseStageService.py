import math
import logging

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.BaseStageDto import (
    BaseStageCreateDto,
    BaseStageUpdateDto,
    BaseStageQueryDto,
)
from models.entity.BaseStageEntity import BaseStage
from models.entity.DictStageTypeEntity import DictStageType
from models.vo.BaseStageVo import BaseStageVo
from models.enums.BaseStatusEnum import BaseStatus

init_logging()
logger = logging.getLogger(__name__)


class BaseStageService:

    async def create_stage(
        self,
        dto: BaseStageCreateDto,
        db: AsyncSession,
    ) -> str:
        try:
            if dto is None:
                raise BusinessException(ErrorCode.PARAMS_ERROR, "请求参数不能为空")
            # 同一工厂内制程编码唯一性校验（仅校验主数据，不含按计划快照）
            stmt = select(BaseStage).where(
                BaseStage.plan_id.is_(None),
                BaseStage.factory_id == dto.factory_id,
                BaseStage.stage_code == dto.stage_code,
            )
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                raise BusinessException(ErrorCode.DB_ERROR, extra_msg="该工厂下制程编码已存在")
            # 同一工厂内制程名称唯一性校验（仅校验主数据，不含按计划快照）
            name_stmt = select(BaseStage).where(
                BaseStage.plan_id.is_(None),
                BaseStage.factory_id == dto.factory_id,
                BaseStage.stage_name == dto.stage_name,
            )
            name_result = await db.execute(name_stmt)
            if name_result.scalar_one_or_none():
                raise BusinessException(ErrorCode.DB_ERROR, extra_msg="该工厂下制程名称已存在")
            payload = dto.model_dump(exclude_unset=True)
            # md_stage 没有 stage_type_id 列，只有 stage_type（编码字符串）
            stage_type_id = payload.pop("stage_type_id", None)
            stage_type_code = await self._resolve_stage_type_code(stage_type_id, db)
            entity = BaseStage(**payload)
            entity.stage_type = stage_type_code
            entity.plan_id = None
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return str(entity.stage_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create_stage]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建制程失败: {e}")

    async def update_stage(
        self,
        stage_id: int,
        dto: BaseStageUpdateDto,
        db: AsyncSession,
    ) -> str:
        entity = await self._get_or_raise(stage_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("stage_id", None)
        if not update_data:
            return str(stage_id)

        allowed_fields = {
            "factory_id",
            "stage_code",
            "stage_name",
            "sequence",
            "line_count",
            "status",
            "creator_binding_id",
        }
        # 确定本次更新后实际生效的 factory_id
        effective_factory_id = update_data.get("factory_id") or entity.factory_id

        try:
            # 制程编码唯一性校验（仅当本次更新包含 stage_code 时，排除自身）
            if "stage_code" in update_data and update_data["stage_code"]:
                code_conflict = await db.execute(
                    select(BaseStage).where(
                        BaseStage.plan_id.is_(None),
                        BaseStage.factory_id == effective_factory_id,
                        BaseStage.stage_code == update_data["stage_code"],
                        BaseStage.stage_id != stage_id,
                    )
                )
                if code_conflict.scalar_one_or_none():
                    raise BusinessException(
                        ErrorCode.DB_ERROR,
                        extra_msg=f"该工厂下制程编码已存在: {update_data['stage_code']}",
                    )

            # 制程名称唯一性校验（仅当本次更新包含 stage_name 时，排除自身）
            if "stage_name" in update_data and update_data["stage_name"]:
                name_conflict = await db.execute(
                    select(BaseStage).where(
                        BaseStage.plan_id.is_(None),
                        BaseStage.factory_id == effective_factory_id,
                        BaseStage.stage_name == update_data["stage_name"],
                        BaseStage.stage_id != stage_id,
                    )
                )
                if name_conflict.scalar_one_or_none():
                    raise BusinessException(
                        ErrorCode.DB_ERROR,
                        extra_msg=f"该工厂下制程名称已存在: {update_data['stage_name']}",
                    )

            # md_stage 没有 stage_type_id 列，需解析为 stage_type 编码
            if "stage_type_id" in update_data:
                stage_type_id = update_data.pop("stage_type_id")
                entity.stage_type = await self._resolve_stage_type_code(stage_type_id, db)
            for field, value in update_data.items():
                if field in allowed_fields:
                    if field == "status" and isinstance(value, BaseStatus):
                        value = value.value
                    setattr(entity, field, value)
            await db.commit()
            return str(stage_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_stage {stage_id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新制程失败: {e}")

    async def delete_stage(
        self,
        stage_id: int,
        db: AsyncSession,
    ) -> str:
        entity = await self._get_or_raise(stage_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(stage_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete_stage]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除制程失败: {e}")

    async def get_stage_by_id(
        self,
        stage_id: int,
        db: AsyncSession,
    ) -> BaseStageVo:
        entity = await self._get_or_raise(stage_id, db)
        return BaseStageVo.model_validate(entity)

    async def query_stages(
        self,
        query: BaseStageQueryDto,
        db: AsyncSession,
    ) -> Page[BaseStageVo]:
        try:
            stmt = select(BaseStage)
            count_stmt = select(func.count()).select_from(BaseStage)
            # 仅查询主数据（plan_id 为空），排除按计划仿真快照
            conditions = [BaseStage.plan_id.is_(None)]

            if query.factory_id is not None:
                conditions.append(BaseStage.factory_id == query.factory_id)
            if query.stage_code:
                conditions.append(BaseStage.stage_code == query.stage_code)
            if query.stage_name:
                conditions.append(BaseStage.stage_name.ilike(f"%{query.stage_name}%"))
            if query.stage_type_id is not None:
                # md_stage 没有 stage_type_id 列，按解析后的 stage_type 编码过滤
                stage_type_code = await self._resolve_stage_type_code(query.stage_type_id, db)
                conditions.append(BaseStage.stage_type == stage_type_code)
            if query.status is not None:
                conditions.append(BaseStage.status == query.status.value)

            if conditions:
                from sqlalchemy import and_
                stmt = stmt.where(and_(*conditions))
                count_stmt = count_stmt.where(and_(*conditions))

            stmt = stmt.order_by(BaseStage.sequence.asc(), BaseStage.created_at.desc())

            total_result = await db.execute(count_stmt)
            total = total_result.scalar_one()

            filter_field_names = {"factory_id", "stage_code", "stage_name", "stage_type_id", "status"}
            has_filter = any(
                getattr(query, name) is not None and getattr(query, name) != ""
                for name in filter_field_names
            )
            is_body_empty = not bool(query.model_fields_set)
            if not has_filter and is_body_empty:
                result = await db.execute(stmt)
                items = [BaseStageVo.model_validate(r) for r in result.scalars().all()]
                return Page(items=items, total=total, current=1, pageSize=total if total > 0 else 10, totalPages=1)

            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [BaseStageVo.model_validate(r) for r in result.scalars().all()]
            total_pages = math.ceil(total / query.pageSize) if query.pageSize > 0 else 0
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize, totalPages=total_pages)
        except BusinessException:
            raise
        except Exception as e:
            logger.error(f"[Error in query_stages]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询制程失败: {e}")

    async def _get_or_raise(
        self,
        stage_id: int,
        db: AsyncSession,
    ) -> BaseStage:
        result = await db.execute(
            select(BaseStage).where(
                BaseStage.stage_id == stage_id,
                BaseStage.plan_id.is_(None),
            )
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"制程不存在: stage_id={stage_id}")
        return entity

    async def _resolve_stage_type_code(
        self,
        stage_type_id,
        db: AsyncSession,
    ) -> str:
        """将 dict_stage_type 主键解析为类型编码（stage_type_code）。

        dict_stage_type 为 Creator 专用字典，无 plan_id，不做主数据过滤。
        """
        if stage_type_id is None:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="制程类型ID不能为空")
        result = await db.execute(
            select(DictStageType.stage_type_code).where(
                DictStageType.stage_type_id == stage_type_id
            )
        )
        stage_type_code = result.scalar_one_or_none()
        if stage_type_code is None:
            raise BusinessException(
                ErrorCode.NOT_FOUND_ERROR,
                extra_msg=f"制程类型不存在: stage_type_id={stage_type_id}",
            )
        return stage_type_code
