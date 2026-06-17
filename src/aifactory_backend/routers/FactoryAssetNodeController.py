# routers/FactoryAssetNodeController.py
import logging
from typing import Any, List, Optional, Union

from fastapi import APIRouter, Depends, Query, File, Form, UploadFile
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from common.BaseResponse import BaseResponse
from common.ErrorCode import ErrorCode
from common.PageResponse import Page
from commonutils.Logs import init_logging
from commonutils.SnowflakeUtils import SnowflakeIdIn
from config.PgSqlConfig import get_db
from exception.ExceptionClass import BusinessException
from models.dto.FactoryAssetNodeDto import (
    FactoryAssetNodeCreateDto,
    FactoryAssetNodeUpdateDto,
    FactoryAssetNodeDeleteDto,
    FactoryAssetNodeBindDto,
    FactoryAssetNodeUnbindDto,
    AddLineNodeDto,
)
from models.vo.FactoryAssetNodeVo import FactoryAssetNodeVo, FactoryAssetNodeTreeVo
from models.vo.FactoryProjectVo import FactoryProjectVo
from models.vo.FactoryProcessDetailsVo import FactoryProcessDetailsVo
from models.vo.FactoryLineDetailsVo import FactoryLineDetailsVo
from models.vo.FactoryEquipmentDetailsVo import FactoryEquipmentDetailsVo
from result.ResultUtils import ResultUtils
from service.FactoryAssetNodeService import FactoryAssetNodeService
from service.FactoryModelUploadService import FactoryModelUploadService
from models.entity.FactoryAssetNodeEntity import FactoryAssetNode
from models.entity.FactoryAsset3dModelEntity import FactoryAsset3dModel
from models.enums.InstanceAssetTypeEnum import InstanceAssetType

init_logging()
logger = logging.getLogger(__name__)

factory_asset_node_router = APIRouter(prefix="/factory-asset-node")

_service = FactoryAssetNodeService()
_upload_service = FactoryModelUploadService()


def get_service() -> FactoryAssetNodeService:
    return _service


def get_upload_service() -> FactoryModelUploadService:
    return _upload_service


@factory_asset_node_router.get(
    "/factory-tree/{factory_projects_id}",
    response_model=BaseResponse[List[FactoryAssetNodeTreeVo]],
    summary="根据工厂项目ID获取完整工厂结构树",
    description=(
        "根据工厂项目 ID 查询完整工厂结构树：\n"
        "- 返回顶级节点列表，每个节点内嵌 `children` 实现完整树形结构\n"
        "- 仅包含节点层级关系与基础字段（id、name、code、type、parentId 等）\n"
        "- 不包含任何 detail 数据\n"
        "- 按节点创建时间升序排列"
    ),
)
async def get_factory_tree(
        factory_projects_id: SnowflakeIdIn,
        db: AsyncSession = Depends(get_db),
        service: FactoryAssetNodeService = Depends(get_service),
):
    result = await service.get_factory_tree(factory_projects_id, db)
    return ResultUtils.ok(data=result, message="查询成功")


@factory_asset_node_router.get(
    "/stage-list/{factory_projects_id}",
    response_model=BaseResponse[List[FactoryAssetNodeVo]],
    summary="根据工厂项目ID获取所有制程节点列表",
    description=(
        "根据工厂项目 ID 查询该项目下所有 STAGE（制程）类型节点：\n"
        "- 返回平铺列表，不含树形嵌套\n"
        "- 仅包含未删除（is_deleted=False）的节点\n"
        "- 按节点创建时间升序排列"
    ),
)
async def get_stage_list(
        factory_projects_id: SnowflakeIdIn,
        db: AsyncSession = Depends(get_db),
        service: FactoryAssetNodeService = Depends(get_service),
):
    result = await service.get_stage_list_by_project(factory_projects_id, db)
    return ResultUtils.ok(data=result, message="查询成功")


@factory_asset_node_router.post(
    "/create",
    response_model=BaseResponse[FactoryAssetNodeVo],
    summary="创建工厂资产节点",
    description=(
        "创建一个工厂资产节点：\n"
        "- `factory_projects_id` 必填，关联工厂项目\n"
        "- `name` 必填，节点名称\n"
        "- `type` 必填，类型（字典表code）\n"
        "- `parent_id` 为空时表示顶级节点；不为空时校验父节点是否存在"
    ),
)
async def create_node(
        dto: FactoryAssetNodeCreateDto,
        db: AsyncSession = Depends(get_db),
        service: FactoryAssetNodeService = Depends(get_service),
):
    result = await service.create_node(dto, db)
    return ResultUtils.ok(data=result, message="节点创建成功")


@factory_asset_node_router.put(
    "/update",
    response_model=BaseResponse[FactoryAssetNodeVo],
    summary="更新工厂资产节点",
    description="部分更新工厂资产节点信息，仅更新请求体中非空的字段。主键 `id` 必填。",
)
async def update_node(
        dto: FactoryAssetNodeUpdateDto,
        db: AsyncSession = Depends(get_db),
        service: FactoryAssetNodeService = Depends(get_service),
):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="节点ID不合法")
    result = await service.update_node(dto.id, dto, db)
    return ResultUtils.ok(data=result, message="更新成功")


@factory_asset_node_router.delete(
    "/delete",
    response_model=BaseResponse[str],
    summary="删除工厂资产节点",
    description=(
        "删除指定工厂资产节点：\n"
        "- **设备节点**（type 为设备类型）：直接删除该节点及对应设备详情记录\n"
        "- **其他节点**（工厂/制程/线体等）：递归删除该节点及其所有子孙节点和关联详情记录\n"
        "- 所有详情子表通过 FK ON DELETE CASCADE 自动级联删除"
    ),
)
async def delete_node(
        dto: FactoryAssetNodeDeleteDto,
        db: AsyncSession = Depends(get_db),
        service: FactoryAssetNodeService = Depends(get_service),
):
    if not dto.id:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="节点ID不合法")
    result = await service.delete_node(dto.id, db)
    return ResultUtils.ok(data=result, message="删除成功")


@factory_asset_node_router.get(
    "/detail/by-prim-path",
    response_model=BaseResponse[Any],
    summary="根据 prim_path 查询资产节点详情",
    description=(
        "通过 3D 模型的 `prim_path` 反查工厂资产节点，并返回对应详情 VO（与按节点ID查询结果相同）：\n"
        "- **STAGE（制程）** → `FactoryProcessDetailsVo`（含 base_stage 聚合）\n"
        "- **LINE（线体）**  → `FactoryLineDetailsVo`（含 base_production_line + 3D模型）\n"
        "- **EQUIPMENT（设备）** → `FactoryEquipmentDetailsVo`（含 BaseEquipmentFullDetailVo + 3D模型）\n\n"
        "**参数说明：**\n"
        "- `prim_path`：USD 场景中的 Prim 路径，例如 `/SMT01/ProdLine/LINE_01`"
    ),
)
async def get_node_detail_by_prim_path(
        prim_path: str = Query(..., description="USD中的 Prim 路径"),
        db: AsyncSession = Depends(get_db),
        service: FactoryAssetNodeService = Depends(get_service),
):
    if not prim_path or not prim_path.strip():
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="prim_path 不能为空")
    result = await service.get_node_detail_by_prim_path(prim_path.strip(), db)
    return ResultUtils.ok(data=result, message="查询成功")


@factory_asset_node_router.get(
    "/{node_id}/detail",
    response_model=BaseResponse[Any],
    summary="根据节点ID查询详情",
    description=(
        "根据节点ID自动识别类型，返回对应详情 VO：\n"
        "- **工厂项目**（factory_asset_node 不存在时视作 factory_projects.project_id）→ `FactoryProjectVo`\n"
        "- **STAGE（制程）** → `FactoryProcessDetailsVo`（含 base_stage 聚合）\n"
        "- **LINE（线体）**  → `FactoryLineDetailsVo`（含 base_production_line + 3D模型）\n"
        "- **EQUIPMENT（设备）** → `FactoryEquipmentDetailsVo`（含 BaseEquipmentFullDetailVo + 3D模型）"
    ),
)
async def get_node_detail(
        node_id: SnowflakeIdIn,
        db: AsyncSession = Depends(get_db),
        service: FactoryAssetNodeService = Depends(get_service),
):
    result = await service.get_node_detail(node_id, db)
    return ResultUtils.ok(data=result, message="查询成功")


@factory_asset_node_router.post(
    "/bind",
    response_model=BaseResponse[Any],
    summary="统一绑定接口：绑定 LINE 或 EQUIPMENT 节点到对应业务实体",
    description=(
        "根据节点类型自动路由绑定逻辑：\n"
        "- **LINE 节点**：按 base_production_line.stage_id 定位目标制程节点，按需迁移父节点后绑定 line_id → BOUND\n"
        "- **EQUIPMENT 节点**：直接绑定 equipment_id → BOUND\n"
        "- `factoryAssetId`：LINE / EQUIPMENT 节点 ID；`refId`：LINE 传 line_id，EQUIPMENT 传 equipment_id"
    ),
)
async def bind_node(
        dto: FactoryAssetNodeBindDto,
        db: AsyncSession = Depends(get_db),
        service: FactoryAssetNodeService = Depends(get_service),
):
    result = await service.bind_node(dto, db)
    return ResultUtils.ok(data=result, message="绑定成功")


@factory_asset_node_router.post(
    "/unbind",
    response_model=BaseResponse[dict],
    summary="统一解绑接口：解绑 LINE 或 EQUIPMENT 节点",
    description=(
        "根据节点类型自动路由解绑逻辑：清除对应详情表的 ref_id，节点 bind_status → UNBOUND，并级联更新父节点状态。"
    ),
)
async def unbind_node(
        dto: FactoryAssetNodeUnbindDto,
        db: AsyncSession = Depends(get_db),
        service: FactoryAssetNodeService = Depends(get_service),
):
    result = await service.unbind_node(dto, db)
    return ResultUtils.ok(data=result, message="解绑成功")


@factory_asset_node_router.post(
    "/add-line-node",
    response_model=BaseResponse[FactoryAssetNodeVo],
    summary="在 default 制程下新增线体节点（拖拉拽资产库线体）",
    description=(
        "在指定项目的 default 制程节点下新增线体节点（拖拉拽资产库线体模型），并自动创建该线体下挂载的所有设备子节点：\n"
        "1. 查 default_stage 节点 → 2. 按 lineId 取 line_model_details → 3. 从 primPath 解析线体名/code\n"
        "4. 创建 LINE 节点 + factory_line_details(ref_id=None) + factory_asset_3d_model\n"
        "5. 按 line_model_equipment_rel 批量创建 EQUIPMENT 子节点 + 详情 + 3D模型\n"
        "6. 级联更新父节点 bind_status"
    ),
)
async def add_line_node(
        dto: AddLineNodeDto,
        db: AsyncSession = Depends(get_db),
        service: FactoryAssetNodeService = Depends(get_service),
):
    result = await service.add_line_node(dto, db)
    return ResultUtils.ok(data=result, message="线体节点创建成功")


@factory_asset_node_router.post(
    "/upload-factory-model",
    response_model=BaseResponse[dict],
    summary="上传工厂模型 ZIP",
    description=(
        "上传工厂模型 ZIP 包：解压 → 文件存入本地存储（Factory/<folder>/...）→ 解析 Data/Assembly + Data/ProdLine CSV → "
        "在 default_stage 下批量创建 LINE / EQUIPMENT 节点及 3D 模型记录。FACTORY 根节点已有模型时拒绝重复上传。"
    ),
)
async def upload_factory_model(
        project_id: str = Form(..., description="目标工厂项目 ID（雪花算法 UUID，传字符串）"),
        file: UploadFile = File(..., description="工厂模型 ZIP 文件"),
        db: AsyncSession = Depends(get_db),
        upload_service: FactoryModelUploadService = Depends(get_upload_service),
):
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="请上传 .zip 格式的工厂模型文件")
    pid = project_id.strip()
    if not pid:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="projectId 不合法")
    # 校验 FACTORY 根节点是否已绑定 3D 资产模型，不允许重复上传
    factory_root = (await db.execute(
        select(FactoryAssetNode).where(
            FactoryAssetNode.factory_projects_id == pid,
            FactoryAssetNode.type == InstanceAssetType.FACTORY.value,
            FactoryAssetNode.is_deleted == False,
        ).limit(1)
    )).scalar_one_or_none()
    if factory_root is not None:
        model_count = (await db.execute(
            select(func.count()).select_from(FactoryAsset3dModel).where(
                FactoryAsset3dModel.factory_asset_id == factory_root.id,
                FactoryAsset3dModel.is_deleted == False,
            )
        )).scalar_one()
        if model_count > 0:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="该项目已上传模型文件，不允许重复上传")
    file_bytes = await file.read()
    result = await upload_service.upload_factory_model(pid, file_bytes, db)
    return ResultUtils.ok(data=result, message="工厂模型上传成功")


@factory_asset_node_router.post(
    "/upload-omniverse-usd",
    response_model=BaseResponse[dict],
    summary="上传 Omniverse USD ZIP",
    description=(
        "上传 Omniverse USD ZIP 包（逻辑与 `upload-factory-model` 一致，存储走本地文件存储）：\n\n"
        "1. **解压** ZIP，自动发现工厂数据文件夹（包含 `Data/Assembly/` 的顶层文件夹，名称不固定）\n"
        "2. **上传全部文件**到本地存储（直接以 ZIP 路径上传，无额外前缀）\n"
        "3. **工厂入口 USD**（`<folder_name>_V01.usd`）写入 FACTORY 根节点 3D 模型记录的 `root_usd_path` 字段\n"
        "4. **解析 `Data/Assembly/*.csv`**（无表头，列：`Line_name`, `Line_id`）→ 每行对应一条线体实例\n"
        "5. **根据 Line_name 查找 `Data/ProdLine/{Line_name}.csv`** → 获取该线体下的设备列表\n"
        "6. 在 `default_stage` 节点下创建 **LINE / EQUIPMENT 节点**及 3D 模型记录\n\n"
        "**参数说明：**\n"
        "- `project_id`：目标工厂项目 ID（雪花算法 UUID，传字符串）\n"
        "- `file`：Omniverse USD ZIP 文件"
    ),
)
async def upload_omniverse_usd(
        project_id: str = Form(..., description="目标工厂项目 ID（雪花算法 UUID，传字符串）"),
        file: UploadFile = File(..., description="omniverse_usd.zip 文件"),
        db: AsyncSession = Depends(get_db),
        upload_service: FactoryModelUploadService = Depends(get_upload_service),
):
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="请上传 .zip 格式的 Omniverse USD 文件")
    pid = project_id.strip()
    if not pid:
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="projectId 不合法")
    # 校验 FACTORY 根节点是否已绑定 3D 资产模型，不允许重复上传
    factory_root = (await db.execute(
        select(FactoryAssetNode).where(
            FactoryAssetNode.factory_projects_id == pid,
            FactoryAssetNode.type == InstanceAssetType.FACTORY.value,
            FactoryAssetNode.is_deleted == False,
        ).limit(1)
    )).scalar_one_or_none()
    if factory_root is not None:
        model_count = (await db.execute(
            select(func.count()).select_from(FactoryAsset3dModel).where(
                FactoryAsset3dModel.factory_asset_id == factory_root.id,
                FactoryAsset3dModel.is_deleted == False,
            )
        )).scalar_one()
        if model_count > 0:
            raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="该项目已上传模型文件，不允许重复上传")
    file_bytes = await file.read()
    result = await upload_service.upload_omniverse_usd(pid, file_bytes, db)
    return ResultUtils.ok(data=result, message="Omniverse USD 上传成功")

