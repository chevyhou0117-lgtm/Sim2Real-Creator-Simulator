"""Central ZIP validation and bounded decompression helpers.

Limits can be overridden without code changes:

``AIFACTORY_ZIP_MAX_ENTRIES``
    Maximum number of entries, including directories (default: 10,000).
``AIFACTORY_ZIP_MAX_SINGLE_FILE_BYTES``
    Maximum uncompressed size of one file (default: 256 MiB).
``AIFACTORY_ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES``
    Maximum aggregate uncompressed size (default: 1 GiB).
``AIFACTORY_ZIP_MAX_COMPRESSION_RATIO``
    Maximum per-file and aggregate uncompressed/compressed ratio (default: 200).
``AIFACTORY_ZIP_MAX_ARCHIVE_BYTES``
    Maximum size of the uploaded ZIP itself (default: 512 MiB).
"""

from __future__ import annotations

import math
import os
import stat
import zipfile
from dataclasses import dataclass
from pathlib import PurePosixPath, PureWindowsPath
from typing import Callable, List, Optional, Tuple


_READ_CHUNK_SIZE = 1024 * 1024


class UnsafeZipError(ValueError):
    """Raised when a ZIP archive violates a path or resource safety rule."""


@dataclass(frozen=True)
class ZipSafetyLimits:
    max_entries: int = 10_000
    max_single_file_bytes: int = 256 * 1024 * 1024
    max_total_uncompressed_bytes: int = 1024 * 1024 * 1024
    max_compression_ratio: float = 200.0
    max_archive_bytes: int = 512 * 1024 * 1024


def _positive_int_from_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError as exc:
        raise UnsafeZipError(f"环境变量 {name} 必须是正整数") from exc
    if value <= 0:
        raise UnsafeZipError(f"环境变量 {name} 必须大于 0")
    return value


def _positive_float_from_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw)
    except ValueError as exc:
        raise UnsafeZipError(f"环境变量 {name} 必须是正数") from exc
    if not math.isfinite(value) or value <= 0:
        raise UnsafeZipError(f"环境变量 {name} 必须大于 0")
    return value


def get_zip_safety_limits() -> ZipSafetyLimits:
    """Load limits for one request so environment overrides remain effective."""

    defaults = ZipSafetyLimits()
    return ZipSafetyLimits(
        max_entries=_positive_int_from_env(
            "AIFACTORY_ZIP_MAX_ENTRIES", defaults.max_entries
        ),
        max_single_file_bytes=_positive_int_from_env(
            "AIFACTORY_ZIP_MAX_SINGLE_FILE_BYTES",
            defaults.max_single_file_bytes,
        ),
        max_total_uncompressed_bytes=_positive_int_from_env(
            "AIFACTORY_ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES",
            defaults.max_total_uncompressed_bytes,
        ),
        max_compression_ratio=_positive_float_from_env(
            "AIFACTORY_ZIP_MAX_COMPRESSION_RATIO",
            defaults.max_compression_ratio,
        ),
        max_archive_bytes=_positive_int_from_env(
            "AIFACTORY_ZIP_MAX_ARCHIVE_BYTES",
            defaults.max_archive_bytes,
        ),
    )


async def read_limited_upload(
    upload,
    *,
    max_archive_bytes: Optional[int] = None,
    chunk_size: int = _READ_CHUNK_SIZE,
) -> bytes:
    """Read an UploadFile-like object in chunks under a hard size limit.

    The object only needs an async ``read(size)`` method, keeping this helper
    independent of FastAPI and straightforward to unit-test.
    """

    limit = (
        max_archive_bytes
        if max_archive_bytes is not None
        else get_zip_safety_limits().max_archive_bytes
    )
    if limit <= 0 or chunk_size <= 0:
        raise UnsafeZipError("ZIP 上传大小限制和读取块大小必须大于 0")

    chunks = []
    total = 0
    while True:
        # Read at most one byte beyond the remaining budget so oversized
        # uploads are detected without buffering another full chunk.
        read_size = min(chunk_size, limit - total + 1)
        chunk = await upload.read(read_size)
        if not chunk:
            break
        if not isinstance(chunk, bytes):
            raise UnsafeZipError("上传文件读取结果必须是 bytes")
        total += len(chunk)
        if total > limit:
            raise UnsafeZipError(f"ZIP 原始上传大小超限: {total} > {limit}")
        chunks.append(chunk)

    return b"".join(chunks)


def validate_zip_entry_name(name: str, *, is_directory: bool = False) -> str:
    """Validate one ZIP member name and return its canonical relative name."""

    if not isinstance(name, str) or not name:
        raise UnsafeZipError("ZIP 条目名称不能为空")
    if "\x00" in name:
        raise UnsafeZipError("ZIP 条目名称不能包含 NUL 字符")
    if "\\" in name:
        raise UnsafeZipError(f"ZIP 条目必须使用正斜杠: {name!r}")

    posix_path = PurePosixPath(name)
    windows_path = PureWindowsPath(name)
    if (
        posix_path.is_absolute()
        or windows_path.is_absolute()
        or bool(windows_path.drive)
        or bool(windows_path.root)
    ):
        raise UnsafeZipError(f"ZIP 条目必须是相对路径: {name!r}")

    canonical_name = name[:-1] if is_directory and name.endswith("/") else name
    parts = canonical_name.split("/")
    if not canonical_name or any(part in ("", ".", "..") for part in parts):
        raise UnsafeZipError(f"ZIP 条目包含不安全路径片段: {name!r}")

    return canonical_name


def _compression_ratio(uncompressed_size: int, compressed_size: int) -> float:
    if uncompressed_size == 0:
        return 0.0
    if compressed_size <= 0:
        return float("inf")
    return uncompressed_size / compressed_size


def _validate_archive_metadata(
    zf: zipfile.ZipFile, limits: ZipSafetyLimits
) -> List[zipfile.ZipInfo]:
    infos = zf.infolist()
    if len(infos) > limits.max_entries:
        raise UnsafeZipError(
            f"ZIP 条目数量超限: {len(infos)} > {limits.max_entries}"
        )

    file_infos: List[zipfile.ZipInfo] = []
    total_uncompressed = 0
    total_compressed = 0
    seen_names = set()

    for info in infos:
        canonical_name = validate_zip_entry_name(
            info.filename, is_directory=info.is_dir()
        )
        if canonical_name in seen_names:
            raise UnsafeZipError(f"ZIP 包含重复条目: {info.filename!r}")
        seen_names.add(canonical_name)

        unix_mode = (info.external_attr >> 16) & 0o170000
        if unix_mode == stat.S_IFLNK:
            raise UnsafeZipError(f"ZIP 不允许符号链接条目: {info.filename!r}")
        if info.flag_bits & 0x1:
            raise UnsafeZipError(f"ZIP 不允许加密条目: {info.filename!r}")
        if info.is_dir():
            continue
        if info.file_size < 0 or info.compress_size < 0:
            raise UnsafeZipError(f"ZIP 条目大小非法: {info.filename!r}")
        if info.file_size > limits.max_single_file_bytes:
            raise UnsafeZipError(
                f"ZIP 单文件解压大小超限: {info.filename!r} "
                f"({info.file_size} > {limits.max_single_file_bytes})"
            )

        total_uncompressed += info.file_size
        total_compressed += info.compress_size
        if total_uncompressed > limits.max_total_uncompressed_bytes:
            raise UnsafeZipError(
                "ZIP 总解压大小超限: "
                f"{total_uncompressed} > {limits.max_total_uncompressed_bytes}"
            )
        if (
            _compression_ratio(info.file_size, info.compress_size)
            > limits.max_compression_ratio
        ):
            raise UnsafeZipError(f"ZIP 条目压缩比超限: {info.filename!r}")
        file_infos.append(info)

    if (
        _compression_ratio(total_uncompressed, total_compressed)
        > limits.max_compression_ratio
    ):
        raise UnsafeZipError("ZIP 总压缩比超限")

    return file_infos


def read_safe_zip_entries(
    zf: zipfile.ZipFile,
    *,
    include: Optional[Callable[[str], bool]] = None,
    limits: Optional[ZipSafetyLimits] = None,
) -> List[Tuple[str, bytes]]:
    """Validate an archive, then read selected files under hard byte budgets.

    Metadata is checked before decompression. Files are subsequently read in
    chunks and actual bytes are counted as a second line of defence against a
    forged central directory.
    """

    effective_limits = limits or get_zip_safety_limits()
    file_infos = _validate_archive_metadata(zf, effective_limits)
    entries: List[Tuple[str, bytes]] = []
    actual_total = 0

    for info in file_infos:
        if include is not None and not include(info.filename):
            continue

        chunks = []
        actual_file_size = 0
        try:
            with zf.open(info, "r") as source:
                while True:
                    chunk = source.read(_READ_CHUNK_SIZE)
                    if not chunk:
                        break
                    actual_file_size += len(chunk)
                    actual_total += len(chunk)
                    if actual_file_size > effective_limits.max_single_file_bytes:
                        raise UnsafeZipError(
                            f"ZIP 单文件实际解压大小超限: {info.filename!r}"
                        )
                    if actual_total > effective_limits.max_total_uncompressed_bytes:
                        raise UnsafeZipError("ZIP 实际总解压大小超限")
                    chunks.append(chunk)
        except UnsafeZipError:
            raise
        except Exception as exc:
            raise UnsafeZipError(
                f"读取 ZIP 条目失败: {info.filename!r}: {exc}"
            ) from exc

        if actual_file_size != info.file_size:
            raise UnsafeZipError(
                f"ZIP 条目声明大小与实际不一致: {info.filename!r}"
            )
        entries.append((info.filename, b"".join(chunks)))

    return entries
