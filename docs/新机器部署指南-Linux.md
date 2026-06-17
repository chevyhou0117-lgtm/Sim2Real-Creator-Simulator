# 新机器部署指南 · Linux 版（从零开始 · Docker 全栈 + 宿主 Kit）

把整套 **Sim2Real（运营模拟 + Creator + 3D 数字孪生）** 部署到**一台全新的 Linux 机器**上（Ubuntu 22.04/24.04 为例）。
形态：**5 个服务全部跑在 Docker 里**（两个后端 + 两个前端 + PostgreSQL），**Omniverse Kit 单独在宿主机原生运行**（要 NVIDIA GPU，不进 Docker）。

> Linux 是这套更顺的目标：镜像全是 Linux 原生（无 WSL2 中间层），且 Kit 看门狗代码本来就是 Linux 版。
> Windows 版见 [新机器部署指南.md](新机器部署指南.md)。

---

## 0. 总览

```
浏览器
 ├─ http://<HOST>:8080  sim 前端（运营模拟 UI）       ┐
 ├─ http://<HOST>:8081  aifactory 前端（Creator UI）  │  都在 Docker
 ├─ http://<HOST>:8000  sim 后端（仿真引擎，拥有 DB） │  (compose 5 服务)
 ├─ http://<HOST>:8129  aifactory 后端（资产/工厂）   │
 ├─       :5432         PostgreSQL（共享库）          ┘
 └─ (直连) Kit  :8011 /ov+/kit/playback ┐  原生跑在宿主机
            WebRTC :12333 / :12334     ┘  (NVIDIA GPU，不在 Docker)
```

`<HOST>`：单机演示 = `localhost`；远程访问 = 服务器 IP（见 §8）。

| 组件 | 端口 | 形态 |
|---|---|---|
| sim 前端 / aifactory 前端 | 8080 / 8081 | Docker（nginx） |
| sim 后端 / aifactory 后端 | 8000 / 8129 | Docker（FastAPI） |
| PostgreSQL | 5432 | Docker |
| Omniverse Kit | 8011 / 12333 / 12334 | **宿主原生**（GPU） |

---

## 1. 前置依赖

```bash
# Docker Engine + compose 插件（不是 Docker Desktop）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER        # 之后重新登录，免 sudo 跑 docker
docker compose version               # 确认有 compose v2 插件

# Git
sudo apt-get update && sudo apt-get install -y git

# NVIDIA 驱动（给宿主的 Kit 用；Kit 不进容器，故【不需要】nvidia-container-toolkit）
sudo apt-get install -y nvidia-driver-550   # 版本按你的卡选，装完重启
nvidia-smi                                   # 能列出 GPU 即可

# 构建 Kit 需要的系统构建链（仅构建 Kit 时要）
sudo apt-get install -y build-essential
```

> **不用单独装 Node / Python / 后端依赖**——前端在 Docker 里构建、后端在 Docker 里运行。
> headless 服务器（无显示器）也行：Kit 用 `--no-window` 离屏渲染 + WebRTC 串流，不需要 X server。

---

## 2. 拿代码 + 资产

```bash
# 2.1 主仓库（本项目）
git clone <本仓库地址> ~/Sim2Real-Creator-Simulation
# 源码在 源码/ 目录下（两处历史源码 bug 已在源码内修好，可直接构建）

# 2.2 Kit App（单独 clone）
git clone -b feat/aifactory-migration \
  https://github.com/chevyhou0117-lgtm/kit-app-template.git ~/kit-app-template

# 2.3 资产库（~31GB，不在 git 里，单独拷到本机，例如 /opt/sim2real/storage）
sudo mkdir -p /opt/sim2real/storage
# …用 rsync/scp 把资产拷进去…
```

资产目录顶层应包含：`thumbnails/ Library/ Line_Library/ Data/ `。
本指南用 **`<STORAGE>`** 代指它（如 `/opt/sim2real/storage`）。

```

---

## 3. 构建并启动 Kit（GPU，Docker 之外）

```bash
cd ~/kit-app-template
./repo.sh build        # 首次用 packman 联网拉 Kit SDK 109.0.3（数 GB），需外网/内网缓存 + build-essential
```

### 3.1 让 Kit 指向资产库
设置环境变量 `AIFACTORY_USD_ROOT=<STORAGE>`（Kit 从这里读 USD）：
```bash
export AIFACTORY_USD_ROOT=/opt/sim2real/storage
# 或写进 source/extensions/aifactory.service.setup/.../.env
```

### 3.2 启动 Kit
```bash
./repo.sh launch       # 选 fii.houyiming_streaming.kit
```
起来后监听 `:8011`（/ov + /kit/playback）、`:12333`（media）、`:12334`（signal）。

---

## 4. 配置并启动 Docker（5 个服务）

```bash
cd ~/Sim2Real-Creator-Simulation
cp docker/.env.demo.example docker/.env
```

### 4.1 编辑 `docker/.env`
```bash
POSTGRES_PASSWORD=postgres                       # 演示可默认；正式改强密码
AIFACTORY_STORAGE_HOST=/opt/sim2real/storage     # ★ 指向 §2.3 的 <STORAGE>

# 串流相关：单机演示用默认即可（浏览器/Kit/后端同机）
VITE_KIT_API_URL=http://localhost:8011
VITE_KIT_STREAM_URL=enabled                      # 非空=启用直连 WebRTC（不需要 5183 串流页）
VITE_BACKEND_DIRECT_URL=http://localhost:8000
VITE_KIT_STREAM_MODE=direct
```

### 4.2 对齐全厂场景 USD 的绝对路径（首次灌库前）
`md_creator_project.creator_url` 是**绝对路径**，由 `源码/sim_backend/seed_data/creator_project.csv` 灌入，默认是别的机器的路径。改成本机 Linux 绝对路径：
```
creator_url 改为：  /opt/sim2real/storage/Data/P9_animations/Houston_F_NV/demo520.usd
```
> 已灌过库再改的话，`down -v` 清库重灌，或直接改库里的 `creator_url`。

### 4.3 构建 + 启动
```bash
docker compose -f docker/docker-compose.demo.yml build      # 首次较慢（拉依赖 + 前端 npm ci）
docker compose -f docker/docker-compose.demo.yml up -d
docker compose -f docker/docker-compose.demo.yml logs -f sim-backend   # 看迁移 + 灌 P9 种子
```
启动链：`sim-postgres` 健康 → `sim-backend`（alembic 迁移 + 首次灌 P9 种子，含 aifactory 的 creator_tables）→ `aifactory-backend`（纯消费）+ 两个前端。

> **首次** `up` 建表 + 灌 P9 种子；之后 `up`/`restart`/`down→up` **都不重灌**（按 md_factory 是否为空门控 + 数据在持久卷 `sim_pgdata`）。只有 `down -v` 才重灌。
> `host.docker.internal`（aifactory 前端反代 /ov 到宿主 Kit 用）已在 compose 里用 `extra_hosts: host-gateway` 处理，Docker Engine 20.10+ 在 Linux 上支持，无需额外配置。

---

## 5. 验证

| 检查 | 方法 | 预期 |
|---|---|---|
| sim 后端 | `curl -s localhost:8000/health` / 开 `:8000/docs` | 200 / Swagger |
| aifactory 后端 | 开 `:8129/docs` | Swagger |
| 全部容器 | `docker compose -f docker/docker-compose.demo.yml ps` | 5 个都 healthy |
| sim 前端 | 开 `http://<HOST>:8080` | 页面渲染、接口不报错 |
| aifactory 前端 | 开 `http://<HOST>:8081` | 资产库列表 + 缩略图能显示 |
| 3D 串流 | sim 前端进方案 → 跑模拟 → 3D 回放页 | 视口出画面、随窗口自适应 |

---

## 6. 常用操作

```bash
docker compose -f docker/docker-compose.demo.yml down          # 停（保留数据）
docker compose -f docker/docker-compose.demo.yml down -v       # 停并清库（下次 up 重新迁移+灌）
# 改了前端代码 / stream.config.json / 任何 VITE_*（构建期烤入）→ 必须重 build
docker compose -f docker/docker-compose.demo.yml up -d --build sim-frontend
# 只改了运行时项（如 AIFACTORY_STORAGE_HOST）→ 不用 build，重建容器即可
docker compose -f docker/docker-compose.demo.yml up -d aifactory-backend
```
> `restart` 只重启进程，不换镜像/不应用 compose 改动——应用改动永远用 `up -d`（必要时 `--build`）。

---

## 7. 远程 / 多机访问（Linux 服务器常见场景）

GPU 机器常是 headless 服务器、浏览器在别的机器。这时 `localhost` 不再指 Kit 所在机，需要：

1. **前端按服务器 IP 重 build**（VITE_* 是构建期烤入的）：
   ```bash
   docker compose -f docker/docker-compose.demo.yml build sim-frontend \
     --build-arg VITE_KIT_API_URL=http://<SERVER_IP>:8011 \
     --build-arg VITE_BACKEND_DIRECT_URL=http://<SERVER_IP>:8000 \
     --build-arg VITE_KIT_STREAM_MODE=direct
   ```
   （或在 `docker/.env` 把这些设成 `<SERVER_IP>` 再 `build`。）
2. **改 WebRTC 连接目标**：把 `源码/sim_frontend/stream.config.json`（及 aifactory 的）里的 `server` 从 `127.0.0.1` 改成 `<SERVER_IP>`，重 build 前端。
3. **Kit 扩展 CORS** 放行前端源 `http://<SERVER_IP>:8080`。
4. **防火墙放行**给客户端：`8080 8081 8000 8129 8011 12333 12334`（如 `ufw allow`）。

---

## 8. 已知限制与排障

- **3D 黑屏**：① Kit 在跑且 `:8011/:12333/:12334` 在监听；② sim 前端跨域调 Kit，需 Kit 扩展 CORS 放行前端源；③ `VITE_KIT_API_URL` 指向 Kit 实际 /ov 端口（默认 8011）。
- **3D 只开场景不动画**：sim 后端 `:8000` 已发布（compose 已发布）、`VITE_BACKEND_DIRECT_URL` 是否可达。
- **缩略图 404 / 资产打不开**：`AIFACTORY_STORAGE_HOST` 没指对，或 **bind-mount 权限**（§2.3）——容器 uid 1000 读不到。
- **aifactory Creator 3D 报 `authenticate/accessToken`**：把其 `AppStream.tsx` local 配置 `authenticate` 改 `false`，重 build `aifactory-frontend`。
- **首次灌库失败**：看 `logs sim-backend`；确认 PG 起来、`creator_project.csv` 路径合法。
