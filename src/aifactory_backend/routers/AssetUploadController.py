import logging
from common.ErrorCode import ErrorCode
from exception.ExceptionClass import BusinessException
from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from common.BaseResponse import BaseResponse
from commonutils.Logs import init_logging
from config.PgSqlConfig import get_db
from models.dto.UsdAssetUploadDto import UsdPresignedUrlDto, AssetVersionUpdateDto
from models.enums.CategoryEnum import AssetUploadType
from result.ResultUtils import ResultUtils
from service.AssetUploadService import AssetUploadService
from service.EquipmentModelDetailService import EquipmentModelDetailService
from service.LineModelDetailService import LineModelDetailService
from service.MinioService import MinioManagerService

init_logging()
logger = logging.getLogger(__name__)

asset_upload_router = APIRouter(prefix="/asset-upload")

_service = AssetUploadService()
_minio_service = MinioManagerService()
_equipment_detail_service = EquipmentModelDetailService()
_line_detail_service = LineModelDetailService()


def get_service() -> AssetUploadService:
    return _service


def get_minio_service() -> MinioManagerService:
    return _minio_service


def get_equipment_detail_service() -> EquipmentModelDetailService:
    return _equipment_detail_service


def get_line_detail_service() -> LineModelDetailService:
    return _line_detail_service


# todo 设备模型和线体模型重复校验的逻辑。去数据库里面校验，数据库查询的问题。
#  有就直接报错，没有就继续执行，去做查询。


@asset_upload_router.post(
    "/upload",
    response_model=BaseResponse[dict],
    summary="上传资产模型 ZIP 文件",
    description=(
        "接收 ZIP 压缩包，根据 `type` 字段执行不同解析逻辑：\n\n"
        "**`factory` / `line`（工厂/线体模型）**\n"
        "- 解压 ZIP，将**所有文件**（含子文件夹完整结构）上传到 MinIO，保留原始目录结构\n"
        "- `location_path` = ZIP 根目录名\n"
        "- 遍历 `ProdLine/` 下的直属子文件夹，每个子文件夹 = 一条线体模型\n"
        "- 在 `asset_categories` 中创建 `line_model` 节点（父节点为默认线体类型）\n"
        "- 在 `line_model_details` 中记录 `root_usd_path` 完整路径和默认缩略图，获取 `line_model_id`\n"
        "- 遍历每条线体的 `Machine/` 目录，找到设备 `.usd` 文件：\n"
        "  - 文件名（去后缀）作为 `instance_name`\n"
        "  - 按文件名关键词模糊匹配 `asset_categories.name`（`type=equipment_model`）→ `category_id`\n"
        "  - 反查 `equipment_model_details.id` → `equipment_model_id`\n"
        "  - 插入 `line_model_equipment_rel` 关联记录（`line_model_id` + `equipment_model_id`）\n\n"
        "**`equipment`（设备模型）**\n"
        "- 解压 ZIP，将**所有文件**（含子文件夹完整结构）上传到 MinIO 的 `Library/Asset/` 前缀下\n"
        "- `location_path` = `Library/Asset/{ZIP根目录名}`\n"
        "- 遍历 ZIP 内顶级子文件夹，每个子文件夹 = 一台设备模型\n"
        "- 在 `asset_categories` 中创建 `equipment_model` 节点（父节点为默认设备类型）\n"
        "- 在 `equipment_model_details` 中记录 `root_usd_path` 完整路径和默认缩略图"
    ),
)
async def upload_asset(
        type: AssetUploadType = Form(default=AssetUploadType.FACTORY, description="上传类型：factory / line / equipment"),
        file: UploadFile = File(..., description="ZIP 压缩包文件"),
        db: AsyncSession = Depends(get_db),
        service: AssetUploadService = Depends(get_service),
):

    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise BusinessException(ErrorCode.PARAMS_ERROR, extra_msg="仅支持上传 .zip 格式的压缩文件")

    file_bytes = await file.read()
    result = await service.upload_asset(type, file_bytes, db)
    return ResultUtils.ok(data=result, message="上传成功")


@asset_upload_router.post(
    "/update-version",
    response_model=BaseResponse[dict],
    summary="更新资产模型版本",
    description=(
        "基于已有资产详情记录派生一条**新版本**（本地存储版，仅 DB 行派生，不重新上传 ZIP）：\n\n"
        "- 通过 `detailId` 定位源版本详情行（`line_model_details.id` 或 `equipment_model_details.id`）\n"
        "- 新行沿用源行的 `asset_version_id` 谱系（源行为空时回退为源行 `id`），同一谱系下 `versionTag` 不可重复\n"
        "- 全量复制源行字段，覆盖请求中提供的 `rootUsdPath` / `locationPath` / `thumbnailPath`（如需换 USD/缩略图文件，前端先上传文件后传入新路径）\n"
        "- 新行 `is_current=True`、`status=ACTIVE`；同谱系其余 `is_current=True` 行置为 `False`（保留历史版本，不删除）\n"
        "- **线体专属**：仅派生 `line_model_details` 行，不重建 `line_model_equipment_rel` 设备关联（无文件路径重映射）\n"
        "- **设备专属**：无设备关联，无 MQ 推送"
    ),
)
async def update_asset_version(
        dto: AssetVersionUpdateDto,
        db: AsyncSession = Depends(get_db),
        eq_service: EquipmentModelDetailService = Depends(get_equipment_detail_service),
        ln_service: LineModelDetailService = Depends(get_line_detail_service),
):
    overrides = {
        "root_usd_path": dto.root_usd_path,
        "location_path": dto.location_path,
        "thumbnail_path": dto.thumbnail_path,
    }
    if dto.asset_type == AssetUploadType.LINE:
        result = await ln_service.create_new_version(
            dto.detail_id, dto.version_tag, dto.remark, dto.created_by, overrides, db
        )
        return ResultUtils.ok(data=result, message="线体模型版本升级成功")
    elif dto.asset_type == AssetUploadType.EQUIPMENT_MODEL:
        result = await eq_service.create_new_version(
            dto.detail_id, dto.version_tag, dto.remark, dto.created_by, overrides, db
        )
        return ResultUtils.ok(data=result, message="设备模型版本升级成功")
    else:
        raise BusinessException(
            ErrorCode.PARAMS_ERROR,
            extra_msg=f"不支持的资产类型: {dto.asset_type}（仅支持 line / equipment）",
        )


@asset_upload_router.post(
    "/upload-thumbnail",
    response_model=BaseResponse[dict],
    summary="上传/更新缩略图",
    description=(
        "上传图片文件到 MinIO 的 `thumbnails/` 目录，"
        "返回存储路径（格式：`thumbnails/xxx.png`）供前端保存到对应记录的 `thumbnail_path` 字段。"
    ),
)
async def upload_thumbnail(
        file: UploadFile = File(..., description="缩略图图片文件"),
        minio_service: MinioManagerService = Depends(get_minio_service),
):
    thumbnail_path = await minio_service.upload_thumbnail_file(file)
    return ResultUtils.ok(
        data={"thumbnail_path": thumbnail_path},
        message="缩略图上传成功",
    )


@asset_upload_router.post(
    "/update-thumbnail-by-category",
    response_model=BaseResponse[dict],
    summary="更新模型缩略图（by category_id）",
    description=(
        "根据 `category_id` 和 `type` 更新对应节点的缩略图：\n\n"
        "- **`line`**：更新 `line_model_details`（按 `category_id`）的 `thumbnail_path`，`category_id` 为 `asset_categories.id`\n"
        "- **`equipment`**：更新 `equipment_model_details`（`is_current=True` 最新版本）的 `thumbnail_path`，`category_id` 为 `asset_categories.id`\n"
        "- **`process`**：更新 `asset_categories.thumbnail_path`，`category_id` 为制程节点的 `asset_categories.id`\n\n"
        "通用行为：\n"
        "- 将新图片上传到本地存储 `thumbnails/` 目录\n"
        "- 若旧缩略图为自定义图（非默认图），则自动删除旧文件\n"
        "- 返回 `{ category_id, thumbnail_path }`（thumbnail_path 为完整访问 URL）"
    ),
)
async def update_thumbnail_by_category(
        type: str = Form(..., description="资产类型：line / equipment / process"),
        category_id: str = Form(..., description="节点 ID（asset_categories.id）"),
        file: UploadFile = File(..., description="新缩略图图片文件"),
        db: AsyncSession = Depends(get_db),
        service: AssetUploadService = Depends(get_service),
):
    result = await service.update_thumbnail_by_category(type, category_id, file, db)
    return ResultUtils.ok(data=result, message="缩略图更新成功")


@asset_upload_router.post(
    "/presigned-url",
    response_model=BaseResponse[dict],
    summary="获取 USD 文件预签名下载链接",
    description="根据 `root_usd_path` 生成 MinIO 预签名下载链接，默认有效期 3600 秒。",
)
async def get_presigned_url(
        dto: UsdPresignedUrlDto,
        service: AssetUploadService = Depends(get_service),
):
    url = service.get_presigned_url(dto.root_usd_path, dto.expires_seconds)
    return ResultUtils.ok(data={"presigned_url": url, "root_usd_path": dto.root_usd_path}, message="生成成功")
