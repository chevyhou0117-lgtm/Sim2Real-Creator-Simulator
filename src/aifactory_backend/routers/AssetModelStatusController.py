import logging
from typing import List, Any

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from common.BaseResponse import BaseResponse
from common.DeleteRequest import BatchIdsRequest
from commonutils.Logs import init_logging
from commonutils.SnowflakeUtils import SnowflakeIdIn
from config.PgSqlConfig import get_db
from models.enums.AssetModelTypeEnum import AssetModelType
from result.ResultUtils import ResultUtils
from service.EquipmentModelDetailService import EquipmentModelDetailService
from service.LineModelDetailService import LineModelDetailService

init_logging()
logger = logging.getLogger(__name__)

asset_model_status_router = APIRouter(prefix="/asset-model-status")

_line_service = LineModelDetailService()
_equipment_service = EquipmentModelDetailService()


def _get_service(asset_type: AssetModelType):
    """根据资产类型返回对应 Service 实例"""
    if asset_type == AssetModelType.LINE:
        return _line_service
    return _equipment_service


@asset_model_status_router.put(
    "/{asset_type}/enable/{detail_id}",
    response_model=BaseResponse[Any],
    summary="启用资产模型（线体 / 设备）",
    description="将资产模型状态切换为 ACTIVE。允许从 DRAFT / INACTIVE 启用；ARCHIVED 不允许。",
)
async def enable_asset_model(
        asset_type: AssetModelType,
        detail_id: SnowflakeIdIn,
        db: AsyncSession = Depends(get_db),
):
    result = await _get_service(asset_type).enable(detail_id, db)
    return ResultUtils.ok(data=result, message="启用成功")


@asset_model_status_router.put(
    "/{asset_type}/batch-enable",
    response_model=BaseResponse[List[str]],
    summary="批量启用资产模型（线体 / 设备）",
    description="批量切换为 ACTIVE，仅对 DRAFT / INACTIVE 生效，ARCHIVED 自动跳过。返回实际启用的 ID 列表。",
)
async def batch_enable_asset_model(
        asset_type: AssetModelType,
        dto: BatchIdsRequest,
        db: AsyncSession = Depends(get_db),
):
    result = await _get_service(asset_type).batch_enable(dto.ids, db)
    return ResultUtils.ok(data=result, message=f"批量启用成功，共 {len(result)} 条")


@asset_model_status_router.put(
    "/{asset_type}/disable/{detail_id}",
    response_model=BaseResponse[Any],
    summary="禁用资产模型（线体 / 设备）",
    description="将资产模型状态切换为 INACTIVE。允许从 DRAFT / ACTIVE 禁用；ARCHIVED 不允许；存在挂载/引用关系时拒绝。",
)
async def disable_asset_model(
        asset_type: AssetModelType,
        detail_id: SnowflakeIdIn,
        db: AsyncSession = Depends(get_db),
):
    result = await _get_service(asset_type).disable(detail_id, db)
    return ResultUtils.ok(data=result, message="禁用成功")


@asset_model_status_router.put(
    "/{asset_type}/batch-disable",
    response_model=BaseResponse[List[str]],
    summary="批量禁用资产模型（线体 / 设备）",
    description="批量切换为 INACTIVE，仅对 DRAFT / ACTIVE 生效，ARCHIVED 自动跳过。存在挂载/引用关系时整体拒绝。",
)
async def batch_disable_asset_model(
        asset_type: AssetModelType,
        dto: BatchIdsRequest,
        db: AsyncSession = Depends(get_db),
):
    result = await _get_service(asset_type).batch_disable(dto.ids, db)
    return ResultUtils.ok(data=result, message=f"批量禁用成功，共 {len(result)} 条")


@asset_model_status_router.put(
    "/{asset_type}/archive/{detail_id}",
    response_model=BaseResponse[Any],
    summary="归档资产模型（线体 / 设备）",
    description="将资产模型状态切换为 ARCHIVED。任意非归档状态均可归档；归档后不可修改。",
)
async def archive_asset_model(
        asset_type: AssetModelType,
        detail_id: SnowflakeIdIn,
        db: AsyncSession = Depends(get_db),
):
    result = await _get_service(asset_type).archive(detail_id, db)
    return ResultUtils.ok(data=result, message="归档成功")
