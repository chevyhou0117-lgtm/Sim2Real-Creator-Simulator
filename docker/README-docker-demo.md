# 后端 Docker 化 · 单机本机演示（docker-compose.demo.yml）

把 **两个后端 + PostgreSQL + sim 前端** 一键跑在一台机器上，用已 seed 的 **P9 工厂**验证 3D 串流。
**Omniverse Kit（需 RTX GPU）不进 Docker，照常在宿主机原生运行。**

---

## 0. 前置

| 依赖 | 说明 |
|---|---|
| Docker Desktop | 已验证 Docker 29.x + Compose v5；Windows 用 WSL2 后端 |
| Omniverse Kit App | **单独在宿主机跑**（`kit-app-template` 构建出的 `fii.houyiming_streaming.kit`）。/ov + /kit/playback：**sim 前端用 `:8233`、aifactory 前端用 `:8011`（两者分开）**；WebRTC `:12333/:12334`。**sim 前端现在直连 WebRTC，不再需要单独的 `:5183` 串流页** |
| （可选）资产库 | 缩略图/USD 大文件（~31GB）。仅 aifactory 资产页/下载需要；只验证 sim 串流可不挂 |

> 本机演示意味着：浏览器、Kit、后端容器都在同一台机。所以前端里烤死的 `localhost` 地址可直接用，无需按 IP 重构。

## 1. 起服务

```powershell
# （可选）覆盖默认值
Copy-Item docker/.env.demo.example docker/.env   # 按需改密码/资产目录/Kit 端口

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
| aifactory 后端 | 8129 | 8128 | http://localhost:8129/docs |
| aifactory 前端（Creator UI） | 8081 | nginx 80 | http://localhost:8081 ｜ nginx 反代 /api,/static→后端、/ov→宿主 Kit:8011 |
| PostgreSQL | 5432 | 5432 | `psql postgres/postgres@localhost:5432/aifactory_simulation` |
| Kit · sim 前端用（宿主原生） | **8233** / 12333 / 12334 | — | 不在 compose 内；sim 前端直连其 /ov 与 WebRTC |
| Kit · aifactory 前端用（宿主原生） | **8011** | — | 不在 compose 内；aifactory nginx 反代 /ov→host.docker.internal:8011 |

## 3. 验证 3D 串流（本机，用 P9）

1. 确认 **Kit App 已在宿主机跑起来**（sim 前端用的 Kit 在 `:8233` 控制 + `:12333/:12334` WebRTC 在监听；aifactory 前端用的 Kit 在 `:8011`，两者分开）。sim 前端现在**直连 WebRTC**，不用再起 `:5183` 串流页。
2. 确认 `md_creator_project.creator_url` 指向的全厂 USD 在**本机真实存在**——它是绝对路径，由 `seed_data/creator_project.csv` 灌入。路径不符就改该 CSV 后 `down -v` 重灌，或直接改库里的 `creator_url`。
3. 浏览器开 http://localhost:8080 → 进「运营模拟」→ 选/建一个 P9 方案 → 关联 Creator 项目 → 跑模拟 → 进 3D 回放页：
   - **2D 图表正常但 3D 黑屏** → 多半是串流/Kit URL 或 `load-from-backend` 拉不到事件，对照 §4。
   - 视口出画面且设备按事件变色 → 闭链通。

## 4. 已知限制与排障（本机演示口径）

- **「重启 Kit」按钮在容器内失效**：`admin.py` 用 `pgrep/os.kill/setsid` 操作宿主 Kit 进程，容器看不到宿主 PID。**只影响这个按钮，不影响串流本身**。需要它就手动在宿主重启 Kit，或后续把 watchdog 改成调宿主 agent。
- **sim 与 aifactory 用的是两个不同的 Kit 端口**：sim 前端连 Kit `:8233`（由 `docker/.env` 的 `KIT_API_PORT` 控制，运行期注入 `runtime-config.js`，改后 `up -d` 即可，无需 rebuild）；aifactory 前端的 `/ov` 走自己 nginx 反代到固定的 `:8011`（写死在 [aifactory_frontend/nginx.conf](../src/aifactory_frontend/nginx.conf)，要改需 rebuild）。两者勿混用。`/ov` + `/kit/playback` 实际端口以你运行的 Kit 扩展为准。
- **Kit 的 CORS**：前端从 `:8080` 跨域调 Kit，需 Kit 扩展放行该源。Kit 在本仓库之外，需在 Kit 侧确认。
- **直连 WebRTC 配置**：sim 前端已改为像 aifactory 那样直接连 Kit 的 WebRTC（移植 `@nvidia/omniverse-webrtc-streaming-library`，见 [src/components/composer/AppStream.tsx](../源码/sim_frontend/src/components/composer/AppStream.tsx) + [KitViewport.tsx](../源码/sim_frontend/src/components/KitViewport.tsx)）。`mediaPort` 12333 / `signalingPort` 12334；[源码/sim_frontend/stream.config.json](../源码/sim_frontend/stream.config.json) 的 `local.server`(默认 127.0.0.1) 仅作 dev/回退默认。`VITE_KIT_STREAM_URL` 现在只作开关（非空=启用，留空=2D mock）。**远程多机：改 `docker/.env` 的 `KIT_HOST_IP` 为 Kit 宿主 IP 后 `up -d` 重建前端容器即可（启动时运行期注入 `runtime-config.js`，无需 rebuild、无需手改 `stream.config.json`）。**
- **3D 黑屏/无画面**：① Kit 的 `:12333/:12334` 是否在监听、浏览器能否直达；② Kit 扩展是否对 `:8080` 源放行 CORS（控制面跨域）。**3D 只开场景不动画**：检查 sim-backend 的 `:8000` 是否真发布到宿主、`docker/.env` 的 `KIT_HOST_IP`/`BACKEND_PORT` 拼出的后端地址是否宿主可达。
- **路径含中文 `源码/`**：Docker 29 一般可正常解析 UTF-8 build context。若构建报路径错误，临时把 `源码` 建一个 ASCII 软链/junction（如 `mklink /J codes 源码`）并把 compose 的 `context` 改成 `../codes/...`。
- **重灌种子**：`down -v` 清 DB 卷后再 `up` 会重新迁移 + 灌 P9。种子门控按 `md_factory` 是否为空，普通重启不会重灌。

## 5. 不在本阶段范围（留给「闭环链路」阶段）

- 在 Creator 里**新授权一个工厂**（拖产线→绑主数据→validate）后**直接仿真**：目前跑不通。两个根因——绑定**从不回写** `md_equipment.creator_binding_id`、授权侧**不产生 BoP/standard_ct**，导致新工厂没有事件 prim_path、且方案校验过不了 READY。这是代码层缺口，与 Docker 无关，单列阶段二处理。
- ~~aifactory 前端 Docker 化~~：✅ 已完成。新增 [Dockerfile.prod](../源码/aifactory_frontend/Dockerfile.prod) + [nginx.conf](../源码/aifactory_frontend/nginx.conf)，compose 第 5 个服务 `aifactory-frontend`(:8081)。nginx 反代 /api,/static→aifactory-backend、/ov→宿主 Kit(host.docker.internal:8011)。注意：它的 3D 视口用的是 NVIDIA 5.6.0 直连串流(`stream.config.json`)；若 Creator 3D 报 `authenticate/accessToken` 错，同 sim 那样把其 AppStream 的 `authenticate` 改 false。
