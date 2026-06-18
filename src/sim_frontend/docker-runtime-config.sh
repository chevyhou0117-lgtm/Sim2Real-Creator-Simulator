#!/bin/sh
# 运行期注入 Kit 主机地址。
# nginx 官方镜像启动前会自动按序执行 /docker-entrypoint.d/*.sh，本脚本据此在【容器启动时】
# 按环境变量 KIT_HOST_IP 生成 /usr/share/nginx/html/runtime-config.js，并确保 index.html 加载它。
# 改 Kit IP 只需改 docker/.env 的 KIT_HOST_IP 后重启容器，无需重新 build 前端。
set -eu

HTML_DIR=/usr/share/nginx/html
: "${KIT_HOST_IP:=127.0.0.1}"
: "${KIT_API_PORT:=8233}"   # sim 前端的 Kit /ov 端口（aifactory 前端用的是另一个 Kit :8011）
: "${BACKEND_PORT:=8000}"

cat > "$HTML_DIR/runtime-config.js" <<EOF
// 由容器启动脚本(docker-runtime-config.sh)生成 — KIT_HOST_IP=${KIT_HOST_IP}
// 请勿手改；改 docker/.env 的 KIT_HOST_IP 后重启容器即可。
window.__RUNTIME_CONFIG__ = {
  KIT_HOST: "${KIT_HOST_IP}",
  KIT_API_URL: "http://${KIT_HOST_IP}:${KIT_API_PORT}",
  BACKEND_DIRECT_URL: "http://${KIT_HOST_IP}:${BACKEND_PORT}"
};
EOF

# 确保 index.html 在 <head> 处以绝对路径加载 runtime-config.js。
# 先删除可能已存在的引用(源码自带 / 上次注入 / vite base 改写过的相对路径)，再插入规范的绝对路径，
# 既幂等又兼容 SPA 深层路由与 aifactory 的 base="./"。
HTML="$HTML_DIR/index.html"
if [ -f "$HTML" ]; then
  # 只删除已有的 runtime-config.js <script> 元素本身（不按行删，避免误伤被压成一行的 head）
  sed -i 's#<script[^>]*runtime-config\.js[^>]*></script>##g' "$HTML"
  # 在 <head> 之后插入规范的绝对路径引用（先于模块 bundle 执行）
  sed -i 's#<head>#<head><script src="/runtime-config.js"></script>#' "$HTML"
fi

echo "[runtime-config] KIT_HOST_IP=${KIT_HOST_IP} KIT_API_PORT=${KIT_API_PORT} BACKEND_PORT=${BACKEND_PORT} -> ${HTML_DIR}/runtime-config.js"
