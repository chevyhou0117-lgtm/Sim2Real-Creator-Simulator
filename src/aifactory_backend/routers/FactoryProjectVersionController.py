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
from models.dto.FactoryProjectVersionDto import (
    FactoryProjectVersionCreateDto,
    FactoryProjectVersionPublishDto,
    FactoryProjectVersionArchiveDto,
    FactoryProjectVersionSwitchDto,
    FactoryProjectVersionUpdateDto,
    FactoryProjectVersionDeleteDto,
    FactoryProjectVersionQueryDto,
)
from models.vo.FactoryProjectVersionVo import FactoryProjectVersionVo
from result.ResultUtils import ResultUtils
from service.FactoryProjectVersionService import FactoryProjectVersionService

init_logging()
logger = logging.getLogger(__name__)

factory_project_version_router = APIRouter(prefix="/factory-project-version")

_service = FactoryProjectVersionService()


def get_service() -> FactoryProjectVersionService:
    return _service


@factory_project_version_router.post(
    "/create",
    response_model=BaseResponse[FactoryProjectVersionVo],
    summary="创建项目新版本",
    description=(
        "创建项目新版本：\n"
        "- `project_id` 必填\n"
        "- 不传 `base_version_id` 则基于当前版本派生\n"
        "- 传 `base_version_id` 则从指定版本派生\n"
        "- 新版本为 DRAFT 状态，自动设为当前编辑版本\n"
        "- 自动复制基线版本的资产树到新版本"
    ),
)
async def create_version(
    dto: FactoryProjectVersionCreateDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectVersionService = Depends(get_service),
):
    result = await service.create_version(dto, db)
    return ResultUtils.ok(data=result, message="版本创建成功")


@factory_project_version_router.put(
    "/publish",
    response_model=BaseResponse[FactoryProjectVersionVo],
    summary="发布版本（DRAFT → PUBLISHED）",
    description=(
        "发布指定版本：\n"
        "- 只有 DRAFT 状态的版本才能发布\n"
        "- 发布后自动创建新的 DRAFT 版本（基于发布版本），保持可编辑\n"
        "- 发布版本变为只读，旧版本仍可查看/使用"
    ),
)
async def publish_version(
    dto: FactoryProjectVersionPublishDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectVersionService = Depends(get_service),
):
    result = await service.publish_version(dto, db)
    return ResultUtils.ok(data=result, message="版本发布成功")


@factory_project_version_router.put(
    "/archive",
    response_model=BaseResponse[FactoryProjectVersionVo],
    summary="归档版本（PUBLISHED → ARCHIVED）",
    description=(
        "归档指定版本：\n"
        "- 只有 PUBLISHED 状态的版本才能归档\n"
        "- 当前编辑版本不能归档\n"
        "- 归档后版本仍可查看/使用，但不再常用"
    ),
)
async def archive_version(
    dto: FactoryProjectVersionArchiveDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectVersionService = Depends(get_service),
):
    result = await service.archive_version(dto, db)
    return ResultUtils.ok(data=result, message="版本归档成功")


@factory_project_version_router.put(
    "/switch",
    response_model=BaseResponse[FactoryProjectVersionVo],
    summary="切换当前编辑版本",
    description=(
        "切换当前编辑版本：\n"
        "- 目标版本必须为 DRAFT 状态\n"
        "- 取消原 is_current 标记，设置新的 is_current=TRUE\n"
        "- 前端加载项目时默认进入 is_current=TRUE 的版本"
    ),
)
async def switch_current_version(
    dto: FactoryProjectVersionSwitchDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectVersionService = Depends(get_service),
):
    result = await service.switch_current_version(dto, db)
    return ResultUtils.ok(data=result, message="版本切换成功")


@factory_project_version_router.put(
    "/update",
    response_model=BaseResponse[FactoryProjectVersionVo],
    summary="更新版本信息（名称/备注）",
)
async def update_version(
    dto: FactoryProjectVersionUpdateDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectVersionService = Depends(get_service),
):
    if not dto.version_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="版本ID不合法")
    result = await service.update_version(dto, db)
    return ResultUtils.ok(data=result, message="更新成功")


@factory_project_version_router.delete(
    "/delete",
    response_model=BaseResponse[str],
    summary="删除版本",
    description=(
        "删除指定版本：\n"
        "- 不允许删除当前编辑版本\n"
        "- 不允许删除项目最后一个版本\n"
        "- 关联的资产树通过 FK ON DELETE CASCADE 自动清除"
    ),
)
async def delete_version(
    dto: FactoryProjectVersionDeleteDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectVersionService = Depends(get_service),
):
    result = await service.delete_version(dto, db)
    return ResultUtils.ok(data=result, message="删除成功")


@factory_project_version_router.get(
    "/{version_id}",
    response_model=BaseResponse[FactoryProjectVersionVo],
    summary="根据ID查询版本",
)
async def get_version_by_id(
    version_id: SnowflakeIdIn,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectVersionService = Depends(get_service),
):
    result = await service.get_version_by_id(version_id, db)
    return ResultUtils.ok(data=result, message="查询成功")


@factory_project_version_router.post(
    "/query",
    response_model=BaseResponse[Page[FactoryProjectVersionVo]],
    summary="查询项目版本列表",
    description="按条件查询项目版本列表，支持按项目ID、版本状态过滤。",
)
async def query_versions(
    query: FactoryProjectVersionQueryDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectVersionService = Depends(get_service),
):
    result = await service.query_versions(query, db)
    return ResultUtils.ok(data=result, message="查询成功")
