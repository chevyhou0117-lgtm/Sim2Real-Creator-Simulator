// 模拟回放交互式时间轴
//
// 受 SimulationRunningPage 现有的 RunningTimeline 启发，但拆出来做成"受控组件"：
//  - 父级负责轮询 GET /kit/playback/state 拿到 t_ms / speed / playing 状态
//  - 父级负责调用 controlPlayback(...) 把 user 操作发给 Kit
//  - 本组件只渲染 + 上抛 onSeek / onPlayPause / onSpeedChange 三种事件
//
// 关键交互：
//  - 进度条整条可点击 / 拖动 → seek
//  - 拖动期间 UI 用 draftPct 覆盖 state.t_ms（避免轮询把播放头扯回去）
//  - 鼠标释放后才真正发 seek，期间不发，避免请求洪泛
import React, { memo, useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlaybackState } from '@/lib/playback';

export interface TimelineEventMarker {
  /** 相对模拟起点的毫秒数 */
  tMs: number;
  /** 显示标签（hover tooltip 用） */
  label: string;
  /** 标记颜色（HEX 或 css color） */
  color: string;
}

interface PlaybackTimelineProps {
  durationMs: number;
  events: TimelineEventMarker[];
  state: PlaybackState | null;
  onSeek: (tMs: number) => void;
  onPlayPause: () => void;
  onSpeedChange: (factor: number) => void;
  className?: string;
}

const SPEED_OPTIONS = [0.5, 1, 2, 5, 10];

// 工厂日历起点（用于把模拟相对时间换算成"墙钟"显示，仅作展示用，跟 backend 默认 simulation_start_at 一致）
const WALL_CLOCK_BASE = new Date('2026-04-10T08:00:00');

function formatHMS(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatWall(ms: number): string {
  const d = new Date(WALL_CLOCK_BASE.getTime() + ms);
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function PlaybackTimelineInner({
  durationMs, events, state, onSeek, onPlayPause, onSpeedChange, className,
}: PlaybackTimelineProps) {
  const { t } = useTranslation();
  const railRef = useRef<HTMLDivElement>(null);
  // 拖动期间用 draftPct (0~1) 覆盖播放头位置；非拖动时为 null
  const [draftPct, setDraftPct] = useState<number | null>(null);
  const draggingRef = useRef(false);

  const livePct = state && durationMs > 0 ? Math.min(1, Math.max(0, state.t_ms / durationMs)) : 0;
  const displayPct = draftPct !== null ? draftPct : livePct;
  const displayMs = displayPct * durationMs;

  const isPlaying = state?.state === 'playing';

  // ── 拖动 / 点击 → seek ───────────────────────────────────────────────────
  const pctFromClient = useCallback((clientX: number): number => {
    const rail = railRef.current;
    if (!rail) return 0;
    const rect = rail.getBoundingClientRect();
    const raw = (clientX - rect.left) / rect.width;
    return Math.min(1, Math.max(0, raw));
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    setDraftPct(pctFromClient(e.clientX));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    setDraftPct(pctFromClient(e.clientX));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    const finalPct = pctFromClient(e.clientX);
    setDraftPct(null);
    onSeek(Math.floor(finalPct * durationMs));
  };

  // 键盘快捷键：空格 = play/pause（仅在组件 focus 时；这里挂在 window 上，简单起见）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        onPlayPause();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onPlayPause]);

  // ── ruler 刻度 ───────────────────────────────────────────────────────────
  // 自适应间隔：duration < 1h → 5min；< 6h → 30min；< 24h → 1h；否则 4h
  const tickIntervalMs = (() => {
    if (durationMs <= 0) return 60_000;
    const h = durationMs / 3_600_000;
    if (h <= 1) return 5 * 60 * 1000;
    if (h <= 6) return 30 * 60 * 1000;
    if (h <= 24) return 60 * 60 * 1000;
    return 4 * 60 * 60 * 1000;
  })();
  const ticks: number[] = [];
  for (let t = 0; t <= durationMs; t += tickIntervalMs) ticks.push(t);

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className={cn('bg-[var(--c-020a12)] border-t border-[var(--c-1e3a55)]/60 select-none flex-shrink-0', className)}>
      {/* Ruler — 整条可点击 / 拖动 */}
      <div
        ref={railRef}
        className="relative h-6 mx-4 mt-2 cursor-pointer"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="absolute inset-y-0 left-0 right-0 rounded-sm bg-[var(--c-07111e)] border border-[var(--c-142235)]" />

        {/* Elapsed fill */}
        <div className="absolute inset-y-0 left-0 bg-blue-600/20 rounded-l-sm pointer-events-none"
          style={{ width: `${displayPct * 100}%` }} />

        {/* Ticks + hour labels */}
        {ticks.map(t => {
          const pct = (t / durationMs) * 100;
          if (pct > 100.1) return null;
          const isMajor = (t / tickIntervalMs) % 2 === 0 || ticks.length <= 12;
          return (
            <div key={t} className="absolute top-0 bottom-0 flex flex-col items-start pointer-events-none" style={{ left: `${pct}%` }}>
              <div className={cn('w-px', isMajor ? 'h-2 bg-[var(--c-2a4a6a)]' : 'h-1.5 bg-[var(--c-1a2e42)]')} />
              {isMajor && (
                <span className="text-[8px] font-mono text-slate-400 whitespace-nowrap" style={{ marginLeft: 2 }}>
                  {formatHMS(t)}
                </span>
              )}
            </div>
          );
        })}

        {/* Event markers (异常类) */}
        {events.map((ev, i) => {
          const pct = (ev.tMs / durationMs) * 100;
          if (pct > 100 || pct < 0) return null;
          return (
            <div
              key={`${ev.tMs}-${i}`}
              className="absolute top-0 bottom-0 flex items-center group pointer-events-none"
              style={{ left: `${pct}%` }}
            >
              <div className="w-2 h-2 rotate-45 border flex-shrink-0 -translate-x-1/2"
                style={{ background: ev.color + '66', borderColor: ev.color }} />
              <div className="hidden group-hover:flex absolute bottom-full mb-1.5 -translate-x-1/2 bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded px-2 py-1 flex-col items-center z-20 pointer-events-none whitespace-nowrap" style={{ minWidth: 64 }}>
                <span className="text-[9px] font-medium" style={{ color: ev.color }}>{ev.label}</span>
                <span className="text-[8px] font-mono text-slate-400">{formatHMS(ev.tMs)}</span>
              </div>
            </div>
          );
        })}

        {/* Playhead */}
        <div className="absolute top-0 bottom-0 flex flex-col items-center z-10 pointer-events-none"
          style={{ left: `${displayPct * 100}%` }}>
          <div className="w-px flex-1 bg-white/80" />
          <div className="w-0 h-0 flex-shrink-0"
            style={{ borderLeft: '4px solid transparent', borderRight: '4px solid transparent', borderTop: '6px solid rgba(255,255,255,0.85)' }} />
        </div>
      </div>

      {/* Controls row */}
      <div className="flex items-center gap-3 px-4 py-2">
        {/* Play / Pause */}
        <button
          onClick={onPlayPause}
          className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:bg-blue-600/30 transition-colors"
          title={isPlaying ? t('Pause (Space)') : t('Play (Space)')}
        >
          {isPlaying ? <Pause size={12} /> : <Play size={12} />}
        </button>

        {/* Time display */}
        <div className="flex items-center gap-1.5 bg-[var(--c-040d16)] border border-[var(--c-142235)] rounded px-2.5 py-1 flex-shrink-0">
          <span className="text-[11px] font-mono text-slate-300 tracking-widest">{formatHMS(displayMs)}</span>
          <span className="text-[9px] text-slate-500 mx-1">/</span>
          <span className="text-[9px] font-mono text-slate-400">{formatHMS(durationMs)}</span>
        </div>

        {/* Wall clock */}
        <span className="text-[10px] font-mono text-slate-400">{formatWall(displayMs)}</span>

        <div className="flex-1" />

        {/* Speed selector */}
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-slate-500 mr-1">{t('Speed')}</span>
          {SPEED_OPTIONS.map(s => (
            <button
              key={s}
              onClick={() => onSpeedChange(s)}
              className={cn(
                'px-1.5 py-0.5 rounded text-[9px] font-mono transition-colors',
                state?.speed === s
                  ? 'bg-blue-600/25 text-blue-300 border border-blue-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent hover:border-[var(--c-1e3a55)]',
              )}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* REPLAY indicator (替代旧的 LIVE) */}
        <div className={cn(
          'flex items-center gap-1.5 border rounded px-2 py-0.5',
          isPlaying
            ? 'bg-emerald-600/15 border-emerald-500/30'
            : 'bg-slate-700/15 border-slate-500/30',
        )}>
          <div className={cn(
            'w-1.5 h-1.5 rounded-full flex-shrink-0',
            isPlaying ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400',
          )} />
          <span className={cn(
            'text-[9px] font-mono font-semibold',
            isPlaying ? 'text-emerald-300' : 'text-slate-400',
          )}>
            REPLAY
          </span>
        </div>
      </div>
    </div>
  );
}

// memo：父组件每 500ms setPlaybackState 都会重渲染，但 timeline 自己已经持有 state prop
// 显示拖动；只在 state / events / duration 变化时重渲染就够。父传 onSeek/onPause/onSpeed
// 必须用 useCallback 保持 identity（否则 memo 失效）。
export const PlaybackTimeline = memo(PlaybackTimelineInner);
