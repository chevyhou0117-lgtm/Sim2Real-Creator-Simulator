# 后端 Docker 化 · 单机本机演示（docker-compose.demo.yml）

把 **两个后端 + PostgreSQL + 两个前端** 用 Compose 跑在一台机器上，用已 seed 的 **P9 工厂**验证 3D 串流。
Omniverse Kit（需 RTX GPU）独立运行：Linux 推荐容器加入 Compose 网络，Windows 仍可在宿主原生运行。

---

## 0. 前置

| 依赖 | 说明 |
|---|---|
| Docker Desktop | 已验证 Docker 29.x + Compose v5；Windows 用 WSL2 后端 |
| Omniverse Kit App | Linux：`docker/run-kit-linux.sh`；Windows：宿主原生 Kit。sim 控制面 `:8233`；Creator 控制面 `:8011`（Linux 仅 Docker 内网）；WebRTC `:12333/:12334` |
| （可选）资产库 | 缩略图/USD 大文件（~31GB）。仅 aifactory 资产页/下载需要；只验证 sim 串流可不挂 |

> 本机演示意味着：浏览器、Kit、后端容器都在同一台机。所以前端里烤死的 `localhost` 地址可直接用，无需按 IP 重构。

## 1. 起服务

```powershell
# （可选）覆盖默认值
Copy-Item docker/.env.demo.example docker/.env   # 按需改密码/资产目录/Kit 端口

# 必填：生成 Creator 登录/后端写接口密钥并填入 docker/.env 的 CREATOR_API_KEY
openssl rand -hex 32
# 浏览器访问 :8081 时：用户名 creator（可由 CREATOR_AUTH_USERNAME 改），密码即该密钥
# Basic Auth 仅编码、不加密；跨机器访问必须在前置反向代理启用 HTTPS，或只在可信内网/VPN 使用。

# Windows 宿主原生 Kit 必须改这项；Linux 容器 Kit 保持 sim2real:8011
# KIT_API_UPSTREAM=host.docker.internal:8011

# 构建 + 起（首次构建较慢：后端走清华源装依赖，前端 npm ci）
docker compose -f docker/docker-compose.demo.yml build
docker compose -f docker/docker-compose.demo.yml up -d

# 看后端把表建好 + 灌 P9 种子 + uvicorn 起来
docker compose -f docker/docker-compose.demo.yml logs -f sim-backend
```

启动链：`sim-postgres` 健康 → `sim-backend`（迁移 + 灌种子，**它拥有并创建全部表**，含 aifactory 的 `creator_tables.sql`）→ `sim-backend` 健康 → `aifactory-backend`（`CREATE_ALL=false` 纯消费）+ `sim-frontend`。

## 2. 端口

| 服务 | 宿主端口 | 容器内 | 验证 |
|---|---|---|---|
| sim 前端 | 8080 | nginx 80 | http://localhost:8080 |
| sim 后端 | 8000 | 8000 | http://localhost:8000/docs ｜ **必须发布**：Kit 回拉事件靠它 |
| aifactory 后端 | 127.0.0.1:8129 | 8128 | 仅本机调试；远端流量走 Creator `:8081/api` |
| aifactory 前端（Creator UI） | 8081 | nginx 80 | http://localhost:8081 ｜ nginx 反代 /api,/static→后端、/ov→宿主 Kit:8011 |
| PostgreSQL | 127.0.0.1:5432 | 5432 | 仅本机 Kit/psql 可达，LAN 不可达 |
| Kit · sim 前端用（宿主原生） | **8233** / 12333 / 12334 | — | 不在 compose 内；sim 前端直连其 /ov 与 WebRTC |
| Kit · aifactory 前端用 | Linux 不发布 8011 | — | Creator nginx 反代 `/ov`→`${KIT_API_UPSTREAM}` |

## 3. 验证 3D 串流（本机，用 P9）

1. Linux 容器 Kit 必须在 Compose 创建网络后执行 `./docker/run-kit-linux.sh`；Windows 宿主原生 Kit 可独立启动。确认 sim 控制端 `:8233` 与 `:12333/:12334` 在监听；Creator 的 `:8011` 在 Linux 仅 Docker 内网可达。访问 `:8081` 时使用 `docker/.env` 中配置的 Creator 用户名和密钥登录。
2. 确认 `md_creator_project.creator_url` 指向的全厂 USD 对 Kit 可见——它是 **Kit 容器内**的绝对路径（默认 `/storage/Data/P9_animations/Houston_F_NV/demo520.usd`，对应 Kit 容器 `-v <宿主资产库>:/storage` 的挂载），由 `seed_data/creator_project.csv` 灌入。挂载目标或 USD 位置不同才需要改该 CSV，改后 `down -v` 重灌，或直接改库里的 `creator_url`。
3. 浏览器开 http://localhost:8080 → 进「运营模拟」→ 选/建一个 P9 方案 → 关联 Creator 项目 → 跑模拟 → 进 3D 回放页：
   - **2D 图表正常但 3D 黑屏** → 多半是串流/Kit URL 或 `load-from-backend` 拉不到事件，对照 §4。
   - 视口出画面且设备按事件变色 → 闭链通。

## 4. 已知限制与排障（本机演示口径）

- **「重启 Kit」按钮已移除**：容器化后该按钮触发的 Kit 重启会丢失 WebRTC 串流（需手动刷新页面才恢复），效果不佳，已删（连同后端 `/admin/kit/*` 端点）。Kit 卡死时直接 `docker restart <kit 容器名>` 即可。
- **sim 与 aifactory 用的是两个不同的 Kit 端口**：sim 前端连 Kit `:8233`；aifactory 前端的 `/ov`
  经 nginx 转发到运行期 `KIT_API_UPSTREAM`（Linux 默认 `sim2real:8011`，Windows 原生 Kit 用
  `host.docker.internal:8011`）。改 upstream 只需 `up -d` 重建前端容器，无需重 build。
- **Kit 的 CORS**：前端从 `:8080` 跨域调 Kit，需 Kit 扩展放行该源。Kit 在本仓库之外，需在 Kit 侧确认。
- **直连 WebRTC 配置**：sim 前端已改为像 aifactory 那样直接连 Kit 的 WebRTC（移植 `@nvidia/omniverse-webrtc-streaming-library`，见 [src/components/composer/AppStream.tsx](../源码/sim_frontend/src/components/composer/AppStream.tsx) + [KitViewport.tsx](../源码/sim_frontend/src/components/KitViewport.tsx)）。`mediaPort` 12333 / `signalingPort` 12334；[源码/sim_frontend/stream.config.json](../源码/sim_frontend/stream.config.json) 的 `local.server`(默认 127.0.0.1) 仅作 dev/回退默认。`VITE_KIT_STREAM_URL` 现在只作开关（非空=启用，留空=2D mock）。**远程多机：改 `docker/.env` 的 `KIT_HOST_IP` 为 Kit 宿主 IP 后 `up -d` 重建前端容器即可（启动时运行期注入 `runtime-config.js`，无需 rebuild、无需手改 `stream.config.json`）。**
- **3D 黑屏/无画面**：① Kit 的 `:12333/:12334` 是否在监听、浏览器能否直达；② Kit 扩展是否对 `:8080` 源放行 CORS（控制面跨域）。**3D 只开场景不动画**：检查 sim-backend 的 `:8000` 是否真发布到宿主、`docker/.env` 的 `KIT_HOST_IP`/`BACKEND_PORT` 拼出的后端地址是否宿主可达。
- **路径含中文 `源码/`**：Docker 29 一般可正常解析 UTF-8 build context。若构建报路径错误，临时把 `源码` 建一个 ASCII 软链/junction（如 `mklink /J codes 源码`）并把 compose 的 `context` 改成 `../codes/...`。
- **重灌种子**：`down -v` 清 DB 卷后再 `up` 会重新迁移 + 灌 P9。种子门控按 `md_factory` 是否为空，普通重启不会重灌。

## 5. 不在本阶段范围（留给「闭环链路」阶段）

- 在 Creator 里**新授权一个工厂**（拖产线→绑主数据→validate）后**直接仿真**：目前跑不通。两个根因——绑定**从不回写** `md_equipment.creator_binding_id`、授权侧**不产生 BoP/standard_ct**，导致新工厂没有事件 prim_path、且方案校验过不了 READY。这是代码层缺口，与 Docker 无关，单列阶段二处理。
- ~~aifactory 前端 Docker 化~~：✅ 已完成。nginx 反代 `/api`,`/static`→aifactory-backend，
  `/ov`→运行期 `KIT_API_UPSTREAM`。注意：它的 3D 视口使用 NVIDIA 5.6.0 直连串流；
  若 Creator 3D 报 `authenticate/accessToken` 错，同 sim 那样把 AppStream 的 `authenticate` 改 false。
