import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, FileText, Table2, Download, CheckCircle2, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { planApi } from '@/lib/api';
import { Input, Select } from '@/components/ui/Input';

const CONTENT_MODULES = [
  { id: 'basic', label: 'Plan Basic Info', desc: 'Plan name, simulation time range, participating lines, parameter summary', default: true },
  { id: 'output', label: 'Production Output Overview', desc: 'Output volume, work order completion rate, Gantt chart', default: true },
  { id: 'lbr', label: 'Line Balance Rate (LBR)', desc: 'LBR time-series curve, heatmap, bottleneck identification', default: true },
  { id: 'device', label: 'Equipment Utilization Analysis', desc: 'Utilization bar chart, OEE breakdown, Gantt chart', default: true },
  { id: 'material', label: 'Inventory & Material Status', desc: 'Inventory curve, shortage events', default: false },
  { id: 'events', label: 'Event Log', desc: 'Full event list (may be large)', default: false },
  { id: 'params', label: 'Parameter Configuration Details', desc: 'CT, yield rate, failure rate and other parameter details', default: false },
  { id: 'constraints', label: 'Constraint Configuration', desc: 'Enabled soft constraints and sub-parameters', default: false },
  { id: 'anomaly', label: 'Anomaly Injection Event List', desc: 'List of injected failure/shortage events', default: false },
];

export function ReportExportPage() {
  const { t } = useTranslation();
  const { planId } = useParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState(new Set(CONTENT_MODULES.filter(m => m.default).map(m => m.id)));
  const [format, setFormat] = useState<'pdf' | 'excel'>('pdf');
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);

  const toggleModule = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExport = async () => {
    if (!planId) return;
    setExporting(true);
    try {
      const report = await planApi.exportReport(planId, {
        modules: Array.from(selected),
        format,
        title: 'Simulation Report',
      });
      // Download as JSON file
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report_${planId}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setExported(true);
    } catch (e) {
      console.error('Export failed', e);
    } finally {
      setExporting(false);
    }
  };

  const estimatedTime = Math.ceil(selected.size * 2.5);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[var(--c-142235)] flex-shrink-0">
        <button onClick={() => navigate(`/simulation/plan/${planId}/result`)} className="text-slate-600 hover:text-slate-300 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="text-base font-bold text-slate-200">{t('Export Simulation Report')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('SMT Line A - New Product Introduction Capacity Assessment')}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
          {/* Report Info */}
          <div className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-300">{t('Report Basic Info')}</h3>
            <Input label={t('Report Title')} defaultValue="SMT Line A - New Product Introduction Capacity Assessment_Simulation Analysis Report_20260410" />
            <div className="flex flex-col gap-1">
              <label className="text-xs text-slate-400 font-medium">{t('Report Summary (optional)')}</label>
              <textarea
                className="bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/60 resize-none h-16 placeholder:text-slate-600"
                placeholder={t('Add a report summary, shown on the home page (max 500 characters)')}
              />
            </div>
            <Select label={t('Report Language')}>
              <option>{t('Chinese')}</option>
              <option>{t('English')}</option>
            </Select>
          </div>

          {/* Content Selection */}
          <div className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">{t('Content Module Selection')}</h3>
            <div className="space-y-2">
              {CONTENT_MODULES.map(m => (
                <div
                  key={m.id}
                  onClick={() => toggleModule(m.id)}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-all',
                    selected.has(m.id) ? 'bg-blue-600/10 border border-blue-500/20' : 'border border-transparent hover:bg-[var(--c-0d2035)]/50',
                  )}
                >
                  <div className={cn(
                    'w-4 h-4 rounded border-2 flex items-center justify-center mt-0.5 flex-shrink-0',
                    selected.has(m.id) ? 'border-blue-500 bg-blue-600' : 'border-slate-600',
                  )}>
                    {selected.has(m.id) && <CheckCircle2 size={10} className="text-white" />}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-300">{t(m.label)}</div>
                    <div className="text-[11px] text-slate-600">{t(m.desc)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Format Selection */}
          <div className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">{t('Export Format')}</h3>
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'pdf' as const, icon: <FileText size={18} />, label: 'PDF', desc: t('Mixed text and graphics, suitable for formal reporting and archiving, A4 format') },
                { id: 'excel' as const, icon: <Table2 size={18} />, label: 'Excel', desc: t('Data-table focused, suitable for further data analysis, includes multiple sheets') },
              ].map(f => (
                <button
                  key={f.id}
                  onClick={() => setFormat(f.id)}
                  className={cn(
                    'flex items-start gap-3 p-4 rounded-xl border text-left transition-all',
                    format === f.id ? 'bg-blue-600/10 border-blue-500/30' : 'border-[var(--c-142235)] hover:border-[var(--c-1e3a55)]',
                  )}
                >
                  <div className={cn('mt-0.5', format === f.id ? 'text-blue-400' : 'text-slate-500')}>{f.icon}</div>
                  <div>
                    <div className={cn('text-sm font-semibold', format === f.id ? 'text-blue-300' : 'text-slate-400')}>{f.label}</div>
                    <div className="text-[11px] text-slate-600 mt-0.5">{f.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Export Action */}
          {exported ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-5 py-4 flex items-center gap-3">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <div>
                <div className="text-sm font-semibold text-emerald-300">{t('Report generated, downloading...')}</div>
                <div className="text-xs text-slate-500 mt-0.5">{t('Download link valid for 7 days')}</div>
              </div>
              <Button size="sm" variant="secondary" className="ml-auto">{t('Export Again')}</Button>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <div className="text-xs text-slate-500 flex items-center gap-1">
                <Clock size={11} /> {t('Estimated generation time: ~{{sec}} sec', { sec: estimatedTime })}
              </div>
              <Button
                variant="primary"
                size="md"
                onClick={handleExport}
                disabled={selected.size === 0 || exporting}
                className="ml-auto"
              >
                {exporting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t('Generating report...')}
                  </>
                ) : (
                  <>
                    <Download size={14} /> {t('Export {{format}}', { format: format.toUpperCase() })}
                  </>
                )}
              </Button>
            </div>
          )}

          {selected.size === 0 && (
            <p className="text-xs text-red-400">{t('Please select at least one content module')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
