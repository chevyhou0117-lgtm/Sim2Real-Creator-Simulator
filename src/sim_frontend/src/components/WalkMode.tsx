// 自由漫游（FPS 风格，指针锁自由视角）：
//   · 看：点一下画面锁定指针后，【移动鼠标即可转视角，无需按任何键】。前端捕获 pointer-lock
//     的 movementX/Y 累加成 yaw/pitch 增量，默认经 WebRTC 数据通道发给 Kit（见 LOOK_TRANSPORT）。
//   · 走：W/A/S/D（水平面、锁眼高）。键盘不被本层拦截，由串流库转发给 Kit，Kit 侧每帧控制器
//     读取并移动（见 kit-app-template 的 _walk_move_tick）。Shift 加速。
//   · F：准星选中设备——前端拦下 F（不转发：F 是 Kit 的 Frame Selection 热键，转发过去
//     会被热键系统消费，漫游键盘回调收不到）→ POST /ov/walk/pick → Kit 对 viewport 中心
//     拾取 → selection SSE → 页面右上角设备信息面板。
//   · Tab：传送轮盘。capture 阶段拦下（阻止浏览器切焦点 + 不转发给 Kit），解锁指针选产线，
//     点击 → POST /ov/walk/teleport。ESC/再按 Tab/点空白 关闭。
//   · 小地图：进入时拉 /ov/walk/map（产线俯视矩形），订阅 /ov/walk/pose_stream（~150ms
//     一条平面位姿）→ 左下角 WalkMinimap；点击地图任意点也可传送。
//   · Kit 每帧统一按 (eye, yaw, pitch) 写相机 → 看/走/传送都在渲染循环内，画面持续更新不掉帧。
//   · ESC 退出（轮盘开着时先关轮盘）。整页全屏由父组件（SimulationRunningPage）负责。
//
// 说明：本层拦截【鼠标】用于锁定指针+取增量（看视角走前端）；键盘只拦 Tab/F/ESC（WASD/Shift
// 照常转发给 Kit）。灵敏度见 LOOK_SENSITIVITY，调大转得更快（能一甩回头）。
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  kitWalkEnter, kitWalkExit, kitWalkStep, kitWalkMap, kitWalkPick, kitWalkTeleport,
  subscribeWalkPose, type WalkMapData, type WalkMapLine, type WalkPose2D,
} from '@/lib/kit';
import AppStream from './composer/AppStream';
import { WalkTeleportWheel } from './WalkTeleportWheel';
import { WalkMinimap } from './WalkMinimap';

// look 增量的传输方式：
//   'datachannel'（默认，推荐）= 走 WebRTC 数据通道 AppStream.sendMessage，Kit 侧由
//      omni.kit.livestream.messaging 收（见 OpenUsdController.setup_walk_input_channel）。
//      低延迟、不经 HTTP、不占用渲染主循环的请求处理 → 避免"请求一多卡爆"。
//   'http' = 回退：走 HTTP POST /ov/walk/step（带单发合并防堆积）。若数据通道在直连模式下不通
//      （看视角没反应但 WASD 能走），把这里改成 'http' 即可一键回退。
const LOOK_TRANSPORT: 'datachannel' | 'http' = 'datachannel';
const LOOK_EVENT = 'fii.walk.look';  // 与 Kit 侧 _WALK_LOOK_EVENT 对应

// 转视角灵敏度（度/像素）。指针锁下 movementX/Y 会累加，值越大转得越快。
// 0.25：一次约 400px 的甩动 ≈ 100°，大幅甩动可轻松回头（180°+）。觉得还不够就调大。
const LOOK_SENSITIVITY = 0.25;
// 单次发送的最大转动度数（防抖）：pointer lock 偶发巨大 movement（切窗口/系统打嗝）不至于把
// 视角一下甩飞。注意是"每次发送"而非每帧——因为下面用单发合并(single-flight)，一次发送可能
// 合并了多帧的增量，所以放宽到 90°，既能快速甩头回身、又挡住异常尖峰。
const MAX_LOOK_PER_SEND_DEG = 90;

interface Props {
  active: boolean;
  onExit: () => void;
  /** 产线 prim 路径 → 中文名（master data），传送轮盘/小地图显示用；缺失回退 prim 名。 */
  linePrimNames?: Map<string, string>;
}

/** 把键盘焦点还给 3D 画面 video。串流库的键盘转发挂在 video 元素上——焦点一旦被
 *  轮盘按钮/小地图点击抢走，WASD 就到不了 Kit（"传送后走不动"的根因）。 */
function focusVideo() {
  const vid = document.getElementById('remote-video') as HTMLVideoElement | null;
  vid?.focus?.({ preventScroll: true });
}

/** 把 3D 画面 video 元素重新锁上指针（并回焦点）。requestPointerLock 需要用户手势；
 *  本函数只在 keydown / click 处理器里调用（均算手势），失败静默——用户点一下画面即可再锁。 */
function lockPointer() {
  focusVideo();
  if (document.pointerLockElement) return;
  const vid = document.getElementById('remote-video');
  try {
    vid?.requestPointerLock?.();
  } catch { /* 非手势上下文被拒：忽略 */ }
}

export function WalkMode({ active, onExit, linePrimNames }: Props) {
  const { t } = useTranslation();
  // onExit 每次父组件重渲染都是新引用；用 ref 持有，主 effect 只依赖 active（否则会反复进出漫游）。
  const onExitRef = useRef(onExit);
  useEffect(() => { onExitRef.current = onExit; });

  // 传送轮盘开关 + 小地图数据/位姿。keydown 闭包里读 ref 避免 stale state。
  const [wheelOpen, setWheelOpen] = useState(false);
  const wheelOpenRef = useRef(false);
  useEffect(() => { wheelOpenRef.current = wheelOpen; }, [wheelOpen]);
  const [map, setMap] = useState<WalkMapData | null>(null);
  const [pose, setPose] = useState<WalkPose2D | null>(null);

  useEffect(() => {
    if (!active) return;
    kitWalkEnter().catch((err) => console.warn('[Walk] kitWalkEnter 失败:', err));
    // 小地图：产线矩形立即可用；墙体由 Kit 异步预热（walls_ready=false 时隔 2s 重拉，
    // 拿到即止，最多 8 次）。pose 走 SSE 持续推。
    let mapTimer: ReturnType<typeof setTimeout> | null = null;
    const fetchMap = (attempt: number) => {
      kitWalkMap()
        .then((m) => {
          setMap(m);
          if (!m.walls_ready && attempt < 8) {
            mapTimer = setTimeout(() => fetchMap(attempt + 1), 2000);
          }
        })
        .catch((err) => console.warn('[Walk] kitWalkMap 失败（小地图不显示）:', err));
    };
    fetchMap(0);
    const unsubPose = subscribeWalkPose(setPose);
    // 进入即把焦点给 video：WASD（串流库从 video 转发）不用先点一下画面就能走
    focusVideo();

    const lookBuf = { dyaw: 0, dpitch: 0 };
    let raf: number | null = null;

    const onMove = (e: MouseEvent) => {
      if (!document.pointerLockElement) return;      // 未锁指针时不转，避免误动
      lookBuf.dyaw -= e.movementX * LOOK_SENSITIVITY;   // 鼠标右移 = 向右转（yaw 减）
      lookBuf.dpitch -= e.movementY * LOOK_SENSITIVITY;  // 鼠标上移 = 抬头（movementY 上为负）
    };
    const onKey = (e: KeyboardEvent) => {
      // Tab：传送轮盘开关。preventDefault 阻止浏览器切焦点；stopPropagation 不给串流库
      // 转发到 Kit（Kit 侧 Tab 可能有自己的行为）。WASD/Shift 原样放行，F 见下。
      if (e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        if (e.repeat) return;
        const opening = !wheelOpenRef.current;
        setWheelOpen(opening);
        if (opening) {
          if (document.pointerLockElement) document.exitPointerLock();
        } else {
          lockPointer();
        }
        return;
      }
      // F：准星选中。拦下不转发（F 是 Kit 的 Frame Selection 热键，转发过去会在到达
      // 漫游键盘回调前被热键系统消费 → 按了没反应），改调 HTTP /ov/walk/pick；
      // 命中结果经既有 selection SSE 回推 → 右上角设备信息面板。
      if ((e.key === 'f' || e.key === 'F') && !wheelOpenRef.current) {
        e.preventDefault();
        e.stopPropagation();
        if (!e.repeat) {
          kitWalkPick().catch((err) => console.warn('[Walk] pick 失败:', err));
        }
        return;
      }
      if (e.key === 'Escape') {
        if (wheelOpenRef.current) { setWheelOpen(false); return; }  // 先关轮盘，不退漫游
        // 两段式 ESC：锁定中 → 只放开鼠标（可点小地图/轮盘），漫游继续；
        // 已放开 → 才真正退出漫游。注：指针锁下浏览器多半自己消费 ESC（unlock 且不派发
        // keydown），这个分支是兜底，两种浏览器行为下语义一致。
        if (document.pointerLockElement) { document.exitPointerLock(); return; }
        onExitRef.current();
      }
    };
    // 点击 3D 画面（video）→ 锁定指针开始自由视角。覆盖层是 pointer-events-none（不挡 video →
    // 键盘/WASD 照常转发给 Kit），所以点击会穿透到 video，这里在 window 层捕获并给 video 请求锁。
    const onClick = (e: MouseEvent) => {
      if (document.pointerLockElement || wheelOpenRef.current) return;
      const vid = document.getElementById('remote-video');
      if (vid && e.target instanceof Node && vid.contains(e.target)) {
        vid.requestPointerLock?.();
      }
    };
    const clamp = (v: number) =>
      Math.max(-MAX_LOOK_PER_SEND_DEG, Math.min(MAX_LOOK_PER_SEND_DEG, v));
    // HTTP 回退用的单发合并（single-flight）：同一时刻最多一个 walk_step 在途，防止请求在浏览器
    // 连接队列里堆积。数据通道模式不需要（sendMessage 是数据报式、无 HTTP 队列/背压）。
    let inFlight = false;
    const tick = () => {
      if (lookBuf.dyaw || lookBuf.dpitch) {
        if (LOOK_TRANSPORT === 'datachannel') {
          const dyaw = clamp(lookBuf.dyaw);
          const dpitch = clamp(lookBuf.dpitch);
          lookBuf.dyaw = 0;
          lookBuf.dpitch = 0;
          try {
            // 传【对象】而非 JSON 字符串：串流库内部会自行序列化，预先 stringify 会双重编码，
            // Kit 侧 _unpack_message 解回来是字符串而非 dict → "string indices must be integers"。
            AppStream.sendMessage({ event_type: LOOK_EVENT, payload: { dyaw, dpitch } });
          } catch { /* 数据通道未就绪，静默丢弃本帧增量 */ }
        } else if (!inFlight) {
          const dyaw = clamp(lookBuf.dyaw);
          const dpitch = clamp(lookBuf.dpitch);
          lookBuf.dyaw = 0;
          lookBuf.dpitch = 0;
          inFlight = true;
          kitWalkStep({ dyaw_deg: dyaw, dpitch_deg: dpitch })
            .catch(() => { /* 高频，静默 */ })
            .finally(() => { inFlight = false; });
        }
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('keydown', onKey, true);  // capture：Tab 必须抢在浏览器/串流库前面
    window.addEventListener('click', onClick);
    raf = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('click', onClick);
      if (raf !== null) cancelAnimationFrame(raf);
      if (mapTimer !== null) clearTimeout(mapTimer);
      if (document.pointerLockElement) document.exitPointerLock();
      unsubPose();
      setMap(null);
      setPose(null);
      setWheelOpen(false);
      kitWalkExit().catch(() => {});
    };
  }, [active]);

  if (!active) return null;

  const nameOf = (line: WalkMapLine) => linePrimNames?.get(line.prim_path) ?? line.name;

  const handleWheelSelect = (line: WalkMapLine) => {
    setWheelOpen(false);
    kitWalkTeleport({ prim_path: line.prim_path })
      .catch((err) => console.warn('[Walk] teleport 失败:', err));
    lockPointer();  // click 手势内，可直接重锁继续漫游
  };

  const handleMapTeleport = (u: number, v: number) => {
    kitWalkTeleport({ u, v }).catch((err) => console.warn('[Walk] teleport 失败:', err));
    focusVideo();  // 点小地图不锁指针，但把键盘焦点还给 video，落地就能 WASD
  };

  return (
    <div className="absolute inset-0 z-30 pointer-events-none">
      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 bg-blue-900/70 text-blue-100 text-[11px] font-mono px-3 py-1 rounded border border-blue-500/40 pointer-events-none">
        {t('🚶 Roam · Click to lock · WASD move · Shift sprint · F select · Tab teleport · ESC release mouse / again to exit')}
      </div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white/70 rounded-full pointer-events-none shadow" />

      {/* 左下角俯视小地图（点击可传送；指针锁定时点不到，天然不冲突） */}
      <div className="absolute bottom-3 left-3 z-30">
        <WalkMinimap map={map} pose={pose} nameOf={nameOf} onTeleport={handleMapTeleport} />
      </div>

      {/* Tab 传送轮盘 */}
      {wheelOpen && (
        <WalkTeleportWheel
          lines={map?.lines ?? []}
          nameOf={nameOf}
          onSelect={handleWheelSelect}
          onClose={() => { setWheelOpen(false); lockPointer(); }}
        />
      )}
    </div>
  );
}
