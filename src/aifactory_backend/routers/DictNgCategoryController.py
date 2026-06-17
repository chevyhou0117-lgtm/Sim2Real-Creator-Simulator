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
from models.dto.DictNgCategoryDto import (
    DictNgCategoryCreateDto,
    DictNgCategoryUpdateDto,
    DictNgCategoryDeleteDto,
    DictNgCategoryQueryDto,
)
from models.vo.DictNgCategoryVo import DictNgCategoryVo
from result.ResultUtils import ResultUtils
from service.DictNgCategoryService import DictNgCategoryService

init_logging()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/dict/ng-category")
_service = DictNgCategoryService()


def get_service() -> DictNgCategoryService:
    return _service


@router.post("/create", response_model=BaseResponse[str], summary="创建不良类型字典")
async def create(
    dto: DictNgCategoryCreateDto,
    db: AsyncSession = Depends(get_db),
    service: DictNgCategoryService = Depends(get_service),
):
    category_id = await service.create(dto, db)
    return ResultUtils.ok(data=category_id, message="创建成功")


@router.put("/update", response_model=BaseResponse[str], summary="更新不良类型字典")
async def update(
    dto: DictNgCategoryUpdateDto,
    db: AsyncSession = Depends(get_db),
    service: DictNgCategoryService = Depends(get_service),
):
    if not dto.ng_category_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    category_id = await service.update(dto.ng_category_id, dto, db)
    return ResultUtils.ok(data=category_id, message="更新成功")


@router.delete("/delete", response_model=BaseResponse[str], summary="删除不良类型字典")
async def delete(
    dto: DictNgCategoryDeleteDto,
    db: AsyncSession = Depends(get_db),
    service: DictNgCategoryService = Depends(get_service),
):
    if not dto.ng_category_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    category_id = await service.delete(dto.ng_category_id, db)
    return ResultUtils.ok(data=category_id, message="删除成功")


@router.get("/{category_id}", response_model=BaseResponse[DictNgCategoryVo], summary="根据ID查询不良类型字典")
async def get_by_id(
    category_id: SnowflakeIdIn,
    db: AsyncSession = Depends(get_db),
    service: DictNgCategoryService = Depends(get_service),
):
    if not category_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    result = await service.get_by_id(category_id, db)
    return ResultUtils.ok(data=result, message="查询成功")


@router.post("/query", response_model=BaseResponse[Page[DictNgCategoryVo]], summary="查询不良类型字典列表")
async def query(
    query: DictNgCategoryQueryDto,
    db: AsyncSession = Depends(get_db),
    service: DictNgCategoryService = Depends(get_service),
):
    result = await service.query(query, db)
    return ResultUtils.ok(data=result, message="查询成功")
