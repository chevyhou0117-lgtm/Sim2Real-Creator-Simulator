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
from models.dto.BaseEquipmentFailureParamDto import BaseEquipmentFailureParamCreateDto, BaseEquipmentFailureParamUpdateDto, BaseEquipmentFailureParamDeleteDto, BaseEquipmentFailureParamQueryDto
from models.vo.BaseEquipmentFailureParamVo import BaseEquipmentFailureParamVo
from result.ResultUtils import ResultUtils
from service.BaseEquipmentFailureParamService import BaseEquipmentFailureParamService

init_logging()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/base/equipment-failure-param")
_service = BaseEquipmentFailureParamService()

@router.post("/create", response_model=BaseResponse[str], summary="创建故障参数")
async def create(dto: BaseEquipmentFailureParamCreateDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentFailureParamService = Depends(lambda: _service)):
    if not dto.equipment_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="equipmentId 不合法")
    return ResultUtils.ok(data=await service.create(dto, db), message="创建成功")

@router.put("/update", response_model=BaseResponse[str], summary="更新故障参数")
async def update(dto: BaseEquipmentFailureParamUpdateDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentFailureParamService = Depends(lambda: _service)):
    if not dto.param_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.update(dto.param_id, dto, db), message="更新成功")

@router.delete("/delete", response_model=BaseResponse[str], summary="删除故障参数")
async def delete(dto: BaseEquipmentFailureParamDeleteDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentFailureParamService = Depends(lambda: _service)):
    if not dto.param_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.delete(dto.param_id, db), message="删除成功")

@router.get("/{param_id}", response_model=BaseResponse[BaseEquipmentFailureParamVo], summary="根据ID查询故障参数")
async def get_by_id(param_id: SnowflakeIdIn, db: AsyncSession = Depends(get_db), service: BaseEquipmentFailureParamService = Depends(lambda: _service)):
    if not param_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.get_by_id(param_id, db), message="查询成功")

@router.post("/query", response_model=BaseResponse[Page[BaseEquipmentFailureParamVo]], summary="查询故障参数列表")
async def query(query: BaseEquipmentFailureParamQueryDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentFailureParamService = Depends(lambda: _service)):
    return ResultUtils.ok(data=await service.query(query, db), message="查询成功")
