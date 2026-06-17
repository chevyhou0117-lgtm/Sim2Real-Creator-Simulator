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
from models.dto.BaseEquipmentSopDto import (
    BaseEquipmentSopCreateDto,
    BaseEquipmentSopUpdateDto,
    BaseEquipmentSopDeleteDto,
    BaseEquipmentSopQueryDto,
)
from models.vo.BaseEquipmentSopVo import BaseEquipmentSopVo
from result.ResultUtils import ResultUtils
from service.BaseEquipmentSopService import BaseEquipmentSopService

init_logging()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/base/equipment-sop")
_service = BaseEquipmentSopService()


@router.post("/create", response_model=BaseResponse[str], summary="创建SOP作业指导")
async def create(dto: BaseEquipmentSopCreateDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentSopService = Depends(lambda: _service)):
    if not dto.equipment_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="equipmentId 不合法")
    return ResultUtils.ok(data=await service.create(dto, db), message="创建成功")


@router.put("/update", response_model=BaseResponse[str], summary="更新SOP作业指导")
async def update(dto: BaseEquipmentSopUpdateDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentSopService = Depends(lambda: _service)):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.update(dto.id, dto, db), message="更新成功")


@router.delete("/delete", response_model=BaseResponse[str], summary="删除SOP作业指导")
async def delete(dto: BaseEquipmentSopDeleteDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentSopService = Depends(lambda: _service)):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.delete(dto.id, db), message="删除成功")


@router.get("/{record_id}", response_model=BaseResponse[BaseEquipmentSopVo], summary="根据ID查询SOP作业指导")
async def get_by_id(record_id: SnowflakeIdIn, db: AsyncSession = Depends(get_db), service: BaseEquipmentSopService = Depends(lambda: _service)):
    if not record_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.get_by_id(record_id, db), message="查询成功")


@router.post("/query", response_model=BaseResponse[Page[BaseEquipmentSopVo]], summary="查询SOP作业指导列表（支持分页）")
async def query(query: BaseEquipmentSopQueryDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentSopService = Depends(lambda: _service)):
    return ResultUtils.ok(data=await service.query(query, db), message="查询成功")
