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
from models.dto.DictWarehouseTypeDto import (
    DictWarehouseTypeCreateDto,
    DictWarehouseTypeUpdateDto,
    DictWarehouseTypeDeleteDto,
    DictWarehouseTypeQueryDto,
)
from models.vo.DictWarehouseTypeVo import DictWarehouseTypeVo
from result.ResultUtils import ResultUtils
from service.DictWarehouseTypeService import DictWarehouseTypeService

init_logging()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dict/warehouse-type")
_service = DictWarehouseTypeService()


def get_service() -> DictWarehouseTypeService:
    return _service


@router.post("/create", response_model=BaseResponse[str], summary="创建仓库类型字典")
async def create(
    dto: DictWarehouseTypeCreateDto,
    db: AsyncSession = Depends(get_db),
    service: DictWarehouseTypeService = Depends(get_service),
):
    type_id = await service.create(dto, db)
    return ResultUtils.ok(data=type_id, message="创建成功")


@router.put("/update", response_model=BaseResponse[str], summary="更新仓库类型字典")
async def update(
    dto: DictWarehouseTypeUpdateDto,
    db: AsyncSession = Depends(get_db),
    service: DictWarehouseTypeService = Depends(get_service),
):
    if not dto.warehouse_type_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    type_id = await service.update(dto.warehouse_type_id, dto, db)
    return ResultUtils.ok(data=type_id, message="更新成功")


@router.delete("/delete", response_model=BaseResponse[str], summary="删除仓库类型字典")
async def delete(
    dto: DictWarehouseTypeDeleteDto,
    db: AsyncSession = Depends(get_db),
    service: DictWarehouseTypeService = Depends(get_service),
):
    if not dto.warehouse_type_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    type_id = await service.delete(dto.warehouse_type_id, db)
    return ResultUtils.ok(data=type_id, message="删除成功")


@router.get("/{type_id}", response_model=BaseResponse[DictWarehouseTypeVo], summary="根据ID查询仓库类型字典")
async def get_by_id(
    type_id: SnowflakeIdIn,
    db: AsyncSession = Depends(get_db),
    service: DictWarehouseTypeService = Depends(get_service),
):
    if not type_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    result = await service.get_by_id(type_id, db)
    return ResultUtils.ok(data=result, message="查询成功")


@router.post("/query", response_model=BaseResponse[Page[DictWarehouseTypeVo]], summary="查询仓库类型字典列表")
async def query(
    query: DictWarehouseTypeQueryDto,
    db: AsyncSession = Depends(get_db),
    service: DictWarehouseTypeService = Depends(get_service),
):
    result = await service.query(query, db)
    return ResultUtils.ok(data=result, message="查询成功")
