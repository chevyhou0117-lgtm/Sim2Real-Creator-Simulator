import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from common.BaseResponse import BaseResponse
from common.ErrorCode import ErrorCode
from commonutils.Logs import init_logging
from config.PgSqlConfig import get_db
from exception.ExceptionClass import BusinessException
from models.dto.FactoryLineDetailsDto import (
    FactoryLineDetailsCreateDto,
    FactoryLineDetailsUpdateDto,
)
from models.vo.FactoryLineDetailsVo import FactoryLineDetailsVo
from result.ResultUtils import ResultUtils
from service.FactoryLineDetailsService import FactoryLineDetailsService

init_logging()
logger = logging.getLogger(__name__)

factory_line_details_router = APIRouter(prefix="/factory-line-details")

_service = FactoryLineDetailsService()


def get_service() -> FactoryLineDetailsService:
    return _service


@factory_line_details_router.post(
    "/create",
    response_model=BaseResponse[FactoryLineDetailsVo],
    summary="创建线体实例详情（返回聚合 VO）",
)
async def create_line_detail(
    dto: FactoryLineDetailsCreateDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryLineDetailsService = Depends(get_service),
):
    if not dto.factory_asset_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="factoryAssetId 不能为空")
    result = await service.create_line_detail(dto, db)
    return ResultUtils.ok(data=result, message="创建成功")


@factory_line_details_router.put(
    "/update",
    response_model=BaseResponse[FactoryLineDetailsVo],
    summary="更新线体实例详情（支持同时更新实例层 + 3D模型层 + 基础线体层，返回聚合 VO）",
)
async def update_line_detail(
    dto: FactoryLineDetailsUpdateDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryLineDetailsService = Depends(get_service),
):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="id 不合法")
    result = await service.update_line_detail(dto, db)
    return ResultUtils.ok(data=result, message="更新成功")
