import logging
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from common.BaseResponse import BaseResponse
from commonutils.Logs import init_logging
from config.PgSqlConfig import get_db
from models.dto.AssetTypeDictDto import (
    AssetTypeDictCreateDto,
    AssetTypeDictUpdateDto,
    AssetTypeDictDeleteDto,
)
from models.vo.AssetTypeDictVo import AssetTypeDictVo
from result.ResultUtils import ResultUtils
from service.AssetTypeDictService import AssetTypeDictService

init_logging()
logger = logging.getLogger(__name__)

asset_type_dict_router = APIRouter(prefix="/asset-type-dict")

_service = AssetTypeDictService()


def get_service() -> AssetTypeDictService:
    return _service


@asset_type_dict_router.post(
    "/create",
    response_model=BaseResponse[AssetTypeDictVo],
    summary="创建资产类型字典条目",
    description=(
        "新增一条资产类型字典记录：\n"
        "- `code`：类型编码（主键，全局唯一），如: `process`\n"
        "- `name`：类型名称，如: `工序`\n"
        "- `code` 重复时返回错误"
    ),
)
async def create_type_dict(
        dto: AssetTypeDictCreateDto,
        db: AsyncSession = Depends(get_db),
        service: AssetTypeDictService = Depends(get_service),
):
    result = await service.create_type_dict(dto, db)
    return ResultUtils.ok(data=result, message="创建成功")


@asset_type_dict_router.get(
    "/list",
    response_model=BaseResponse[List[AssetTypeDictVo]],
    summary="查询全部资产类型字典",
    description="返回 `asset_type_dict` 表中所有条目，按 `code` 升序排列。",
)
async def list_type_dicts(
        db: AsyncSession = Depends(get_db),
        service: AssetTypeDictService = Depends(get_service),
):
    result = await service.list_type_dicts(db)
    return ResultUtils.ok(data=result, message="查询成功")


@asset_type_dict_router.get(
    "/{code}",
    response_model=BaseResponse[AssetTypeDictVo],
    summary="根据 code 查询资产类型字典条目",
    description="传入类型编码 `code`，返回对应的字典条目，不存在则返回错误。",
)
async def get_type_dict_by_code(
        code: str,
        db: AsyncSession = Depends(get_db),
        service: AssetTypeDictService = Depends(get_service),
):
    result = await service.get_type_dict_by_code(code, db)
    return ResultUtils.ok(data=result, message="查询成功")


@asset_type_dict_router.put(
    "/update",
    response_model=BaseResponse[AssetTypeDictVo],
    summary="更新资产类型字典条目名称",
    description=(
        "根据 `code` 更新对应字典条目的 `name` 字段：\n"
        "- `code` 为必填，用于定位记录（主键不可修改）\n"
        "- `name` 为必填，更新为新的类型名称"
    ),
)
async def update_type_dict(
        dto: AssetTypeDictUpdateDto,
        db: AsyncSession = Depends(get_db),
        service: AssetTypeDictService = Depends(get_service),
):
    result = await service.update_type_dict(dto, db)
    return ResultUtils.ok(data=result, message="更新成功")


@asset_type_dict_router.delete(
    "/delete",
    response_model=BaseResponse[str],
    summary="删除资产类型字典条目",
    description=(
        "根据 `code` 删除对应的字典条目：\n"
        "- 若 `asset_categories` 表中存在使用该 `code` 的记录（外键约束），删除将失败\n"
        "- 删除成功后返回被删除的 `code` 值"
    ),
)
async def delete_type_dict(
        dto: AssetTypeDictDeleteDto,
        db: AsyncSession = Depends(get_db),
        service: AssetTypeDictService = Depends(get_service),
):
    result = await service.delete_type_dict(dto.code, db)
    return ResultUtils.ok(data=result, message="删除成功")
