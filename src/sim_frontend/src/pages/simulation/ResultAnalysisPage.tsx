import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, FileBarChart, Brain, Box, Download, AlertTriangle, TrendingUp, TrendingDown, Loader2, Settings2 } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell, ReferenceLine, PieChart, Pie,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { planApi } from '@/lib/api';
import type { SimResultOut, LineBalanceOut, OperationLoadDetail, TaskOut } from '@/types/api';
import {
  deviceUtilizationData, productionOutputData, materialStockData, eventLogData,
} from '@/mock/data';

// Pie chart 配色（按产品型号顺序循环取色）
const PRODUCT_COLORS = ['#3b82f6', '#06b6d4', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

const RESULT_TABS = [
  { id: 'output', label: 'Production Output Overview' },
  { id: 'lbr', label: 'Line Balance Rate' },
  { id: 'device', label: 'Equipment Utilization' },
  { id: 'material', label: 'Inventory & Material' },
  { id: 'events', label: 'Event Log' },
];


function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: unknown[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0b1d30] border border-[#1e3a55] rounded-xl px-3 py-2 text-xs shadow-xl">
      <div className="text-slate-400 mb-1">{label}</div>
      {(payload as Array<{ name: string; value: number; color: string }>).map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-400">{p.name}:</span>
          <span className="text-slate-200 font-medium">{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</span>
        </div>
      ))}
    </div>
  );
}

// Tab 1: Production Output
function OutputTab({ result, tasks }: { result: SimResultOut | null; tasks: TaskOut[] }) {
  const { t } = useTranslation();
  const totalOutput = result?.total_output ?? 0;
  const outputPerHour = result?.output_per_hour ? Number(result.output_per_hour) : 0;
  const overallLbr = result?.overall_lbr ? (Number(result.overall_lbr) * 100).toFixed(1) : '—';
  const failureCount = result?.equipment_failure_count ?? 0;

  const hourlyRaw = (result?.result_summary as { hourly_output?: Array<{ hour: number; actual: number; plan: number; defect: number }> } | null)?.hourly_output;
  const hourlyData = hourlyRaw?.length
    ? hourlyRaw.map(d => ({ hour: `${d.hour}h`, actual: d.actual, plan: d.plan, defect: d.defect }))
    : productionOutputData;

  // 工单维度聚合（每个 wo_id 取首条 task 代表，避免跨 stage 重复计数）
  const woMap = new Map<string, { wo_no: string; product_code: string; plan_qty: number }>();
  for (const t of tasks) {
    if (t.wo_id && !woMap.has(t.wo_id)) {
      woMap.set(t.wo_id, {
        wo_no: t.wo_no ?? t.wo_id.slice(0, 8),
        product_code: t.product_code,
        plan_qty: t.plan_quantity,
      });
    }
  }
  const wos = [...woMap.values()];
  const totalPlanQty = wos.reduce((s, w) => s + w.plan_qty, 0);

  // 产品型号分布：sum plan_qty per product_code（按 WO 维度计算）
  const productAgg = new Map<string, number>();
  for (const w of wos) {
    productAgg.set(w.product_code, (productAgg.get(w.product_code) ?? 0) + w.plan_qty);
  }
  const pieData = [...productAgg.entries()].map(([name, value], i) => ({
    name, value, fill: PRODUCT_COLORS[i % PRODUCT_COLORS.length],
  }));

  // 工单完工度：模拟 SUCCESS 且 total_output >= sum(plan_qty) 视为整体完工
  const isSuccess = result?.computation_status === 'SUCCESS';
  const allDone = isSuccess && totalPlanQty > 0 && totalOutput >= totalPlanQty;
  const completedWo = allDone ? wos.length : 0;
  const incompleteWos = allDone ? [] : wos;  // 当前后端尚未做 WO 级完工率，未完工时整体未完工

  return (
    <div className="space-y-5">
      {/* Key Metrics */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: t('Total Output'), value: totalOutput.toLocaleString(), sub: `${outputPerHour.toFixed(0)} pcs/h`, status: totalOutput > 0 ? 'good' : 'warn', icon: <TrendingUp size={14} /> },
          {
            label: t('Completed Work Orders'),
            value: wos.length ? `${completedWo}/${wos.length}` : '—',
            sub: wos.length ? t('{{count}} pcs planned output total', { count: totalPlanQty.toLocaleString() }) : t('No work orders'),
            status: wos.length === 0 ? 'warn' : (allDone ? 'good' : 'warn'),
            icon: allDone ? <TrendingUp size={14} /> : <AlertTriangle size={14} />,
          },
          { label: t('Overall LBR'), value: `${overallLbr}%`, sub: overallLbr !== '—' && Number(overallLbr) < 85 ? t('Below target 85%') : t('On target'), status: overallLbr !== '—' && Number(overallLbr) >= 85 ? 'good' : 'warn', icon: Number(overallLbr) >= 85 ? <TrendingUp size={14} /> : <AlertTriangle size={14} /> },
          { label: t('Equipment Failures'), value: String(failureCount), sub: failureCount === 0 ? t('No failures') : t('has failures'), status: failureCount === 0 ? 'good' : 'warn', icon: failureCount === 0 ? <TrendingUp size={14} /> : <AlertTriangle size={14} /> },
          { label: t('Bottleneck Equipment Utilization'), value: result?.bottleneck_utilization ? `${(Number(result.bottleneck_utilization) * 100).toFixed(1)}%` : '—', sub: t('Bottleneck equipment'), status: 'good', icon: <TrendingUp size={14} /> },
        ].map(m => (
          <div key={m.label} className="bg-[#0a1929] border border-[#142235] rounded-xl p-4">
            <div className="text-[11px] text-slate-600 mb-1">{m.label}</div>
            <div className={cn('text-2xl font-bold',
              m.status === 'good' ? 'text-emerald-400' : m.status === 'warn' ? 'text-amber-400' : 'text-red-400'
            )}>{m.value}</div>
            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
              {m.icon}
              {m.sub}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-5">
        {/* Hourly Output */}
        <div className="col-span-2 bg-[#0a1929] border border-[#142235] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-300">{t('Output by Time Period')}</h3>
            <div className="flex items-center gap-2 text-[11px]">
              <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-blue-500 rounded" /><span className="text-slate-500">{t('Actual Output')}</span></div>
              <div className="flex items-center gap-1"><div className="w-3 h-0.5 bg-slate-600 rounded dashed" style={{borderTop:'2px dashed #475569',height:0}} /><span className="text-slate-500">{t('Planned Output')}</span></div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={hourlyData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#142235" />
              <XAxis dataKey="hour" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="actual" fill="#3b82f6" radius={[3, 3, 0, 0]} name={t('Actual Output')} />
              <Line type="monotone" dataKey="plan" stroke="#475569" strokeDasharray="5 5" dot={false} name={t('Planned Output')} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Product Mix Pie */}
        <div className="bg-[#0a1929] border border-[#142235] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">{t('Product Model Distribution')}</h3>
          {pieData.length === 0 ? (
            <div className="text-xs text-slate-600 text-center py-12">{t('No work orders')}</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={3}>
                    {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                  </Pie>
                  <Tooltip formatter={(v) => [`${v} pcs`]} contentStyle={{ background: '#0b1d30', border: '1px solid #1e3a55', borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {pieData.map(d => (
                  <div key={d.name} className="flex items-center gap-2 text-xs">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.fill }} />
                    <span className="text-slate-400 flex-1">{d.name}</span>
                    <span className="text-slate-300 font-medium">{d.value} pcs</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Uncompleted Orders */}
      <div className="bg-[#0a1929] border border-[#142235] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#142235]">
          <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
            <AlertTriangle size={13} /> {t('Uncompleted Work Order Analysis ({{count}} items)', { count: incompleteWos.length })}
          </h3>
        </div>
        {incompleteWos.length === 0 ? (
          <div className="px-5 py-6 text-xs text-slate-500 text-center">{t('All work orders completed')}</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-[11px] text-slate-600">
              <tr className="border-b border-[#0e1e2e]">
                <th className="text-left px-5 py-2.5">{t('Work Order No.')}</th>
                <th className="text-left px-4 py-2.5">{t('Product Model')}</th>
                <th className="text-left px-4 py-2.5">{t('Planned Output')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#0e1e2e]">
              {incompleteWos.map(w => (
                <tr key={w.wo_no} className="hover:bg-[#0d2035]/50 transition-colors">
                  <td className="px-5 py-2.5 font-mono text-slate-300">{w.wo_no}</td>
                  <td className="px-4 py-2.5 text-slate-300">{w.product_code}</td>
                  <td className="px-4 py-2.5 text-slate-400">{w.plan_qty.toLocaleString()} pcs</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Tab 2: LBR — fed from real API data
interface LineLbrSeries {
  line_id: string;
  line_code: string;
  line_name: string;
  points: Array<{ t_min: number; lbr: number | null }>;
}

function LBRTab({
  lbResults,
  result,
}: {
  lbResults: LineBalanceOut[];
  result: SimResultOut | null;
}) {
  const { t } = useTranslation();
  // 全局聚合 (供顶部 summary 用)
  let bottleneckName = '—';
  let bottleneckCt = 0;
  let bottleneckTakt = 0;
  let totalOpCount = 0;

  // 加权平均 LBR：按工站数加权 Σ(LBR_i × N_i) / ΣN_i。
  // 单工站线 LBR 恒为 100%（CT / (CT×1)），会虚高指标，故排除在加权之外。
  let weightedLbrSum = 0;
  let weightTotal = 0;
  let excludedLineCount = 0;

  for (const lb of lbResults) {
    const details = lb.operation_load_detail
      ? (Object.values(lb.operation_load_detail) as OperationLoadDetail[])
      : [];
    const nStations = details.length;
    totalOpCount += nStations;

    if (nStations > 1) {
      weightedLbrSum += Number(lb.lbr) * nStations;
      weightTotal += nStations;
    } else {
      excludedLineCount += 1;
    }

    for (const d of details) {
      if (d.is_bottleneck && d.effective_ct > bottleneckCt) {
        bottleneckName = d.operation_name;
        bottleneckCt = d.effective_ct;
        bottleneckTakt = Number(lb.takt_time);
      }
    }
  }
  const overallLbr = weightTotal > 0 ? weightedLbrSum / weightTotal : 0;
  const lbrPct = (overallLbr * 100).toFixed(1);

  // 从 result_summary 拿 line_lbr_timeseries
  const lineSeries: LineLbrSeries[] =
    (result?.result_summary as { line_lbr_timeseries?: LineLbrSeries[] } | null)?.line_lbr_timeseries ?? [];

  return (
    <div className="space-y-5">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className={cn("bg-[#0a1929] border rounded-xl p-4", Number(lbrPct) < 85 ? "border-amber-500/20" : "border-emerald-500/20")}>
          <div className="text-[11px] text-slate-600 mb-1" title={t('Σ(LBR × station count) / Σ(station count), single-station lines excluded')}>{t('Weighted Average LBR')}</div>
          <div className={cn("text-3xl font-bold", Number(lbrPct) < 85 ? "text-amber-400" : "text-emerald-400")}>{lbrPct}%</div>
          <div className="text-[11px] text-amber-500 mt-1">
            {Number(lbrPct) < 85 ? `⚠ ${t('Below target 85%')}` : `✓ ${t('On target')}`}
            {excludedLineCount > 0 && (
              <span className="text-slate-600"> · {t('{{count}} single-station line(s) excluded', { count: excludedLineCount })}</span>
            )}
          </div>
        </div>
        <div className="bg-[#0a1929] border border-[#142235] rounded-xl p-4">
          <div className="text-[11px] text-slate-600 mb-1">{t('Number of Lines')}</div>
          <div className="text-xl font-bold text-blue-400">{lbResults.length}</div>
          <div className="text-[11px] text-slate-600 mt-1">{t('{{count}} operations total', { count: totalOpCount })}</div>
        </div>
        <div className="bg-[#0a1929] border border-[#142235] rounded-xl p-4">
          <div className="text-[11px] text-slate-600 mb-1">{t('Primary Bottleneck Operation')}</div>
          <div className="text-xl font-bold text-red-400 truncate" title={bottleneckName}>{bottleneckName}</div>
          <div className="text-[11px] text-slate-600 mt-1">CT={bottleneckCt}s, Takt={bottleneckTakt.toFixed(1)}s</div>
        </div>
      </div>

      {/* 每条线一张 LBR 时序曲线（60s 窗口，y = LBR%、x = 模拟时长 min）*/}
      {lineSeries.length === 0 ? (
        <div className="bg-[#0a1929] border border-[#142235] rounded-xl p-8 text-center text-xs text-slate-500">
          {t('No LBR time-series data (simulation not run or results empty)')}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {lineSeries.map(s => {
            // 静态 LBR 值（来自 LineBalanceOut）作 badge
            const lb = lbResults.find(x => x.line_id === s.line_id);
            const staticPct = lb ? Number(lb.lbr) * 100 : null;
            // 时序数据：t_min → 0..100% LBR，null 不连接
            const data = s.points.map(p => ({
              t_min: p.t_min,
              lbr_pct: p.lbr === null ? null : Number((p.lbr * 100).toFixed(2)),
            }));
            // 实际样本（非空）的均值
            const nonNull = data.filter(p => p.lbr_pct !== null) as Array<{ t_min: number; lbr_pct: number }>;
            const avgPct = nonNull.length
              ? nonNull.reduce((a, b) => a + b.lbr_pct, 0) / nonNull.length
              : 0;

            return (
              <div key={s.line_id} className="bg-[#0a1929] border border-[#142235] rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-semibold text-slate-300 truncate" title={`${s.line_code} · ${s.line_name}`}>
                    {s.line_code} · {s.line_name}
                  </h4>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span className="text-slate-600">{t('Real-time Avg')}</span>
                    <span className="text-blue-400 font-bold">{avgPct.toFixed(1)}%</span>
                    {staticPct !== null && (
                      <>
                        <span className="text-slate-700">·</span>
                        <span className="text-slate-600">{t('Static LBR')}</span>
                        <span className={cn(
                          "font-bold",
                          staticPct < 85 ? "text-amber-400" : "text-emerald-400",
                        )}>
                          {staticPct.toFixed(1)}%
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#142235" />
                    <XAxis dataKey="t_min" type="number" domain={[0, 'dataMax']}
                      tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false}
                      label={{ value: t('Simulation Time (min)'), position: 'insideBottom', offset: -2, fill: '#475569', fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false}
                      label={{ value: 'LBR %', angle: -90, position: 'insideLeft', fill: '#475569', fontSize: 10 }} />
                    <Tooltip
                      formatter={(v: number | null) => [v === null ? t('Idle') : `${v}%`, 'LBR']}
                      labelFormatter={(tv: number) => `t = ${tv} min`}
                      contentStyle={{ background: '#0b1d30', border: '1px solid #1e3a55', borderRadius: 8, fontSize: 11 }}
                    />
                    <ReferenceLine y={85} stroke="#ef4444" strokeDasharray="4 4"
                      label={{ value: t('Target 85%'), fill: '#ef4444', fontSize: 9, position: 'right' }} />
                    <Line type="monotone" dataKey="lbr_pct" stroke="#3b82f6" strokeWidth={1.5}
                      dot={false} connectNulls={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Tab 3: Device Utilization
function DeviceTab() {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div className="bg-[#0a1929] border border-[#142235] rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-300">{t('Equipment Utilization Overview')}</h3>
          <div className="flex items-center gap-4 text-[11px]">
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-red-500" /><span className="text-slate-500">&gt;85% {t('Overloaded')}</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-emerald-500" /><span className="text-slate-500">60~85% {t('Normal')}</span></div>
            <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded bg-slate-600" /><span className="text-slate-500">&lt;60% {t('Low Utilization')}</span></div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={deviceUtilizationData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#142235" />
            <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={85} stroke="#ef4444" strokeDasharray="3 3" />
            <Bar dataKey="util" radius={[3, 3, 0, 0]} name={t('Utilization %')}>
              {deviceUtilizationData.map((d, i) => (
                <Cell key={i} fill={d.util > 85 ? '#ef4444' : d.util >= 60 ? '#10b981' : '#475569'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* OEE Table */}
      <div className="bg-[#0a1929] border border-[#142235] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#142235]">
          <h3 className="text-sm font-semibold text-slate-300">{t('OEE Breakdown Details')}</h3>
        </div>
        <table className="w-full text-xs">
          <thead className="text-[11px] text-slate-600 bg-[#060e18]">
            <tr className="border-b border-[#0e1e2e]">
              <th className="text-left px-5 py-2.5">{t('Equipment')}</th>
              <th className="text-left px-4 py-2.5">{t('Overall Utilization')}</th>
              <th className="text-left px-4 py-2.5">{t('Availability')}</th>
              <th className="text-left px-4 py-2.5">{t('Performance')}</th>
              <th className="text-left px-4 py-2.5">{t('Quality')}</th>
              <th className="text-left px-4 py-2.5">OEE</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0e1e2e]">
            {[
              ['SPI-L01', '91%', '93%', '96%', '98.5%', '88.0%', 'overload'],
              ['SMT-L01-01', '88%', '95%', '91%', '99.8%', '86.4%', 'overload'],
              ['SMT-L01-02', '85%', '89%', '94%', '99.6%', '83.5%', 'normal'],
              ['REFLOW-L01', '76%', '97%', '77%', '99.9%', '74.6%', 'normal'],
              ['AOI-L01', '55%', '98%', '55%', '100%', '53.9%', 'idle'],
            ].map(([name, util, avail, perf, qual, oee, status]) => (
              <tr key={name} className="hover:bg-[#0d2035]/50 transition-colors">
                <td className="px-5 py-2.5 text-slate-300 font-medium">{name}</td>
                <td className="px-4 py-2.5">
                  <span className={cn(
                    'text-xs font-bold',
                    status === 'overload' ? 'text-red-400' : status === 'normal' ? 'text-emerald-400' : 'text-slate-500'
                  )}>{util}</span>
                </td>
                <td className="px-4 py-2.5 text-slate-400">{avail}</td>
                <td className="px-4 py-2.5 text-slate-400">{perf}</td>
                <td className="px-4 py-2.5 text-slate-400">{qual}</td>
                <td className="px-4 py-2.5 text-cyan-400 font-semibold">{oee}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Tab 4: Material
function MaterialTab() {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <div className="bg-[#0a1929] border border-[#142235] rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">{t('Key Material Inventory Curve')}</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={materialStockData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#142235" />
            <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="Main IC" name={t('Main IC')} stroke="#3b82f6" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Capacitor 0402" name={t('Capacitor 0402')} stroke="#06b6d4" strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="Connector" name={t('Connector')} stroke="#8b5cf6" strokeWidth={2} dot={false} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#64748b' }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Material Shortage Events */}
      <div className="bg-[#0a1929] border border-[#142235] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#142235]">
          <h3 className="text-sm font-semibold text-amber-400 flex items-center gap-2">
            <AlertTriangle size={13} /> {t('Material Shortage Events (3 times)')}
          </h3>
        </div>
        <table className="w-full text-xs">
          <thead className="text-[11px] text-slate-600">
            <tr className="border-b border-[#0e1e2e]">
              <th className="text-left px-5 py-2.5">{t('Material')}</th>
              <th className="text-left px-4 py-2.5">{t('Shortage Start')}</th>
              <th className="text-left px-4 py-2.5">{t('Duration')}</th>
              <th className="text-left px-4 py-2.5">{t('Affected Work Orders')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0e1e2e]">
            {[
              ['IC Controller (IC-12345)', 'T+04:30', '45 min', '3 items'],
              ['Capacitor 0402', 'T+07:15', '20 min', '1 item'],
              ['Connector', 'T+09:00', '90 min', '5 items'],
            ].map(([mat, start, dur, count]) => (
              <tr key={mat} className="hover:bg-[#0d2035]/50 transition-colors">
                <td className="px-5 py-2.5 text-slate-300">{t(mat)}</td>
                <td className="px-4 py-2.5 font-mono text-slate-400">{start}</td>
                <td className="px-4 py-2.5 text-amber-400">{t(dur)}</td>
                <td className="px-4 py-2.5 text-red-400">{t(count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Tab 5: Event Log
function EventLogTab() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('ALL');
  const filtered = filter === 'ALL' ? eventLogData : eventLogData.filter(e => e.type === filter);
  const types = ['ALL', ...Array.from(new Set(eventLogData.map(e => e.type)))];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {types.map(ty => (
          <button
            key={ty}
            onClick={() => setFilter(ty)}
            className={cn(
              'px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all',
              filter === ty ? 'bg-blue-600/20 text-blue-400 border-blue-500/30' : 'text-slate-500 border-transparent hover:bg-[#0b1d30]',
            )}
          >
            {t(ty)}
          </button>
        ))}
        <div className="flex-1" />
        <Button size="xs" variant="outline"><Download size={11} /> {t('Export CSV')}</Button>
      </div>

      <div className="bg-[#0a1929] border border-[#142235] rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="text-[11px] text-slate-600 bg-[#060e18]">
            <tr className="border-b border-[#0e1e2e]">
              <th className="text-left px-5 py-3">{t('Simulation Time')}</th>
              <th className="text-left px-4 py-3">{t('Event Type')}</th>
              <th className="text-left px-4 py-3">{t('Level')}</th>
              <th className="text-left px-4 py-3">{t('Object')}</th>
              <th className="text-left px-4 py-3">{t('Event Details')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#0e1e2e]">
            {filtered.map((evt, i) => (
              <tr key={i} className="hover:bg-[#0d2035]/50 transition-colors">
                <td className="px-5 py-2.5 font-mono text-slate-500">{evt.time}</td>
                <td className="px-4 py-2.5">
                  <span className="text-[11px] bg-[#0b1d30] border border-[#1e3a55] px-2 py-0.5 rounded text-slate-400">{t(evt.type)}</span>
                </td>
                <td className="px-4 py-2.5">
                  <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded',
                    evt.level === 'INFO' ? 'bg-blue-500/15 text-blue-400' :
                    evt.level === 'WARN' ? 'bg-amber-500/15 text-amber-400' :
                    'bg-red-500/15 text-red-400'
                  )}>{evt.level}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">{evt.obj}</td>
                <td className="px-4 py-2.5 text-slate-400">{t(evt.detail)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ResultAnalysisPage() {
  const { t } = useTranslation();
  const { planId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('output');
  const [result, setResult] = useState<SimResultOut | null>(null);
  const [lbResults, setLbResults] = useState<LineBalanceOut[]>([]);
  const [tasks, setTasks] = useState<TaskOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!planId) return;
    setLoading(true);
    Promise.all([
      planApi.result(planId).catch(() => null),
      planApi.lineBalance(planId).catch(() => []),
      planApi.tasks(planId).catch(() => []),
    ]).then(([res, lb, tk]) => {
      setResult(res);
      setLbResults(lb);
      setTasks(tk);
    }).finally(() => setLoading(false));
  }, [planId]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[#142235] flex-shrink-0">
        <button onClick={() => navigate('/simulation')} className="text-slate-600 hover:text-slate-300 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-base font-bold text-slate-200">{result ? t('Simulation Result') : t('Loading...')}</h1>
            <span className={cn("text-[11px] px-2 py-0.5 rounded-full border",
              result?.computation_status === 'SUCCESS' ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-slate-500/20 text-slate-400 border-slate-500/30"
            )}>{result?.computation_status ?? '...'}</span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {result?.computation_start ? t('Started: {{time}}', { time: result.computation_start.slice(0,19).replace('T',' ') }) : ''}
            {result?.computation_end ? ` · ${t('Ended: {{time}}', { time: result.computation_end.slice(0,19).replace('T',' ') })}` : ''}
          </p>
        </div>
        <div className="flex-1" />
        <Button variant="secondary" size="sm" onClick={() => navigate(`/simulation/plan/${planId}/config`)}>
          <Settings2 size={13} /> {t('View Config')}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/simulation/plan/${planId}/ai`)}>
          <Brain size={13} /> {t('AI Suggestions')}
        </Button>
        <Button variant="secondary" size="sm" onClick={() => navigate(`/simulation/plan/${planId}/running`)}>
          <Box size={13} /> {t('3D Playback')}
        </Button>
        <Button variant="primary" size="sm" onClick={() => navigate(`/simulation/plan/${planId}/export`)}>
          <Download size={13} /> {t('Export Report')}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#142235] px-6 flex-shrink-0">
        {RESULT_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-5 py-3.5 text-xs font-medium transition-all border-b-2 -mb-px',
              activeTab === tab.id ? 'text-blue-400 border-blue-500' : 'text-slate-500 border-transparent hover:text-slate-300',
            )}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Alert Banner */}
        {activeTab === 'output' && result && Number(result.overall_lbr ?? 0) * 100 < 85 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 flex items-start gap-2 mb-5">
            <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-300">
              <span className="font-semibold">{t('Key Finding: ')}</span>
              {t('Line LBR={{lbr}}% (below target 85%). It is recommended to review the "AI Optimization Suggestions".', { lbr: (Number(result.overall_lbr) * 100).toFixed(1) })}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 size={20} className="animate-spin mr-2" /> {t('Loading results...')}
          </div>
        )}

        {!loading && activeTab === 'output' && <OutputTab result={result} tasks={tasks} />}
        {!loading && activeTab === 'lbr' && <LBRTab lbResults={lbResults} result={result} />}
        {activeTab === 'device' && <DeviceTab />}
        {activeTab === 'material' && <MaterialTab />}
        {activeTab === 'events' && <EventLogTab />}
      </div>
    </div>
  );
}
