/** 物料库存面板：右侧常驻浮层，列出每种原料的实时库存量 + 库存时序曲线。
 * 与 LineProgressPanel 同构（同样 150px mini 折线图 + 当前时刻播放头参考线 + 右侧数值/占比条），
 * 两图等宽、同精度（均 60s/分钟 1 点）。数据来自 60s 快照 warehouse_states，父页面一次性拉好传入。
 * 库存为 0 时标红「缺料」。物料供应约束未启用 / 无库存数据时面板不渲染。 */

import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { LineChart, Line, XAxis, YAxis, ReferenceLine, ResponsiveContainer, Tooltip } from 'recharts';
import { cn } from '@/lib/utils';

interface Props {
  /** material_code → 库存时序点 [{t_min, qty}]（t_min 升序） */
  seriesByMaterial: Map<string, Array<{ t_min: number; qty: number }>>;
  tMs: number;
}

function MaterialInventoryPanelInner({ seriesByMaterial, tMs }: Props) {
  const { t } = useTranslation();
  if (seriesByMaterial.size === 0) return null;

  const tMin = tMs / 60_000;
  const mats = [...seriesByMaterial.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="w-80 bg-[var(--c-0b1d30)]/75 border border-[var(--c-1e3a55)]/70 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden flex flex-col">
      <div className="px-4 py-2 border-b border-[var(--c-142235)] flex items-center justify-between flex-shrink-0">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{t('Material inventory')}</span>
        <span className="text-[9px] text-slate-600">{t('Real-time stock')}</span>
      </div>
      <div className="overflow-y-auto min-h-0" style={{ maxHeight: 260 }}>
        {mats.map(([code, series]) => {
          // 当前库存：最近一个 t_min ≤ tMin 的点；峰值：用于右侧占比条
          let cur = series.length ? series[0].qty : 0;
          let peak = 0;
          for (const p of series) {
            if (p.qty > peak) peak = p.qty;
            if (p.t_min <= tMin) cur = p.qty;
          }
          const out = cur <= 0;
          const fill = peak > 0 ? Math.min(1, cur / peak) : 0;
          return (
            <div key={code} className="px-3 py-2 border-b border-[var(--c-0e1e2e)]/60 last:border-b-0">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[11px] text-slate-200 font-medium truncate flex-1" title={code}>{code}</span>
                <span className="text-[9px] text-slate-500 flex-shrink-0">{t('Stock')}</span>
                <span className={cn('text-[11px] font-mono font-semibold tabular-nums', out ? 'text-red-400' : 'text-amber-300')}>
                  {Math.round(cur)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {/* 左：mini 库存折线图（150px，与 LBR 图等宽） */}
                <div className="w-[150px] h-[44px] flex-shrink-0">
                  <MiniStockChart points={series} tMin={tMin} />
                </div>
                {/* 右：当前库存 + 相对峰值占比条 */}
                <div className="flex-1 min-w-0">
                  <div className={cn('text-[11px] font-mono tabular-nums truncate', out ? 'text-red-400' : 'text-slate-200')}>
                    {Math.round(cur)}{out ? ` ⚠${t('Out of stock')}` : ''}
                  </div>
                  <div className="mt-1 h-1.5 bg-[var(--c-040d16)] rounded-full overflow-hidden">
                    <div className={cn('h-full transition-all', out ? 'bg-red-500' : 'bg-amber-500')} style={{ width: `${fill * 100}%` }} />
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

export const MaterialInventoryPanel = memo(MaterialInventoryPanelInner);

/** 单种物料的 mini 库存折线图 + 当前时刻垂直参考线（与 LineProgressPanel 的 MiniLbrChart 同款） */
function MiniStockChart({ points, tMin }: { points: Array<{ t_min: number; qty: number }>; tMin: number }) {
  const { t } = useTranslation();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={points} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <XAxis dataKey="t_min" type="number" domain={['dataMin', 'dataMax']} hide />
        <YAxis domain={[0, 'dataMax']} hide />
        <Tooltip
          contentStyle={{ background: 'var(--c-040d16)', border: '1px solid var(--c-1e3a55)', fontSize: 10, padding: '2px 6px' }}
          labelFormatter={(v) => t('T+{{min}}min', { min: Number(v).toFixed(1) })}
          formatter={(v: number) => [Math.round(v), t('Stock')]}
        />
        <ReferenceLine x={tMin} stroke="#60a5fa" strokeDasharray="2 2" strokeWidth={1} />
        <Line type="monotone" dataKey="qty" stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
