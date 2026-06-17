import { useEffect, useState } from 'react';
import AppStream from './composer/AppStream';

// 串流方式：
//   'direct'(默认) = 前端直连 Kit WebRTC（移植自 aifactory，连 stream.config.json 的 media/signal 端口，不需要 5183 页）
//   'iframe'       = 回退到原方案：<iframe src={VITE_KIT_STREAM_URL}> 嵌 Kit 的 5183 串流页
// 直连暂时不通时，设 VITE_KIT_STREAM_MODE=iframe + VITE_KIT_STREAM_URL=http://localhost:5183 重构即可一键回到可用状态。
const STREAM_MODE = (import.meta.env.VITE_KIT_STREAM_MODE ?? 'direct').trim().toLowerCase();
const STREAM_URL = (import.meta.env.VITE_KIT_STREAM_URL ?? '').trim();

/**
 * KitViewport — Kit 3D 视口。默认直连 WebRTC（替代原 5183 iframe）；可用 VITE_KIT_STREAM_MODE=iframe 回退。
 * 仅负责视频画面；开 USD / 选中 / 回放等控制面仍走 HTTP（src/lib/kit.ts、src/lib/playback.ts），与本组件解耦。
 */
export function KitViewport(props: { className?: string; style?: React.CSSProperties }) {
  if (STREAM_MODE === 'iframe') {
    // 兜底逃生门：回到原来「能用」的 5183 iframe 串流页。
    return (
      <iframe
        src={STREAM_URL}
        className={props.className}
        style={{ border: 0, ...props.style }}
        allow="autoplay; fullscreen; encrypted-media; xr-spatial-tracking"
        allowFullScreen
        title="Omniverse Kit Stream"
      />
    );
  }
  return <KitDirectViewport {...props} />;
}

/**
 * 直连 Kit 的 WebRTC 视口：用 @nvidia/omniverse-webrtc-streaming-library 直接连本机 Kit 的
 * media/signal 端口（见根目录 stream.config.json: local.server / mediaPort / signalingPort）。
 * 卸载时 terminate，保证路由切换 / Kit 重启 remount（父级 bump key）不残留旧会话。
 * AppStreamer 是单例，同一时刻只应挂载一个。
 */
function KitDirectViewport({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  const [started, setStarted] = useState(false);

  useEffect(() => {
    return () => {
      try {
        AppStream.terminate();
      } catch {
        /* 流未启动时 terminate 可能抛错，忽略 */
      }
    };
  }, []);

  return (
    <div
      className={className}
      style={{ position: 'relative', width: '100%', height: '100%', ...style }}
    >
      <AppStream
        sessionId=""
        backendUrl=""
        signalingserver=""
        signalingport={0}
        mediaserver=""
        mediaport={0}
        accessToken=""
        onStarted={() => setStarted(true)}
        onStreamFailed={() => {}}
        onLoggedIn={() => {}}
        handleCustomEvent={() => {}}
        onFocus={() => {}}
        onBlur={() => {}}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />
      {!started && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#07111e]/85 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-9 h-9 rounded-full border-[3px] border-blue-500/30 border-t-blue-500 animate-spin" />
            <div className="text-[12px] text-slate-300">连接 Kit 串流中…</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default KitViewport;
