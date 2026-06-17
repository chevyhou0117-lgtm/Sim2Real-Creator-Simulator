import logging

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from common.BaseResponse import BaseResponse
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from commonutils.SnowflakeUtils import SnowflakeIdIn
from config.PgSqlConfig import get_db
from exception.ExceptionClass import BusinessException
from models.dto.BaseStageDto import (
    BaseStageCreateDto,
    BaseStageUpdateDto,
    BaseStageDeleteDto,
    BaseStageQueryDto,
)
from models.vo.BaseStageVo import BaseStageVo
from result.ResultUtils import ResultUtils
from service.BaseStageService import BaseStageService

init_logging()
logger = logging.getLogger(__name__)

base_stage_router = APIRouter(prefix="/base-stage")

_service = BaseStageService()


def get_service() -> BaseStageService:
    return _service


@base_stage_router.post(
    "/create",
    response_model=BaseResponse[str],
    summary="创建制程（返回制程ID）",
)
async def create_stage(
    dto: BaseStageCreateDto,
    db: AsyncSession = Depends(get_db),
    service: BaseStageService = Depends(get_service),
):
    if not dto.stage_name:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="stageName 不能为空")
    stage_id = await service.create_stage(dto, db)
    return ResultUtils.ok(data=stage_id, message="创建成功")


@base_stage_router.put(
    "/update",
    response_model=BaseResponse[str],
    summary="更新制程（返回制程ID）",
)
async def update_stage(
    dto: BaseStageUpdateDto,
    db: AsyncSession = Depends(get_db),
    service: BaseStageService = Depends(get_service),
):
    if not dto.stage_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="制程ID不合法")
    stage_id = await service.update_stage(dto.stage_id, dto, db)
    return ResultUtils.ok(data=stage_id, message="更新成功")


@base_stage_router.delete(
    "/delete",
    response_model=BaseResponse[str],
    summary="删除制程（返回制程ID）",
)
async def delete_stage(
    dto: BaseStageDeleteDto,
    db: AsyncSession = Depends(get_db),
    service: BaseStageService = Depends(get_service),
):
    if not dto.stage_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="制程ID不合法")
    stage_id = await service.delete_stage(dto.stage_id, db)
    return ResultUtils.ok(data=stage_id, message="删除成功")


@base_stage_router.get(
    "/{stage_id}",
    response_model=BaseResponse[BaseStageVo],
    summary="根据ID查询制程",
)
async def get_stage_by_id(
    stage_id: SnowflakeIdIn,
    db: AsyncSession = Depends(get_db),
    service: BaseStageService = Depends(get_service),
):
    if not stage_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="制程ID不合法")
    result = await service.get_stage_by_id(stage_id, db)
    return ResultUtils.ok(data=result, message="查询成功")


@base_stage_router.post(
    "/query",
    response_model=BaseResponse[Page[BaseStageVo]],
    summary="查询制程列表（不传字段=全量，支持分页）",
)
async def query_stages(
    query: BaseStageQueryDto,
    db: AsyncSession = Depends(get_db),
    service: BaseStageService = Depends(get_service),
):
    result = await service.query_stages(query, db)
    return ResultUtils.ok(data=result, message="查询成功")
