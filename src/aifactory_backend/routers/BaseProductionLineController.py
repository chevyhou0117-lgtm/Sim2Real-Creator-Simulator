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
from models.dto.BaseProductionLineDto import BaseProductionLineCreateDto, BaseProductionLineUpdateDto, BaseProductionLineDeleteDto, BaseProductionLineQueryDto, BaseProductionLineBatchCreateDto
from models.vo.BaseProductionLineVo import BaseProductionLineVo
from result.ResultUtils import ResultUtils
from service.BaseProductionLineService import BaseProductionLineService

init_logging()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/base/production-line")
_service = BaseProductionLineService()

@router.post("/create", response_model=BaseResponse[str], summary="创建线体")
async def create(dto: BaseProductionLineCreateDto, db: AsyncSession = Depends(get_db), service: BaseProductionLineService = Depends(lambda: _service)):
    if not dto.stage_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="stageId 不合法")
    return ResultUtils.ok(data=await service.create(dto, db), message="创建成功")

@router.post("/batch-create", response_model=BaseResponse[List[str]], summary="批量创建线体")
async def batch_create(dto: BaseProductionLineBatchCreateDto, db: AsyncSession = Depends(get_db), service: BaseProductionLineService = Depends(lambda: _service)):
    return ResultUtils.ok(data=await service.batch_create(dto, db), message="批量创建成功")

@router.put("/update", response_model=BaseResponse[str], summary="更新线体")
async def update(dto: BaseProductionLineUpdateDto, db: AsyncSession = Depends(get_db), service: BaseProductionLineService = Depends(lambda: _service)):
    if not dto.line_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.update(dto.line_id, dto, db), message="更新成功")

@router.delete("/delete", response_model=BaseResponse[str], summary="删除线体")
async def delete(dto: BaseProductionLineDeleteDto, db: AsyncSession = Depends(get_db), service: BaseProductionLineService = Depends(lambda: _service)):
    if not dto.line_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.delete(dto.line_id, db), message="删除成功")

@router.get("/{line_id}", response_model=BaseResponse[BaseProductionLineVo], summary="根据ID查询线体")
async def get_by_id(line_id: SnowflakeIdIn, db: AsyncSession = Depends(get_db), service: BaseProductionLineService = Depends(lambda: _service)):
    if not line_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.get_by_id(line_id, db), message="查询成功")

@router.post("/query", response_model=BaseResponse[Page[BaseProductionLineVo]], summary="查询线体列表")
async def query(query: BaseProductionLineQueryDto, db: AsyncSession = Depends(get_db), service: BaseProductionLineService = Depends(lambda: _service)):
    return ResultUtils.ok(data=await service.query(query, db), message="查询成功")
