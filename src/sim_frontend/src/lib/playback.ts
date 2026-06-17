// Kit (Omniverse) playback FastAPI 客户端 —— 控制 3D 模拟回放
//
// 流程：
//   1. ingest()    把后端的事件流推给 Kit PlaybackEngine（一次性装载）
//   2. control()   play / pause / seek / speed / stop
//   3. state()     查询当前播放头位置 + 速度 + 状态（用于 UI 同步）
import { kitApiUrl } from './runtimeConfig';

const KIT_BASE = kitApiUrl(import.meta.env.VITE_KIT_API_URL ?? 'http://localhost:8011').replace(/\/+$/, '');

const DEFAULT_TIMEOUT_MS = 5000;
// 大规模模拟单次回放事件可达数十万条（实测 P9 ≈ 69.5 万条 / 265 MB）：
// 上传 + Kit pydantic 解析 + bucketize 远超原来的 30s。临时放宽到 5 分钟先解锁，
// 用于确认 ingest 到底能不能装完、装完要多久。治本方案（Kit 直连后端 / 服务端
// 分桶）落地后应把这里调回一个合理值。
const INGEST_TIMEOUT_MS  = 300000;

async function kitFetch(path: string, init: RequestInit = {}, timeout = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    return await fetch(`${KIT_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
      signal: ctrl.signal,
      ...init,
    });
  } finally {
    clearTimeout(timer);
  }
}

// Kit FastAPI 包装 BaseResponse[T]，业务数据在 .data 里
interface BaseResponse<T> { code: number; message: string; data: T }

async function unwrap<T>(res: Response, label: string): Promise<T> {
  if (!res.ok) {
    throw new Error(`Kit ${label} ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const body: BaseResponse<T> = await res.json();
  if (body.code !== 0 && body.code !== 200) {
    throw new Error(`Kit ${label} code=${body.code} msg=${body.message}`);
  }
  return body.data;
}

// ── Types (mirror Kit's PlaybackVO) ─────────────────────────────────────────
export interface PlaybackEvent {
  timestamp_ms: number;
  event_type: string;       // PROCESSING_START | PROCESSING_END | FAILURE_START | FAILURE_END | PRODUCT_COMPLETE
  prim_path: string;        // 后缀 / 名称 / 全路径
  equipment_id?: string | null;
  product_id?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface PlaybackSession {
  session_id: string;
  plan_id: string;
  duration_ms: number;
  stream_url?: string | null;
  device_count: number;
  product_count: number;
  unresolved_prims: string[];
}

export interface PlaybackState {
  session_id?: string | null;
  state: 'stopped' | 'playing' | 'paused' | string;
  t_ms: number;
  speed: number;
  duration_ms: number;
}

// ── API ─────────────────────────────────────────────────────────────────────

/** 一次性把整段事件流装载到 Kit PlaybackEngine（旧接口，仅在事件已在内存时使用）。 */
export async function ingestPlayback(
  planId: string,
  durationMs: number,
  events: PlaybackEvent[],
): Promise<PlaybackSession> {
  const res = await kitFetch('/kit/playback', {
    method: 'POST',
    body: JSON.stringify({ plan_id: planId, duration_ms: durationMs, events }),
  }, INGEST_TIMEOUT_MS);
  return unwrap<PlaybackSession>(res, 'ingest');
}

/** Kit 直接从 sim_backend 拉取事件并装载，浏览器不再作为中转（治本方案）。
 *  backendUrl 示例：http://localhost:8000 */
export async function loadPlaybackFromBackend(
  planId: string,
  backendUrl: string,
): Promise<PlaybackSession> {
  const res = await kitFetch('/kit/playback/load-from-backend', {
    method: 'POST',
    body: JSON.stringify({ plan_id: planId, backend_url: backendUrl }),
  }, INGEST_TIMEOUT_MS);
  return unwrap<PlaybackSession>(res, 'load-from-backend');
}

/** 播放控制：play / pause / seek / speed / stop。
 *  - seek 必须传 t_ms
 *  - speed 必须传 factor (>0) */
export async function controlPlayback(
  cmd: 'play' | 'pause' | 'seek' | 'speed' | 'stop',
  opts: { t_ms?: number; factor?: number } = {},
): Promise<PlaybackState> {
  const res = await kitFetch('/kit/playback/control', {
    method: 'POST',
    body: JSON.stringify({ cmd, ...opts }),
  });
  return unwrap<PlaybackState>(res, `control(${cmd})`);
}

/** 当前播放状态（轮询用）。 */
export async function getPlaybackState(): Promise<PlaybackState> {
  const res = await kitFetch('/kit/playback/state', { method: 'GET' });
  return unwrap<PlaybackState>(res, 'state');
}

// ── Convenience wrappers (UI 直接调) ────────────────────────────────────────
export const playbackPlay  = () => controlPlayback('play');
export const playbackPause = () => controlPlayback('pause');
export const playbackStop  = () => controlPlayback('stop');
export const playbackSeek  = (tMs: number) => controlPlayback('seek', { t_ms: Math.max(0, Math.floor(tMs)) });
export const playbackSpeed = (factor: number) => controlPlayback('speed', { factor });
