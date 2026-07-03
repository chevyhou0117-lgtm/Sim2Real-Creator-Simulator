import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, CheckCircle2, AlertCircle, Clock, Database, Factory, Cpu, GitBranch, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { masterDataStats } from '@/mock/data';

const DATA_CATEGORIES = [
  { id: 'factory', icon: <Factory size={15} />, label: 'Factory Info', count: 1, status: 'synced', lastSync: '08:30:00' },
  { id: 'lines', icon: <GitBranch size={15} />, label: 'Line Data', count: 8, status: 'synced', lastSync: '08:30:01' },
  { id: 'equipment', icon: <Cpu size={15} />, label: 'Equipment / Stations', count: 64, status: 'synced', lastSync: '08:30:03' },
  { id: 'bop', icon: <Database size={15} />, label: 'BoP Process Routes', count: 23, status: 'synced', lastSync: '08:30:05' },
  { id: 'calendar', icon: <Calendar size={15} />, label: 'Work Calendar', count: 4, status: 'synced', lastSync: '08:30:06' },
  { id: 'staffing', icon: <Factory size={15} />, label: 'Staffing', count: 12, status: 'warn', lastSync: '2 days ago' },
];

export function MasterDataPage() {
  const { t } = useTranslation();
  const [syncing, setSyncing] = useState(false);

  const handleSync = () => {
    setSyncing(true);
    setTimeout(() => setSyncing(false), 2000);
  };

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">{t('Master Data')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('Sync factory modeling data from the Master Data Platform, with version detection and local cache management')}</p>
        </div>
        <Button variant="primary" size="sm" onClick={handleSync} disabled={syncing}>
          <RefreshCw size={13} className={cn(syncing && 'animate-spin')} />
          {syncing ? t('Syncing...') : t('Trigger Sync Manually')}
        </Button>
      </div>

      {/* Status Banner */}
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-5 py-4 flex items-center gap-4">
        <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0" />
        <div>
          <div className="text-sm font-semibold text-emerald-300">{t('Master Data Synced · Status Normal')}</div>
          <div className="text-xs text-slate-500 mt-0.5">{t('Last sync: 2026-04-10 08:30:00 · Data version: v1.2.8')}</div>
        </div>
        <div className="flex-1" />
        <div className="text-[11px] text-slate-500 flex items-center gap-1">
          <Clock size={11} /> {t('Next auto sync: in ~6 hours')}
        </div>
      </div>

      {/* Data Category Cards */}
      <div className="grid grid-cols-3 gap-4">
        {DATA_CATEGORIES.map(cat => (
          <div key={cat.id} className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className={cn(
                'w-9 h-9 rounded-lg flex items-center justify-center',
                cat.status === 'synced' ? 'bg-blue-600/10 text-blue-400' : 'bg-amber-600/10 text-amber-400',
              )}>
                {cat.icon}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-300">{t(cat.label)}</div>
                <div className="text-[11px] text-slate-500">{t('{{count}} records', { count: cat.count })}</div>
              </div>
              <div className="ml-auto">
                {cat.status === 'synced' ? (
                  <CheckCircle2 size={14} className="text-emerald-400" />
                ) : (
                  <AlertCircle size={14} className="text-amber-400" />
                )}
              </div>
            </div>
            <div className="text-[11px] text-slate-600 flex items-center gap-1">
              <Clock size={10} /> {t('Last sync:')} {t(cat.lastSync)}
            </div>
            {cat.status === 'warn' && (
              <div className="mt-2 text-[11px] text-amber-400 flex items-center gap-1">
                <AlertCircle size={11} /> {t('Data may be outdated, update recommended')}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Data Preview Table */}
      <div className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--c-142235)] flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-300">{t('Line Data Preview')}</h3>
          <span className="text-xs text-slate-500">{t('View only, not editable (from Master Data Platform)')}</span>
        </div>
        <table className="w-full text-xs">
          <thead className="bg-[var(--c-0a1929)] text-[11px] text-slate-600">
            <tr className="border-b border-[var(--c-0e1e2e)]">
              <th className="text-left px-5 py-3">{t('Line ID')}</th>
              <th className="text-left px-4 py-3">{t('Line Name')}</th>
              <th className="text-left px-4 py-3">{t('Stage Type')}</th>
              <th className="text-left px-4 py-3">{t('Operations')}</th>
              <th className="text-left px-4 py-3">{t('Equipment Count')}</th>
              <th className="text-left px-4 py-3">SMT PPH</th>
              <th className="text-left px-4 py-3">{t('BoP Status')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--c-0e1e2e)]">
            {[
              ['L01', 'SMT Line L01', 'SMT', '7', '9', '45,000', 'Active'],
              ['L02', 'SMT Line L02', 'SMT', '7', '9', '42,000', 'Active'],
              ['L03', 'SMT Line L03', 'SMT', '7', '8', '38,000', 'Active'],
              ['T01', 'THT Line T01', 'THT', '5', '7', '—', 'Active'],
              ['T02', 'THT Line T02', 'THT', '5', '6', '—', 'Draft'],
              ['Q01', 'Test Line Q01', 'Test', '4', '5', '—', 'Active'],
            ].map(([id, name, type, ops, eqs, pph, bop]) => (
              <tr key={id} className="hover:bg-[var(--c-0d2035)]/50 transition-colors">
                <td className="px-5 py-2.5 font-mono text-slate-400">{id}</td>
                <td className="px-4 py-2.5 text-slate-300 font-medium">{t(name)}</td>
                <td className="px-4 py-2.5">
                  <span className={cn('text-[11px] px-1.5 py-0.5 rounded font-medium',
                    type === 'SMT' ? 'bg-blue-500/15 text-blue-400' :
                    type === 'THT' ? 'bg-purple-500/15 text-purple-400' :
                    'bg-slate-500/15 text-slate-400',
                  )}>{t(type)}</span>
                </td>
                <td className="px-4 py-2.5 text-slate-400">{ops}</td>
                <td className="px-4 py-2.5 text-slate-400">{eqs}</td>
                <td className="px-4 py-2.5 font-mono text-cyan-400">{pph}</td>
                <td className="px-4 py-2.5">
                  <span className={cn('text-[11px] px-1.5 py-0.5 rounded font-medium',
                    bop === 'Active' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400',
                  )}>{t(bop)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sync History */}
      <div className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[var(--c-142235)]">
          <h3 className="text-sm font-semibold text-slate-300">{t('Sync History')}</h3>
        </div>
        <div className="divide-y divide-[var(--c-0e1e2e)]">
          {[
            { time: '2026-04-10 08:30:00', by: 'System Auto', result: 'Success', changes: 'Updated 3 equipment parameters', version: 'v1.2.8' },
            { time: '2026-04-09 20:30:00', by: 'System Auto', result: 'Success', changes: 'No changes', version: 'v1.2.7' },
            { time: '2026-04-09 08:31:22', by: 'Li Ming', result: 'Success', changes: 'Added 2 BoP items', version: 'v1.2.7' },
            { time: '2026-04-08 15:20:00', by: 'System Auto', result: 'Failed', changes: 'API timeout', version: 'v1.2.6' },
          ].map((h, i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-3">
              <div className="w-32 text-[11px] font-mono text-slate-600">{h.time}</div>
              <div className={cn(
                'w-14 text-[11px] font-medium',
                h.result === 'Success' ? 'text-emerald-400' : 'text-red-400',
              )}>{t(h.result)}</div>
              <div className="text-xs text-slate-400 flex-1">{t(h.changes)}</div>
              <div className="text-[11px] text-slate-600">{t(h.by)}</div>
              <div className="font-mono text-[11px] text-slate-600 bg-[var(--c-0a1929)] px-1.5 py-0.5 rounded">{h.version}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
