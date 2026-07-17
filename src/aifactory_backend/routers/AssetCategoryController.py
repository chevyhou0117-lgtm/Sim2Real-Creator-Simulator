import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from common.BaseResponse import BaseResponse
from common.DeleteRequest import BatchIdsRequest
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from commonutils.SnowflakeUtils import SnowflakeIdIn
from config.PgSqlConfig import get_db
from exception.ExceptionClass import BusinessException
from models.dto.AssetCategoryDto import (
    AssetCategoryCreateDto,
    AssetCategoryUpdateDto,
    AssetCategoryDeleteDto,
    AssetCategoryQueryDto,
    AssetCategoryFilterDto,
    AssetCategoryMoveDto,
    AssetCopyModelDto,
)
from models.enums.CategoryEnum import AssetCategoryType
from models.vo.AssetCategoryVo import AssetCategoryVo, AssetCategoryTreeVo, AssetCategoryFilterVo, AssetCategoryTypeVo
from result.ResultUtils import ResultUtils
from service.AssetCategoryService import AssetCategoryService

init_logging()
logger = logging.getLogger(__name__)

asset_category_router = APIRouter(prefix="/asset-category")

_service = AssetCategoryService()


def get_service() -> AssetCategoryService:
    return _service


@asset_category_router.get(
    "/process/list",
    response_model=BaseResponse[List[AssetCategoryVo]],
    summary="查询全部制程列表",
    description="返回所有 `type=process` 的资产分类节点，以列表形式返回。",
)
async def list_processes(
        db: AsyncSession = Depends(get_db),
        service: AssetCategoryService = Depends(get_service),
):
    result = await service.list_processes(db)
    return ResultUtils.ok(data=result, message="查询成功")


@asset_category_router.get(
    "/process/{process_id}/categories",
    response_model=BaseResponse[List[AssetCategoryTypeVo]],
    summary="根据制程 ID 查询下属资产分类类型type",
    description=(
        "传入制程节点 ID，返回该制程下所有去重后的资产分类类型枚举值（`line_type` / `equipment_type`）。"
    ),
)
async def list_categories_by_process(
        process_id: SnowflakeIdIn,
        db: AsyncSession = Depends(get_db),
        service: AssetCategoryService = Depends(get_service),
):
    result = await service.list_categories_by_process(process_id, db)
    return ResultUtils.ok(data=result, message="查询成功")


@asset_category_router.get(
    "/process/{process_id}/category-list",
    response_model=BaseResponse[List[AssetCategoryVo]],
    summary="根据制程 ID 查询下属资产分类节点的信息",
    description=(
        "传入制程节点 ID，返回该制程下所有 `line_type` / `equipment_type` 分类节点的完整信息，"
        "包含 `id`、`name`、`code`、`thumbnail_path`（完整 URL）、`asset_total_count` 等字段。"
    ),
)
async def list_category_details_by_process(
        process_id: SnowflakeIdIn,
        db: AsyncSession = Depends(get_db),
        service: AssetCategoryService = Depends(get_service),
):
    result = await service.list_category_details_by_process(process_id, db)
    return ResultUtils.ok(data=result, message="查询成功")

@asset_category_router.post(
    "/create",
    response_model=BaseResponse[AssetCategoryVo],
    summary="创建资产分类， 仅创建资产类型，不创建资产模型的节点",
    description=(
        "创建一个资产类型节点（包括制程，不包括资产模型节点）：\n"
        "- `code` 全局唯一，重复则报错\n"
        "- `type` 枚举值：`process` / `line_type` / `equipment_type`\n"
        "- `parentId` 为空时表示顶级节点；不为空时校验父节点是否存在"
    ),
)

async def create_category(
        dto: AssetCategoryCreateDto,
        db: AsyncSession = Depends(get_db),
        service: AssetCategoryService = Depends(get_service),
):
    result = await service.create_category(dto, db)
    return ResultUtils.ok(data=result, message="资产分类创建成功")


@asset_category_router.post(
    "/filter",
    response_model=BaseResponse[List[AssetCategoryTreeVo]],
    summary="按制程+类型+状态过滤资产模型节点（三种模式自动匹配）",
    description=(
        "按条件过滤叶子节点，以树形结构返回，根据参数组合自动选择模式：\n\n"
        "1. **全量查询**：不传 `processName` 且不传 `status` → 返回完整资产分类树\n"
        "2. **status 全局过滤**：不传 `processName` 但传了 `status` → 按状态过滤全部制程下的叶子\n"
        "3. **制程范围过滤**：传了 `processName` → 按制程名（模糊）+ 类型 + 状态过滤\n\n"
        "- **processName**：制程名称模糊匹配（选填）\n"
        "- **type**：资产类型 `line_model` / `equipment_model`（选填，仅在制程模式下生效）\n"
        "- **status**：模型状态 `DRAFT` / `ACTIVE` / `INACTIVE` / `ARCHIVED`（选填）\n\n"
        "仅返回匹配叶子节点及其祖先路径，组成精简树。"
    ),
)
async def filter_categories(
        query: AssetCategoryFilterDto,
        db: AsyncSession = Depends(get_db),
        service: AssetCategoryService = Depends(get_service),
):
    result = await service.filter_categories(query, db)
    return ResultUtils.ok(data=result, message="查询成功")


@asset_category_router.get(
    "/{category_id}/tree",
    response_model=BaseResponse[Optional[AssetCategoryTreeVo]],
    summary="根据 ID 查询该节点及其所有后代节点组成的子树",
    description=(
        "根据主键 ID 获取该资产分类节点及其所有后代节点：\n"
        "- 返回以该节点为根的完整子树（含 `children` 递归结构）\n"
        "- 若节点无子节点，则 `children` 为空列表\n"
        "- 响应中 `id`、`parentId` 均以字符串格式返回（雪花算法 ID）\n"
        "- 叶子节点（`line_model` / `equipment_model`）包含 `detail` 字段，其中 `id` 为详情表主键（字符串格式）"
    ),
)
async def get_category_tree_by_id(
        category_id: SnowflakeIdIn,
        db: AsyncSession = Depends(get_db),
        service: AssetCategoryService = Depends(get_service),
):
    if category_id is None:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="分类 ID 不能为空")
    result = await service.get_category_tree_by_id(category_id, db)
    return ResultUtils.ok(data=result, message="查询成功")



@asset_category_router.post(
    "/query",
    response_model=BaseResponse[List[AssetCategoryTreeVo]],
    summary="资产分类树形查询（全量 / keyword / process_name+type）",
    description=(
        "三种查询模式，互斥使用：\n\n"
        "1. **全量查询**：请求体为空 `{}`，返回完整分类树（所有顶级节点含 `children`）\n\n"
        "2. **keyword 搜索**：传入 `keyword`，在 `line_model` / `equipment_model` 叶子节点中"
        "模糊匹配名称，只返回匹配叶子及其祖先路径，组成精简树\n\n"
        "3. **process_name + type 过滤**：传入 `processName`（制程名模糊匹配）和 `type`"
        "（`line_type` / `equipment_type`），返回匹配制程下对应类型子树（含制程节点）\n\n"
        "响应说明：\n"
        "- `id`、`parentId` 均以字符串格式返回（雪花算法 ID）\n"
        "- 叶子节点（`line_model` / `equipment_model`）包含 `detail` 字段，其中 `id` 为详情表主键（字符串格式）"
    ),
)
async def query_categories(
        query: AssetCategoryQueryDto,
        db: AsyncSession = Depends(get_db),
        service: AssetCategoryService = Depends(get_service),
):
    result = await service.list_categories(query, db)
    return ResultUtils.ok(data=result, message="查询成功")


@asset_category_router.put(
    "/update",
    response_model=BaseResponse[AssetCategoryVo],
    summary="更新资产类型节点，包括制程、线体类型、设备类型、线体模型、设备模型节点，不包括具体的资产模型详情",
    description="部分更新资产分类信息，仅更新请求体中非空的字段。主键 `id` 必填。",
)
async def update_category(
        dto: AssetCategoryUpdateDto,
        db: AsyncSession = Depends(get_db),
        service: AssetCategoryService = Depends(get_service),
):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="分类ID不合法")
    result = await service.update_category(dto.id, dto, db)
    return ResultUtils.ok(data=result, message="更新成功")


@asset_category_router.put(
    "/move",
    response_model=BaseResponse[AssetCategoryVo],
    summary="拖拽移动叶子节点到新的父节点下",
    description=(
        "将资产模型叶子节点（`line_model` / `equipment_model`）拖拽移动到新的父节点下：\n\n"
        "**约束规则**：\n"
        "- 仅支持移动叶子节点，不允许移动制程（`process`）、线体类型（`line_type`）、设备类型（`equipment_type`）节点\n"
        "- `line_model` 只能移动到 `line_type` 类型的父节点下\n"
        "- `equipment_model` 只能移动到 `equipment_type` 类型的父节点下\n"
        "- 目标父节点不能与当前父节点相同\n\n"
        "**请求字段**：\n"
        "- `id`：被移动的叶子节点 ID\n"
        "- `newParentId`：目标父节点 ID"
    ),
)
async def move_leaf_node(
        dto: AssetCategoryMoveDto,
        db: AsyncSession = Depends(get_db),
        service: AssetCategoryService = Depends(get_service),
):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="节点ID不合法")
    if not dto.new_parent_id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="目标父节点ID不合法")
    result = await service.move_leaf_node(dto.id, dto.new_parent_id, db)
    return ResultUtils.ok(data=result, message="移动成功")


@asset_category_router.delete(
    "/delete",
    response_model=BaseResponse[str],
    summary="删除资产节点",
    description=(
        "递归删除指定资产分类节点及其所有子孙节点：\n"
        "- 传入节点 ID，将删除该节点本身及其完整子树\n"
        "- 关联的 `line_model_details` / `equipment_model_details` 由数据库 `ON DELETE CASCADE` 自动级联清理"
    ),
)
async def delete_category(
        dto: AssetCategoryDeleteDto,
        db: AsyncSession = Depends(get_db),
        service: AssetCategoryService = Depends(get_service),
):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="分类ID不合法")
    result = await service.delete_category(dto.id, db)
    return ResultUtils.ok(data=result, message="删除成功")


@asset_category_router.delete(
    "/batch-delete",
    response_model=BaseResponse[List[str]],
    summary="批量删除资产模型节点，仅支持删除叶子节点",
    description=(
        "批量删除多个资产模型叶子节点（`line_model` / `equipment_model`），同步软删除：\n"
        "- 对应详情表记录（`line_model_details` / `equipment_model_details`）\n"
        "- 关联表记录（`line_model_equipment_rel`）\n"
        "- MinIO 中的非默认缩略图文件\n\n"
        "**注意**：列表中任意一个 ID 不是叶子节点类型，或状态非 `DRAFT` / `INACTIVE`，整批操作将回滚并报错。\n"
        "返回实际被删除的分类主键 ID 列表。"
    ),
)
async def batch_delete_categories(
        dto: BatchIdsRequest,
        db: AsyncSession = Depends(get_db),
        service: AssetCategoryService = Depends(get_service),
):
    result = await service.batch_delete_model_nodes(dto.ids, db)
    return ResultUtils.ok(data=result, message=f"批量删除成功，共 {len(result)} 条")


@asset_category_router.post(
    "/copy-model",
    response_model=BaseResponse[dict],
    summary="复制资产模型节点为新版本",
    description=(
        "将已有的线体模型（`line_model`）或设备模型（`equipment_model`）节点复制为一个新版本：\n\n"
        "**复制流程**：\n"
        "1. 定位源节点并验证类型与 `assetType` 一致\n"
        "2. 查找源节点最新版本详情（`is_current=True`）\n"
        "3. 校验 `newVersionTag` 在同一逻辑资产（`asset_version_id`）下不重复\n"
        "4. 在资产树中创建新分类节点（挂到相同父节点下）\n"
        "5. 旧版本详情 `is_current` 置为 `False`，新版本 `is_current=True`\n"
        "6. 线体模型：复制其下未删除的设备实例关联（`line_model_equipment_rel`）到新详情\n\n"
        "**请求字段说明**：\n"
        "- `categoryId`：源节点 ID（必须为 `line_model` / `equipment_model` 叶子节点）\n"
        "- `newAssetName`：新资产名称（新分类节点名称）\n"
        "- `newVersionTag`：新版本标签，如 `v2.0`、`v1.1`，同一逻辑资产下不允许重复\n"
        "- `assetType`：`line`（线体模型）或 `equipment`（设备模型）\n\n"
        "**返回字段**：`sourceCategoryId`、`newCategoryId`、`newDetailId`、"
        "`assetVersionId`、`newVersionTag`、`copiedRelCount`"
    ),
)
async def copy_asset_model(
        dto: AssetCopyModelDto,
        db: AsyncSession = Depends(get_db),
        service: AssetCategoryService = Depends(get_service),
):
    result = await service.copy_asset_model(dto, db)
    return ResultUtils.ok(data=result, message="资产模型复制成功")
