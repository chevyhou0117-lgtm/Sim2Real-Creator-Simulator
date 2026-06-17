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
from models.dto.BaseLineOperationDto import BaseLineOperationCreateDto, BaseLineOperationUpdateDto, BaseLineOperationDeleteDto, BaseLineOperationQueryDto
from models.vo.BaseLineOperationVo import BaseLineOperationVo
from result.ResultUtils import ResultUtils
from service.BaseLineOperationService import BaseLineOperationService

init_logging()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/base/line-operation")
_service = BaseLineOperationService()

@router.post("/create", response_model=BaseResponse[str], summary="创建工序")
async def create(dto: BaseLineOperationCreateDto, db: AsyncSession = Depends(get_db), service: BaseLineOperationService = Depends(lambda: _service)):
    return ResultUtils.ok(data=await service.create(dto, db), message="创建成功")

@router.put("/update", response_model=BaseResponse[str], summary="更新工序")
async def update(dto: BaseLineOperationUpdateDto, db: AsyncSession = Depends(get_db), service: BaseLineOperationService = Depends(lambda: _service)):
    if not dto.operation_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.update(dto.operation_id, dto, db), message="更新成功")

@router.delete("/delete", response_model=BaseResponse[str], summary="删除工序")
async def delete(dto: BaseLineOperationDeleteDto, db: AsyncSession = Depends(get_db), service: BaseLineOperationService = Depends(lambda: _service)):
    if not dto.operation_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.delete(dto.operation_id, db), message="删除成功")

@router.get("/{operation_id}", response_model=BaseResponse[BaseLineOperationVo], summary="根据ID查询工序")
async def get_by_id(operation_id: SnowflakeIdIn, db: AsyncSession = Depends(get_db), service: BaseLineOperationService = Depends(lambda: _service)):
    if not operation_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.get_by_id(operation_id, db), message="查询成功")

@router.post("/query", response_model=BaseResponse[Page[BaseLineOperationVo]], summary="查询工序列表")
async def query(query: BaseLineOperationQueryDto, db: AsyncSession = Depends(get_db), service: BaseLineOperationService = Depends(lambda: _service)):
    return ResultUtils.ok(data=await service.query(query, db), message="查询成功")
