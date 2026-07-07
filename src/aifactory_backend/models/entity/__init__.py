"""导入本包下全部 *Entity 子模块，确保所有 ORM 表在 `import models.entity`
时即注册进 Base.metadata。

为什么必须这样：SQLAlchemy 对字符串外键（如 factory_asset_node.type ->
instance_asset_type_dict.code）是「惰性解析」——配置 mapper / flush 时才去
Base.metadata 里按表名查被引用表。被引用表的模型若没被 import，就不在 metadata 里，
解析时报 "could not find table 'instance_asset_type_dict'"。

历史 bug：本包原本没有 __init__.py（PEP 420 命名空间包），main.py 的
`import models.entity` 其实不会导入任何子模块。多数实体靠 service/router 间接
import 才注册；而未被任何 service 引用的字典表（instance_asset_type_dict）漏注册，
导致建工厂项目（插入 factory_asset_node）时 FK 解析失败。这里集中、无遗漏地导入。
"""
import importlib
import pkgutil

for _module in pkgutil.iter_modules(__path__):
    importlib.import_module(f"{__name__}.{_module.name}")
