import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Plus, X, TrendingUp, TrendingDown, Minus, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { mockPlans } from '@/mock/data';

const ARCHIVED_PLANS = mockPlans.filter(p => p.status === 'ARCHIVED' || p.status === 'COMPLETED');

interface CompareMetric {
  category: string;
  metric: string;
  values: number[];
  unit: string;
  higherIsBetter?: boolean;
}

const COMPARE_DATA: CompareMetric[] = [
  { category: 'Output', metric: 'Total Output', values: [3842, 3156, 4120, 3680], unit: 'pcs', higherIsBetter: true },
  { category: 'Output', metric: 'Work Order Completion Rate', values: [90.0, 78.5, 95.2, 88.4], unit: '%', higherIsBetter: true },
  { category: 'Output', metric: 'On-Time Delivery Rate', values: [89.0, 75.2, 93.8, 86.1], unit: '%', higherIsBetter: true },
  { category: 'Efficiency', metric: 'Weighted Average LBR', values: [73.2, 65.8, 85.4, 78.9], unit: '%', higherIsBetter: true },
  { category: 'Efficiency', metric: 'Average Equipment Utilization', values: [81.3, 74.2, 83.5, 80.1], unit: '%', higherIsBetter: true },
  { category: 'Material', metric: 'Material Shortage Count', values: [3, 7, 1, 4], unit: 'times', higherIsBetter: false },
  { category: 'Material', metric: 'Total Shortage Wait Time', values: [155, 380, 45, 210], unit: 'min', higherIsBetter: false },
  { category: 'Equipment', metric: 'Total Failure Downtime', values: [90, 150, 60, 110], unit: 'min', higherIsBetter: false },
];

const PLAN_COLORS = ['#3b82f6', '#06b6d4', '#10b981', '#8b5cf6'];

const PLAN_LABELS = ['Current Plan', 'Plan B', 'Plan C', 'Plan D'];

function getRelativeDiff(val: number, best: number, unit: '%' | string, higherIsBetter = true, t: TFunction): { diff: string; status: 'good' | 'warn' | 'bad' | 'best' } {
  if (val === best) return { diff: t('Best'), status: 'best' };
  const diff = ((val - best) / Math.abs(best)) * 100;
  const absDiff = Math.abs(diff);
  const isBad = higherIsBetter ? diff < 0 : diff > 0;
  return {
    diff: `${isBad ? '-' : '+'}${absDiff.toFixed(1)}%`,
    status: absDiff <= 5 ? 'good' : absDiff <= 25 ? 'warn' : 'bad',
  };
}

export function PlanComparePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedPlans, setSelectedPlans] = useState<string[]>([ARCHIVED_PLANS[0]?.id, ARCHIVED_PLANS[1]?.id].filter(Boolean));

  const numPlans = Math.min(selectedPlans.length, 4);

  const barData = COMPARE_DATA.filter(d => d.category === 'Efficiency' || d.category === 'Output').map(d => ({
    metric: d.metric,
    ...Object.fromEntries(d.values.slice(0, numPlans).map((v, i) => [PLAN_LABELS[i], v])),
  }));

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">{t('Plan Comparison')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('Select 2-4 completed or archived plans for side-by-side comparison')}</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => {}}>
          <Download size={13} /> {t('Export Comparison Report')}
        </Button>
      </div>

      {/* Plan Selector */}
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }, (_, i) => {
          const planId = selectedPlans[i];
          const plan = ARCHIVED_PLANS.find(p => p.id === planId);
          return (
            <div
              key={i}
              className={cn(
                'bg-[var(--c-0b1d30)] border rounded-xl p-4 relative',
                plan ? 'border-[var(--c-1e3a55)]' : 'border-dashed border-[var(--c-142235)]',
              )}
              style={{ borderLeftColor: plan ? PLAN_COLORS[i] : undefined, borderLeftWidth: plan ? 3 : 1 }}
            >
              {plan ? (
                <>
                  <button
                    onClick={() => setSelectedPlans(prev => prev.filter((_, idx) => idx !== i))}
                    className="absolute top-2 right-2 text-slate-600 hover:text-slate-300 transition-colors"
                  >
                    <X size={14} />
                  </button>
                  <div className="text-[10px] font-bold mb-1" style={{ color: PLAN_COLORS[i] }}>{t('Plan {{letter}}', { letter: String.fromCharCode(65 + i) })}</div>
                  <div className="text-xs font-semibold text-slate-300 leading-tight">{plan.name}</div>
                  <div className="text-[11px] text-slate-600 mt-1">{plan.timeRange}</div>
                </>
              ) : (
                <button
                  onClick={() => {
                    if (ARCHIVED_PLANS[i]) {
                      setSelectedPlans(prev => { const next = [...prev]; next[i] = ARCHIVED_PLANS[i].id; return next; });
                    }
                  }}
                  className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-600 hover:text-slate-400 transition-colors py-4"
                >
                  <Plus size={18} />
                  <span className="text-xs">{t('Add Plan')}</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {selectedPlans.length < 2 && (
        <div className="text-center py-8 text-slate-600 text-sm">{t('Please select at least 2 plans to compare')}</div>
      )}

      {selectedPlans.length >= 2 && (
        <>
          {/* Metrics Table */}
          <div className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--c-142235)] flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-300">{t('Key Metrics Comparison')}</h3>
              <span className="text-[11px] text-slate-600">{t('Green=Best, Orange=Gap>10%, Red=Gap>25%')}</span>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-[var(--c-0a1929)] text-[11px] text-slate-600">
                <tr className="border-b border-[var(--c-0e1e2e)]">
                  <th className="text-left px-5 py-3">{t('Category')}</th>
                  <th className="text-left px-4 py-3">{t('Metric')}</th>
                  {Array.from({ length: numPlans }, (_, i) => (
                    <th key={i} className="text-center px-4 py-3" style={{ color: PLAN_COLORS[i] }}>{t('Plan {{letter}}', { letter: String.fromCharCode(65 + i) })}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--c-0e1e2e)]">
                {COMPARE_DATA.slice(0, 8).map(d => {
                  const vals = d.values.slice(0, numPlans);
                  const best = d.higherIsBetter ? Math.max(...vals) : Math.min(...vals);
                  return (
                    <tr key={d.metric} className="hover:bg-[var(--c-0d2035)]/50 transition-colors">
                      <td className="px-5 py-3 text-slate-600">{t(d.category)}</td>
                      <td className="px-4 py-3 text-slate-400">{t(d.metric)}</td>
                      {vals.map((val, i) => {
                        const { diff, status } = getRelativeDiff(val, best, d.unit, d.higherIsBetter, t);
                        return (
                          <td key={i} className="px-4 py-3 text-center">
                            <div className="text-slate-200 font-semibold">{val.toLocaleString()}<span className="text-slate-600 font-normal text-[10px] ml-0.5">{t(d.unit)}</span></div>
                            <div className={cn(
                              'text-[10px] font-medium',
                              status === 'best' ? 'text-emerald-400' :
                              status === 'good' ? 'text-slate-500' :
                              status === 'warn' ? 'text-amber-400' : 'text-red-400',
                            )}>
                              {status === 'best' ? t('★ Best') : diff}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bar Chart */}
          <div className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">{t('Output & Efficiency Comparison')}</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={barData.slice(0, 5)} margin={{ top: 5, right: 10, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--c-142235)" />
                <XAxis dataKey="metric" tick={{ fill: 'var(--c-64748b)', fontSize: 10 }} axisLine={false} tickLine={false} angle={-15} textAnchor="end" />
                <YAxis tick={{ fill: 'var(--c-64748b)', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: 'var(--c-0b1d30)', border: '1px solid var(--c-1e3a55)', borderRadius: 8, fontSize: 11 }} />
                <Legend wrapperStyle={{ fontSize: 11, color: 'var(--c-64748b)', paddingTop: 16 }} />
                {PLAN_LABELS.slice(0, numPlans).map((label, i) => (
                  <Bar key={label} dataKey={label} fill={PLAN_COLORS[i]} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}
