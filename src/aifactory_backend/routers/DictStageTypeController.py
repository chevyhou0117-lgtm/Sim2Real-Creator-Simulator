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
from models.dto.DictStageTypeDto import (
    DictStageTypeCreateDto,
    DictStageTypeUpdateDto,
    DictStageTypeDeleteDto,
    DictStageTypeQueryDto,
)
from models.vo.DictStageTypeVo import DictStageTypeVo
from result.ResultUtils import ResultUtils
from service.DictStageTypeService import DictStageTypeService

init_logging()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dict/stage-type")
_service = DictStageTypeService()


def get_service() -> DictStageTypeService:
    return _service


@router.post("/create", response_model=BaseResponse[str], summary="创建制程类型字典")
async def create(
    dto: DictStageTypeCreateDto,
    db: AsyncSession = Depends(get_db),
    service: DictStageTypeService = Depends(get_service),
):
    type_id = await service.create(dto, db)
    return ResultUtils.ok(data=type_id, message="创建成功")


@router.put("/update", response_model=BaseResponse[str], summary="更新制程类型字典")
async def update(
    dto: DictStageTypeUpdateDto,
    db: AsyncSession = Depends(get_db),
    service: DictStageTypeService = Depends(get_service),
):
    if not dto.stage_type_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    type_id = await service.update(dto.stage_type_id, dto, db)
    return ResultUtils.ok(data=type_id, message="更新成功")


@router.delete("/delete", response_model=BaseResponse[str], summary="删除制程类型字典")
async def delete(
    dto: DictStageTypeDeleteDto,
    db: AsyncSession = Depends(get_db),
    service: DictStageTypeService = Depends(get_service),
):
    if not dto.stage_type_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    type_id = await service.delete(dto.stage_type_id, db)
    return ResultUtils.ok(data=type_id, message="删除成功")


@router.get("/{type_id}", response_model=BaseResponse[DictStageTypeVo], summary="根据ID查询制程类型字典")
async def get_by_id(
    type_id: SnowflakeIdIn,
    db: AsyncSession = Depends(get_db),
    service: DictStageTypeService = Depends(get_service),
):
    if not type_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    result = await service.get_by_id(type_id, db)
    return ResultUtils.ok(data=result, message="查询成功")


@router.post("/query", response_model=BaseResponse[Page[DictStageTypeVo]], summary="查询制程类型字典列表")
async def query(
    query: DictStageTypeQueryDto,
    db: AsyncSession = Depends(get_db),
    service: DictStageTypeService = Depends(get_service),
):
    result = await service.query(query, db)
    return ResultUtils.ok(data=result, message="查询成功")
