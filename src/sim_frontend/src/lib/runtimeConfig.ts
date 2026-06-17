// 运行期配置：生产容器启动时，nginx 脚本(docker-runtime-config.sh)按 KIT_HOST_IP
// 生成 /runtime-config.js 并注入 window.__RUNTIME_CONFIG__。改 Kit IP 只需改 docker/.env
// 后重启容器，无需 rebuild。
//
// 本机开发(npm run dev)或未注入时，__RUNTIME_CONFIG__ 为空 → 全部回退到构建期默认值
// (import.meta.env.VITE_* / localhost)，行为与改造前一致。
type RuntimeConfig = {
  KIT_HOST?: string; // Kit WebRTC 主机(signaling/media)
  KIT_API_URL?: string; // Kit /ov 控制端点基址
  BACKEND_DIRECT_URL?: string; // 后端直连基址(Kit 回拉事件用)
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

/** Kit /ov 控制端点基址；回退到 VITE_KIT_API_URL。 */
export const kitApiUrl = (fallback: string): string =>
  nonEmpty(rc.KIT_API_URL) ?? fallback;

/** 后端直连基址；回退到 VITE_BACKEND_DIRECT_URL。 */
export const backendDirectUrl = (fallback: string): string =>
  nonEmpty(rc.BACKEND_DIRECT_URL) ?? fallback;
