# 部署指南（dist 前端 + Kit App 构建版）

把 **sim / aifactory 全栈**部署到一台机器上：前端用**构建好的 `dist` 静态包**（不再 `npm run dev`），由 **nginx** 托管 + 反代后端；3D 部分用 **git clone 的 kit-app-template（Kit 109.0.3）构建出来的 Kit App**。

> 与 [`新机器部署指南.md`](新机器部署指南.md) 的区别：那份是**开发模式**（前端 `npm run dev`、四个常驻终端）；本份是**部署形态**（前端 dist + nginx、Kit 走构建产物）。数据库/种子/后端依赖那部分两份是一样的。

---

## 0. 架构与端口总览

```
浏览器
  ├─(http)──► nginx :8080  ──► sim_frontend_dist (静态)
  │                          └─ /api      ─► sim 后端      :8000
  ├─(http)──► nginx :8081  ──► aifactory_frontend_dist (静态)
  │                          ├─ /api /static ─► aifactory 后端 :8129
  │                          └─ /ov          ─► Kit aifactory.service :8011
  ├─(http 直连)──► Kit aifactory.service     :8011   (sim 前端 VITE_KIT_API_URL 也直连这个)
  └─(WebRTC 直连)► Kit 流媒体  media :12333 / signal :12334
```

| 组件 | 端口 | 形态 | 由谁提供 |
|---|---|---|---|
| sim 前端 | 8080（nginx） | dist 静态 | nginx |
| aifactory 前端 | 8081（nginx） | dist 静态 | nginx |
| sim 后端 | 8000 | Python/uvicorn | 源码 + venv |
| aifactory 后端 | 8129 | Python/uvicorn | 源码 + venv |
| Kit aifactory.service（`/ov`） | 8011 | Kit 扩展(FastAPI) | Kit App |
| Kit fastapi.service（sim http） | 8233 | Kit 扩展(FastAPI) | Kit App |
| Kit 流媒体 media / signal | 12333 / 12334 | WebRTC | Kit App |
| PostgreSQL | 5432 | DB | 原生/Docker |

**交付物清单**（`Downloads/bushu/`）：
- `sim_backend.zip` / `aifactory_backend.zip` —— 后端源码（不含 `.venv`）
- `sim_frontend_dist/` / `aifactory_frontend_dist/` —— 前端构建产物
- Kit 定制件：`source/apps/fii.*` + 6 个定制扩展（见 §5，或直接 clone Kit 仓库分支）

---

## 1. 前置依赖

| 依赖 | 版本 | 用途 | 备注 |
|---|---|---|---|
| **PostgreSQL** | 16.x | sim/aifactory 共用库 | 原生或 Docker 皆可 |
| **Python** | 3.11 | 两个后端运行时 | 目标机必须装 |
| **nginx** | 任意稳定版 | 托管 dist + 反代 | Windows 版解压即用 |
| **Node.js** | 22 | **仅构建期**需要 | 部署机若已有 dist，可不装 |
| **NVIDIA RTX GPU + 驱动** | 较新驱动 | Kit 渲染/流送 | 无 GPU 则 3D 不可用，其余功能不受影响 |

> dist 已是静态文件，**部署机不需要 Node**；Node 只在"生成 dist"的构建机上要。同理 VS Build Tools 只在"构建 Kit"的机器上要。

---

## 2. 数据库（建表 + 灌种子）

不用手动导 SQL，代码自动建表/灌种子。先确保 PG 在跑、库 `aifactory_simulation` 已建（账号 `postgres/postgres@localhost:5432`）。

有 Docker 的话：
```powershell
docker compose up -d sim-postgres   # 建容器 + 空库 aifactory_simulation:5432
```

建表 + 灌种子（由 sim 后端驱动，**它拥有表结构**）：
```powershell
cd codes\sim_backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e .
.\.venv\Scripts\python.exe -m alembic upgrade head      # 建/升级表
.\.venv\Scripts\python.exe load_seed.py --reset         # 灌主数据 + 资产库 CSV
```
> `--reset` = drop + 重新迁移 + 全量重灌；增量只跑 `load_seed.py`（不带 `--reset`）。

---

## 3. 后端部署（解压 zip → 装依赖 → 配 .env）

两个后端都是 Python，**解压源码 zip、各建一个 venv、装依赖、配 `.env`** 即可。

**① sim 后端（:8000）**
```powershell
# 解压 sim_backend.zip 到目标目录后：
cd sim_backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e .       # 依赖来自 pyproject.toml
Copy-Item .env.example .env                           # 按需改 .env
```
（§2 已用它建过表，这里只是运行时。）

**② aifactory 后端（:8129）**
```powershell
cd aifactory_backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```
- aifactory 纯消费 sim 建的表，**必须先做完 §2**。
- `.env` 关键项：DB 连接、`AIFACTORY_STORAGE_ROOT`（资产/缩略图/USD 根，见 §6）。

**启动（生产用 `--reload` 去掉）**
```powershell
# sim
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
# aifactory
.\.venv\Scripts\python.exe -m uvicorn main:app --port 8129
```

---

## 4. 前端部署（dist + nginx）

dist部署这块我不太清楚，请部署老师自行决定，或者直接用npm install起前端。

---

## 5. Kit App 部署



### 5.1 取得 kit-app-template

直接 clone 已含全部定制件的仓库分支：
```powershell
git clone -b feat/aifactory-migration https://github.com/chevyhou0117-lgtm/kit-app-template.git
```


### 5.2 构建

```powershell
cd kit-app-template
.\repo.bat build
```
- **首次构建会联网用 packman 拉 Kit SDK 109.0.3（数 GB）**，需外网或内网 packman 缓存。
- 需要 **VS Build Tools（C++ 工作负载）**。


### 5.3 启动

```powershell
.\repo.bat launch  
然后选 fii.houyiming_streaming.kit
```
起来后监听：`:8011`（aifactory.service /ov）、`:8233`（fastapi.service）、`:12333/:12334`（WebRTC 流）。

---

## 6. 资产/存储大文件 + 全厂场景 USD

git 里只有数据库 CSV（含**相对路径**），实际大文件不在 git，需另行拷贝。

**aifactory 资产文件（约 31 GB，配 `AIFACTORY_STORAGE_ROOT`）**：把整个目录拷到目标机，改 `codes/aifactory_backend/.env` 的 `AIFACTORY_STORAGE_ROOT` 指向它（正斜杠，如 `d:/Sim2Real/storage`）。其下三个子目录：

| 子目录 | 内容 | DB 列引用（值为相对路径） |
|---|---|---|
| `thumbnails/` | 缩略图（~21 MB） | `*.thumbnail_path` |
| `Library/` | 设备 USD（~31 GB） | `equipment_model_details.root_usd_path` |
| `Line_Library/` | 线体 USD（~2.6 MB） | `line_model_details.root_usd_path` |

DB 里路径全是相对（相对该根），换机器只改 `AIFACTORY_STORAGE_ROOT`、DB 无需动。

**全厂场景 USD（Kit 渲染用，绝对路径）**：`md_creator_project.creator_url`（如 `D:/Sim2Real/Data/P9_animations/.../demo520.usd`）是**绝对路径**，由 `seed_data/creator_project.csv` 灌入。若目标机该 USD 路径不同，需改这个 CSV 的绝对路径后重灌。

---

## 7. 启动顺序与验证

启动顺序：**PG → sim 后端(:8000) → aifactory 后端(:8129) → Kit App → nginx**。

| 检查 | 方法 | 预期 |
|---|---|---|
| sim 后端 | 浏览器开 `http://IP:8000/docs` | Swagger 文档 |
| aifactory 后端 | `http://IP:8129/docs` | Swagger 文档 |
| Kit | `dev.ps1 status` 或看端口 | 8011/8233/12333/12334 监听 |
| sim 前端 | `http://IP:8080` | 页面渲染、接口不报 502 |
| aifactory 前端 | `http://IP:8081` | 资产库列表、缩略图能显示 |
| 3D 流送 | 进入 3D 页 | WebRTC 视口出画面 |
