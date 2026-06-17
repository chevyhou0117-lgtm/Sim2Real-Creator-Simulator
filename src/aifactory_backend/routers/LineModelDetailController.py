import logging
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from common.BaseResponse import BaseResponse
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from commonutils.SnowflakeUtils import SnowflakeIdIn
from config.PgSqlConfig import get_db
from exception.ExceptionClass import BusinessException
from models.dto.LineModelDetailDto import (
    LineModelDetailCreateDto,
    LineModelDetailUpdateDto,
    LineModelDetailDeleteDto,
    LineModelDetailQueryDto,
    LineAndEquipmentRelDto,
)
from models.vo.LineModelDetailVo import LineModelDetailVo, LineAndEquipmentModelDetailVo
from result.ResultUtils import ResultUtils
from service.LineModelDetailService import LineModelDetailService

init_logging()
logger = logging.getLogger(__name__)

line_model_detail_router = APIRouter(prefix="/line-model-detail")

_service = LineModelDetailService()


def get_service() -> LineModelDetailService:
    return _service


# @line_model_detail_router.post(
#     "/create",
#     response_model=BaseResponse[LineModelDetailVo],
#     summary="创建线体模型详情",
#     description=(
#         "创建一条线体模型详情记录：\n"
#         "- `categoryId` 必填，关联 `asset_categories` 表中 type 为 `line_model` 的分类\n"
#         "- `rootUsdPath` / `locationPath` 为必填路径字段"
#     ),
# )
# async def create_line_model_detail(
#         dto: LineModelDetailCreateDto,
#         db: AsyncSession = Depends(get_db),
#         service: LineModelDetailService = Depends(get_service),
# ):
#     result = await service.create_line_model_detail(dto, db)
#     return ResultUtils.ok(data=result, message="线体模型详情创建成功")
#

@line_model_detail_router.get(
    "/{detail_id}",
    response_model=BaseResponse[LineModelDetailVo],
    summary="根据 ID 查询单条线体模型详情",
    description="根据主键 ID 查询单条线体模型详情记录。",
)
async def get_line_model_detail_by_id(
        detail_id: SnowflakeIdIn,
        db: AsyncSession = Depends(get_db),
        service: LineModelDetailService = Depends(get_service),
):
    if detail_id is None:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="详情ID不能为空")
    result = await service.get_line_model_detail_by_id(detail_id, db)
    return ResultUtils.ok(data=result, message="查询成功")

#
# @line_model_detail_router.post(
#     "/query",
#     response_model=BaseResponse[Page[LineModelDetailVo]],
#     summary="查询线体模型详情列表（支持全量/分页过滤）",
#     description=(
#         "查询线体模型详情列表，支持两种模式：\n"
#         "- **全量查询**：请求体为空 `{}` 时，返回所有记录（`totalPages=1`）\n"
#         "- **过滤分页**：传入任意参数时，按条件分页返回\n"
#         "  - `categoryId`：按资产分类 ID 过滤\n"
#         "  - `current` / `pageSize`：分页控制"
#     ),
# )

# async def query_line_model_details(
#         query: LineModelDetailQueryDto,
#         db: AsyncSession = Depends(get_db),
#         service: LineModelDetailService = Depends(get_service),
# ):
#     result = await service.list_line_model_details(query, db)
#     return ResultUtils.ok(data=result, message="查询成功")


@line_model_detail_router.put(
    "/update",
    response_model=BaseResponse[LineModelDetailVo],
    summary="更新某线体模型详情信息",
    description="部分更新线体模型详情，仅更新请求体中非空的字段。主键 `id` 必填。category_id 是父id",
)
async def update_line_model_detail(
        dto: LineModelDetailUpdateDto,
        db: AsyncSession = Depends(get_db),
        service: LineModelDetailService = Depends(get_service),
):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="详情ID不合法")
    result = await service.update_line_model_detail(dto.id, dto, db)
    return ResultUtils.ok(data=result, message="更新成功")


@line_model_detail_router.post(
    "/equipment-rel",
    response_model=BaseResponse[List[LineAndEquipmentModelDetailVo]],
    summary="根据线体ID查询其挂载的所有设备",
    description=(
        "传入线体模型详情主键 ID，查询 `line_model_equipment_rel` 获取该线体下挂载的所有设备：\n"
        "- 校验线体是否存在 → 查关联表 → 反查设备详情 → 补充资产分类 name/type\n"
        "- 返回设备列表（含 instanceName / rootUsdPath / locationPath / thumbnailPath 等）"
    ),
)
async def get_equipment_by_line_id(
        dto: LineAndEquipmentRelDto,
        db: AsyncSession = Depends(get_db),
        service: LineModelDetailService = Depends(get_service),
):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="线体详情ID不合法")
    result = await service.get_equipment_by_line_id(dto.id, db)
    return ResultUtils.ok(data=result, message="查询成功")


# @line_model_detail_router.delete(
#     "/delete",
#     response_model=BaseResponse[int],
#     summary="删除线体模型详情，返回删除 ID",
#     description="删除指定线体模型详情记录，返回被删除的主键 ID。",
# )
# async def delete_line_model_detail(
#         dto: LineModelDetailDeleteDto,
#         db: AsyncSession = Depends(get_db),
#         service: LineModelDetailService = Depends(get_service),
# ):
#     if not dto.id:
#         raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="详情ID不合法")
#     result = await service.delete_line_model_detail(dto.id, db)
#     return ResultUtils.ok(data=result, message="删除成功")
