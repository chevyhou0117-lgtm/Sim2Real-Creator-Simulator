import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from common.BaseResponse import BaseResponse
from common.ErrorCode import ErrorCode
from commonutils.Logs import init_logging
from config.PgSqlConfig import get_db
from exception.ExceptionClass import BusinessException
from models.dto.FactoryProcessDetailsDto import (
    FactoryProcessDetailsCreateDto,
    FactoryProcessDetailsUpdateDto,
)
from models.vo.FactoryProcessDetailsVo import FactoryProcessDetailsVo
from result.ResultUtils import ResultUtils
from service.FactoryProcessDetailsService import FactoryProcessDetailsService

init_logging()
logger = logging.getLogger(__name__)

factory_process_details_router = APIRouter(prefix="/factory-process-details")

_service = FactoryProcessDetailsService()


def get_service() -> FactoryProcessDetailsService:
    return _service


@factory_process_details_router.post(
    "/create",
    response_model=BaseResponse[FactoryProcessDetailsVo],
    summary="创建制程实例详情（返回聚合 VO）",
)
async def create_process_detail(
    dto: FactoryProcessDetailsCreateDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryProcessDetailsService = Depends(get_service),
):
    if not dto.factory_asset_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="factoryAssetId 不能为空")
    result = await service.create_process_detail(dto, db)
    return ResultUtils.ok(data=result, message="创建成功")


@factory_process_details_router.put(
    "/update",
    response_model=BaseResponse[FactoryProcessDetailsVo],
    summary="更新制程实例详情（支持同时更新实例层 + 基础制程层，返回聚合 VO）",
)
async def update_process_detail(
    dto: FactoryProcessDetailsUpdateDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryProcessDetailsService = Depends(get_service),
):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="id 不合法")
    result = await service.update_process_detail(dto, db)
    return ResultUtils.ok(data=result, message="更新成功")
