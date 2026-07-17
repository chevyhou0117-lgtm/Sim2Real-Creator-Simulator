import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from common.BaseResponse import BaseResponse
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from commonutils.SnowflakeUtils import SnowflakeIdIn
from config.PgSqlConfig import get_db
from exception.ExceptionClass import BusinessException
from models.dto.FactoryProjectDto import (
    FactoryProjectCreateDto,
    FactoryProjectUpdateDto,
    FactoryProjectDeleteDto,
    FactoryProjectQueryDto,
    FactoryProjectCopyDto,
)
from models.vo.FactoryProjectVo import FactoryProjectVo, FactoryProjectAndAssetVo, FactoryProjectDetailVo
from models.vo.ValidationReportVo import ValidationReportVo
from result.ResultUtils import ResultUtils
from service.FactoryProjectService import FactoryProjectService
from service.FactoryAssetNodeService import FactoryAssetNodeService

init_logging()
logger = logging.getLogger(__name__)

factory_project_router = APIRouter(prefix="/factory-project")

_service = FactoryProjectService()
_asset_node_service = FactoryAssetNodeService()


def get_service() -> FactoryProjectService:
    return _service


def get_asset_node_service() -> FactoryAssetNodeService:
    return _asset_node_service


@factory_project_router.post(
    "/create",
    response_model=BaseResponse[dict],
    summary="创建工厂项目（返回项目ID和版本ID）",
    description=(
        "创建工厂项目，返回 `{ project_id, version_id }`。\n\n"
        "**两种场景：**\n\n"
        "1. **传入 factory_id**（绑定已有工厂）：\n"
        "   - 自动加载该工厂已有参数\n"
        "   - 查找该工厂最新项目的当前版本，自动递增版本号\n"
        "   - 复制最新版本的资产树到新版本\n"
        "   - 可选传 `copy_from_version_id` 指定复制源版本\n\n"
        "2. **不传 factory_id，传 factory_name + factory_code**（新建工厂）：\n"
        "   - 校验工厂名称/编号唯一性（主数据范围）\n"
        "   - 创建 md_factory 主数据行，factory_id 雪花自动生成\n"
        "   - 创建项目 V1 版本（新工厂无制程，资产树只有根节点 + default_stage）\n"
        "   - 不支持 `copy_from_version_id`"
    ),
)
async def create_factory_project(
    dto: FactoryProjectCreateDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectService = Depends(get_service),
):
    if not dto.project_name:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="projectName 不能为空")
    result = await service.create_factory_project(dto, db)
    return ResultUtils.ok(data=result, message="创建成功")


@factory_project_router.put(
    "/update",
    response_model=BaseResponse[str],
    summary="更新工厂项目（返回项目ID）",
)
async def update_factory_project(
    dto: FactoryProjectUpdateDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectService = Depends(get_service),
):
    if not dto.project_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="项目ID不合法")
    project_id = await service.update_factory_project(dto.project_id, dto, db)
    return ResultUtils.ok(data=project_id, message="更新成功")


@factory_project_router.delete(
    "/delete",
    response_model=BaseResponse[str],
    summary="删除工厂项目（返回项目ID）",
)
async def delete_factory_project(
    dto: FactoryProjectDeleteDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectService = Depends(get_service),
):
    if not dto.project_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="项目ID不合法")
    project_id = await service.delete_factory_project(dto.project_id, db)
    return ResultUtils.ok(data=project_id, message="删除成功")


@factory_project_router.get(
    "/list-with-version",
    response_model=BaseResponse[list],
    summary="列出已有工厂（含最新项目/版本）供新建项目下拉选择",
)
async def list_factories_with_version(
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectService = Depends(get_service),
):
    # 注意：必须声明在 /{project_id} 之前，否则会被其捕获成 project_id="list-with-version"
    result = await service.list_factories_with_version(db)
    return ResultUtils.ok(data=result, message="查询成功")


@factory_project_router.get(
    "/{project_id}/asset-tree",
    response_model=BaseResponse[FactoryProjectAndAssetVo],
    summary="根据项目ID查询工厂项目基础信息及其完整资产树形结构",
    description=(
        "返回指定工厂项目的基础信息（同 `/{project_id}`）以及完整资产树形结构 `assetTree`：\n\n"
        "- 树根节点为 FACTORY 类型节点，层级依次为 STAGE → LINE → EQUIPMENT\n"
        "- 每个节点包含 id、name、code、type、parentId 等基础字段，`children` 嵌套返回完整子树\n"
        "- 树构建复用 `FactoryAssetNodeService.get_factory_tree`，节点详情请使用 `/factory-asset-node/{node_id}/detail`"
    ),
)
async def get_factory_project_asset_tree(
    project_id: SnowflakeIdIn,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectService = Depends(get_service),
    asset_node_service: FactoryAssetNodeService = Depends(get_asset_node_service),
):
    # 注意：必须声明在 /{project_id} 之前，否则会被其捕获成 project_id="asset-tree"
    if not project_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="项目ID不合法")
    asset_tree = await asset_node_service.get_factory_tree(project_id, db)
    result = await service.get_factory_project_with_asset_tree(project_id, asset_tree, db)
    return ResultUtils.ok(data=result, message="查询成功")


@factory_project_router.get(
    "/{project_id}",
    response_model=BaseResponse[FactoryProjectDetailVo],
    summary="根据ID查询工厂项目（含 rootUsdPath 与完整资产树 factoryAssetNodeVo）",
)
async def get_factory_project_by_id(
    project_id: SnowflakeIdIn,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectService = Depends(get_service),
):
    if not project_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="项目ID不合法")
    result = await service.get_factory_project_by_id(project_id, db)
    return ResultUtils.ok(data=result, message="查询成功")


@factory_project_router.post(
    "/validate",
    response_model=BaseResponse[ValidationReportVo],
    summary="校验工厂项目并生成校验报告",
    description=(
        "对工厂项目的完整节点树执行全量校验，生成校验报告：\n\n"
        "**校验维度：**\n"
        "1. **绑定状态**：所有 STAGE / LINE / EQUIPMENT 节点必须处于 `BOUND` 状态\n"
        "   - `UNBOUND`：节点未绑定 → 问题\n"
        "   - `BIND_FAILED`：name/code 不匹配 → 问题\n"
        "   - `PARTIALLY_BOUND`：非叶子节点下存在未完成绑定的子节点 → 问题\n"
        "2. **必填项**：绑定实体（BaseStage / BaseProductionLine / BaseEquipment）的必填字段不能为空\n"
        "3. **字段格式**：制程顺序 `sequence` 必须 > 0\n\n"
        "**校验结果：**\n"
        "- **校验通过**：项目状态升级为 `active`\n"
        "- **校验未通过**：状态保持不变（通常 `draft`），返回详细问题列表"
    ),
)
async def validate_factory_project(
    project_id: SnowflakeIdIn,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectService = Depends(get_service),
):
    if not project_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="项目ID不合法")
    report = await service.validate_factory_project(project_id, db)
    message = "校验通过，项目状态已升级为 active" if report.is_valid else "校验未通过，请查看校验报告中的问题列表"
    return ResultUtils.ok(data=report, message=message)


@factory_project_router.post(
    "/query",
    response_model=BaseResponse[Page[FactoryProjectVo]],
    summary="按字段查询工厂项目（不传字段=全量）",
)
async def query_factory_projects(
    query: FactoryProjectQueryDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectService = Depends(get_service),
):
    result = await service.query_factory_projects(query, db)
    return ResultUtils.ok(data=result, message="查询成功")


@factory_project_router.post(
    "/copy",
    response_model=BaseResponse[dict],
    summary="复制工厂项目（生成新版本）",
    description=(
        "对指定工厂项目进行完整深拷贝，生成一个新版本项目。\n\n"
        "**复制内容：**\n"
        "1. 新项目记录：状态重置为 `DRAFT`，新建项目版本（version_number = N+1，is_current）\n"
        "2. 工厂结构信息（`factory_id`）保持不变\n"
        "3. 完整复制资产树所有节点（FACTORY/STAGE/LINE/EQUIPMENT）及其详情记录和 3D 模型记录\n"
        "4. 3D 模型 `root_usd_path` 原样保留（本地存储共用同一份 USD 文件）\n\n"
        "**返回字段：** `newProjectId` / `newVersionId` / `newVersionNumber` / `copiedNodes` / `has3dModels`"
    ),
)
async def copy_factory_project(
    dto: FactoryProjectCopyDto,
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectService = Depends(get_service),
):
    if not dto.source_project_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="源项目 ID 不合法")
    result = await service.copy_factory_project(dto.source_project_id, db)
    return ResultUtils.ok(data=result, message="复制成功")


@factory_project_router.post(
    "/update-thumbnail",
    response_model=BaseResponse[dict],
    summary="更新工厂项目缩略图",
    description=(
        "上传新缩略图图片文件，原子化更新工厂项目的 `thumbnail_url`：\n\n"
        "- 将新图片上传到本地存储 `thumbnails/` 目录，返回完整 /static 访问 URL\n"
        "- 若旧缩略图存在，则自动从本地存储删除旧文件\n"
        "- 返回 `{ project_id, thumbnail_url }`"
    ),
)
async def update_project_thumbnail(
    project_id: str = Form(..., description="项目主键ID（UUID 字符串）"),
    file: UploadFile = File(..., description="新缩略图图片文件"),
    db: AsyncSession = Depends(get_db),
    service: FactoryProjectService = Depends(get_service),
):
    pid = (project_id or "").strip()
    if not pid:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="项目ID不合法")
    result = await service.update_project_thumbnail(pid, file, db)
    return ResultUtils.ok(data=result, message="缩略图更新成功")
