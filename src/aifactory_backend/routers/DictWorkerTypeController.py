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
from models.dto.DictWorkerTypeDto import (
    DictWorkerTypeCreateDto,
    DictWorkerTypeUpdateDto,
    DictWorkerTypeDeleteDto,
    DictWorkerTypeQueryDto,
)
from models.vo.DictWorkerTypeVo import DictWorkerTypeVo
from result.ResultUtils import ResultUtils
from service.DictWorkerTypeService import DictWorkerTypeService

init_logging()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dict/worker-type")
_service = DictWorkerTypeService()


def get_service() -> DictWorkerTypeService:
    return _service


@router.post("/create", response_model=BaseResponse[str], summary="创建工种字典")
async def create(
    dto: DictWorkerTypeCreateDto,
    db: AsyncSession = Depends(get_db),
    service: DictWorkerTypeService = Depends(get_service),
):
    type_id = await service.create(dto, db)
    return ResultUtils.ok(data=type_id, message="创建成功")


@router.put("/update", response_model=BaseResponse[str], summary="更新工种字典")
async def update(
    dto: DictWorkerTypeUpdateDto,
    db: AsyncSession = Depends(get_db),
    service: DictWorkerTypeService = Depends(get_service),
):
    if not dto.worker_type_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    type_id = await service.update(dto.worker_type_id, dto, db)
    return ResultUtils.ok(data=type_id, message="更新成功")


@router.delete("/delete", response_model=BaseResponse[str], summary="删除工种字典")
async def delete(
    dto: DictWorkerTypeDeleteDto,
    db: AsyncSession = Depends(get_db),
    service: DictWorkerTypeService = Depends(get_service),
):
    if not dto.worker_type_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    type_id = await service.delete(dto.worker_type_id, db)
    return ResultUtils.ok(data=type_id, message="删除成功")


@router.get("/{type_id}", response_model=BaseResponse[DictWorkerTypeVo], summary="根据ID查询工种字典")
async def get_by_id(
    type_id: SnowflakeIdIn,
    db: AsyncSession = Depends(get_db),
    service: DictWorkerTypeService = Depends(get_service),
):
    if not type_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    result = await service.get_by_id(type_id, db)
    return ResultUtils.ok(data=result, message="查询成功")


@router.post("/query", response_model=BaseResponse[Page[DictWorkerTypeVo]], summary="查询工种字典列表")
async def query(
    query: DictWorkerTypeQueryDto,
    db: AsyncSession = Depends(get_db),
    service: DictWorkerTypeService = Depends(get_service),
):
    result = await service.query(query, db)
    return ResultUtils.ok(data=result, message="查询成功")
