import logging
from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from common.DeleteRequest import BatchIdsRequest
from commonutils.Logs import init_logging
from commonutils.SnowflakeUtils import SnowflakeIdIn
from config.PgSqlConfig import get_db
from models.enums.AssetModelTypeEnum import AssetModelType
from service.AssetDownloadService import AssetDownloadService

init_logging()
logger = logging.getLogger(__name__)

asset_download_router = APIRouter(prefix="/asset-download")

_service = AssetDownloadService()


def get_service() -> AssetDownloadService:
    return _service


def _zip_response(zip_bytes: bytes, zip_filename: str) -> StreamingResponse:
    """构造 ZIP 文件的 StreamingResponse，文件名支持中文。

    不能用 io.BytesIO 直接传给 StreamingResponse（Starlette 会按 \\n 行迭代破坏二进制），
    改用固定大小分块生成器，确保二进制完整。
    """
    encoded_name = quote(zip_filename, encoding="utf-8")
    headers = {
        "Content-Disposition": f"attachment; filename=\"{zip_filename}\"; filename*=UTF-8''{encoded_name}",
    }

    def _byte_chunks(data: bytes, chunk_size: int = 64 * 1024):
        for i in range(0, len(data), chunk_size):
            yield data[i:i + chunk_size]

    return StreamingResponse(_byte_chunks(zip_bytes), headers=headers, media_type="application/zip")


@asset_download_router.get(
    "/{asset_type}/download/{category_id}",
    summary="下载资产模型文件夹（线体 / 设备）",
    description=(
        "根据 category_id 从资产库打包下载对应资产模型的完整文件夹，以 ZIP 返回。"
        "asset_type：line（线体）或 equipment（设备）。仅 ACTIVE 状态允许下载。"
    ),
    response_class=StreamingResponse,
)
async def download_asset_model(
        asset_type: AssetModelType,
        category_id: SnowflakeIdIn,
        db: AsyncSession = Depends(get_db),
        service: AssetDownloadService = Depends(get_service),
):
    zip_bytes, zip_filename = await service.download_single(asset_type, category_id, db)
    logger.info(f"单个下载: asset_type={asset_type}, category_id={category_id}, file={zip_filename}")
    return _zip_response(zip_bytes, zip_filename)


@asset_download_router.post(
    "/{asset_type}/batch-download",
    summary="批量下载资产模型文件夹（线体 / 设备）",
    description=(
        "批量打包多个资产模型文件夹，合并为单个 ZIP 返回。请求体：{\"ids\": [categoryId1, ...]}。"
        "仅 ACTIVE 状态允许下载。"
    ),
    response_class=StreamingResponse,
)
async def batch_download_asset_models(
        asset_type: AssetModelType,
        dto: BatchIdsRequest,
        db: AsyncSession = Depends(get_db),
        service: AssetDownloadService = Depends(get_service),
):
    zip_bytes, zip_filename = await service.batch_download(asset_type, dto.ids, db)
    logger.info(f"批量下载: asset_type={asset_type}, count={len(dto.ids)}, file={zip_filename}")
    return _zip_response(zip_bytes, zip_filename)
