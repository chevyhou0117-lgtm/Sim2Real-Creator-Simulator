# 新机器部署指南 · Linux 版

**6 个服务全部跑在 Docker 里**（两个后端 + 两个前端 + PostgreSQL+Omniverse Kit App）。

---

## 0. 端口总览

```
用到的端口
 ├─ http://<HOST1>:8080  simulator 前端    
 ├─ http://<HOST1>:8081  creator 前端
 ├─ http://<HOST1>:8000  simulator 后端
 ├─ http://127.0.0.1:8129 creator 后端本机调试（对客户端不暴露）
 ├─ 127.0.0.1:5432         PostgreSQL 本机兼容口（不对 LAN 监听）
 ├─ Docker内网:8011       creator 的 Kit API（由 :8081/ov 代理）
 └─ http://<HOST2>:8233. simulator 在kit上的fastapi后端
            WebRTC :12333 / :12334                             
```

`<HOST1>`：单机演示 = `localhost`；远程访问 = Sim2Real组件所在服务器 IP。
`<HOST2>`：单机演示 = `localhost`；远程访问 = OMV Kit App所在服务器 IP。



---

## 1. 拿代码 + 资产
本章的默认安全拓扑要求 Sim2Real 组件和 Kit 容器在**同一台 Docker 宿主机**上；
浏览器可以在其他内网机器。Kit 与 Compose 跨主机的取舍见 §7。

从夸克网盘下载：

1.kit镜像：fii-houyiming_streaming.tar.gz（约2GB） 

2.样例（约105GB，Creator的样例约31GB,其余为Simulation的样例）
```bash
# Sim2Real组建仓库
git clone https://github.com/chevyhou0117-lgtm/Sim2Real-Creator-Simulation

# Kit App
gunzip -c fii-houyiming_streaming.tar.gz | docker load

# 资产库 (存在某路径)
sudo mkdir -p /opt/sim2real/storage
```

资产目录顶层应包含：`thumbnails/ Library/ Line_Library/ Data/`（`Data/` 内含全厂场景 USD，如 `Data/P9_animations/Houston_F_NV/demo520.usd`）。
本指南用 **`<STORAGE>`** 代指它。


### 3.0 前置：安装 NVIDIA Container Toolkit
Kit 容器要用 `--gpus all` 拿 GPU，宿主机需先装好 NVIDIA 驱动（`nvidia-smi` 能出结果），再装 NVIDIA Container Toolkit 并注册到 Docker：
```bash
sudo apt-get install -y nvidia-container-toolkit
sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# 验证：容器内能看到 GPU 即可
docker run --rm --gpus all ubuntu nvidia-smi
```
> 没装它时 `docker run --gpus all` 会报 `could not select device driver "" with capabilities: [[gpu]]`。

### 3.1 Kit 容器的网络要求
Kit 的 `aifactory.service.setup` 只读取完整环境变量 `AIFACTORY_DATABASE_URL`，不读取
`DB_HOST` / `DB_PORT`。Kit 必须加入 Compose 的 `sim2real-demo_default` 网络，才能用
`sim-postgres:5432` 访问数据库。

**因此不能再先跑 `docker run`**：该网络要由 Compose 先创建。完成 §4.3 后，按 §4.4
启动 Kit。新拓扑不发布 Kit `8011`；Creator 通过自己的 `:8081/ov/*` 同源代理访问它。

---

## 4. 配置并启动 Docker（5 个服务）

```bash
cd ~/Sim2Real-Creator-Simulation
cp docker/.env.demo.example docker/.env
```

### 4.1 编辑 `docker/.env`
kit如果和sim2real服务在同一台机器，则127.0.0.1，在内网的不同机器上则填kit实际在的ip
```bash
KIT_HOST_IP=127.0.0.1/192.168....

# 必填；先执行 `openssl rand -hex 32`，把输出填到这里。
# 浏览器访问 Creator :8081 时用户名默认 creator，密码就是该值。
CREATOR_AUTH_USERNAME=creator
CREATOR_API_KEY=<64位随机十六进制值>

# 以下三项为 Linux 容器化 Kit 必需：
SIM2REAL_DOCKER_NETWORK=sim2real-demo_default
KIT_API_UPSTREAM=sim2real:8011
AIFACTORY_DATABASE_URL=postgresql+asyncpg://postgres:postgres@sim-postgres:5432/aifactory_simulation
```

`AIFACTORY_DATABASE_URL` 中的密码必须与 `POSTGRES_PASSWORD` 一致。密码含 `@ : / # %` 等 URL
保留字符时，连接串中的密码部分必须先做 URL 编码。

Creator nginx 对页面、`/api` 和 `/ov` 统一启用 Basic Auth，并在服务端为后端写请求注入
`X-Creator-API-Key`。不要把 `CREATOR_API_KEY` 写进前端源码或提交真实的 `docker/.env`。
Basic Auth 本身不加密凭据；跨机器访问 `:8081` 时必须由前置反向代理提供 HTTPS，或限制在可信内网/VPN。

### 4.2 确认全厂场景 USD 路径（首次灌库前）
`md_creator_project.creator_url` 由 `src/sim_backend/seed_data/creator_project.csv` 灌入，是 **Kit 容器内**的绝对路径，默认值：
```
/storage/Data/P9_animations/Houston_F_NV/demo520.usd
```
它对应 §3.1 的挂载 `-v <STORAGE>:/storage`（即 `AIFACTORY_USD_ROOT`），**照默认方式挂载则无需修改**。只有当你把 `-v` 右侧容器内目标改成别的路径、或 USD 文件位置不同（资产库须含 `Data/` 目录，见 §1）时才需要改 CSV。
> 已灌过库再改的话，`down -v` 清库重灌，或直接改库里的 `creator_url`。

### 4.3 构建 + 启动
```bash
docker compose -f docker/docker-compose.demo.yml build
docker compose -f docker/docker-compose.demo.yml up -d
docker compose -f docker/docker-compose.demo.yml logs -f sim-backend 
```
启动链：`sim-postgres` 健康 → `sim-backend`（alembic 迁移 + 首次灌 P9 种子，含 aifactory 的 creator_tables）→ `aifactory-backend`（纯消费）+ 两个前端。

> **首次** `up` 建表 + 灌 P9 种子；之后 `up`/`restart`/`down→up` **都不重灌**（按 md_factory 是否为空门控 + 数据在持久卷 `sim_pgdata`）。只有 `down -v` 才重灌。
> Linux 容器 Kit 模式下，Creator nginx 按 `KIT_API_UPSTREAM=sim2real:8011` 走 Docker DNS；
> `host.docker.internal` 只是宿主原生 Kit 的兼容选项。

### 4.4 启动 Kit（Compose 之后）

```bash
./docker/run-kit-linux.sh
docker logs -f sim2real
```

该脚本会从 `docker/.env` 读取资产目录、Docker 网络和 `AIFACTORY_DATABASE_URL`，并验证它们；
脚本不会自动删除同名的旧 `sim2real` 容器。等价的核心 `docker run` 参数是：

```bash
docker run -d --name sim2real --gpus all --restart unless-stopped \
  --network sim2real-demo_default --network-alias sim2real \
  -e AIFACTORY_USD_ROOT=/storage \
  -e 'AIFACTORY_DATABASE_URL=postgresql+asyncpg://postgres:<URL_ENCODED_PASSWORD>@sim-postgres:5432/aifactory_simulation' \
  -p 8233:8233 -p 12334:12334/tcp -p 12333:12333/udp \
  -v /opt/sim2real/storage:/storage \
  fii-houyiming_streaming:latest
```

> 特别注意：没有 `-p 8011:8011`。`8011` 仅在 Docker 内网可达，由 Creator nginx 转发。

---

## 5. 验证

| 检查 | 方法 | 预期 |
|---|---|---|
| sim 后端 | `curl -s localhost:8000/health` / 开 `:8000/docs` | 200 / Swagger |
| aifactory 后端 | 服务器本机开 `http://127.0.0.1:8129/docs` | Swagger（LAN 直连应失败） |
| Compose 容器 | `docker compose -f docker/docker-compose.demo.yml ps` | 5 个都 healthy |
| Kit 数据库 | `docker logs sim2real` | 无 `Connect call failed ... localhost:5432` |
| Kit 内网 API | `docker compose -f docker/docker-compose.demo.yml exec aifactory-frontend wget -qO- http://sim2real:8011/health` | HTTP 200 |
| sim 前端 | 开 `http://<HOST>:8080` | 页面渲染、接口不报错 |
| aifactory 前端 | 开 `http://<HOST>:8081` | 资产库列表 + 缩略图能显示 |
| 3D 串流 | sim 前端进方案 → 跑模拟 → 3D 回放页 | 视口出画面、随窗口自适应 |

---

## 6. 常用操作

```bash
# 先移除 Kit，再删 Compose 网络
docker rm -f sim2real
docker compose -f docker/docker-compose.demo.yml down          # 停（保留数据）
# 如确认要清库，改用：docker compose -f docker/docker-compose.demo.yml down -v
# 改了前端代码 / stream.config.json 默认值 / 任何 VITE_*（构建期烤入）→ 必须重 build
docker compose -f docker/docker-compose.demo.yml up -d --build sim-frontend
# 只改了 Kit IP（docker/.env 的 KIT_HOST_IP）→ 运行期注入，不用 build，重建前端容器即可
docker compose -f docker/docker-compose.demo.yml up -d sim-frontend aifactory-frontend
# 只改了其它运行时项（如 AIFACTORY_STORAGE_HOST）→ 不用 build，重建容器即可
docker compose -f docker/docker-compose.demo.yml up -d aifactory-backend
```
> `restart` 只重启进程，不换镜像/不应用 compose 改动——应用改动永远用 `up -d`（必要时 `--build`）。
>
> Kit 是独立 `docker run` 但挂在 Compose 网络上。执行 `compose down` 前先执行
> `docker rm -f sim2real`，否则 Docker 会因网络仍有 active endpoint 而无法删除该网络。

---

## 7. 远程 / 多机访问（Linux 服务器常见场景）

GPU 机器常是 headless 服务器、浏览器在别的机器，此时 `localhost` 不再指 Kit 所在机。
**现在只需一个变量 + 重建前端容器，无需 rebuild、无需手改 `stream.config.json`**：

1. 编辑 `docker/.env`，把 `KIT_HOST_IP` 设为 **服务器的客户端可达 IP**（局域网或公网）。
2. 重建两个前端容器（env 变了 compose 自动 recreate → 启动脚本据 `KIT_HOST_IP` 重写 `runtime-config.js`）：
   ```bash
   docker compose -f docker/docker-compose.demo.yml up -d sim-frontend aifactory-frontend
   ```
3. **Kit 扩展 CORS** 只放行前端源（如 `http://<SERVER_IP>:8080`、`:8081`）。
   当前 Kit 镜像内的两套扩展仍硬编码 `*`，且部分 AnimationController 手动写 `Access-Control-Allow-Origin: *`；
   环境变量不会覆盖它，需在 Kit 源码修改后重建镜像。
4. **防火墙放行**给客户端：`8080 8081 8000 8233 12333 12334`。
   **不要放行** `5432` / `8129` / `8011`：前两者只绑定 loopback，`8011` 未发布到宿主。
5. 验证：浏览器开 `http://<SERVER_IP>:8080/runtime-config.js` 应看到该 IP；或 devtools 敲 `window.__RUNTIME_CONFIG__`。

> **原理**：Kit IP 是【运行期注入】的——容器启动时 nginx 脚本 `docker-runtime-config.sh` 按 `KIT_HOST_IP` 生成 `/runtime-config.js`，前端优先读 `window.__RUNTIME_CONFIG__`，回退构建期默认（均为 `localhost`/`127.0.0.1`）。**首次 build 一次即可，以后换 IP 只改 `KIT_HOST_IP` 再 `up -d`**。
> 例外：`VITE_KIT_STREAM_MODE=iframe` 逃生门模式下 `VITE_KIT_STREAM_URL`（5183 页地址）仍是构建期值，需要时才重 build。
>
> **Kit 与 Compose 在不同物理机器**时，Docker bridge 网络不能跨主机加入。此时需通过 VPN/
> WireGuard 或 SSH tunnel 向 Kit 提供受限的 PostgreSQL 地址，并将 `AIFACTORY_DATABASE_URL` 指向该私网地址；
> 不要把 `5432` 绑定到 `0.0.0.0`。同时把 `KIT_API_UPSTREAM` 设为 Kit 的私网 IP:8011，
> 并在 Kit 侧防火墙中只允许 Sim2Real 服务器访问 8011。

---

## 8. 已知限制与排障

- **3D 黑屏**：① Kit 在跑且宿主 `:8233`、`:12333/:12334` 在监听；② Creator 容器内
  `http://sim2real:8011/health` 可达；③ sim 前端跨域调 Kit，需 Kit 扩展 CORS 放行前端源；
  ④ `docker/.env` 的 `KIT_HOST_IP` 指向浏览器可达的 Kit 宿主 IP。
- **Kit 的 DB API 500**：确认 `docker inspect sim2real` 显示已加入 `sim2real-demo_default`，且
  `AIFACTORY_DATABASE_URL` 中的主机是 `sim-postgres`，不是 `localhost`。
- **3D 只开场景不动画**：sim 后端 `:8000` 已发布（compose 已发布）、`KIT_HOST_IP`/`BACKEND_PORT` 拼出的后端地址是否可达。
- **缩略图 404 / 资产打不开**：`AIFACTORY_STORAGE_HOST` 没指对，或 **bind-mount 权限**（§2.3）——容器 uid 1000 读不到。
- **aifactory Creator 3D 报 `authenticate/accessToken`**：把其 `AppStream.tsx` local 配置 `authenticate` 改 `false`，重 build `aifactory-frontend`。
- **首次灌库失败**：看 `logs sim-backend`；确认 PG 起来、`creator_project.csv` 路径合法。
