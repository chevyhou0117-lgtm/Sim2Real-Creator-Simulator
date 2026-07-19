import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

from common.ErrorCode import ErrorCode
from exception.ExceptionClass import BusinessException
from service.FactoryProjectService import FactoryProjectService
from service.FactoryProjectVersionService import FactoryProjectVersionService


class FactoryProjectSoftDeleteTest(unittest.IsolatedAsyncioTestCase):
    async def test_project_lookup_excludes_soft_deleted_rows(self):
        result = Mock()
        result.scalar_one_or_none.return_value = None
        db = AsyncMock()
        db.execute.return_value = result

        with self.assertRaises(BusinessException):
            await FactoryProjectService()._get_project_or_raise("project-1", db)

        statement = db.execute.await_args.args[0]
        sql = str(statement.compile(compile_kwargs={"literal_binds": True})).lower()
        self.assertIn("factory_projects.is_deleted = false", sql)

    async def test_version_mutations_require_an_active_project(self):
        cases = (
            ("publish_version", SimpleNamespace(version_id="version-1", published_by="tester")),
            ("archive_version", SimpleNamespace(version_id="version-1")),
            (
                "switch_current_version",
                SimpleNamespace(project_id="project-1", version_id="version-1"),
            ),
            (
                "update_version",
                SimpleNamespace(version_id="version-1", version_name="renamed", remark=None),
            ),
            ("delete_version", SimpleNamespace(version_id="version-1")),
        )

        for method_name, dto in cases:
            with self.subTest(method=method_name):
                service = FactoryProjectVersionService()
                service._get_version_or_raise = AsyncMock(
                    return_value=SimpleNamespace(project_id="project-1")
                )
                service._get_project_or_raise = AsyncMock(
                    side_effect=BusinessException(ErrorCode.NOT_FOUND_ERROR)
                )
                db = AsyncMock()

                with self.assertRaises(BusinessException):
                    await getattr(service, method_name)(dto, db)

                service._get_project_or_raise.assert_awaited_once_with("project-1", db)
                db.commit.assert_not_awaited()
                db.delete.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
