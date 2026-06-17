import logging
from enum import Enum as _Enum
from typing import List, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from common.ErrorCode import ErrorCode
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.FactoryEquipmentDetailsDto import (
    FactoryEquipmentDetailsCreateDto,
    FactoryEquipmentDetailsUpdateDto,
    TechnicalSpecUpsertDto,
    ProcessParamUpsertDto,
    BomPartUpsertItemDto,
    SopUpsertItemDto,
    OperationRecordUpsertItemDto,
)
from models.entity.BaseEquipmentEntity import BaseEquipment
from models.entity.BaseEquipmentTechnicalSpecEntity import BaseEquipmentTechnicalSpec
from models.entity.BaseEquipmentProcessParamEntity import BaseEquipmentProcessParam
from models.entity.BaseEquipmentBomPartEntity import BaseEquipmentBomPart
from models.entity.BaseEquipmentSopEntity import BaseEquipmentSop
from models.entity.BaseEquipmentOperationRecordEntity import BaseEquipmentOperationRecord
from models.entity.FactoryAsset3dModelEntity import FactoryAsset3dModel
from models.entity.FactoryEquipmentDetailsEntity import FactoryEquipmentDetails
from models.vo.BaseEquipmentFullDetailVo import BaseEquipmentFullDetailVo
from models.vo.BaseEquipmentTechnicalSpecVo import BaseEquipmentTechnicalSpecVo
from models.vo.BaseEquipmentProcessParamVo import BaseEquipmentProcessParamVo
from models.vo.BaseEquipmentBomPartVo import BaseEquipmentBomPartVo
from models.vo.BaseEquipmentSopVo import BaseEquipmentSopVo
from models.vo.BaseEquipmentOperationRecordVo import BaseEquipmentOperationRecordVo
from models.vo.FactoryEquipmentDetailsVo import FactoryEquipmentDetailsVo

init_logging()
logger = logging.getLogger(__name__)

# 字段分层定义
_3D_FIELDS = {"usd_name", "usd_id", "root_usd_path", "bucket_name", "prim_path", "location_path", "thumbnail_path"}

_INSTANCE_FIELDS = {
    "factory_asset_id", "ref_id", "specifications", "installation_date",
    "position_data", "rotation_data", "extra_metadata", "description",
}

_EQUIPMENT_FIELDS = {
    "operation_id", "line_id", "equipment_code",
    "equipment_name", "equipment_type", "equipment_group_id", "brand", "manufacturer",
    "model_no", "manufacture_date", "manufacture_code", "made_in", "supplier",
    "supplier_phone", "purchase_date", "service_life", "standard_ct", "unit",
    "location", "equipment_photo", "responsible_person", "asset_code", "status", "sort_order",
}

# 子表嵌套字段名（从 update_data 中提取嵌套对象用）
_SUB_TABLE_KEYS = {"technical_spec", "process_param", "bom_parts", "sop_list", "operation_records"}


class FactoryEquipmentDetailsService:

    #  创建
    async def create_equipment_detail(
        self,
        dto: FactoryEquipmentDetailsCreateDto,
        db: AsyncSession,
    ) -> FactoryEquipmentDetailsVo:
        """
        创建设备实例详情记录，返回聚合 VO。
        只写入 factory_equipment_details 实例表，3D模型和 base_equipment 通过关联独立管理。
        """
        try:
            entity = FactoryEquipmentDetails(
                factory_asset_id=dto.factory_asset_id,
                ref_id=dto.ref_id,
                specifications=dto.specifications,
                installation_date=dto.installation_date,
                position_data=dto.position_data,
                rotation_data=dto.rotation_data,
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
            logger.error(f"[Error in create_equipment_detail]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建设备详情失败: {e}")

    #  公开接口：更新
    async def update_equipment_detail(
        self,
        dto: FactoryEquipmentDetailsUpdateDto,
        db: AsyncSession,
    ) -> FactoryEquipmentDetailsVo:
        """
        更新设备实例详情，支持同时更新多层数据：
        - [实例层]   factory_equipment_details
        - [3D模型层] factory_asset_3d_model（Upsert：有记录则更新，无记录且 root_usd_path 提供则创建）
        - [基础设备] base_equipment（仅当 ref_id 已绑定时才更新）
        - [技术规格] base_equipment_technical_spec（1:1 Upsert）
        - [过程参数] base_equipment_process_param（1:1 Upsert）
        - [BOM备件]  base_equipment_bom_part（1:N，id有值=更新，无值=新增）
        - [SOP]     base_equipment_sop（1:N，id有值=更新，无值=新增）
        - [运行记录] base_equipment_operation_record（1:N，id有值=更新，无值=新增）
        """
        entity = await self._get_or_raise(dto.id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("id", None)

        try:
            # 更新实例层
            for field in _INSTANCE_FIELDS:
                if field in update_data:
                    value = update_data[field]
                    setattr(entity, field, value.value if isinstance(value, _Enum) else value)

            # 更新/创建 3D 模型层
            model_update = {k: v for k, v in update_data.items() if k in _3D_FIELDS}
            if model_update:
                factory_asset_id = update_data.get("factory_asset_id", entity.factory_asset_id)
                await self._upsert_3d_model(factory_asset_id, model_update, db)

            # 确定 equipment_id（用于子表操作）
            ref_id = update_data.get("ref_id", entity.ref_id)

            # 更新基础设备层
            equip_update = {k: v for k, v in update_data.items() if k in _EQUIPMENT_FIELDS}
            if equip_update and ref_id:
                equip_entity = await self._get_equipment(ref_id, db)
                if equip_entity:
                    for field, value in equip_update.items():
                        setattr(equip_entity, field, value.value if isinstance(value, _Enum) else value)
                else:
                    logger.warning(f"ref_id={ref_id} 对应的 base_equipment 不存在，跳过基础设备字段更新")

            # 更新技术规格（1:1 Upsert）
            if dto.technical_spec is not None and ref_id:
                await self._upsert_technical_spec(ref_id, dto.technical_spec, db)

            # 更新过程参数（1:1 Upsert）
            if dto.process_param is not None and ref_id:
                await self._upsert_process_param(ref_id, dto.process_param, db)

            # 更新 BOM 备件（1:N Upsert）
            if dto.bom_parts is not None and ref_id:
                await self._upsert_bom_parts(ref_id, dto.bom_parts, db)

            # 更新 SOP（1:N Upsert）
            if dto.sop_list is not None and ref_id:
                await self._upsert_sop_list(ref_id, dto.sop_list, db)

            # 更新运行记录（1:N Upsert）
            if dto.operation_records is not None and ref_id:
                await self._upsert_operation_records(ref_id, dto.operation_records, db)

            await db.commit()
            await db.refresh(entity)
            return await self._build_vo(entity, db)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update_equipment_detail {dto.id}]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新设备详情失败: {e}")

    #  私有：构建聚合 VO
    async def _build_vo(
        self,
        entity: FactoryEquipmentDetails,
        db: AsyncSession,
    ) -> FactoryEquipmentDetailsVo:
        """从实例实体出发，JOIN 3D 模型 + base_equipment 构建聚合 VO。"""
        model = await self._get_3d_model(entity.factory_asset_id, db)
        # 查基础设备 含子表信息通过 model_validate 获取已有字段，子表数据由独立接口管理
        base_equipment_vo: Optional[BaseEquipmentFullDetailVo] = None
        if entity.ref_id:
            equip = await self._get_equipment(entity.ref_id, db)
            if equip:
                # 同步查询子表填充聚合 VO
                tech_spec = await self._query_technical_spec(entity.ref_id, db)
                proc_param = await self._query_process_param(entity.ref_id, db)
                bom_parts = await self._query_bom_parts(entity.ref_id, db)
                sop_list = await self._query_sop_list(entity.ref_id, db)
                op_records = await self._query_operation_records(entity.ref_id, db)

                base_equipment_vo = BaseEquipmentFullDetailVo.model_validate(equip)
                base_equipment_vo.technical_spec = BaseEquipmentTechnicalSpecVo.model_validate(tech_spec) if tech_spec else None
                base_equipment_vo.process_param = BaseEquipmentProcessParamVo.model_validate(proc_param) if proc_param else None
                base_equipment_vo.bom_parts = [BaseEquipmentBomPartVo.model_validate(p) for p in bom_parts]
                base_equipment_vo.sop_list = [BaseEquipmentSopVo.model_validate(s) for s in sop_list]
                base_equipment_vo.operation_records = [BaseEquipmentOperationRecordVo.model_validate(r) for r in op_records]

        return FactoryEquipmentDetailsVo(
            id=entity.id,
            factory_asset_id=entity.factory_asset_id,
            specifications=entity.specifications,
            installation_date=entity.installation_date,
            extra_metadata=entity.extra_metadata,
            instance_description=entity.description,
            position_data=entity.position_data,
            rotation_data=entity.rotation_data,
            usd_name=model.usd_name if model else None,
            usd_id=model.usd_id if model else None,
            root_usd_path=model.root_usd_path if model else None,
            bucket_name=model.bucket_name if model else None,
            prim_path=model.prim_path if model else None,
            location_path=model.location_path if model else None,
            thumbnail_path=model.thumbnail_path if model else None,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            base_equipment=base_equipment_vo,
        )

    #  子表 Upsert 方法
    async def _upsert_technical_spec(
        self, equipment_id: int, dto: TechnicalSpecUpsertDto, db: AsyncSession
    ) -> None:
        """技术规格 1:1 Upsert。"""
        record = await self._query_technical_spec(equipment_id, db)
        data = dto.model_dump(exclude_unset=True)
        if record:
            for k, v in data.items():
                setattr(record, k, v)
        else:
            db.add(BaseEquipmentTechnicalSpec(equipment_id=equipment_id, **data))

    async def _upsert_process_param(
        self, equipment_id: int, dto: ProcessParamUpsertDto, db: AsyncSession
    ) -> None:
        """过程参数 1:1 Upsert。"""
        record = await self._query_process_param(equipment_id, db)
        data = dto.model_dump(exclude_unset=True)
        if record:
            for k, v in data.items():
                setattr(record, k, v)
        else:
            db.add(BaseEquipmentProcessParam(equipment_id=equipment_id, **data))

    async def _upsert_bom_parts(
        self, equipment_id: int, items: List[BomPartUpsertItemDto], db: AsyncSession
    ) -> None:
        """BOM 备件 1:N Upsert：id 有值则更新对应记录，无值则新增。"""
        for item in items:
            data = item.model_dump(exclude_unset=True)
            item_id = data.pop("id", None)
            if item_id:
                result = await db.execute(
                    select(BaseEquipmentBomPart).where(BaseEquipmentBomPart.id == item_id)
                )
                record = result.scalar_one_or_none()
                if record:
                    for k, v in data.items():
                        setattr(record, k, v)
                else:
                    logger.warning(f"BOM备件 id={item_id} 不存在，跳过更新")
            else:
                db.add(BaseEquipmentBomPart(equipment_id=equipment_id, **data))

    async def _upsert_sop_list(
        self, equipment_id: int, items: List[SopUpsertItemDto], db: AsyncSession
    ) -> None:
        """SOP 1:N Upsert：id 有值则更新对应记录，无值则新增。"""
        for item in items:
            data = item.model_dump(exclude_unset=True)
            item_id = data.pop("id", None)
            if item_id:
                result = await db.execute(
                    select(BaseEquipmentSop).where(BaseEquipmentSop.id == item_id)
                )
                record = result.scalar_one_or_none()
                if record:
                    for k, v in data.items():
                        setattr(record, k, v)
                else:
                    logger.warning(f"SOP id={item_id} 不存在，跳过更新")
            else:
                db.add(BaseEquipmentSop(equipment_id=equipment_id, **data))

    async def _upsert_operation_records(
        self, equipment_id: int, items: List[OperationRecordUpsertItemDto], db: AsyncSession
    ) -> None:
        """运行记录 1:N Upsert：id 有值则更新对应记录，无值则新增。"""
        for item in items:
            data = item.model_dump(exclude_unset=True)
            item_id = data.pop("id", None)
            if item_id:
                result = await db.execute(
                    select(BaseEquipmentOperationRecord).where(BaseEquipmentOperationRecord.id == item_id)
                )
                record = result.scalar_one_or_none()
                if record:
                    for k, v in data.items():
                        setattr(record, k, v)
                else:
                    logger.warning(f"运行记录 id={item_id} 不存在，跳过更新")
            else:
                db.add(BaseEquipmentOperationRecord(equipment_id=equipment_id, **data))

    #  子表查询辅助方法
    async def _query_technical_spec(self, equipment_id: int, db: AsyncSession) -> Optional[BaseEquipmentTechnicalSpec]:
        result = await db.execute(
            select(BaseEquipmentTechnicalSpec).where(BaseEquipmentTechnicalSpec.equipment_id == equipment_id)
        )
        return result.scalar_one_or_none()

    async def _query_process_param(self, equipment_id: int, db: AsyncSession) -> Optional[BaseEquipmentProcessParam]:
        result = await db.execute(
            select(BaseEquipmentProcessParam).where(BaseEquipmentProcessParam.equipment_id == equipment_id)
        )
        return result.scalar_one_or_none()

    async def _query_bom_parts(self, equipment_id: int, db: AsyncSession) -> List[BaseEquipmentBomPart]:
        result = await db.execute(
            select(BaseEquipmentBomPart).where(BaseEquipmentBomPart.equipment_id == equipment_id)
        )
        return list(result.scalars().all())

    async def _query_sop_list(self, equipment_id: int, db: AsyncSession) -> List[BaseEquipmentSop]:
        result = await db.execute(
            select(BaseEquipmentSop).where(BaseEquipmentSop.equipment_id == equipment_id)
        )
        return list(result.scalars().all())

    async def _query_operation_records(self, equipment_id: int, db: AsyncSession) -> List[BaseEquipmentOperationRecord]:
        result = await db.execute(
            select(BaseEquipmentOperationRecord).where(BaseEquipmentOperationRecord.equipment_id == equipment_id)
        )
        return list(result.scalars().all())

    #  通用查询辅助方法
    async def _upsert_3d_model(self, factory_asset_id: int, model_update: dict, db: AsyncSession) -> None:
        """Upsert 3D 模型记录：有则更新，无且含 root_usd_path 则创建。"""
        model = await self._get_3d_model(factory_asset_id, db)
        if model:
            for field, value in model_update.items():
                setattr(model, field, value.value if isinstance(value, _Enum) else value)
        elif model_update.get("root_usd_path"):
            db.add(FactoryAsset3dModel(factory_asset_id=factory_asset_id, **model_update))

    async def _get_or_raise(self, detail_id: int, db: AsyncSession) -> FactoryEquipmentDetails:
        result = await db.execute(
            select(FactoryEquipmentDetails).where(FactoryEquipmentDetails.id == detail_id)
        )
        entity = result.scalar_one_or_none()
        if entity is None:
            raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"设备详情不存在: id={detail_id}")
        return entity

    async def _get_3d_model(self, factory_asset_id: int, db: AsyncSession) -> Optional[FactoryAsset3dModel]:
        result = await db.execute(
            select(FactoryAsset3dModel).where(FactoryAsset3dModel.factory_asset_id == factory_asset_id)
        )
        return result.scalar_one_or_none()

    async def _get_equipment(self, equipment_id: int, db: AsyncSession) -> Optional[BaseEquipment]:
        result = await db.execute(
            select(BaseEquipment).where(BaseEquipment.equipment_id == equipment_id)
        )
        return result.scalar_one_or_none()

