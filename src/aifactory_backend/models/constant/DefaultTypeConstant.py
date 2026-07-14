

"""
默认线体类型 / 默认设备类型 节点的稳定标识（code）。

注意：asset_categories.id / parent_id 均为 String(36) UUID，且随环境 seed 变化，
不能硬编码具体 id（旧的 2001/2002 整型 id 已随 schema 迁移到 UUID 而失效）。
上传新建线体/设备时，按 code 在运行期反查默认类型节点的真实 id 作为 parent_id。
"""
DEFAULT_LINE_TYPE_CODE = "Default_Line_Type"
DEFAULT_EQUIPMENT_TYPE_CODE = "Default_Equipment_Type"
