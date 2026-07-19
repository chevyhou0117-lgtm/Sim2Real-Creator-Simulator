#!/bin/sh
# 运行期注入 Kit 主机地址。
# nginx 官方镜像启动前会自动按序执行 /docker-entrypoint.d/*.sh，本脚本据此在【容器启动时】
# 按环境变量 KIT_HOST_IP 生成 /usr/share/nginx/html/runtime-config.js，并确保 index.html 加载它。
# 改 Kit IP 只需改 docker/.env 的 KIT_HOST_IP 后重启容器，无需重新 build 前端。
#
# aifactory 前端只用到 KIT_HOST(WebRTC)，KIT_API_URL/BACKEND_DIRECT_URL 一并生成但前端不读，无副作用。
set -eu

HTML_DIR=/usr/share/nginx/html
: "${KIT_HOST_IP:=127.0.0.1}"
: "${KIT_API_PORT:=8011}"
: "${BACKEND_PORT:=8000}"
: "${CREATOR_AUTH_USERNAME:=creator}"
: "${CREATOR_API_KEY:?CREATOR_API_KEY is required; generate one with: openssl rand -hex 32}"

# 这些值会写入 nginx 配置/htpasswd，限定为安全字符，防止换行或指令注入。
case "$CREATOR_AUTH_USERNAME" in
  *[!A-Za-z0-9._-]*|'')
    echo "CREATOR_AUTH_USERNAME may only contain A-Z, a-z, 0-9, dot, underscore and dash" >&2
    exit 1
    ;;
esac
case "$CREATOR_API_KEY" in
  *[!A-Za-z0-9._~-]*|'')
    echo "CREATOR_API_KEY may only contain URL-safe characters; use: openssl rand -hex 32" >&2
    exit 1
    ;;
esac

umask 077
printf '%s:{PLAIN}%s\n' "$CREATOR_AUTH_USERNAME" "$CREATOR_API_KEY" > /etc/nginx/.creator_htpasswd
cat > /etc/nginx/creator-auth.inc <<'EOF'
auth_basic "Sim2Real Creator";
auth_basic_user_file /etc/nginx/.creator_htpasswd;
EOF
cat > /etc/nginx/creator-upstream-auth.inc <<EOF
proxy_set_header Authorization "";
proxy_set_header X-Creator-API-Key "${CREATOR_API_KEY}";
EOF
# nginx worker 以 `nginx` 用户运行，必须能读取 htpasswd；仍只开放给 root/nginx 组。
chown root:nginx /etc/nginx/.creator_htpasswd /etc/nginx/creator-auth.inc /etc/nginx/creator-upstream-auth.inc
chmod 640 /etc/nginx/.creator_htpasswd /etc/nginx/creator-auth.inc /etc/nginx/creator-upstream-auth.inc
umask 022

# nginx 的变量形式 proxy_pass 使用 Docker DNS，它不会查询 /etc/hosts。
# host.docker.internal 在 Linux 上由 compose extra_hosts 写入 /etc/hosts，因此启动时
# 先把该兼容 upstream 固化为 host-gateway IP。sim2real:8011 仍保留动态 DNS，
# Kit 晚于前端启动时 nginx 也不会因无法解析而退出。
NGINX_CONF=/etc/nginx/conf.d/aifactory.conf
case "${KIT_API_UPSTREAM:-}" in
  host.docker.internal:*)
    kit_api_port=${KIT_API_UPSTREAM##*:}
    if kit_api_ip=$(getent ahostsv4 host.docker.internal 2>/dev/null | awk 'NR == 1 { print $1 }') \
      && [ -n "$kit_api_ip" ] \
      && [ -f "$NGINX_CONF" ]; then
      sed -i "s#\"${KIT_API_UPSTREAM}\"#\"${kit_api_ip}:${kit_api_port}\"#" "$NGINX_CONF"
      echo "[runtime-config] KIT_API_UPSTREAM host.docker.internal resolved via /etc/hosts"
    fi
    ;;
esac

cat > "$HTML_DIR/runtime-config.js" <<EOF
// 由容器启动脚本(docker-runtime-config.sh)生成 — KIT_HOST_IP=${KIT_HOST_IP}
// 请勿手改；改 docker/.env 的 KIT_HOST_IP 后重启容器即可。
window.__RUNTIME_CONFIG__ = {
  KIT_HOST: "${KIT_HOST_IP}",
  KIT_API_URL: "http://${KIT_HOST_IP}:${KIT_API_PORT}",
  BACKEND_DIRECT_URL: "http://${KIT_HOST_IP}:${BACKEND_PORT}"
};
EOF
chmod 644 "$HTML_DIR/runtime-config.js"

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

echo "[runtime-config] KIT_HOST_IP=${KIT_HOST_IP} KIT_API_PORT=${KIT_API_PORT} BACKEND_PORT=${BACKEND_PORT} auth_user=${CREATOR_AUTH_USERNAME} -> ${HTML_DIR}/runtime-config.js"
