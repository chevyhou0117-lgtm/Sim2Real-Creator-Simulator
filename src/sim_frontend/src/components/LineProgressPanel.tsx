/** 产线进度面板：右上常驻浮层，列出每条产线的实时完成进度与 LBR 时序曲线。
 *
 * 每行布局（同行）：mini LBR 折线图（左）+ 完成进度文字（右）。
 *
 * 计算口径：
 *   - 完成数 = events 流里"该线最后一台设备" PROCESSING_END 数量（t_ms ≤ tMs）
 *     之前用 PRODUCT_COMPLETE 会出现部分线没事件、长时间 0/total 的情况；
 *     改用最后一台设备的完成数即"出该线的件数"，与用户视角一致。
 *   - 目标数 = plan_tasks 里该 line 所有 task 的 plan_quantity 之和
 *   - LBR 曲线 = result_summary.line_lbr_timeseries[line_id].points (t_min × lbr 0~1)
 *     模拟完成时一次性算好；回放时画一条垂直线随 tMs 滑动（"实时"指播放头移动）。 */

import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';
import type { PlaybackEvent } from '@/lib/playback';

interface Props {
  events: PlaybackEvent[];
  tMs: number;
  /** equipment_id → {name, line_id}，用于按 line 反查 */
  equipmentInfoById: Map<string, { name: string; line_id: string }>;
  /** line_id → {name, lbr?, targetQty, sortKey(stage.sequence)} */
  lineStatById: Map<string, { name: string; lbr: number | null; targetQty: number; sortKey: number }>;
  /** line_id → 该线"最后一台设备"id，PROCESSING_END 计数即完成产量 */
  lineLastEquipmentById: Map<string, string>;
  /** line_id → LBR 时序点（来自后端 result_summary.line_lbr_timeseries） */
  lbrSeriesByLine: Map<string, Array<{ t_min: number; lbr: number | null }>>;
}

function LineProgressPanelInner({
  events, tMs, equipmentInfoById, lineStatById, lineLastEquipmentById, lbrSeriesByLine,
}: Props) {
  const { t } = useTranslation();
  // 完成数：扫一次 events，按 "该线最后一台设备 PROCESSING_END" 计数
  const completedByLine = useMemo(() => {
    const lastEqToLine = new Map<string, string>();
    for (const [lineId, eqId] of lineLastEquipmentById) lastEqToLine.set(eqId, lineId);
    const m = new Map<string, number>();
    for (const e of events) {
      if (e.event_type !== 'PROCESSING_END') continue;
      if (e.timestamp_ms > tMs) continue;
      if (!e.equipment_id) continue;
      const lineId = lastEqToLine.get(e.equipment_id);
      if (!lineId) continue;
      m.set(lineId, (m.get(lineId) ?? 0) + 1);
    }
    return m;
  }, [events, tMs, lineLastEquipmentById]);
  void equipmentInfoById;  // 当前不用，保留 prop 以便后续扩展（如设备级面板复用）

  if (lineStatById.size === 0) return null;

  const tMin = tMs / 60_000;  // 折线图 x 轴单位 = 分钟
  // 按制程顺序排序（stage.sequence 升序），同 stage 内按 name 二级
  const lines = [...lineStatById.entries()]
    .map(([line_id, info]) => ({ line_id, ...info }))
    .sort((a, b) => a.sortKey - b.sortKey || a.name.localeCompare(b.name));

  return (
    <div className="w-80 h-full bg-[var(--c-0b1d30)]/75 border border-[var(--c-1e3a55)]/70 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden flex flex-col">
      <div className="px-4 py-2 border-b border-[var(--c-142235)] flex items-center justify-between flex-shrink-0">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{t('Line Progress')}</span>
        <span className="text-[9px] text-slate-600">{t('Real-time LBR · Completed')}</span>
      </div>
      <div className="flex-1 overflow-y-auto min-h-0">
        {lines.map((line) => {
          const done = completedByLine.get(line.line_id) ?? 0;
          const total = line.targetQty;
          const pct = total > 0 ? Math.min(1, done / total) : 0;
          const series = lbrSeriesByLine.get(line.line_id) ?? [];
          // 当前 LBR：series 是 t_min 升序，找最近一个 ≤ tMin 的非 null
          let currentLbr: number | null = null;
          for (const p of series) {
            if (p.t_min > tMin) break;
            if (p.lbr != null) currentLbr = p.lbr;
          }
          const lbrColor = currentLbr == null ? 'text-slate-600'
            : currentLbr >= 0.85 ? 'text-emerald-400'
            : currentLbr >= 0.7 ? 'text-amber-400' : 'text-red-400';
          return (
            <div key={line.line_id} className="px-3 py-2 border-b border-[var(--c-0e1e2e)]/60 last:border-b-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[11px] text-slate-200 font-medium truncate flex-1" title={line.name}>
                  {line.name}
                </span>
                <span className="text-[9px] text-slate-500 flex-shrink-0">LBR</span>
                <span className={cn('text-[11px] font-mono font-semibold tabular-nums', lbrColor)}>
                  {currentLbr == null ? '—' : `${(currentLbr * 100).toFixed(1)}%`}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* 左：mini LBR 折线图（无数据则占位） */}
                <div className="w-[150px] h-[44px] flex-shrink-0">
                  {series.length > 0 ? (
                    <MiniLbrChart points={series} tMin={tMin} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[9px] text-slate-600 bg-[var(--c-040d16)] rounded border border-[var(--c-142235)]/50">
                      {t('No LBR data')}
                    </div>
                  )}
                </div>
                {/* 右：完成数 + 进度条 */}
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-mono text-slate-200 tabular-nums truncate">
                    {done}<span className="text-slate-600"> / {total || '—'}</span>
                  </div>
                  <div className="mt-1 h-1.5 bg-[var(--c-040d16)] rounded-full overflow-hidden">
                    <div
                      className={cn('h-full transition-all', pct >= 1 ? 'bg-emerald-500' : 'bg-blue-500')}
                      style={{ width: `${pct * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// memo：state 轮询每次更新 playbackState 会带动父重渲染，但本组件只依赖 events/tMs/maps。
// 浅比较即可（Map 引用稳定即跳过）。events 数组在 enterReady 后不变，Map 也是一次性建好的。
export const LineProgressPanel = memo(LineProgressPanelInner);

/** 单条线的 mini LBR 折线图 + 当前时刻垂直参考线 */
function MiniLbrChart({
  points, tMin,
}: { points: Array<{ t_min: number; lbr: number | null }>; tMin: number }) {
  const { t } = useTranslation();
  // lbr 0~1 → 百分比，null 保持 null（recharts 默认在 null 处断线）
  const data = points.map(p => ({ t_min: p.t_min, lbr_pct: p.lbr == null ? null : p.lbr * 100 }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <XAxis dataKey="t_min" type="number" domain={['dataMin', 'dataMax']} hide />
        <YAxis domain={[0, 100]} hide />
        <Tooltip
          contentStyle={{ background: 'var(--c-040d16)', border: '1px solid var(--c-1e3a55)', fontSize: 10, padding: '2px 6px' }}
          labelFormatter={(v) => t('T+{{min}}min', { min: Number(v).toFixed(1) })}
          formatter={(v: number) => [`${v?.toFixed?.(1) ?? '—'}%`, 'LBR']}
        />
        <ReferenceLine x={tMin} stroke="#60a5fa" strokeDasharray="2 2" strokeWidth={1} />
        <Line
          type="monotone"
          dataKey="lbr_pct"
          stroke="#10b981"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
          connectNulls={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
