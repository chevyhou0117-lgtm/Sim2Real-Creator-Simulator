// Kit (Omniverse) FastAPI 客户端 —— 控制 USD viewport 视角 / prim 选择
// Kit FastAPI 服务在独立进程，默认 http://localhost:8233（可通过 VITE_KIT_API_URL 覆盖）
// 注意：这是 sim 前端用的 Kit；aifactory 前端用的是另一个 Kit :8011，两者分开。
import { kitApiUrl } from './runtimeConfig';

// 运行期优先用容器注入的 KIT_API_URL（按 KIT_HOST_IP 生成），回退构建期 VITE_KIT_API_URL，再回退 localhost。
const KIT_BASE = kitApiUrl(import.meta.env.VITE_KIT_API_URL ?? 'http://localhost:8233').replace(/\/+$/, '');

const DEFAULT_TIMEOUT_MS = 5000;

async function kitFetch(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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

/** 让 Kit viewport 选中并聚焦到指定 USD prim_path（视角移动 + 选中 outline 高亮）。
 *  fail-soft：网络错 / Kit 未启动 / prim 不存在 一律 throw，调用方应静默 catch 不影响 UI。 */
export async function kitFocusPrim(primPath: string): Promise<void> {
  const res = await kitFetch('/ov/select-and-focus', {
    method: 'POST',
    body: JSON.stringify({ prim_path: primPath }),
  });
  if (!res.ok) {
    throw new Error(`Kit /ov/select-and-focus ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

/** 仅高亮选中（不动相机）— 单击设备节点用。 */
export async function kitSelectPrim(primPath: string): Promise<void> {
  const res = await kitFetch('/ov/select', {
    method: 'POST',
    body: JSON.stringify({ prim_path: primPath }),
  });
  if (!res.ok) {
    throw new Error(`Kit /ov/select ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

// ── select-many 回声抑制 ─────────────────────────────────────────────────────
// 单击产线/工序/工厂节点 → kitSelectMany 让 Kit 组高亮 → Kit 的 selection SSE 会把
// 选中回推（通常是第一台设备的 prim）。不抑制的话，页面的反向同步会把"产线选中"改写成
// "第一台设备选中"：PlanConfig 的参数扩展列切成设备工艺参数、回放页弹出设备状态面板。
// 只抑制组选回声——单选（kitSelectPrim）的回声是回放页"树点设备弹面板"链路的一部分，保留。
// 窗口：发请求时开 20s（大场景 select-many 本身要数秒），完成后收短到 2s 尾窗；
// 过期后用户在 3D 视口里真点同一台设备仍正常反向同步。
let selectManyEcho: { paths: Set<string>; until: number } | null = null;
const markSelectManyEcho = (paths: string[], ttlMs: number) => {
  selectManyEcho = { paths: new Set(paths), until: Date.now() + ttlMs };
};

/** 批量高亮选中多个 prim（不动相机）— 单击产线/工序节点时高亮其下全部设备用。
 *  Kit 端自动跳过场景里不存在的 prim；空列表直接跳过不发请求。fail-soft：调用方静默 catch。
 *  factory 级一次几十~上百 prim，Kit 端遍历 stage 设置 selection 在大场景下超过 5s，这里给 15s 余量
 *  （与 focus-perspective-many 对齐，避免 AbortError）。 */
export async function kitSelectMany(primPaths: string[]): Promise<void> {
  const paths = primPaths.filter((p) => !!p && p.trim());
  if (paths.length === 0) return;
  const t0 = performance.now();
  console.log(`[Kit] select-many start: ${paths.length} paths`);
  markSelectManyEcho(paths, 20000);
  try {
    const res = await kitFetch('/ov/select-many', {
      method: 'POST',
      body: JSON.stringify({ prim_paths: paths }),
    }, 15000);
    const dt = (performance.now() - t0).toFixed(0);
    if (!res.ok) {
      throw new Error(`Kit /ov/select-many ${res.status} after ${dt}ms: ${await res.text().catch(() => '')}`);
    }
    console.log(`[Kit] select-many done in ${dt}ms`);
    markSelectManyEcho(paths, 2000);   // 收短尾窗：完成后回声很快到达
  } catch (err) {
    const dt = (performance.now() - t0).toFixed(0);
    console.warn(`[Kit] select-many threw after ${dt}ms`, err);
    markSelectManyEcho(paths, 2000);
    throw err;
  }
}

/** 切到斜俯透视并聚焦 — 双击设备节点用。Kit 端默认带运镜动画。 */
export async function kitFocusPerspective(primPath: string): Promise<void> {
  const res = await kitFetch('/ov/focus-perspective', {
    method: 'POST',
    body: JSON.stringify({ prim_path: primPath }),
  });
  if (!res.ok) {
    throw new Error(`Kit /ov/focus-perspective ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

/** 双击产线 / 工序节点：把子树下所有设备 prim 合并 BBox，切到斜俯透视并聚焦。
 *  Kit 端会算合并 bbox 的中心和尺寸，再按 azimuth/elevation/distance_factor 算相机偏移。
 *  fail-soft：空列表跳过；Kit 未起 / 端点不存在一律 throw 由调用方静默 catch。 */
export async function kitFocusPerspectiveMany(primPaths: string[]): Promise<void> {
  const paths = primPaths.filter((p) => !!p && p.trim());
  if (paths.length === 0) return;
  const res = await kitFetch('/ov/focus-perspective-many', {
    method: 'POST',
    body: JSON.stringify({ prim_paths: paths }),
  }, 15000);  // 运镜需多帧 await，给 15s 余量
  if (!res.ok) {
    throw new Error(`Kit /ov/focus-perspective-many ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

/** 切回俯视全景 — 透视模式下再次单击时用。 */
export async function kitViewTopDown(): Promise<void> {
  const res = await kitFetch('/ov/view-top-down', { method: 'POST', body: '{}' });
  if (!res.ok) {
    throw new Error(`Kit /ov/view-top-down ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

// 打开 USD 比视角操作慢（异步加载 + 等帧 framing），单独给更长超时。
// 120s：demo520 全厂场景冷加载（数千 prim + 贴图）可超 30s，避免 AbortError 误判失败。
const OPEN_STAGE_TIMEOUT_MS = 120000;

/** 查询 Kit 当前已打开 USD 的 root layer identifier；无 stage / 查询失败一律返回 null。
 *  fail-soft：不 throw，便于调用方做"不同才打开"的幂等预判。 */
export async function kitCurrentStage(): Promise<string | null> {
  try {
    const res = await kitFetch('/ov/current_stage', { method: 'GET' });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as { data?: string | null } | null;
    const ident = body?.data ?? null;
    return typeof ident === 'string' && ident.trim() ? ident.trim() : null;
  } catch {
    return null;
  }
}

/** 让 Kit 打开指定 USD（完整 URL / 绝对本地路径 / S3 相对路径）。
 *  Kit 端已做服务端幂等（同 stage 跳过重开，保护 playback 注入的 prim）。
 *  失败 throw，调用方按需 catch。 */
export async function kitOpenStage(url: string, timeoutMs: number = OPEN_STAGE_TIMEOUT_MS): Promise<void> {
  const res = await kitFetch(
    '/ov/open_stage',
    { method: 'POST', body: JSON.stringify({ rootUsdPath: url }) },
    timeoutMs,
  );
  if (!res.ok) {
    throw new Error(`Kit /ov/open_stage ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

/** 切换 Kit 主窗口全屏（Kit 端幂等：当前状态与目标一致时跳过）。
 *  fail-soft：失败 throw，调用方按需静默 catch。
 *
 *  - 桌面模式：走 omni.appwindow + carb.windowing，操作真实窗口
 *  - 串流模式 (`--no-window`)：Kit handler 改写 `/app/window/hideUi`
 *    （F11 的实际机制）——true 隐藏菜单栏/停靠面板让画面占满 viewport，
 *    false 恢复完整编辑器 UI（布局从进入全屏时的快照还原）
 *
 *  超时给 12s：Kit 刚启动那段 (~30s) 主线程满载，全屏切换会被 settings 监听器
 *  阻塞数秒；启动完成后 ~10ms 返回。给宽松超时避免冷启动期 AbortError。 */
export async function kitSetFullscreen(fullscreen: boolean): Promise<void> {
  const res = await kitFetch(
    '/ov/window/set-fullscreen',
    { method: 'POST', body: JSON.stringify({ fullscreen }) },
    12000,
  );
  if (!res.ok) {
    throw new Error(`Kit /ov/window/set-fullscreen ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

/** 确保指定 USD 已打开：前端先用 current_stage 预判，相同则跳过，不同才 open_stage。
 *  （Kit 端亦有兜底幂等。）返回是否真触发了打开。url 为空则跳过并返回 false。 */
export async function kitEnsureStage(url: string | null | undefined): Promise<boolean> {
  const target = (url ?? '').trim();
  if (!target) return false;
  const current = await kitCurrentStage();
  // Normalize slashes: USD returns identifiers with '/' on all platforms, but the DB
  // may store Windows paths with '\'. Compare after normalizing both sides.
  const norm = (p: string) => p.replace(/\\/g, '/');
  if (current && norm(current) === norm(target)) return false;
  await kitOpenStage(target);
  return true;
}

// ─── 第一人称漫游 ────────────────────────────────────────────────────────────

export interface WalkPose {
  eye: [number, number, number];
  yaw_deg: number;
  pitch_deg: number;
  eye_height?: number;
}

/** 进入漫游：相机切到工厂中心 + 人眼高度，朝 +X。eye_height=0 由 Kit 自动估算。 */
export async function kitWalkEnter(eyeHeight: number = 0): Promise<WalkPose> {
  const res = await kitFetch('/ov/walk/enter', {
    method: 'POST',
    body: JSON.stringify({ eye_height: eyeHeight }),
  });
  if (!res.ok) {
    throw new Error(`Kit /ov/walk/enter ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const body = (await res.json()) as { data: WalkPose };
  return body.data;
}

/** 退出漫游：恢复到 enter 前的俯视相机记忆。 */
export async function kitWalkExit(): Promise<void> {
  const res = await kitFetch('/ov/walk/exit', { method: 'POST', body: '{}' });
  if (!res.ok) {
    throw new Error(`Kit /ov/walk/exit ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

/** 漫游步进：位移以世界单位（forward 沿水平 yaw，right 沿右手，up 沿 stage up）；
 *  视角增量以 °。任意未传字段视为 0。失败 throw，调用方按需静默 catch（高频调用时建议不打日志）。 */
export async function kitWalkStep(opts: {
  forward?: number; right?: number; up?: number;
  dyaw_deg?: number; dpitch_deg?: number;
}): Promise<void> {
  const res = await kitFetch('/ov/walk/step', {
    method: 'POST',
    body: JSON.stringify({
      forward: opts.forward ?? 0,
      right: opts.right ?? 0,
      up: opts.up ?? 0,
      dyaw_deg: opts.dyaw_deg ?? 0,
      dpitch_deg: opts.dpitch_deg ?? 0,
    }),
  });
  if (!res.ok) {
    throw new Error(`Kit /ov/walk/step ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

// ─── 漫游：俯视小地图 + 传送 ─────────────────────────────────────────────────
// 地面平面 (u, v) 坐标约定（与 Kit /ov/walk/map、/ov/walk/pose_stream 一致）：
//   Z-up 场景 → (u,v)=(世界x, 世界y)；Y-up → (u,v)=(世界x, 世界z)。
//   heading_deg：0°=+u，逆时针增（90°=+v）。

/** 地面平面上的一个矩形（世界单位）。 */
export interface WalkMapRect {
  u_min: number; v_min: number; u_max: number; v_max: number;
}

/** 一条产线在地面平面上的包围矩形。name 已去掉 P9 'a_' 前缀。 */
export interface WalkMapLine extends WalkMapRect {
  prim_path: string;
  name: string;
}

/** 俯视小地图数据：工厂整体范围 + 产线矩形 + 墙段矩形。
 *  walls 由 Kit 异步预热产出：walls_ready=false 时 walls 为空，隔 ~2s 重拉即可。 */
export interface WalkMapData extends WalkMapRect {
  lines: WalkMapLine[];
  walls?: WalkMapRect[];
  walls_ready?: boolean;
}

/** 漫游相机在地面平面上的位姿（pose_stream 推送/teleport 返回）。 */
export interface WalkPose2D {
  u: number;
  v: number;
  heading_deg: number;
  pitch_deg?: number;
}

/** 拉取俯视小地图数据（进入漫游后调一次即可；只依赖已打开的 stage）。 */
export async function kitWalkMap(): Promise<WalkMapData> {
  const res = await kitFetch('/ov/walk/map');
  if (!res.ok) {
    throw new Error(`Kit /ov/walk/map ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const body = (await res.json()) as { data: WalkMapData };
  return body.data;
}

/** 漫游"准星选中"（F 键）：让 Kit 对 viewport 中心做一次 GPU 拾取。结果不在响应里——
 *  命中后 Kit set selection → 走 /ov/selection_stream SSE 推给前端（空串=未命中清空选中）。
 *  为什么前端拦 F 而不是让串流库转发给 Kit：F 是 Kit viewport 的 Frame Selection 热键，
 *  会在到达漫游键盘回调前被热键系统消费掉（按了没反应）。 */
export async function kitWalkPick(): Promise<void> {
  const res = await kitFetch('/ov/walk/pick', { method: 'POST', body: '{}' });
  if (!res.ok) {
    throw new Error(`Kit /ov/walk/pick ${res.status}: ${await res.text().catch(() => '')}`);
  }
}

/** 漫游传送：传 prim_path 站到该产线正面并面向中心；传 (u,v) 直接落点（朝向不变）。 */
export async function kitWalkTeleport(
  target: { prim_path: string } | { u: number; v: number },
): Promise<WalkPose2D> {
  const res = await kitFetch('/ov/walk/teleport', {
    method: 'POST',
    body: JSON.stringify(target),
  });
  if (!res.ok) {
    throw new Error(`Kit /ov/walk/teleport ${res.status}: ${await res.text().catch(() => '')}`);
  }
  const body = (await res.json()) as { data: WalkPose2D };
  return body.data;
}

/** 订阅漫游相机平面位姿（漫游期间 Kit ~150ms 推一条）。EventSource 自动重连。
 *  返回 unsubscribe 函数。 */
export function subscribeWalkPose(onPose: (pose: WalkPose2D) => void): () => void {
  const es = new EventSource(`${KIT_BASE}/ov/walk/pose_stream`);
  es.onmessage = (ev) => {
    try {
      onPose(JSON.parse(ev.data) as WalkPose2D);
    } catch (err) {
      console.warn('[Kit] walk pose_stream parse failed:', err);
    }
  };
  es.onerror = (err) => {
    console.warn('[Kit] walk pose_stream error (auto-reconnect):', err);
  };
  return () => es.close();
}

// ─── viewport selection SSE 订阅 ─────────────────────────────────────────────

/** 订阅 Kit viewport selection 变化。EventSource 自动重连。
 *  回调拿到的 primPath 可能是空串（表示取消选中）。返回 unsubscribe 函数。
 *  注意：kitSelectMany（组高亮）自身引起的回声在此被吞掉（见 selectManyEcho）。 */
export function subscribeKitSelection(onPrim: (primPath: string) => void): () => void {
  const es = new EventSource(`${KIT_BASE}/ov/selection_stream`);
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data) as { prim_path?: string };
      const prim = data.prim_path ?? '';
      const echo = selectManyEcho;
      if (prim && echo && Date.now() < echo.until && echo.paths.has(prim)) return;
      onPrim(prim);
    } catch (err) {
      console.warn('[Kit] selection_stream parse failed:', err);
    }
  };
  es.onerror = (err) => {
    // 浏览器自动重连；只打日志方便排查
    console.warn('[Kit] selection_stream error (auto-reconnect):', err);
  };
  return () => es.close();
}

// ─── USD stage 加载结果 SSE 订阅 ─────────────────────────────────────────────

/** Kit USD stage 加载结果（由 aifactory.service.setup 的 openedStageResult 事件转发）。 */
export interface OpenedStageResult {
  url: string;
  result: 'success' | 'error';
  error: string;
}

/** 订阅 Kit USD stage 加载结果。EventSource 自动重连。每次加载完成 / 失败回调一次。
 *  result==='success' 表示场景已完全加载（资产 + 串流 idle）；'error' 时 error 含原因。
 *  返回 unsubscribe 函数。 */
export function subscribeOpenedStageResult(
  onResult: (r: OpenedStageResult) => void,
): () => void {
  const es = new EventSource(`${KIT_BASE}/ov/opened_stage_stream`);
  es.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data) as Partial<OpenedStageResult>;
      onResult({
        url: data.url ?? '',
        result: (data.result as 'success' | 'error') ?? 'error',
        error: data.error ?? '',
      });
    } catch (err) {
      console.warn('[Kit] opened_stage_stream parse failed:', err);
    }
  };
  es.onerror = (err) => {
    // 浏览器自动重连；只打日志方便排查
    console.warn('[Kit] opened_stage_stream error (auto-reconnect):', err);
  };
  return () => es.close();
}
