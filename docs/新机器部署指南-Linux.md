# 新机器部署指南 · Linux 版

**6 个服务全部跑在 Docker 里**（两个后端 + 两个前端 + PostgreSQL+Omniverse Kit App）。

---

## 0. 端口总览

```
用到的端口
 ├─ http://<HOST1>:8080  simulator 前端    
 ├─ http://<HOST1>:8081  creator 前端
 ├─ http://<HOST1>:8000  simulator 后端
 ├─ http://<HOST1>:8129  creator 后端
 ├─ http://<HOST1>:5432  PostgreSQL（两个模块共享的数据库）
 ├─ http://<HOST2>:8011  creator 在kit上的fastapi后端
 └─ http://<HOST2>:8233. simulator 在kit上的fastapi后端
            WebRTC :12333 / :12334                             
```

`<HOST1>`：单机演示 = `localhost`；远程访问 = Sim2Real组件所在服务器 IP。
`<HOST2>`：单机演示 = `localhost`；远程访问 = OMV Kit App所在服务器 IP。



---

## 1. 拿代码 + 资产
SimReal组件和Kit App可以部署在同一内网的不同机器上。

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

### 3.1 启动 Kit 容器并指向资产库
Kit 已容器化，直接 `docker run`：`-v` 把宿主资产库挂进容器，`-e AIFACTORY_USD_ROOT` 告诉 Kit 从哪读 USD（填【容器内】路径，即 `-v` 的挂载目标）：
```bash
docker run -d --name sim2real --gpus all --restart unless-stopped \
  -e AIFACTORY_USD_ROOT=/storage \
  -p 8011:8011 -p 8233:8233 \
  -p 12334:12334/tcp -p 12333:12333/udp \
  -v /opt/sim2real/storage:/storage \
  fii-houyiming_streaming:latest
```
> `AIFACTORY_USD_ROOT=/storage` 必须等于 `-v` 右侧的容器内目标；宿主资产库在哪由 `-v` 左侧（`/opt/sim2real/storage`）决定，换位置只改左侧，无需 rebuild。

起来后监听 Kit 的 /ov + /kit/playback 控制端口 —— **sim 前端用 `:8233`、aifactory 前端用 `:8011`（两者分开）** —— 以及 `:12333`（media）、`:12334`（signal）。`docker logs -f sim2real` 看启动日志。

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
```

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
# 改了前端代码 / stream.config.json 默认值 / 任何 VITE_*（构建期烤入）→ 必须重 build
docker compose -f docker/docker-compose.demo.yml up -d --build sim-frontend
# 只改了 Kit IP（docker/.env 的 KIT_HOST_IP）→ 运行期注入，不用 build，重建前端容器即可
docker compose -f docker/docker-compose.demo.yml up -d sim-frontend aifactory-frontend
# 只改了其它运行时项（如 AIFACTORY_STORAGE_HOST）→ 不用 build，重建容器即可
docker compose -f docker/docker-compose.demo.yml up -d aifactory-backend
```
> `restart` 只重启进程，不换镜像/不应用 compose 改动——应用改动永远用 `up -d`（必要时 `--build`）。

---

## 7. 远程 / 多机访问（Linux 服务器常见场景）

GPU 机器常是 headless 服务器、浏览器在别的机器，此时 `localhost` 不再指 Kit 所在机。
**现在只需一个变量 + 重建前端容器，无需 rebuild、无需手改 `stream.config.json`**：

1. 编辑 `docker/.env`，把 `KIT_HOST_IP` 设为 **服务器的客户端可达 IP**（局域网或公网）。
2. 重建两个前端容器（env 变了 compose 自动 recreate → 启动脚本据 `KIT_HOST_IP` 重写 `runtime-config.js`）：
   ```bash
   docker compose -f docker/docker-compose.demo.yml up -d sim-frontend aifactory-frontend
   ```
3. **Kit 扩展 CORS** 放行前端源（如 `http://<SERVER_IP>:8080`、`:8081`）。
4. **防火墙放行**给客户端：`8080 8081 8000 8129 8233 8011 12333 12334`（如 `ufw allow`）。
5. 验证：浏览器开 `http://<SERVER_IP>:8080/runtime-config.js` 应看到该 IP；或 devtools 敲 `window.__RUNTIME_CONFIG__`。

> **原理**：Kit IP 是【运行期注入】的——容器启动时 nginx 脚本 `docker-runtime-config.sh` 按 `KIT_HOST_IP` 生成 `/runtime-config.js`，前端优先读 `window.__RUNTIME_CONFIG__`，回退构建期默认（均为 `localhost`/`127.0.0.1`）。**首次 build 一次即可，以后换 IP 只改 `KIT_HOST_IP` 再 `up -d`**。
> 例外：`VITE_KIT_STREAM_MODE=iframe` 逃生门模式下 `VITE_KIT_STREAM_URL`（5183 页地址）仍是构建期值，需要时才重 build。

---

## 8. 已知限制与排障

- **3D 黑屏**：① Kit 在跑且 sim 的 `:8233`、aifactory 的 `:8011` 以及 `:12333/:12334` 在监听；② sim 前端跨域调 Kit，需 Kit 扩展 CORS 放行前端源；③ `docker/.env` 的 `KIT_HOST_IP` 指向 Kit 宿主、`KIT_API_PORT` 为 sim 的 /ov 端口（默认 8233；aifactory 的 8011 固定在其 nginx.conf），改后 `up -d` 重建前端生效。
- **3D 只开场景不动画**：sim 后端 `:8000` 已发布（compose 已发布）、`KIT_HOST_IP`/`BACKEND_PORT` 拼出的后端地址是否可达。
- **缩略图 404 / 资产打不开**：`AIFACTORY_STORAGE_HOST` 没指对，或 **bind-mount 权限**（§2.3）——容器 uid 1000 读不到。
- **aifactory Creator 3D 报 `authenticate/accessToken`**：把其 `AppStream.tsx` local 配置 `authenticate` 改 `false`，重 build `aifactory-frontend`。
- **首次灌库失败**：看 `logs sim-backend`；确认 PG 起来、`creator_project.csv` 路径合法。
