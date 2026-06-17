# 资产上传 ZIP 目录结构规范

> 对应接口：`POST /api/v1/asset-upload/upload`（[AssetUploadController.py](../routers/AssetUploadController.py) → [AssetUploadService.py](../service/AssetUploadService.py)）
> 表单字段：`type`（`factory` / `line` / `equipment`）+ `file`（`.zip`）

**核心结论：入库以 ProdLine / 设备文件夹为单位，Assembly（`a_xxx.usd`）不参与上传解析。**

ZIP 必须有**唯一的顶层根目录**（取第一个条目的第一段作为 root）。

---

## 一、设备模型上传（`type=equipment`）—— 必须先传

每个**顶层子文件夹 = 一台设备模型**，文件夹内的主 USD **必须与文件夹同名**。

```
EquipLib/                                  ← ZIP 根目录（名字随意）
├── FF460Z0018_JY/
│   ├── FF460Z0018_JY.usd                  ← 主 USD，必须 = 文件夹名.usd（root_usd_path）
│   ├── textures/...                        ← 贴图等附属文件，原样保留层级
│   └── ...
├── KUKA_KR6/
│   └── KUKA_KR6.usd
└── ...
```

入库结果：
- 落盘到 `storage/Library/Asset/EquipLib/...`（保留完整层级）
- 每个子文件夹 → `asset_categories`（`type=equipment_model`）+ `equipment_model_details`
- `root_usd_path` = `Library/Asset/EquipLib/FF460Z0018_JY/FF460Z0018_JY.usd`
- 同名设备已存在则只覆盖文件、不重建 DB 记录

---

## 二、线体/工厂模型上传（`type=line` 或 `factory`）—— 设备传完再传

ZIP 根目录下必须有 `ProdLine/`，其**每个直属子文件夹 = 一条线体模型**。

```
MyFactory/                                 ← ZIP 根目录 = location_path
└── ProdLine/
    ├── L_HST_Module/                       ← 一条线体模型
    │   ├── L_HST_Module.usd                ← 线体主 USD，必须 = 文件夹名.usd（root_usd_path）
    │   └── Machine/                         ← 该线体上的设备实例
    │       ├── id_FF460Z0018_JY_JY01.usd
    │       ├── id_FF460Z0018_JY_JY02.usd
    │       └── id_KUKA_KR6_R01.usd
    ├── L_HST_PACK/
    │   ├── L_HST_PACK.usd
    │   └── Machine/
    │       └── ...
    └── ...
```

入库结果：
- 落盘到 `storage/MyFactory/...`（保留完整层级，`minio_prefix=""`）
- 每个 `ProdLine/<线体名>/` → `asset_categories`（`type=line_model`）+ `line_model_details`
- `root_usd_path` = `MyFactory/ProdLine/L_HST_Module/L_HST_Module.usd`
- `Machine/*.usd` 每个文件 → 反查并绑定到设备模型，写入 `line_model_equipment_rel`
- 增量更新：按 `location_path` 比对，ZIP 里没了的线体会被删除（连同关系记录）

### Machine 设备实例 → 设备模型 的绑定规则
文件名按关键词模糊匹配已入库的 `equipment_model`：

| 实例文件名 | 提取关键词（去 `id_` 前缀 + 去最后一段 `_xxx`） | 匹配目标 |
|---|---|---|
| `id_FF460Z0018_JY_JY01.usd` | `FF460Z0018_JY` | `asset_categories.name ILIKE %FF460Z0018_JY%`（type=equipment_model）|
| `KUKA_KR6_R01.usd` | `KUKA_KR6` | 同上 |

> ⚠️ **匹配不到就跳过绑定**（只记 warning）。所以**必须先传设备模型、再传线体**，否则 `Machine/` 里的设备绑不上。

---

## 命名硬性约束（否则该项被静默跳过）
1. ZIP 只有**一个顶层根目录**。
2. 线体主 USD 名 = 其文件夹名：`ProdLine/<X>/<X>.usd`。
3. 设备主 USD 名 = 其文件夹名：`<Y>/<Y>.usd`。
4. `Machine/` 下只认**直属** `.usd` 文件（不进子目录）。
5. 设备实例文件名建议 `id_<设备模型关键词>_<编号>.usd`，关键词要能 ILIKE 命中已入库设备模型名。

## 不需要放进 ZIP 的东西
- **`a_<线体名>.usd`（Assembly）**：上传完全不解析。Assembly 是运行时由 ProdLine 拼装生成的产物（kit 扩展 `build_prod_line_assembly`），不是入库输入。
- 缩略图：上传后默认用占位图；如需自定义走单独接口 `POST /api/v1/asset-upload/upload-thumbnail`，再把返回的 `thumbnails/xxx.png` 写到对应记录的 `thumbnail_path`。

---

## 推荐操作顺序
1. 先传**全部设备模型**（`type=equipment`，一个或多个 ZIP）。
2. 再传**线体/工厂模型**（`type=line`），此时 `Machine/` 才能正确绑定到设备模型。
3. （可选）逐个上传缩略图并回填 `thumbnail_path`。
