// 运行期配置占位文件。
// - 本机开发(npm run dev)：保持为空 → 前端回退到构建期默认(stream.config.json / localhost)。
// - 生产容器：启动时由 nginx 脚本(docker-runtime-config.sh)按 KIT_HOST_IP 覆盖本文件。
// 请勿手改这里的值用于生产；改 docker/.env 的 KIT_HOST_IP 后重启容器即可。
window.__RUNTIME_CONFIG__ = {};
