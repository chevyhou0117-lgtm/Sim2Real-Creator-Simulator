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
from models.dto.BaseEquipmentProcessParamDto import (
    BaseEquipmentProcessParamCreateDto,
    BaseEquipmentProcessParamUpdateDto,
    BaseEquipmentProcessParamDeleteDto,
    BaseEquipmentProcessParamQueryDto,
)
from models.vo.BaseEquipmentProcessParamVo import BaseEquipmentProcessParamVo
from result.ResultUtils import ResultUtils
from service.BaseEquipmentProcessParamService import BaseEquipmentProcessParamService

init_logging()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/base/equipment-process-param")
_service = BaseEquipmentProcessParamService()


@router.post("/create", response_model=BaseResponse[str], summary="创建设备过程参数（1:1）")
async def create(dto: BaseEquipmentProcessParamCreateDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentProcessParamService = Depends(lambda: _service)):
    if not dto.equipment_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="equipmentId 不合法")
    return ResultUtils.ok(data=await service.create(dto, db), message="创建成功")


@router.put("/update", response_model=BaseResponse[str], summary="更新设备过程参数")
async def update(dto: BaseEquipmentProcessParamUpdateDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentProcessParamService = Depends(lambda: _service)):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.update(dto.id, dto, db), message="更新成功")


@router.delete("/delete", response_model=BaseResponse[str], summary="删除设备过程参数")
async def delete(dto: BaseEquipmentProcessParamDeleteDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentProcessParamService = Depends(lambda: _service)):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.delete(dto.id, db), message="删除成功")


@router.get("/{record_id}", response_model=BaseResponse[BaseEquipmentProcessParamVo], summary="根据ID查询设备过程参数")
async def get_by_id(record_id: SnowflakeIdIn, db: AsyncSession = Depends(get_db), service: BaseEquipmentProcessParamService = Depends(lambda: _service)):
    if not record_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.get_by_id(record_id, db), message="查询成功")


@router.post("/query", response_model=BaseResponse[Page[BaseEquipmentProcessParamVo]], summary="查询设备过程参数列表（支持分页）")
async def query(query: BaseEquipmentProcessParamQueryDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentProcessParamService = Depends(lambda: _service)):
    return ResultUtils.ok(data=await service.query(query, db), message="查询成功")
