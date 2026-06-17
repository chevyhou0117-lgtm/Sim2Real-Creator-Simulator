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
from models.dto.BaseWarehouseDto import BaseWarehouseCreateDto, BaseWarehouseUpdateDto, BaseWarehouseDeleteDto, BaseWarehouseQueryDto
from models.vo.BaseWarehouseVo import BaseWarehouseVo
from result.ResultUtils import ResultUtils
from service.BaseWarehouseService import BaseWarehouseService

init_logging()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/base/warehouse")
_service = BaseWarehouseService()

@router.post("/create", response_model=BaseResponse[str], summary="创建仓库")
async def create(dto: BaseWarehouseCreateDto, db: AsyncSession = Depends(get_db), service: BaseWarehouseService = Depends(lambda: _service)):
    if not dto.factory_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="factoryId 不合法")
    return ResultUtils.ok(data=await service.create(dto, db), message="创建成功")

@router.put("/update", response_model=BaseResponse[str], summary="更新仓库")
async def update(dto: BaseWarehouseUpdateDto, db: AsyncSession = Depends(get_db), service: BaseWarehouseService = Depends(lambda: _service)):
    if not dto.warehouse_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.update(dto.warehouse_id, dto, db), message="更新成功")

@router.delete("/delete", response_model=BaseResponse[str], summary="删除仓库")
async def delete(dto: BaseWarehouseDeleteDto, db: AsyncSession = Depends(get_db), service: BaseWarehouseService = Depends(lambda: _service)):
    if not dto.warehouse_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.delete(dto.warehouse_id, db), message="删除成功")

@router.get("/{warehouse_id}", response_model=BaseResponse[BaseWarehouseVo], summary="根据ID查询仓库")
async def get_by_id(warehouse_id: SnowflakeIdIn, db: AsyncSession = Depends(get_db), service: BaseWarehouseService = Depends(lambda: _service)):
    if not warehouse_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.get_by_id(warehouse_id, db), message="查询成功")

@router.post("/query", response_model=BaseResponse[Page[BaseWarehouseVo]], summary="查询仓库列表")
async def query(query: BaseWarehouseQueryDto, db: AsyncSession = Depends(get_db), service: BaseWarehouseService = Depends(lambda: _service)):
    return ResultUtils.ok(data=await service.query(query, db), message="查询成功")
