import ast
import unittest
from pathlib import Path


SERVICE_PATH = (
    Path(__file__).resolve().parents[1]
    / "service"
    / "FactoryProjectService.py"
)


class FactoryProjectCopyVersionScopeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = ast.parse(SERVICE_PATH.read_text(encoding="utf-8"))
        cls.service_class = next(
            node
            for node in cls.module.body
            if isinstance(node, ast.ClassDef)
            and node.name == "FactoryProjectService"
        )

    @classmethod
    def method(cls, name: str) -> ast.AsyncFunctionDef:
        return next(
            node
            for node in cls.service_class.body
            if isinstance(node, ast.AsyncFunctionDef) and node.name == name
        )

    def test_project_copy_delegates_to_selected_version_tree_copier(self):
        method = self.method("copy_factory_project")
        copier_calls = [
            node
            for node in ast.walk(method)
            if isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "_copy_asset_tree"
        ]
        self.assertEqual(len(copier_calls), 1)

        keywords = {
            keyword.arg: ast.unparse(keyword.value)
            for keyword in copier_calls[0].keywords
        }
        self.assertEqual(keywords["source_version_id"], "src_version.version_id")
        self.assertEqual(keywords["target_version_id"], "new_version_id")
        self.assertEqual(keywords["target_project_id"], "new_project_id")

        # copy_factory_project must not maintain a second project-wide node copier.
        referenced_names = {
            node.id for node in ast.walk(method) if isinstance(node, ast.Name)
        }
        self.assertNotIn("FactoryAssetNode", referenced_names)

    def test_selected_current_version_is_verified_against_source_project(self):
        source = ast.unparse(self.method("copy_factory_project"))
        self.assertIn(
            "FactoryProjectVersion.project_id == source_project_id",
            source,
        )
        self.assertIn("if src_version is None:", source)
        self.assertIn("ErrorCode.DATA_NOT_FOUND", source)

    def test_complete_tree_copier_is_version_scoped(self):
        source = ast.unparse(self.method("_copy_asset_tree"))
        self.assertIn(
            "FactoryAssetNode.version_id == source_version_id",
            source,
        )
        self.assertIn("self._copy_node_details", source)
        self.assertIn("self._copy_3d_models", source)
        self.assertIn("node.parent_id in id_mapping", source)
        self.assertIn("values(parent_id=new_parent_id)", source)


if __name__ == "__main__":
    unittest.main()
