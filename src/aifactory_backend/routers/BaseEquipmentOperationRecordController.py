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
from models.dto.BaseEquipmentOperationRecordDto import (
    BaseEquipmentOperationRecordCreateDto,
    BaseEquipmentOperationRecordUpdateDto,
    BaseEquipmentOperationRecordDeleteDto,
    BaseEquipmentOperationRecordQueryDto,
)
from models.vo.BaseEquipmentOperationRecordVo import BaseEquipmentOperationRecordVo
from result.ResultUtils import ResultUtils
from service.BaseEquipmentOperationRecordService import BaseEquipmentOperationRecordService

init_logging()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/base/equipment-operation-record")
_service = BaseEquipmentOperationRecordService()


@router.post("/create", response_model=BaseResponse[str], summary="创建设备运行记录")
async def create(dto: BaseEquipmentOperationRecordCreateDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentOperationRecordService = Depends(lambda: _service)):
    if not dto.equipment_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="equipmentId 不合法")
    return ResultUtils.ok(data=await service.create(dto, db), message="创建成功")


@router.put("/update", response_model=BaseResponse[str], summary="更新设备运行记录")
async def update(dto: BaseEquipmentOperationRecordUpdateDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentOperationRecordService = Depends(lambda: _service)):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.update(dto.id, dto, db), message="更新成功")


@router.delete("/delete", response_model=BaseResponse[str], summary="删除设备运行记录")
async def delete(dto: BaseEquipmentOperationRecordDeleteDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentOperationRecordService = Depends(lambda: _service)):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.delete(dto.id, db), message="删除成功")


@router.get("/{record_id}", response_model=BaseResponse[BaseEquipmentOperationRecordVo], summary="根据ID查询设备运行记录")
async def get_by_id(record_id: SnowflakeIdIn, db: AsyncSession = Depends(get_db), service: BaseEquipmentOperationRecordService = Depends(lambda: _service)):
    if not record_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.get_by_id(record_id, db), message="查询成功")


@router.post("/query", response_model=BaseResponse[Page[BaseEquipmentOperationRecordVo]], summary="查询设备运行记录列表（支持分页）")
async def query(query: BaseEquipmentOperationRecordQueryDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentOperationRecordService = Depends(lambda: _service)):
    return ResultUtils.ok(data=await service.query(query, db), message="查询成功")
