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
from models.dto.BaseWipBufferDto import BaseWipBufferCreateDto, BaseWipBufferUpdateDto, BaseWipBufferDeleteDto, BaseWipBufferQueryDto
from models.vo.BaseWipBufferVo import BaseWipBufferVo
from result.ResultUtils import ResultUtils
from service.BaseWipBufferService import BaseWipBufferService

init_logging()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/base/wip-buffer")
_service = BaseWipBufferService()

@router.post("/create", response_model=BaseResponse[str], summary="创建线边仓")
async def create(dto: BaseWipBufferCreateDto, db: AsyncSession = Depends(get_db), service: BaseWipBufferService = Depends(lambda: _service)):
    if not dto.line_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="lineId 不合法")
    return ResultUtils.ok(data=await service.create(dto, db), message="创建成功")

@router.put("/update", response_model=BaseResponse[str], summary="更新线边仓")
async def update(dto: BaseWipBufferUpdateDto, db: AsyncSession = Depends(get_db), service: BaseWipBufferService = Depends(lambda: _service)):
    if not dto.wip_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.update(dto.wip_id, dto, db), message="更新成功")

@router.delete("/delete", response_model=BaseResponse[str], summary="删除线边仓")
async def delete(dto: BaseWipBufferDeleteDto, db: AsyncSession = Depends(get_db), service: BaseWipBufferService = Depends(lambda: _service)):
    if not dto.wip_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.delete(dto.wip_id, db), message="删除成功")

@router.get("/{wip_id}", response_model=BaseResponse[BaseWipBufferVo], summary="根据ID查询线边仓")
async def get_by_id(wip_id: SnowflakeIdIn, db: AsyncSession = Depends(get_db), service: BaseWipBufferService = Depends(lambda: _service)):
    if not wip_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.get_by_id(wip_id, db), message="查询成功")

@router.post("/query", response_model=BaseResponse[Page[BaseWipBufferVo]], summary="查询线边仓列表")
async def query(query: BaseWipBufferQueryDto, db: AsyncSession = Depends(get_db), service: BaseWipBufferService = Depends(lambda: _service)):
    return ResultUtils.ok(data=await service.query(query, db), message="查询成功")
