import math, logging
from typing import List
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from exception.ExceptionClass import BusinessException
from models.dto.BaseEquipmentDto import BaseEquipmentCreateDto, BaseEquipmentUpdateDto, BaseEquipmentQueryDto, BaseEquipmentBatchCreateDto, QueryEquipmentByLineIdDto
from models.entity.BaseEquipmentEntity import BaseEquipment
from models.entity.BaseEquipmentProcessParamEntity import BaseEquipmentProcessParam
from models.entity.FactoryLineDetailsEntity import FactoryLineDetails
from models.vo.BaseEquipmentVo import BaseEquipmentVo
from models.enums.BaseStatusEnum import BaseStatus

init_logging()
logger = logging.getLogger(__name__)


class BaseEquipmentService:
    async def create(self, dto: BaseEquipmentCreateDto, db: AsyncSession) -> str:
        try:
            if dto is None: raise BusinessException(ErrorCode.PARAMS_ERROR, "请求参数不能为空")
            stmt = select(BaseEquipment).where(
                BaseEquipment.equipment_code == dto.equipment_code,
                BaseEquipment.plan_id.is_(None),
            )
            if (await db.execute(stmt)).scalar_one_or_none():
                raise BusinessException(ErrorCode.DB_ERROR, extra_msg="设备编码已存在")
            data = dto.model_dump(exclude_unset=True)
            # standard_ct lives on md_equipment_process_parameters, not md_equipment
            standard_ct = data.pop("standard_ct", None)
            # md_equipment.line_id is NOT NULL
            if data.get("line_id") is None:
                raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="所属产线ID(line_id)不能为空")
            entity = BaseEquipment(**data)
            entity.plan_id = None
            db.add(entity)
            await db.flush()
            if standard_ct is not None:
                param = BaseEquipmentProcessParam(
                    equipment_id=entity.equipment_id,
                    standard_ct=standard_ct,
                    plan_id=None,
                )
                db.add(param)
            await db.commit()
            await db.refresh(entity)
            return str(entity.equipment_id)
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in create]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"创建设备失败: {e}")

    async def batch_create(self, dto: BaseEquipmentBatchCreateDto, db: AsyncSession) -> List[str]:
        try:
            if dto is None or not dto.items:
                raise BusinessException(ErrorCode.PARAMS_ERROR, "批量创建列表不能为空")
            ids = []
            for item in dto.items:
                stmt = select(BaseEquipment).where(
                    BaseEquipment.equipment_code == item.equipment_code,
                    BaseEquipment.plan_id.is_(None),
                )
                if (await db.execute(stmt)).scalar_one_or_none():
                    raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"设备编码已存在: {item.equipment_code}")
                data = item.model_dump(exclude_unset=True)
                # standard_ct lives on md_equipment_process_parameters, not md_equipment
                standard_ct = data.pop("standard_ct", None)
                # md_equipment.line_id is NOT NULL
                if data.get("line_id") is None:
                    raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="所属产线ID(line_id)不能为空")
                entity = BaseEquipment(**data)
                entity.plan_id = None
                db.add(entity)
                await db.flush()
                if standard_ct is not None:
                    param = BaseEquipmentProcessParam(
                        equipment_id=entity.equipment_id,
                        standard_ct=standard_ct,
                        plan_id=None,
                    )
                    db.add(param)
                ids.append(str(entity.equipment_id))
            await db.commit()
            return ids
        except BusinessException:
            await db.rollback()
            raise
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in batch_create]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"批量创建设备失败: {e}")

    async def update(self, equipment_id: int, dto: BaseEquipmentUpdateDto, db: AsyncSession) -> str:
        entity = await self._get_or_raise(equipment_id, db)
        update_data = dto.model_dump(exclude_unset=True)
        update_data.pop("equipment_id", None)
        if not update_data: return str(equipment_id)
        allowed = {"operation_id", "line_id", "equipment_code", "equipment_name", "equipment_type", "equipment_group_id",
                   "brand", "manufacturer", "model_no", "manufacture_date", "manufacture_code", "made_in", "supplier",
                   "supplier_phone", "purchase_date", "service_life", "unit", "location",
                   "equipment_photo", "responsible_person", "asset_code", "status", "sort_order"}
        try:
            # standard_ct lives on md_equipment_process_parameters, not md_equipment
            if "standard_ct" in update_data:
                standard_ct = update_data.pop("standard_ct")
                param_stmt = select(BaseEquipmentProcessParam).where(
                    BaseEquipmentProcessParam.equipment_id == equipment_id,
                    BaseEquipmentProcessParam.plan_id.is_(None),
                )
                param = (await db.execute(param_stmt)).scalar_one_or_none()
                if param is None:
                    param = BaseEquipmentProcessParam(
                        equipment_id=equipment_id,
                        standard_ct=standard_ct,
                        plan_id=None,
                    )
                    db.add(param)
                else:
                    param.standard_ct = standard_ct
            for field, value in update_data.items():
                if field in allowed:
                    if field == "status" and isinstance(value, BaseStatus): value = value.value
                    setattr(entity, field, value)
            await db.commit()
            return str(equipment_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in update]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"更新设备失败: {e}")

    async def delete(self, equipment_id: int, db: AsyncSession) -> str:
        entity = await self._get_or_raise(equipment_id, db)
        try:
            await db.delete(entity)
            await db.commit()
            return str(equipment_id)
        except Exception as e:
            await db.rollback()
            logger.error(f"[Error in delete]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"删除设备失败: {e}")

    async def get_by_id(self, equipment_id: int, db: AsyncSession) -> BaseEquipmentVo:
        entity = await self._get_or_raise(equipment_id, db)
        return BaseEquipmentVo.model_validate(entity)

    async def query(self, query: BaseEquipmentQueryDto, db: AsyncSession) -> Page[BaseEquipmentVo]:
        try:
            stmt, count_stmt = select(BaseEquipment), select(func.count()).select_from(BaseEquipment)
            conditions = [BaseEquipment.plan_id.is_(None)]
            if query.operation_id: conditions.append(BaseEquipment.operation_id == query.operation_id)
            if query.line_id: conditions.append(BaseEquipment.line_id == query.line_id)
            if query.equipment_code: conditions.append(BaseEquipment.equipment_code.ilike(f"%{query.equipment_code}%"))
            if query.equipment_name: conditions.append(BaseEquipment.equipment_name.ilike(f"%{query.equipment_name}%"))
            if query.equipment_type: conditions.append(BaseEquipment.equipment_type == query.equipment_type)
            if query.status is not None: conditions.append(BaseEquipment.status == query.status.value)
            if conditions: stmt, count_stmt = stmt.where(and_(*conditions)), count_stmt.where(and_(*conditions))
            stmt = stmt.order_by(BaseEquipment.created_at.desc())
            total = (await db.execute(count_stmt)).scalar_one()
            offset = (query.current - 1) * query.pageSize
            result = await db.execute(stmt.offset(offset).limit(query.pageSize))
            items = [BaseEquipmentVo.model_validate(r) for r in result.scalars().all()]
            return Page(items=items, total=total, current=query.current, pageSize=query.pageSize, totalPages=math.ceil(total / query.pageSize) if query.pageSize > 0 else 0)
        except BusinessException: raise
        except Exception as e:
            logger.error(f"[Error in query]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"查询设备失败: {e}")

    async def query_by_line_id(self, dto: QueryEquipmentByLineIdDto, db: AsyncSession) -> List[BaseEquipmentVo]:
        """
        根据父节点 parentId 查询对应线体下的所有设备：
        1. parentId → factory_line_details(factory_asset_id=parentId) → ref_id(= md_production_line.line_id)
        2. ref_id 为空 → 报错"请先绑定对应的线体，再绑定设备"
        3. 查 md_equipment WHERE line_id = ref_id AND plan_id IS NULL（master 行）
        4. keyword 可选：对 equipment_name / equipment_code 模糊过滤
        """
        if not dto.parent_id:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="parentId 不合法")
        try:
            # 1. parentId → factory_line_details → ref_id
            line_detail = (await db.execute(
                select(FactoryLineDetails.ref_id).where(
                    FactoryLineDetails.factory_asset_id == dto.parent_id,
                    FactoryLineDetails.is_deleted == False,
                )
            )).first()
            if line_detail is None or line_detail.ref_id is None:
                raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg="请先绑定对应的线体，再绑定设备")
            line_id = line_detail.ref_id

            # 2. 查 md_equipment（仅 master 行 plan_id IS NULL）
            conditions = [BaseEquipment.line_id == line_id, BaseEquipment.plan_id.is_(None)]
            # 3. keyword 模糊过滤
            if dto.keyword and dto.keyword.strip():
                kw = dto.keyword.strip()
                conditions.append(or_(
                    BaseEquipment.equipment_name.ilike(f"%{kw}%"),
                    BaseEquipment.equipment_code.ilike(f"%{kw}%"),
                ))
            stmt = select(BaseEquipment).where(and_(*conditions)).order_by(BaseEquipment.created_at.desc())
            entities = (await db.execute(stmt)).scalars().all()
            vos = [BaseEquipmentVo.model_validate(e) for e in entities]
            logger.info(f"根据父节点查设备成功: parentId={dto.parent_id}, line_id={line_id}, keyword='{dto.keyword}', 设备数={len(vos)}")
            return vos
        except BusinessException: raise
        except Exception as e:
            logger.error(f"[Error in query_by_line_id]: {e}")
            raise BusinessException(ErrorCode.DB_ERROR, extra_msg=f"根据线体查询设备失败: {e}")

    async def _get_or_raise(self, equipment_id: int, db: AsyncSession) -> BaseEquipment:
        result = await db.execute(select(BaseEquipment).where(
            BaseEquipment.equipment_id == equipment_id,
            BaseEquipment.plan_id.is_(None),
        ))
        entity = result.scalar_one_or_none()
        if entity is None: raise BusinessException(ErrorCode.NOT_FOUND_ERROR, extra_msg=f"设备不存在: equipment_id={equipment_id}")
        return entity
