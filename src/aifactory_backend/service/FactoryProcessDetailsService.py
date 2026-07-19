import logging
from enum import Enum as _Enum
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.FactoryProcessDetailsDto import (
    FactoryProcessDetailsCreateDto,
    FactoryProcessDetailsUpdateDto,
)
from models.entity.BaseStageEntity import BaseStage
from models.entity.FactoryProcessDetailsEntity import FactoryProcessDetails
from models.enums.InstanceAssetTypeEnum import InstanceAssetType
from models.vo.BaseStageVo import BaseStageVo
from models.vo.FactoryProcessDetailsVo import FactoryProcessDetailsVo
from service.FactoryAssetNodeService import FactoryAssetNodeService

init_logging()
logger = logging.getLogger(__name__)

_asset_node_service = FactoryAssetNodeService()


class FactoryProcessDetailsService:

    # ------------------------------------------------------------------ #
    #  公开接口：创建
    # ------------------------------------------------------------------ #
    async def create_process_detail(
        self,
        dto: FactoryProcessDetailsCreateDto,
        db: AsyncSession,
    ) -> FactoryProcessDetailsVo:
        """
        创建制程实例详情记录，返回聚合 VO。
        只写入 factory_process_details 实例表，base_stage 通过 ref_id 关联不在此创建。
        """
        try:
            await _asset_node_service.ensure_node_editable(
                dto.factory_asset_id,
                db,
                InstanceAssetType.STAGE,
            )
            existing = (await db.execute(
                select(FactoryProcessDetails.id).where(
                    FactoryProcessDetails.factory_asset_id == dto.factory_asset_id,
                    FactoryProcessDetails.is_deleted == False,
                ).limit(1)
            )).scalar_one_or_none()
            if existing is not None:
                raise BusinessException(
                    ErrorCode.DATA_ALREADY_EXISTS,
                    extra_msg="该制程节点已存在详情",
                )
            entity = FactoryProcessDetails(
                factory_asset_id=dto.factory_asset_id,
                ref_id=dto.ref_id,
                total_capacity=dto.total_capacity,
                extra_metadata=dto.extra_metadata,
                description=dto.description,
            )
            db.add(entity)
            await db.commit()
            await db.refresh(entity)
            return await self._build_vo(entity, db)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create_process_detail]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建制程详情失败: {e}")

    # ------------------------------------------------------------------ #
    #  公开接口：更新
    # ------------------------------------------------------------------ #
    async def update_process_detail(
        self,
        dto: FactoryProcessDetailsUpdateDto,
        db: AsyncSession,
    ) -> FactoryProcessDetailsVo:
        """
        更新制程实例详情，支持同时更新两层数据：
        - [实例层]   factory_process_details
        - [基础制程] base_stage（仅当 ref_id 已绑定时才更新）
        """
        entity = await self._get_or_raise(dto.id, db)
        await _asset_node_service.ensure_node_editable(
            entity.factory_asset_id,
            db,
            InstanceAssetType.STAGE,
        )
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("id", None)

        requested_asset_id = update_data.pop("factory_asset_id", None)
        if (
            requested_asset_id is not None
            and str(requested_asset_id) != str(entity.factory_asset_id)
        ):
            raise BusinessException(
                ErrorCode.PARAMS_ERROR,
                extra_msg="factory_asset_id 创建后不可修改",
            )

        # 实例层允许更新的字段
        instance_fields = {"ref_id", "total_capacity", "extra_metadata", "description"}
        # 基础制程层允许更新的字段
        stage_fields = {"stage_name", "stage_code", "sequence", "stage_type_id", "line_count", "status", "creator_binding_id"}

        try:
            # —— 更新实例层 ——
            for field in instance_fields:
                if field in update_data:
                    value = update_data[field]
                    setattr(entity, field, value.value if isinstance(value, _Enum) else value)

            # —— 更新基础制程层 ——
            stage_update = {k: v for k, v in update_data.items() if k in stage_fields}
            if stage_update:
                ref_id = update_data.get("ref_id", entity.ref_id)
                if ref_id:
                    stage_entity = await self._get_stage(ref_id, db)
                    if stage_entity:
                        for field, value in stage_update.items():
                            setattr(stage_entity, field, value.value if isinstance(value, _Enum) else value)
                    else:
                        logger.warning(f"ref_id={ref_id} 对应的 base_stage 不存在，跳过基础制程字段更新")

            await db.commit()
            await db.refresh(entity)
            return await self._build_vo(entity, db)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_process_detail {dto.id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新制程详情失败: {e}")

    # ------------------------------------------------------------------ #
    #  私有：根据 ID 查询并构建聚合 VO
    # ------------------------------------------------------------------ #
    async def _build_vo(
        self,
        entity: FactoryProcessDetails,
        db: AsyncSession,
    ) -> FactoryProcessDetailsVo:
        """从实例实体出发，JOIN base_stage 构建聚合 VO。"""
        base_process_vo: Optional[BaseStageVo] = None
        process_name: Optional[str] = None
        process_code: Optional[str] = None
        line_count: Optional[int] = None

        if entity.ref_id:
            stage = await self._get_stage(entity.ref_id, db)
            if stage:
                base_process_vo = BaseStageVo.model_validate(stage)
                process_name = stage.stage_name
                process_code = stage.stage_code
                line_count = stage.line_count

        return FactoryProcessDetailsVo(
            id=entity.id,
            factory_asset_id=entity.factory_asset_id,
            process_name=process_name,
            process_code=process_code,
            line_count=line_count,
            total_capacity=entity.total_capacity,
            metadata=entity.extra_metadata,
            description=entity.description,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            base_process=base_process_vo,
        )

    async def _get_or_raise(self, detail_id: int, db: AsyncSession) -> FactoryProcessDetails:
        result = await db.execute(
            select(FactoryProcessDetails).where(
                FactoryProcessDetails.id == detail_id,
                FactoryProcessDetails.is_deleted == False,
            )
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"制程详情不存在: id={detail_id}")
        return entity

    async def _get_stage(self, stage_id: int, db: AsyncSession) -> Optional[BaseStage]:
        result = await db.execute(
            select(BaseStage).where(BaseStage.stage_id == stage_id)
        )
        return result.scalar_one_or_none()
