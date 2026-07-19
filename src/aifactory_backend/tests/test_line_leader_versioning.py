import unittest
from unittest.mock import AsyncMock, patch

from models.dto.LineLeaderDto import (
    LineLeaderCreateDto,
    LineLeaderQueryDto,
    LineLeaderUpdateDto,
)
from models.entity.FactoryAssetNodeEntity import FactoryAssetNode
from models.entity.FactoryProjectVersionEntity import FactoryProjectVersion
from models.entity.LineLeaderEntity import LineLeader
from models.enums.InstanceAssetTypeEnum import InstanceAssetType
from service.FactoryAssetNodeService import FactoryAssetNodeService
from service.FactoryProjectService import FactoryProjectService
from service.LineLeaderService import LineLeaderService


class _ScalarCollection:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)


class _Result:
    def __init__(self, scalar=None, rows=None):
        self._scalar = scalar
        self._rows = [] if rows is None else rows

    def scalar_one_or_none(self):
        return self._scalar

    def scalar_one(self):
        return self._scalar

    def scalars(self):
        return _ScalarCollection(self._rows)

    def all(self):
        return list(self._rows)


class _FakeDb:
    def __init__(self, responses=None):
        self.responses = list(responses or [])
        self.statements = []
        self.added = []
        self.deleted = []
        self._generated = 0

    async def execute(self, statement):
        self.statements.append(statement)
        if self.responses:
            return self.responses.pop(0)
        return _Result()

    def add(self, entity):
        self.added.append(entity)
        if hasattr(entity, "id") and entity.id is None:
            self._generated += 1
            entity.id = f"generated-{self._generated}"

    async def flush(self):
        return None

    async def commit(self):
        return None

    async def rollback(self):
        return None

    async def refresh(self, entity):
        return None

    async def delete(self, entity):
        self.deleted.append(entity)


class LineLeaderVersioningTest(unittest.IsolatedAsyncioTestCase):
    def test_read_scope_is_active_current_draft_line_only(self):
        statement = LineLeaderService._active_current_draft_select(LineLeader)
        sql = str(statement.compile(compile_kwargs={"literal_binds": True}))

        self.assertIn("factory_asset_node.is_deleted = false", sql)
        self.assertIn("factory_asset_node.type = 'LINE'", sql)
        self.assertIn("factory_project_version.is_current = true", sql)
        self.assertIn("factory_project_version.version_status = 'DRAFT'", sql)
        self.assertIn("factory_projects.is_deleted = false", sql)

    async def test_empty_query_still_uses_bounded_default_page(self):
        db = _FakeDb([_Result(scalar=0), _Result(rows=[])])

        page = await LineLeaderService().query_line_leaders(
            LineLeaderQueryDto(),
            db,
        )

        page_sql = str(
            db.statements[-1].compile(compile_kwargs={"literal_binds": True})
        )
        self.assertIn("LIMIT 10", page_sql)
        self.assertIn("OFFSET 0", page_sql)
        self.assertEqual(page.pageSize, 10)

    async def test_create_update_and_delete_all_use_editable_line_guard(self):
        service = LineLeaderService()
        node_id = "node-current-draft"
        leader_id = "leader-id"

        create_db = _FakeDb([_Result(scalar=None)])
        create_guard = AsyncMock()
        with patch(
            "service.LineLeaderService._asset_node_service.ensure_node_editable",
            create_guard,
        ):
            result = await service.create_line_leader(
                LineLeaderCreateDto(
                    factory_asset_id=node_id,
                    line_leader_name="Alice",
                ),
                create_db,
            )
        self.assertEqual(result, "generated-1")
        create_guard.assert_awaited_once_with(
            node_id,
            create_db,
            InstanceAssetType.LINE,
        )

        update_entity = LineLeader(id=leader_id, factory_asset_id=node_id)
        update_db = _FakeDb([_Result(scalar=update_entity)])
        update_guard = AsyncMock()
        with patch(
            "service.LineLeaderService._asset_node_service.ensure_node_editable",
            update_guard,
        ):
            result = await service.update_line_leader(
                leader_id,
                LineLeaderUpdateDto(id=leader_id),
                update_db,
            )
        self.assertEqual(result, leader_id)
        update_guard.assert_awaited_once_with(
            node_id,
            update_db,
            InstanceAssetType.LINE,
        )

        delete_entity = LineLeader(id=leader_id, factory_asset_id=node_id)
        delete_db = _FakeDb([_Result(scalar=delete_entity)])
        delete_guard = AsyncMock()
        with patch(
            "service.LineLeaderService._asset_node_service.ensure_node_editable",
            delete_guard,
        ):
            result = await service.delete_line_leader(leader_id, delete_db)
        self.assertEqual(result, leader_id)
        self.assertEqual(delete_db.deleted, [delete_entity])
        delete_guard.assert_awaited_once_with(
            node_id,
            delete_db,
            InstanceAssetType.LINE,
        )

    async def test_tree_copy_invokes_line_leader_copy_for_line_nodes(self):
        source_node = FactoryAssetNode(
            id="source-line",
            factory_projects_id="source-project",
            version_id="source-version",
            name="Line A",
            type=InstanceAssetType.LINE.value,
            parent_id=None,
            bind_status="BOUND",
        )
        db = _FakeDb([
            _Result(rows=[source_node]),
            _Result(rows=[]),
        ])
        service = FactoryProjectService()

        with (
            patch.object(service, "_copy_node_details", AsyncMock()) as copy_details,
            patch.object(service, "_copy_line_leaders", AsyncMock()) as copy_leaders,
        ):
            summary = await service._copy_asset_tree(
                "source-version",
                "target-version",
                "target-project",
                db,
            )

        copied_node = next(
            entity for entity in db.added if isinstance(entity, FactoryAssetNode)
        )
        copy_details.assert_awaited_once_with(source_node, copied_node.id, db)
        copy_leaders.assert_awaited_once_with(source_node.id, copied_node.id, db)
        self.assertEqual(summary["copied_nodes"], 1)

    async def test_line_leader_copy_preserves_fields_and_rebinds_node(self):
        source = LineLeader(
            id="source-leader",
            factory_asset_id="source-line",
            line_leader_name="Alice",
            employee_id="E100",
            contact_number="123",
            email="alice@example.com",
            shift_schedule="day",
            shift_a_leader="A",
            shift_b_leader="B",
            shift_c_leader="C",
        )
        db = _FakeDb([_Result(rows=[source])])

        await FactoryProjectService()._copy_line_leaders(
            "source-line",
            "target-line",
            db,
        )

        copied = db.added[0]
        self.assertEqual(copied.factory_asset_id, "target-line")
        self.assertEqual(copied.line_leader_name, source.line_leader_name)
        self.assertEqual(copied.employee_id, source.employee_id)
        self.assertEqual(copied.shift_c_leader, source.shift_c_leader)

    async def test_node_soft_delete_physically_cleans_line_leaders(self):
        node = FactoryAssetNode(
            id="line-node",
            factory_projects_id="project",
            version_id="version",
            name="Line A",
            type=InstanceAssetType.LINE.value,
            parent_id=None,
        )
        version = FactoryProjectVersion(
            version_id="version",
            project_id="project",
            version_number=1,
            version_status="DRAFT",
            is_current=True,
        )
        db = _FakeDb([
            _Result(scalar=node),
            _Result(scalar=version),
            _Result(rows=[node]),
        ])

        result = await FactoryAssetNodeService().delete_node(node.id, db)

        self.assertEqual(result, node.id)
        delete_statements = [
            statement
            for statement in db.statements
            if getattr(statement, "is_delete", False)
        ]
        self.assertEqual(len(delete_statements), 1)
        self.assertEqual(delete_statements[0].table.name, "line_leaders_info")


if __name__ == "__main__":
    unittest.main()
