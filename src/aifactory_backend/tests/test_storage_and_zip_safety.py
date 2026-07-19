import io
import os
import stat
import tempfile
import unittest
import zipfile
from unittest.mock import patch

from commonutils.StoragePathUtils import (
    UnsafeStoragePathError,
    resolve_path_within_root,
)
from commonutils.ZipSafetyUtils import (
    UnsafeZipError,
    ZipSafetyLimits,
    get_zip_safety_limits,
    read_limited_upload,
    read_safe_zip_entries,
)


def _make_zip(entries, *, compression=zipfile.ZIP_STORED):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=compression) as zf:
        for name, content in entries:
            zf.writestr(name, content)
    return buffer.getvalue()


def _read_entries(archive, *, limits=None, include=None):
    with zipfile.ZipFile(io.BytesIO(archive)) as zf:
        return read_safe_zip_entries(zf, limits=limits, include=include)


class StoragePathSafetyTest(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.storage_root = os.path.join(self.temp_dir.name, "storage")
        os.mkdir(self.storage_root)

    def test_valid_relative_path_resolves_below_root(self):
        result = resolve_path_within_root(
            self.storage_root, "Library/Asset/model.usd"
        )
        self.assertEqual(
            result,
            os.path.join(self.storage_root, "Library", "Asset", "model.usd"),
        )

    def test_rejects_traversal_absolute_and_windows_paths(self):
        unsafe_names = (
            "../escape.txt",
            "safe/../../escape.txt",
            "..\\escape.txt",
            "safe\\file.usd",
            "/tmp/escape.txt",
            "C:/tmp/escape.txt",
            "C:\\tmp\\escape.txt",
            "\\\\server\\share\\escape.txt",
            ".",
        )
        for name in unsafe_names:
            with self.subTest(name=name):
                with self.assertRaises(UnsafeStoragePathError):
                    resolve_path_within_root(self.storage_root, name)

    def test_common_prefix_does_not_count_as_containment(self):
        with self.assertRaises(UnsafeStoragePathError):
            resolve_path_within_root(
                self.storage_root, "../storage-backup/escape.txt"
            )

    def test_existing_symlink_cannot_redirect_outside_root(self):
        outside = os.path.join(self.temp_dir.name, "outside")
        os.mkdir(outside)
        link = os.path.join(self.storage_root, "linked")
        try:
            os.symlink(outside, link)
        except (OSError, NotImplementedError):
            self.skipTest("symlinks are unavailable on this platform")

        with self.assertRaises(UnsafeStoragePathError):
            resolve_path_within_root(self.storage_root, "linked/escape.txt")


class ZipSafetyTest(unittest.TestCase):
    def setUp(self):
        self.generous_limits = ZipSafetyLimits(
            max_entries=100,
            max_single_file_bytes=1024 * 1024,
            max_total_uncompressed_bytes=2 * 1024 * 1024,
            max_compression_ratio=10_000,
        )

    def test_valid_archive_is_read_in_memory(self):
        archive = _make_zip(
            [("Root/model.usd", b"usd"), ("Root/Data/items.csv", b"a,b")]
        )
        self.assertEqual(
            _read_entries(archive, limits=self.generous_limits),
            [("Root/model.usd", b"usd"), ("Root/Data/items.csv", b"a,b")],
        )

    def test_rejects_all_path_traversal_and_absolute_variants(self):
        unsafe_names = (
            "../escape.txt",
            "Root/../../escape.txt",
            "..\\escape.txt",
            "Root\\..\\escape.txt",
            "/tmp/escape.txt",
            "C:/tmp/escape.txt",
            "C:\\tmp\\escape.txt",
            "\\\\server\\share\\escape.txt",
        )
        for name in unsafe_names:
            with self.subTest(name=name):
                archive = _make_zip([(name, b"payload")])
                with self.assertRaises(UnsafeZipError):
                    _read_entries(archive, limits=self.generous_limits)

    def test_business_filter_cannot_hide_an_unsafe_entry(self):
        archive = _make_zip([("../ignored.txt", b"payload")])
        with self.assertRaises(UnsafeZipError):
            _read_entries(
                archive,
                limits=self.generous_limits,
                include=lambda _name: False,
            )

    def test_rejects_entry_count_limit(self):
        archive = _make_zip([("Root/a", b"a"), ("Root/b", b"b")])
        limits = ZipSafetyLimits(1, 100, 100, 100)
        with self.assertRaises(UnsafeZipError):
            _read_entries(archive, limits=limits)

    def test_rejects_single_file_size_limit(self):
        archive = _make_zip([("Root/large", b"12345")])
        limits = ZipSafetyLimits(10, 4, 100, 100)
        with self.assertRaises(UnsafeZipError):
            _read_entries(archive, limits=limits)

    def test_rejects_total_uncompressed_size_limit(self):
        archive = _make_zip([("Root/a", b"123"), ("Root/b", b"456")])
        limits = ZipSafetyLimits(10, 10, 5, 100)
        with self.assertRaises(UnsafeZipError):
            _read_entries(archive, limits=limits)

    def test_rejects_excessive_compression_ratio(self):
        archive = _make_zip(
            [("Root/bomb", b"0" * 100_000)], compression=zipfile.ZIP_DEFLATED
        )
        limits = ZipSafetyLimits(10, 200_000, 200_000, 5)
        with self.assertRaises(UnsafeZipError):
            _read_entries(archive, limits=limits)

    def test_rejects_symlink_entry(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as zf:
            info = zipfile.ZipInfo("Root/link")
            info.create_system = 3
            info.external_attr = (stat.S_IFLNK | 0o777) << 16
            zf.writestr(info, "../../outside")
        with self.assertRaises(UnsafeZipError):
            _read_entries(buffer.getvalue(), limits=self.generous_limits)

    def test_environment_overrides_are_loaded_per_request(self):
        env = {
            "AIFACTORY_ZIP_MAX_ENTRIES": "7",
            "AIFACTORY_ZIP_MAX_SINGLE_FILE_BYTES": "11",
            "AIFACTORY_ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES": "19",
            "AIFACTORY_ZIP_MAX_COMPRESSION_RATIO": "3.5",
            "AIFACTORY_ZIP_MAX_ARCHIVE_BYTES": "23",
        }
        with patch.dict(os.environ, env):
            self.assertEqual(
                get_zip_safety_limits(),
                ZipSafetyLimits(7, 11, 19, 3.5, 23),
            )

    def test_invalid_environment_override_fails_closed(self):
        with patch.dict(
            os.environ, {"AIFACTORY_ZIP_MAX_ENTRIES": "not-a-number"}
        ):
            with self.assertRaises(UnsafeZipError):
                get_zip_safety_limits()


class _AsyncUpload:
    def __init__(self, content):
        self.content = content
        self.offset = 0
        self.read_sizes = []

    async def read(self, size):
        self.read_sizes.append(size)
        chunk = self.content[self.offset:self.offset + size]
        self.offset += len(chunk)
        return chunk


class UploadSizeSafetyTest(unittest.IsolatedAsyncioTestCase):
    async def test_reads_upload_in_bounded_chunks(self):
        upload = _AsyncUpload(b"12345678")
        self.assertEqual(
            await read_limited_upload(
                upload, max_archive_bytes=8, chunk_size=3
            ),
            b"12345678",
        )
        self.assertTrue(all(size <= 3 for size in upload.read_sizes))

    async def test_rejects_upload_one_byte_over_limit(self):
        upload = _AsyncUpload(b"123456789")
        with self.assertRaises(UnsafeZipError):
            await read_limited_upload(
                upload, max_archive_bytes=8, chunk_size=64
            )
        self.assertEqual(upload.offset, 9)


if __name__ == "__main__":
    unittest.main()
