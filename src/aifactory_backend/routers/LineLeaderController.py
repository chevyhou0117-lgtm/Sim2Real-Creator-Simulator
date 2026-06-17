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
from models.dto.LineLeaderDto import (
    LineLeaderCreateDto,
    LineLeaderUpdateDto,
    LineLeaderDeleteDto,
    LineLeaderQueryDto,
)
from models.vo.LineLeaderVo import LineLeaderVo
from result.ResultUtils import ResultUtils
from service.LineLeaderService import LineLeaderService

init_logging()
logger = logging.getLogger(__name__)

line_leader_router = APIRouter(prefix="/line-leader")

_service = LineLeaderService()


def get_service() -> LineLeaderService:
    return _service


@line_leader_router.post(
    "/create",
    response_model=BaseResponse[int],
    summary="创建线体负责人信息（返回ID）",
)
async def create_line_leader(
    dto: LineLeaderCreateDto,
    db: AsyncSession = Depends(get_db),
    service: LineLeaderService = Depends(get_service),
):
    if not dto.factory_asset_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="factoryAssetId 不能为空")
    leader_id = await service.create_line_leader(dto, db)
    return ResultUtils.ok(data=leader_id, message="创建成功")


@line_leader_router.put(
    "/update",
    response_model=BaseResponse[int],
    summary="更新线体负责人信息（返回ID）",
)
async def update_line_leader(
    dto: LineLeaderUpdateDto,
    db: AsyncSession = Depends(get_db),
    service: LineLeaderService = Depends(get_service),
):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    leader_id = await service.update_line_leader(dto.id, dto, db)
    return ResultUtils.ok(data=leader_id, message="更新成功")


@line_leader_router.delete(
    "/delete",
    response_model=BaseResponse[int],
    summary="删除线体负责人信息（返回ID）",
)
async def delete_line_leader(
    dto: LineLeaderDeleteDto,
    db: AsyncSession = Depends(get_db),
    service: LineLeaderService = Depends(get_service),
):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    leader_id = await service.delete_line_leader(dto.id, db)
    return ResultUtils.ok(data=leader_id, message="删除成功")


@line_leader_router.get(
    "/{leader_id}",
    response_model=BaseResponse[LineLeaderVo],
    summary="根据ID查询线体负责人信息",
)
async def get_line_leader_by_id(
    leader_id: SnowflakeIdIn,
    db: AsyncSession = Depends(get_db),
    service: LineLeaderService = Depends(get_service),
):
    if not leader_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    result = await service.get_line_leader_by_id(leader_id, db)
    return ResultUtils.ok(data=result, message="查询成功")


@line_leader_router.post(
    "/query",
    response_model=BaseResponse[Page[LineLeaderVo]],
    summary="按字段查询线体负责人信息（不传字段=全量）",
)
async def query_line_leaders(
    query: LineLeaderQueryDto,
    db: AsyncSession = Depends(get_db),
    service: LineLeaderService = Depends(get_service),
):
    result = await service.query_line_leaders(query, db)
    return ResultUtils.ok(data=result, message="查询成功")
