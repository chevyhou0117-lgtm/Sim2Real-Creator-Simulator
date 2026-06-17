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
from models.dto.BaseFactoryDto import (
    BaseFactoryCreateDto,
    BaseFactoryUpdateDto,
    BaseFactoryDeleteDto,
    BaseFactoryQueryDto,
)
from models.vo.BaseFactoryVo import BaseFactoryVo
from result.ResultUtils import ResultUtils
from service.BaseFactoryService import BaseFactoryService

init_logging()
logger = logging.getLogger(__name__)

base_factory_router = APIRouter(prefix="/base-factory")

_service = BaseFactoryService()


def get_service() -> BaseFactoryService:
    return _service


@base_factory_router.post(
    "/create",
    response_model=BaseResponse[str],
    summary="创建工厂基础信息（返回工厂ID）",
)
async def create_factory(
    dto: BaseFactoryCreateDto,
    db: AsyncSession = Depends(get_db),
    service: BaseFactoryService = Depends(get_service),
):
    if not dto.factory_name:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="factoryName 不能为空")
    factory_id = await service.create_factory(dto, db)
    return ResultUtils.ok(data=factory_id, message="创建成功")


@base_factory_router.put(
    "/update",
    response_model=BaseResponse[str],
    summary="更新工厂基础信息（返回工厂ID）",
)
async def update_factory(
    dto: BaseFactoryUpdateDto,
    db: AsyncSession = Depends(get_db),
    service: BaseFactoryService = Depends(get_service),
):
    if not dto.factory_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="工厂ID不合法")
    factory_id = await service.update_factory(dto.factory_id, dto, db)
    return ResultUtils.ok(data=factory_id, message="更新成功")


@base_factory_router.delete(
    "/delete",
    response_model=BaseResponse[str],
    summary="删除工厂基础信息（返回工厂ID）",
)
async def delete_factory(
    dto: BaseFactoryDeleteDto,
    db: AsyncSession = Depends(get_db),
    service: BaseFactoryService = Depends(get_service),
):
    if not dto.factory_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="工厂ID不合法")
    factory_id = await service.delete_factory(dto.factory_id, db)
    return ResultUtils.ok(data=factory_id, message="删除成功")


@base_factory_router.get(
    "/{factory_id}",
    response_model=BaseResponse[BaseFactoryVo],
    summary="根据ID查询工厂基础信息",
)
async def get_factory_by_id(
    factory_id: SnowflakeIdIn,
    db: AsyncSession = Depends(get_db),
    service: BaseFactoryService = Depends(get_service),
):
    if not factory_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="工厂ID不合法")
    result = await service.get_factory_by_id(factory_id, db)
    return ResultUtils.ok(data=result, message="查询成功")


@base_factory_router.post(
    "/query",
    response_model=BaseResponse[Page[BaseFactoryVo]],
    summary="查询工厂基础信息列表（不传字段=全量，支持分页）",
)
async def query_factories(
    query: BaseFactoryQueryDto,
    db: AsyncSession = Depends(get_db),
    service: BaseFactoryService = Depends(get_service),
):
    result = await service.query_factories(query, db)
    return ResultUtils.ok(data=result, message="查询成功")
