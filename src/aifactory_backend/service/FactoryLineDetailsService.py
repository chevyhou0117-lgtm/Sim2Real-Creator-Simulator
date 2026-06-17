import logging
from enum import Enum as _Enum
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.FactoryLineDetailsDto import (
    FactoryLineDetailsCreateDto,
    FactoryLineDetailsUpdateDto,
)
from models.entity.BaseProductionLineEntity import BaseProductionLine
from models.entity.FactoryAsset3dModelEntity import FactoryAsset3dModel
from models.entity.FactoryLineDetailsEntity import FactoryLineDetails
from models.vo.BaseProductionLineVo import BaseProductionLineVo
from models.vo.FactoryLineDetailsVo import FactoryLineDetailsVo

init_logging()
logger = logging.getLogger(__name__)

# 3D 模型层允许更新的字段集合
_3D_FIELDS = {"usd_name", "usd_id", "root_usd_path", "bucket_name", "prim_path", "location_path", "thumbnail_path"}
# 实例层允许更新的字段集合
_INSTANCE_FIELDS = {"factory_asset_id", "ref_id", "capacity_per_day", "extra_metadata"}
# 基础线体层允许更新的字段集合
_LINE_FIELDS = {"line_name", "line_code", "smt_pph", "operation_count", "status", "sort_order"}


class FactoryLineDetailsService:

    # ------------------------------------------------------------------ #
    #  公开接口：创建
    # ------------------------------------------------------------------ #
    async def create_line_detail(
        self,
        dto: FactoryLineDetailsCreateDto,
        db: AsyncSession,
    ) -> FactoryLineDetailsVo:
        """
        创建线体实例详情记录，返回聚合 VO。
        只写入 factory_line_details 实例表，3D模型和 base_production_line 通过关联独立管理。
        """
        try:
            entity = FactoryLineDetails(
                factory_asset_id=dto.factory_asset_id,
                ref_id=dto.ref_id,
                capacity_per_day=dto.capacity_per_day,
                extra_metadata=dto.extra_metadata,
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
            logger.error(f"[Error in create_line_detail]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建线体详情失败: {e}")

    # ------------------------------------------------------------------ #
    #  公开接口：更新
    # ------------------------------------------------------------------ #
    async def update_line_detail(
        self,
        dto: FactoryLineDetailsUpdateDto,
        db: AsyncSession,
    ) -> FactoryLineDetailsVo:
        """
        更新线体实例详情，支持同时更新三层数据：
        - [实例层]   factory_line_details
        - [3D模型层] factory_asset_3d_model（Upsert：有记录则更新，无记录且 root_usd_path 提供则创建）
        - [基础线体] base_production_line（仅当 ref_id 已绑定时才更新）
        """
        entity = await self._get_or_raise(dto.id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("id", None)

        try:
            # —— 更新实例层 ——
            for field in _INSTANCE_FIELDS:
                if field in update_data:
                    value = update_data[field]
                    setattr(entity, field, value.value if isinstance(value, _Enum) else value)

            # —— 更新/创建 3D 模型层 ——
            model_update = {k: v for k, v in update_data.items() if k in _3D_FIELDS}
            if model_update:
                factory_asset_id = update_data.get("factory_asset_id", entity.factory_asset_id)
                await self._upsert_3d_model(factory_asset_id, model_update, db)

            # —— 更新基础线体层 ——
            line_update = {k: v for k, v in update_data.items() if k in _LINE_FIELDS}
            if line_update:
                ref_id = update_data.get("ref_id", entity.ref_id)
                if ref_id:
                    line_entity = await self._get_line(ref_id, db)
                    if line_entity:
                        for field, value in line_update.items():
                            setattr(line_entity, field, value.value if isinstance(value, _Enum) else value)
                    else:
                        logger.warning(f"ref_id={ref_id} 对应的 base_production_line 不存在，跳过基础线体字段更新")

            await db.commit()
            await db.refresh(entity)
            return await self._build_vo(entity, db)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_line_detail {dto.id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新线体详情失败: {e}")

    # ------------------------------------------------------------------ #
    #  私有：构建聚合 VO
    # ------------------------------------------------------------------ #
    async def _build_vo(
        self,
        entity: FactoryLineDetails,
        db: AsyncSession,
    ) -> FactoryLineDetailsVo:
        """从实例实体出发，JOIN 3D 模型 + base_production_line 构建聚合 VO。"""
        # 查 3D 模型
        model = await self._get_3d_model(entity.factory_asset_id, db)
        # 查基础线体
        base_line_vo: Optional[BaseProductionLineVo] = None
        if entity.ref_id:
            line = await self._get_line(entity.ref_id, db)
            if line:
                base_line_vo = BaseProductionLineVo.model_validate(line)

        return FactoryLineDetailsVo(
            id=entity.id,
            factory_asset_id=entity.factory_asset_id,
            capacity_per_day=entity.capacity_per_day,
            metadata=entity.extra_metadata,
            usd_name=model.usd_name if model else None,
            usd_id=model.usd_id if model else None,
            root_usd_path=model.root_usd_path if model else None,
            bucket_name=model.bucket_name if model else None,
            prim_path=model.prim_path if model else None,
            location_path=model.location_path if model else None,
            thumbnail_path=model.thumbnail_path if model else None,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            base_line=base_line_vo,
        )

    async def _upsert_3d_model(
        self,
        factory_asset_id: int,
        model_update: dict,
        db: AsyncSession,
    ) -> None:
        """Upsert 3D 模型记录：有则更新，无且含 root_usd_path 则创建。"""
        model = await self._get_3d_model(factory_asset_id, db)
        if model:
            for field, value in model_update.items():
                setattr(model, field, value.value if isinstance(value, _Enum) else value)
        elif model_update.get("root_usd_path"):
            new_model = FactoryAsset3dModel(
                factory_asset_id=factory_asset_id,
                **{k: v for k, v in model_update.items()},
            )
            db.add(new_model)

    async def _get_or_raise(self, detail_id: int, db: AsyncSession) -> FactoryLineDetails:
        result = await db.execute(
            select(FactoryLineDetails).where(FactoryLineDetails.id == detail_id)
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"线体详情不存在: id={detail_id}")
        return entity

    async def _get_3d_model(self, factory_asset_id: int, db: AsyncSession) -> Optional[FactoryAsset3dModel]:
        result = await db.execute(
            select(FactoryAsset3dModel).where(FactoryAsset3dModel.factory_asset_id == factory_asset_id)
        )
        return result.scalar_one_or_none()

    async def _get_line(self, line_id: int, db: AsyncSession) -> Optional[BaseProductionLine]:
        result = await db.execute(
            select(BaseProductionLine).where(BaseProductionLine.line_id == line_id)
        )
        return result.scalar_one_or_none()
