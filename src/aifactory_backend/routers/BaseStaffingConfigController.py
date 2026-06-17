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
from models.dto.BaseStaffingConfigDto import BaseStaffingConfigCreateDto, BaseStaffingConfigUpdateDto, BaseStaffingConfigDeleteDto, BaseStaffingConfigQueryDto
from models.vo.BaseStaffingConfigVo import BaseStaffingConfigVo
from result.ResultUtils import ResultUtils
from service.BaseStaffingConfigService import BaseStaffingConfigService

init_logging()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/base/staffing-config")
_service = BaseStaffingConfigService()

@router.post("/create", response_model=BaseResponse[str], summary="创建人员配置")
async def create(dto: BaseStaffingConfigCreateDto, db: AsyncSession = Depends(get_db), service: BaseStaffingConfigService = Depends(lambda: _service)):
    if not dto.factory_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="factoryId 不合法")
    if not dto.operation_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="operationId 不合法")
    if not dto.worker_type_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="workerTypeId 不合法")
    return ResultUtils.ok(data=await service.create(dto, db), message="创建成功")

@router.put("/update", response_model=BaseResponse[str], summary="更新人员配置")
async def update(dto: BaseStaffingConfigUpdateDto, db: AsyncSession = Depends(get_db), service: BaseStaffingConfigService = Depends(lambda: _service)):
    if not dto.staffing_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.update(dto.staffing_id, dto, db), message="更新成功")

@router.delete("/delete", response_model=BaseResponse[str], summary="删除人员配置")
async def delete(dto: BaseStaffingConfigDeleteDto, db: AsyncSession = Depends(get_db), service: BaseStaffingConfigService = Depends(lambda: _service)):
    if not dto.staffing_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.delete(dto.staffing_id, db), message="删除成功")

@router.get("/{staffing_id}", response_model=BaseResponse[BaseStaffingConfigVo], summary="根据ID查询人员配置")
async def get_by_id(staffing_id: SnowflakeIdIn, db: AsyncSession = Depends(get_db), service: BaseStaffingConfigService = Depends(lambda: _service)):
    if not staffing_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.get_by_id(staffing_id, db), message="查询成功")

@router.post("/query", response_model=BaseResponse[Page[BaseStaffingConfigVo]], summary="查询人员配置列表")
async def query(query: BaseStaffingConfigQueryDto, db: AsyncSession = Depends(get_db), service: BaseStaffingConfigService = Depends(lambda: _service)):
    return ResultUtils.ok(data=await service.query(query, db), message="查询成功")
