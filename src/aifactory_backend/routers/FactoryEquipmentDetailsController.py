import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from common.BaseResponse import BaseResponse
from common.ErrorCode import ErrorCode
from commonutils.Logs import init_logging
from config.PgSqlConfig import get_db
from exception.ExceptionClass import BusinessException
from models.dto.FactoryEquipmentDetailsDto import (
    FactoryEquipmentDetailsCreateDto,
    FactoryEquipmentDetailsUpdateDto,
)
from models.vo.FactoryEquipmentDetailsVo import FactoryEquipmentDetailsVo
from result.ResultUtils import ResultUtils
from service.FactoryEquipmentDetailsService import FactoryEquipmentDetailsService

init_logging()
logger = logging.getLogger(__name__)

factory_equipment_details_router = APIRouter(prefix="/factory-equipment-details")

_service = FactoryEquipmentDetailsService()


def get_service() -> FactoryEquipmentDetailsService:
    return _service


@factory_equipment_details_router.post(
    "/create",
    response_model=BaseResponse[FactoryEquipmentDetailsVo],
    summary="创建设备实例详情（返回聚合 VO）",
)
async def create_equipment_detail(
    dto: FactoryEquipmentDetailsCreateDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryEquipmentDetailsService = Depends(get_service),
):
    if not dto.factory_asset_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="factoryAssetId 不能为空")
    result = await service.create_equipment_detail(dto, db)
    return ResultUtils.ok(data=result, message="创建成功")


@factory_equipment_details_router.put(
    "/update",
    response_model=BaseResponse[FactoryEquipmentDetailsVo],
    summary="更新设备实例详情（支持同时更新实例层 + 3D模型层 + 基础设备层，返回聚合 VO）",
)
async def update_equipment_detail(
    dto: FactoryEquipmentDetailsUpdateDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryEquipmentDetailsService = Depends(get_service),
):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="id 不合法")
    result = await service.update_equipment_detail(dto, db)
    return ResultUtils.ok(data=result, message="更新成功")
