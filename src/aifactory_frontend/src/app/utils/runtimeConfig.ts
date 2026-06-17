// 运行期配置：生产容器启动时，nginx 脚本(docker-runtime-config.sh)按 KIT_HOST_IP
// 生成 /runtime-config.js 并注入 window.__RUNTIME_CONFIG__。改 Kit IP 只需改 docker/.env
// 后重启容器，无需 rebuild。
//
// aifactory 前端的 /api、/ov 走 nginx 同源反代，唯独 WebRTC(stream.config.json 的 server)
// 是浏览器直连 Kit，无法走 http 反代，故此处只需 KIT_HOST。
//
// 本机开发或未注入时回退到构建期默认(stream.config.json 的 server)，行为与改造前一致。
type RuntimeConfig = {
  KIT_HOST?: string; // Kit WebRTC 主机(signaling/media)
  KIT_API_URL?: string;
  BACKEND_DIRECT_URL?: string;
};

const rc: RuntimeConfig =
  (typeof window !== "undefined" &&
    (window as unknown as { __RUNTIME_CONFIG__?: RuntimeConfig })
      .__RUNTIME_CONFIG__) ||
  {};

const nonEmpty = (v?: string): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** Kit WebRTC 主机；运行期未注入时回退到构建期默认(stream.config.json 的 server)。 */
export const kitHost = (fallback: string): string =>
  nonEmpty(rc.KIT_HOST) ?? fallback;
