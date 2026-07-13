// 点击设备浮层：基于已 ingest 的 PlaybackEvent 流，就地计算 t 时刻该 prim 的状态 + 累计 KPI
// （不依赖后端额外接口）。SSE 推过来的是 prim_path，我们按 prim_path 精确匹配筛事件。
//
// 当前 t 状态判断：扫到 t 为止，最近一次 PROCESSING_START/PROCESSING_END/FAILURE_START/FAILURE_END
// 的"状态轨迹"决定 IDLE / BUSY / FAILURE。同时累加 processingCount / failureCount / ngCount。
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlaybackEvent } from '@/lib/playback';

interface Props {
  primPath: string;
  events: PlaybackEvent[];
  tMs: number;
  onClose: () => void;
  /** equipment_id (UUID) → 设备显示名（中文），用于浮层标题。空映射 = fallback 用 equipment_id */
  equipmentNameById?: Map<string, string>;
  /** product_id (UUID) → 产品显示名（中文），用于"加工 X"。空映射 = fallback 用 product_id */
  productNameById?: Map<string, string>;
}

type EquipStatus = 'IDLE' | 'BUSY' | 'FAILURE';

interface DerivedStat {
  equipmentId: string;
  status: EquipStatus;
  currentProduct?: string;
  processingCount: number;
  failureCount: number;
  ngCount: number;
  totalEvents: number;
}

/** prim 是否出现在模拟事件中（全 history，不限 t）。配合 computeDerivedStat 区分
 *  "在 history 里但当前时刻前未生产" vs "完全不是设备"。 */
function hasEventInHistory(events: PlaybackEvent[], primPath: string): boolean {
  return events.some((e) => e.prim_path === primPath);
}


function computeDerivedStat(events: PlaybackEvent[], primPath: string, tMs: number): DerivedStat | null {
  const matched = events.filter((e) => e.prim_path === primPath && e.timestamp_ms <= tMs);
  if (matched.length === 0) return null;

  const equipmentId = matched[0].equipment_id ?? primPath.split('/').pop() ?? primPath;
  let status: EquipStatus = 'IDLE';
  let currentProduct: string | undefined;
  let processingCount = 0;
  let failureCount = 0;
  let ngCount = 0;

  for (const e of matched) {
    switch (e.event_type) {
      case 'PROCESSING_START':
        status = 'BUSY';
        currentProduct = e.product_id ?? undefined;
        break;
      case 'PROCESSING_END':
        if (status === 'BUSY') status = 'IDLE';
        currentProduct = undefined;
        processingCount += 1;
        break;
      case 'FAILURE_START':
        status = 'FAILURE';
        failureCount += 1;
        break;
      case 'FAILURE_END':
        status = 'IDLE';
        break;
      case 'NG_DETECTED':
        ngCount += 1;
        break;
    }
  }
  return {
    equipmentId,
    status,
    currentProduct,
    processingCount,
    failureCount,
    ngCount,
    totalEvents: matched.length,
  };
}

function DeviceStatusOverlayInner({
  primPath, events, tMs, onClose, equipmentNameById, productNameById,
}: Props) {
  const { t } = useTranslation();
  const stat = useMemo(
    () => computeDerivedStat(events, primPath, tMs),
    [events, primPath, tMs],
  );

  if (!primPath) return null;

  // 三种场景：
  //   a) 在 events history 里但当前 t 前无事件 → 显示常规 KPI 浮层，状态 IDLE，KPI 全 0
  //   b) 在 history 里但既不在 ≤t 也不在 >t（兜底，理论不发生）→ 数据异常文案
  //   c) 完全不在 events 里 → 装饰几何/未建模设备
  const inHistory = hasEventInHistory(events, primPath);
  if (!stat) {
    if (inHistory) {
      // 看是否 history 里其它时间能找出 equipment_id，用作浮层标题（否则用 prim_path basename）
      const firstEvent = events.find((e) => e.prim_path === primPath);
      const eqId = firstEvent?.equipment_id ?? primPath.split('/').pop() ?? primPath;
      return renderStatPanel({
        equipmentId: eqId,
        status: 'IDLE',
        currentProduct: undefined,
        processingCount: 0,
        failureCount: 0,
        ngCount: 0,
        totalEvents: 0,
      }, equipmentNameById, productNameById, onClose, t);
    }
    // c) 完全不在 events 流 —— 装饰几何
    return (
      <div className="w-80 bg-[var(--c-0b1d30)]/75 border border-[var(--c-1e3a55)]/70 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden">
        <div className="flex items-start justify-between px-4 pt-3 pb-2">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">{t('Non-equipment prim')}</div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 ml-2 flex-shrink-0" aria-label={t('Close')}>
            <X size={14} />
          </button>
        </div>
        <div className="px-4 pb-4 text-xs text-slate-500 leading-relaxed">
          {t('This prim is not equipment in the simulation events (it may be decorative geometry or an unmodeled device).')}
        </div>
      </div>
    );
  }

  return renderStatPanel(stat, equipmentNameById, productNameById, onClose, t);
}

function renderStatPanel(
  stat: DerivedStat,
  equipmentNameById: Map<string, string> | undefined,
  productNameById: Map<string, string> | undefined,
  onClose: () => void,
  t: TFunction,
) {
  const statusColor =
    stat.status === 'BUSY' ? 'text-amber-400' :
    stat.status === 'FAILURE' ? 'text-red-400' :
    'text-emerald-400';
  const statusLabel =
    stat.status === 'BUSY' ? t('Running') :
    stat.status === 'FAILURE' ? t('Down') :
    t('Idle');
  const statusDotBg =
    stat.status === 'BUSY' ? 'bg-amber-400' :
    stat.status === 'FAILURE' ? 'bg-red-400' :
    'bg-emerald-400';

  // UUID → 中文设备名；映射缺失则 fallback 用 equipment_id 切前 8 字符（避免巨长 UUID）
  const equipmentDisplay = equipmentNameById?.get(stat.equipmentId)
    ?? (stat.equipmentId.length > 12 ? stat.equipmentId.slice(0, 8) : stat.equipmentId);
  const productDisplay = stat.currentProduct
    ? (productNameById?.get(stat.currentProduct) ?? stat.currentProduct)
    : undefined;

  return (
    <div className="w-80 bg-[var(--c-0b1d30)]/75 border border-[var(--c-1e3a55)]/70 rounded-xl shadow-2xl backdrop-blur-md overflow-hidden">
      <div className="flex items-start justify-between px-4 pt-3 pb-2">
        <div className="min-w-0">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">{t('Equipment')}</div>
          <div className="text-sm font-bold text-slate-100 truncate" title={equipmentDisplay}>
            {equipmentDisplay}
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-200 ml-2 flex-shrink-0"
          aria-label={t('Close')}
        >
          <X size={14} />
        </button>
      </div>

      <div className="px-4 pb-3 flex items-center gap-2">
        <span className={cn('w-2 h-2 rounded-full', statusDotBg)} />
        <span className={cn('text-xs font-semibold', statusColor)}>{statusLabel}</span>
        {productDisplay && (
          <span className="text-[10px] text-slate-400 ml-1 truncate" title={productDisplay}>
            {t('Processing')} <span className="text-cyan-300">{productDisplay}</span>
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 px-4 pb-3">
        <div className="bg-[var(--c-07111e)]/60 rounded-lg py-2 text-center">
          <div className="text-sm font-bold text-slate-200 font-mono">{stat.processingCount}</div>
          <div className="text-[9px] text-slate-500">{t('Completed Count')}</div>
        </div>
        <div className="bg-[var(--c-07111e)]/60 rounded-lg py-2 text-center">
          <div className="text-sm font-bold text-red-300 font-mono">{stat.failureCount}</div>
          <div className="text-[9px] text-slate-500">{t('Failures')}</div>
        </div>
        <div className="bg-[var(--c-07111e)]/60 rounded-lg py-2 text-center">
          <div className="text-sm font-bold text-amber-300 font-mono">{stat.ngCount}</div>
          <div className="text-[9px] text-slate-500">{t('NG Count')}</div>
        </div>
      </div>
    </div>
  );
}

// memo：同 LineProgressPanel，state 轮询带动父重渲染但 overlay 只关心 primPath/events/tMs。
export const DeviceStatusOverlay = memo(DeviceStatusOverlayInner);
