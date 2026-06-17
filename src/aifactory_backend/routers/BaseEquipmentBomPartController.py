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
from models.dto.BaseEquipmentBomPartDto import (
    BaseEquipmentBomPartCreateDto,
    BaseEquipmentBomPartUpdateDto,
    BaseEquipmentBomPartDeleteDto,
    BaseEquipmentBomPartQueryDto,
)
from models.vo.BaseEquipmentBomPartVo import BaseEquipmentBomPartVo
from result.ResultUtils import ResultUtils
from service.BaseEquipmentBomPartService import BaseEquipmentBomPartService

init_logging()
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/base/equipment-bom-part")
_service = BaseEquipmentBomPartService()


@router.post("/create", response_model=BaseResponse[str], summary="创建BOM备件")
async def create(dto: BaseEquipmentBomPartCreateDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentBomPartService = Depends(lambda: _service)):
    if not dto.equipment_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="equipmentId 不合法")
    if not dto.part_code or not dto.part_code.strip():
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="partCode 不能为空")
    if not dto.part_name or not dto.part_name.strip():
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="partName 不能为空")
    if not dto.unit or not dto.unit.strip():
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="unit 不能为空")
    return ResultUtils.ok(data=await service.create(dto, db), message="创建成功")


@router.put("/update", response_model=BaseResponse[str], summary="更新BOM备件")
async def update(dto: BaseEquipmentBomPartUpdateDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentBomPartService = Depends(lambda: _service)):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    update_fields = dto.model_dump(exclude_unset=True)
    update_fields.pop("id", None)
    if not update_fields:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="更新内容不能全为空，请至少传入一个可更新字段")
    return ResultUtils.ok(data=await service.update(dto.id, dto, db), message="更新成功")


@router.delete("/delete", response_model=BaseResponse[str], summary="删除BOM备件")
async def delete(dto: BaseEquipmentBomPartDeleteDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentBomPartService = Depends(lambda: _service)):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.delete(dto.id, db), message="删除成功")


@router.get("/{record_id}", response_model=BaseResponse[BaseEquipmentBomPartVo], summary="根据ID查询BOM备件")
async def get_by_id(record_id: SnowflakeIdIn, db: AsyncSession = Depends(get_db), service: BaseEquipmentBomPartService = Depends(lambda: _service)):
    if not record_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="ID不合法")
    return ResultUtils.ok(data=await service.get_by_id(record_id, db), message="查询成功")


@router.post("/query", response_model=BaseResponse[Page[BaseEquipmentBomPartVo]], summary="查询BOM备件列表（支持分页）")
async def query(query: BaseEquipmentBomPartQueryDto, db: AsyncSession = Depends(get_db), service: BaseEquipmentBomPartService = Depends(lambda: _service)):
    return ResultUtils.ok(data=await service.query(query, db), message="查询成功")
