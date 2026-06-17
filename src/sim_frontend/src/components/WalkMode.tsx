// 第一人称漫游覆盖层
//
// active 切 true：
//   1) 调 kitWalkEnter() 让 Kit 把相机切到漫游姿态，拿到 eye_height 用于推估移动速度
//   2) 全局挂 WASD/Shift/ESC 键盘 + mousemove；ESC 或 pointer-lock 释放都触发 onExit
//   3) requestAnimationFrame 每帧汇总持有按键与累积鼠标位移 → kitWalkStep（~60Hz 节流）
// active 切 false：卸所有 listener，kitWalkExit() 让 Kit 相机恢复到记忆的俯视。
//
// 透明覆盖层接管 iframe 上方的点击：第一次点击触发 pointer lock，后续 mousemove 转 yaw/pitch。
// 锁未建立时 mousemove 不动视角（避免误抓鼠标），仅 WASD 仍然可用。
//
// 地面约束：不发 up 增量；后端 step 会把相机 Z (或 Y) clamp 回 enter 时的地面高度，
// 所以低头 + W 仍水平走，永远不会飞起/扎地。
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { kitWalkEnter, kitWalkExit, kitWalkStep } from '@/lib/kit';

interface Props {
  active: boolean;
  onExit: () => void;
}

// 鼠标灵敏度（°/px）— pointer lock 下 movementX/Y 是亚像素级
// 0.08 比 FPS 默认更温和，避免一格鼠标转半圈
const MOUSE_SENSITIVITY = 0.08;
// Shift 加速倍数
const SPRINT_FACTOR = 2.5;
// 每秒移动 = eye_height * SPEED_PER_EYE_HEIGHT
// 0.7 × 1.7m ≈ 1.2 m/s，接近正常步行速度（之前 2.0 过快，工厂内难看清）
const SPEED_PER_EYE_HEIGHT = 0.7;
const DEFAULT_EYE_HEIGHT = 1.7;
// 单帧最大转动度数 —— 防止 pointer lock 偶发巨大 movementX（窗口切换/系统打嗝）甩飞视角
const MAX_LOOK_PER_FRAME_DEG = 8;

export function WalkMode({ active, onExit }: Props) {
  const { t } = useTranslation();
  // 持有按键集合 / 鼠标累积视角增量 / 移动速度 — 全用 ref 避免 re-render 重建 tick
  const keysRef = useRef<Set<string>>(new Set());
  const lookBufRef = useRef({ dyaw: 0, dpitch: 0 });
  const speedRef = useRef<number>(DEFAULT_EYE_HEIGHT * SPEED_PER_EYE_HEIGHT);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let rafId: number | null = null;
    const cleanupFns: Array<() => void> = [];
    // 拷贝 ref.current 到 effect scope，cleanup 时引用稳定（避开 react-hooks/exhaustive-deps 误报）
    const keys = keysRef.current;
    const lookBuf = lookBufRef.current;

    (async () => {
      // 1) Kit 端进入漫游模式
      try {
        const pose = await kitWalkEnter();
        if (cancelled) {
          kitWalkExit().catch(() => {});
          return;
        }
        const eyeHeight = pose.eye_height && pose.eye_height > 0 ? pose.eye_height : DEFAULT_EYE_HEIGHT;
        speedRef.current = eyeHeight * SPEED_PER_EYE_HEIGHT;
      } catch (err) {
        console.warn('[Walk] kitWalkEnter failed:', err);
        if (!cancelled) onExit();
        return;
      }

      // 2) 挂键盘 / 鼠标 / pointer-lock-change 监听
      // 注：Q/E（上下飞行）已禁用——漫游必须贴地走（用户体验要求 + 无碰撞体积时避免穿模）
      const handledKeys = new Set(['w', 'a', 's', 'd', 'shift', 'escape']);
      const onKeyDown = (e: KeyboardEvent) => {
        const k = e.key.toLowerCase();
        if (!handledKeys.has(k)) return;
        e.preventDefault();
        if (k === 'escape') {
          onExit();
          return;
        }
        keys.add(k);
      };
      const onKeyUp = (e: KeyboardEvent) => {
        const k = e.key.toLowerCase();
        if (handledKeys.has(k)) keys.delete(k);
      };
      const onMouseMove = (e: MouseEvent) => {
        if (!document.pointerLockElement) return;
        // 鼠标右 = 向右看：USD 坐标系中 yaw 减（CCW 为正）
        lookBuf.dyaw -= e.movementX * MOUSE_SENSITIVITY;
        lookBuf.dpitch -= e.movementY * MOUSE_SENSITIVITY;
      };
      const onPLChange = () => {
        // 用户按 ESC 退出 pointer lock → 一并退出漫游
        if (!document.pointerLockElement) {
          onExit();
        }
      };
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);
      window.addEventListener('mousemove', onMouseMove);
      document.addEventListener('pointerlockchange', onPLChange);
      cleanupFns.push(() => {
        window.removeEventListener('keydown', onKeyDown);
        window.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('pointerlockchange', onPLChange);
      });

      // 3) raf tick — 每帧把累积输入推给 Kit
      let lastT = performance.now();
      const tick = (t: number) => {
        if (cancelled) return;
        // dt clamp 100ms — 卡顿/切后台回来时避免一帧巨大位移
        const dt = Math.min(0.1, (t - lastT) / 1000);
        lastT = t;
        let speed = speedRef.current;
        if (keys.has('shift')) speed *= SPRINT_FACTOR;
        let forward = 0;
        let right = 0;
        if (keys.has('w')) forward += speed * dt;
        if (keys.has('s')) forward -= speed * dt;
        if (keys.has('d')) right += speed * dt;
        if (keys.has('a')) right -= speed * dt;
        // 单帧 clamp：偶发巨大 movementX/Y（窗口切换、Alt-Tab 回来）不会甩飞视角
        const dyaw = Math.max(-MAX_LOOK_PER_FRAME_DEG, Math.min(MAX_LOOK_PER_FRAME_DEG, lookBuf.dyaw));
        const dpitch = Math.max(-MAX_LOOK_PER_FRAME_DEG, Math.min(MAX_LOOK_PER_FRAME_DEG, lookBuf.dpitch));
        lookBuf.dyaw = 0;
        lookBuf.dpitch = 0;

        if (forward || right || dyaw || dpitch) {
          kitWalkStep({
            forward,
            right,
            dyaw_deg: dyaw,
            dpitch_deg: dpitch,
          }).catch(() => { /* 高频调用，静默 */ });
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      cleanupFns.forEach((fn) => fn());
      keys.clear();
      lookBuf.dyaw = 0;
      lookBuf.dpitch = 0;
      kitWalkExit().catch(() => {});
      if (document.pointerLockElement) document.exitPointerLock();
    };
  }, [active, onExit]);

  if (!active) return null;

  return (
    <div
      className="absolute inset-0 z-30"
      style={{ cursor: document.pointerLockElement ? 'none' : 'crosshair' }}
      onClick={(e) => {
        // 第一次点击 → 请求 pointer lock；之后 mousemove 才会被识别为视角操作
        (e.currentTarget as HTMLDivElement).requestPointerLock?.();
      }}
    >
      <div className="absolute top-2.5 left-1/2 -translate-x-1/2 bg-blue-900/70 text-blue-100 text-[11px] font-mono px-3 py-1 rounded border border-blue-500/40 pointer-events-none">
        {t('🚶 Walk Mode · WASD to move · Mouse to look (click to lock) · Shift to sprint · ESC to exit')}
      </div>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-white/70 rounded-full pointer-events-none shadow" />
    </div>
  );
}
