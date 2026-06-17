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
from models.dto.EquipmentModelDetailDto import (
    EquipmentModelDetailCreateDto,
    EquipmentModelDetailUpdateDto,
    EquipmentModelDetailDeleteDto,
    EquipmentModelDetailQueryDto,
)
from models.vo.EquipmentModelDetailVo import EquipmentModelDetailVo
from result.ResultUtils import ResultUtils
from service.EquipmentModelDetailService import EquipmentModelDetailService

init_logging()
logger = logging.getLogger(__name__)

equipment_model_detail_router = APIRouter(prefix="/equipment-model-detail")

_service = EquipmentModelDetailService()


def get_service() -> EquipmentModelDetailService:
    return _service

#
# @equipment_model_detail_router.post(
#     "/create",
#     response_model=BaseResponse[EquipmentModelDetailVo],
#     summary="创建设备模型详情",
#     description=(
#         "创建一条设备模型详情记录：\n"
#         "- `categoryId` 必填，关联 `asset_categories` 表中 type 为 `equipment_model` 的分类\n"
#         "- `rootUsdPath` / `locationPath` 为必填路径字段\n"
#         "- `specifications` 为可选 JSONB 规格参数"
#     ),
# )
# async def create_equipment_model_detail(
#         dto: EquipmentModelDetailCreateDto,
#         db: AsyncSession = Depends(get_db),
#         service: EquipmentModelDetailService = Depends(get_service),
# ):
#     result = await service.create_equipment_model_detail(dto, db)
#     return ResultUtils.ok(data=result, message="设备模型详情创建成功")


@equipment_model_detail_router.get(
    "/{detail_id}",
    response_model=BaseResponse[EquipmentModelDetailVo],
    summary="根据 ID 查询单条设备模型详情",
    description="根据主键 ID 查询单条设备模型详情记录。",
)
async def get_equipment_model_detail_by_id(
        detail_id: SnowflakeIdIn,
        db: AsyncSession = Depends(get_db),
        service: EquipmentModelDetailService = Depends(get_service),
):
    if detail_id is None:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="详情ID不能为空")
    result = await service.get_equipment_model_detail_by_id(detail_id, db)
    return ResultUtils.ok(data=result, message="查询成功")


# @equipment_model_detail_router.post(
#     "/query",
#     response_model=BaseResponse[Page[EquipmentModelDetailVo]],
#     summary="查询设备模型详情列表（支持全量/分页过滤）",
#     description=(
#         "查询设备模型详情列表，支持两种模式：\n"
#         "- **全量查询**：请求体为空 `{}` 时，返回所有记录（`totalPages=1`）\n"
#         "- **过滤分页**：传入任意参数时，按条件分页返回\n"
#         "  - `categoryId`：按资产分类 ID 过滤\n"
#         "  - `manufacturer`：制造商模糊搜索\n"
#         "  - `assetType`：资产类型模糊搜索\n"
#         "  - `brand`：品牌模糊搜索\n"
#         "  - `current` / `pageSize`：分页控制"
#     ),
# )
# async def query_equipment_model_details(
#         query: EquipmentModelDetailQueryDto,
#         db: AsyncSession = Depends(get_db),
#         service: EquipmentModelDetailService = Depends(get_service),
# ):
#     result = await service.list_equipment_model_details(query, db)
#     return ResultUtils.ok(data=result, message="查询成功")


@equipment_model_detail_router.put(
    "/update",
    response_model=BaseResponse[EquipmentModelDetailVo],
    summary="更新某设备模型的详情信息",
    description="部分更新设备模型详情，仅更新请求体中非空的字段。主键 `id` 必填。category_id 是父id。",
)
async def update_equipment_model_detail(
        dto: EquipmentModelDetailUpdateDto,
        db: AsyncSession = Depends(get_db),
        service: EquipmentModelDetailService = Depends(get_service),
):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="详情ID不合法")
    result = await service.update_equipment_model_detail(dto.id, dto, db)
    return ResultUtils.ok(data=result, message="更新成功")


# @equipment_model_detail_router.delete(
#     "/delete",
#     response_model=BaseResponse[int],
#     summary="删除设备模型详情，返回删除 ID",
#     description="删除指定设备模型详情记录，返回被删除的主键 ID。",
# )
# async def delete_equipment_model_detail(
#         dto: EquipmentModelDetailDeleteDto,
#         db: AsyncSession = Depends(get_db),
#         service: EquipmentModelDetailService = Depends(get_service),
# ):
#     if not dto.id:
#         raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="详情ID不合法")
#     result = await service.delete_equipment_model_detail(dto.id, db)
#     return ResultUtils.ok(data=result, message="删除成功")
#
