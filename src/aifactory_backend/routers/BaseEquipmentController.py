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
from models.dto.BaseEquipmentDto import BaseEquipmentCreateDto, BaseEquipmentUpdateDto, BaseEquipmentDeleteDto, BaseEquipmentQueryDto, BaseEquipmentBatchCreateDto, QueryEquipmentByLineIdDto
from models.vo.BaseEquipmentVo import BaseEquipmentVo
from result.ResultUtils import ResultUtils
from service.BaseEquipmentService import BaseEquipmentService

init_logging()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/base/equipment")
_service = BaseEquipmentService()

@router.post("/create", response_model=BaseResponse[str], summary="创建设备")
async def create(dto: BaseEquipmentCreateDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentService = Depends(lambda: _service)):
    if not dto.operation_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="operationId 不合法")
    return ResultUtils.ok(data=await service.create(dto, db), message="创建成功")

@router.post("/batch-create", response_model=BaseResponse[List[str]], summary="批量创建设备")
async def batch_create(dto: BaseEquipmentBatchCreateDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentService = Depends(lambda: _service)):
    return ResultUtils.ok(data=await service.batch_create(dto, db), message="批量创建成功")

@router.put("/update", response_model=BaseResponse[str], summary="更新设备")
async def update(dto: BaseEquipmentUpdateDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentService = Depends(lambda: _service)):
    if not dto.equipment_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.update(dto.equipment_id, dto, db), message="更新成功")

@router.delete("/delete", response_model=BaseResponse[str], summary="删除设备")
async def delete(dto: BaseEquipmentDeleteDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentService = Depends(lambda: _service)):
    if not dto.equipment_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.delete(dto.equipment_id, db), message="删除成功")

@router.get("/{equipment_id}", response_model=BaseResponse[BaseEquipmentVo], summary="根据ID查询设备")
async def get_by_id(equipment_id: SnowflakeIdIn, db: AsyncSession = Depends(get_db), service: BaseEquipmentService = Depends(lambda: _service)):
    if not equipment_id: raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.get_by_id(equipment_id, db), message="查询成功")

@router.post("/query", response_model=BaseResponse[Page[BaseEquipmentVo]], summary="查询设备列表")
async def query(query: BaseEquipmentQueryDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentService = Depends(lambda: _service)):
    return ResultUtils.ok(data=await service.query(query, db), message="查询成功")


@router.post(
    "/query-by-line",
    response_model=BaseResponse[List[BaseEquipmentVo]],
    summary="根据父节点查询对应线体下的所有设备",
    description=(
        "根据工厂资产节点的 parentId 查询对应线体下挂载的所有设备。\n\n"
        "链路：parentId → factory_line_details.ref_id (= md_production_line.line_id) → md_equipment。\n"
        "ref_id 为空（未绑定线体）时返回 \"请先绑定对应的线体，再绑定设备\"；keyword 可选模糊过滤。"
    ),
)
async def query_by_line_id(dto: QueryEquipmentByLineIdDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentService = Depends(lambda: _service)):
    return ResultUtils.ok(data=await service.query_by_line_id(dto, db), message="查询成功")
