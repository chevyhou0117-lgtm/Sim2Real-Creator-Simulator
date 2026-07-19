"""Helpers for resolving untrusted object names below a local storage root."""

from __future__ import annotations

import os
from pathlib import PurePosixPath, PureWindowsPath


class UnsafeStoragePathError(ValueError):
    """Raised when an object name could resolve outside its configured root."""


def resolve_path_within_root(root: str, object_name: str) -> str:
    """Resolve ``object_name`` below ``root`` and reject ambiguous paths.

    Storage object names use POSIX separators on every platform. Rejecting
    backslashes prevents a value from being interpreted differently by Linux
    and Windows hosts. ``realpath`` also prevents an existing symlink below
    the storage directory from redirecting a write outside the root.
    """

    if not isinstance(root, str) or not root.strip():
        raise UnsafeStoragePathError("存储根目录不能为空")
    if not isinstance(object_name, str) or not object_name:
        raise UnsafeStoragePathError("存储对象路径不能为空")
    if "\x00" in object_name:
        raise UnsafeStoragePathError("存储对象路径不能包含 NUL 字符")
    if "\\" in object_name:
        raise UnsafeStoragePathError("存储对象路径必须使用正斜杠")

    posix_path = PurePosixPath(object_name)
    windows_path = PureWindowsPath(object_name)
    if (
        posix_path.is_absolute()
        or windows_path.is_absolute()
        or bool(windows_path.drive)
        or bool(windows_path.root)
    ):
        raise UnsafeStoragePathError("存储对象路径必须是相对路径")

    components = object_name.split("/")
    if ".." in components:
        raise UnsafeStoragePathError("存储对象路径不能包含 '..'")

    # Never allow an object name to alias the root itself. This matters for
    # callers such as delete_files_by_prefix(), which recursively delete.
    normalized_object_name = os.path.normpath(object_name)
    if normalized_object_name in ("", "."):
        raise UnsafeStoragePathError("存储对象路径必须指向根目录下的对象")

    root_path = os.path.realpath(os.path.abspath(root))
    candidate_path = os.path.realpath(
        os.path.abspath(os.path.join(root_path, *object_name.split("/")))
    )
    try:
        common_path = os.path.commonpath((root_path, candidate_path))
    except ValueError as exc:
        raise UnsafeStoragePathError("存储对象路径不在存储根目录内") from exc
    if common_path != root_path or candidate_path == root_path:
        raise UnsafeStoragePathError("存储对象路径不在存储根目录内")

    return candidate_path
