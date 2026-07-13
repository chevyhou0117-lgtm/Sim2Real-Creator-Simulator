import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Plus, Search, Download, Archive, Trash2,
  PlayCircle, Eye, FileBarChart, MoreHorizontal, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { planApi, masterApi, simulatorsToFrontend } from '@/lib/api';
import { STATUS_CONFIG, SIMULATOR_LABELS, type SimPlan, type PlanStatus } from '@/mock/data';
import type { PlanOut } from '@/types/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

/** Convert backend PlanOut to frontend SimPlan shape */
function toPlan(p: PlanOut): SimPlan {
  return {
    id: p.plan_id,
    name: p.plan_name,
    description: p.plan_description ?? undefined,
    simulators: simulatorsToFrontend(p.enabled_simulators) as SimPlan['simulators'],
    status: p.status as PlanStatus,
    timeRange: `${p.simulation_duration_hours}h`,
    creator: p.created_by,
    creatorId: '',
    lastRunTime: p.updated_at?.slice(0, 16).replace('T', ' ') ?? null,
    createdAt: p.created_at?.slice(0, 10) ?? '',
  };
}

function SimulatorTags({ simulators }: { simulators?: string[] }) {
  const { t } = useTranslation();
  if (!simulators?.length) return <span className="text-[11px] text-slate-600">{t('Not configured')}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {simulators.map(s => (
        <span key={s} className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', SIMULATOR_LABELS[s]?.cls ?? 'bg-slate-500/15 text-slate-400')}>
          {SIMULATOR_LABELS[s]?.label ? t(SIMULATOR_LABELS[s].label) : s}
        </span>
      ))}
    </div>
  );
}

function NewPlanModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (name: string, desc: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(`${t('Simulation Plan')}_${new Date().toISOString().slice(0,10).replace(/-/g,'')}`);
  const [desc, setDesc] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-2xl p-6 w-[440px] shadow-2xl">
        <h2 className="text-base font-semibold text-slate-200 mb-1">{t('New Simulation Plan')}</h2>
        <p className="text-xs text-slate-500 mb-5">{t('Enter a name to proceed to the config page, where you can select the simulation type')}</p>
        <div className="space-y-4">
          <Input label={t('Plan Name *')} value={name} onChange={e => setName(e.target.value)} placeholder={t('Enter plan name')} />
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 font-medium">{t('Notes (optional)')}</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder={t('Describe the purpose and background of this simulation')}
              className="bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/60 placeholder:text-slate-600 resize-none h-20"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" disabled={!name.trim()} onClick={() => onConfirm(name.trim(), desc)}>
            {t('Confirm and Configure')}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmModal({ title, warning, strong, onClose, onConfirm }: {
  title: string;
  warning: string;
  strong?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-2xl p-6 w-[420px] shadow-2xl">
        <h2 className="text-base font-semibold text-slate-200 mb-2">{title}</h2>
        <p className={cn('text-xs leading-relaxed', strong ? 'text-amber-300' : 'text-slate-400')}>
          {warning}
        </p>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="danger" onClick={onConfirm}>{t('Confirm Delete')}</Button>
        </div>
      </div>
    </div>
  );
}

const STATUS_FILTER_OPTIONS: Array<{ label: string; value: PlanStatus | 'ALL' }> = [
  { label: 'All Statuses', value: 'ALL' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Ready', value: 'READY' },
  { label: 'Running', value: 'RUNNING' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Archived', value: 'ARCHIVED' },
];

export function PlanListPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [plans, setPlans] = useState<SimPlan[]>([]);
  const [loading, setLoading] = useState(true);
  void loading;
  const [showNewModal, setShowNewModal] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<PlanStatus | 'ALL'>('ALL');
  const [selected, setSelected] = useState<string[]>([]);
  const [factoryId, setFactoryId] = useState<string>('');
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await planApi.list();
      setPlans(data.map(toPlan));
    } catch (e) {
      console.error('Failed to load plans', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlans();
    masterApi.factories().then(fs => { if (fs.length) setFactoryId(fs[0].factory_id); });
  }, [loadPlans]);

  const filteredPlans = plans.filter(p => {
    if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
    if (searchText && !p.name.includes(searchText) && !p.creator.includes(searchText)) return false;
    return true;
  });

  const handleNewPlan = async (name: string, desc: string) => {
    if (!factoryId) return;
    try {
      const created = await planApi.create({
        plan_name: name,
        factory_id: factoryId,
        enabled_simulators: ['PRODUCTION', 'LINE_BALANCE'],
        simulation_duration_hours: 11,
        plan_description: desc || undefined,
        created_by: 'user',
      });
      setShowNewModal(false);
      navigate(`/simulation/plan/${created.plan_id}/config`);
    } catch (e) {
      console.error('Failed to create plan', e);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <div className="p-6 space-y-5">
      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-100">{t('Simulation Plan Management')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('Create, configure and run production simulation plans, with support for multi-plan comparison analysis')}</p>
        </div>
        <Button variant="primary" size="md" onClick={() => setShowNewModal(true)}>
          <Plus size={14} /> {t('New Plan')}
        </Button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'All Plans', value: plans.length, color: 'text-slate-300' },
          { label: 'Draft', value: plans.filter(p => p.status === 'DRAFT').length, color: 'text-slate-400' },
          { label: 'Ready / Running', value: plans.filter(p => ['READY','RUNNING'].includes(p.status)).length, color: 'text-blue-400' },
          { label: 'Completed', value: plans.filter(p => p.status === 'COMPLETED').length, color: 'text-emerald-400' },
          { label: 'Archived', value: plans.filter(p => p.status === 'ARCHIVED').length, color: 'text-purple-400' },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-xl px-4 py-3">
            <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
            <div className="text-[11px] text-slate-600 mt-0.5">{t(s.label)}</div>
          </div>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-xl px-5 py-4">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-48">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              placeholder={t('Search by plan name or creator...')}
              className="w-full bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded-lg pl-8 pr-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/60 placeholder:text-slate-600"
            />
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5">
            {STATUS_FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                  statusFilter === opt.value
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                    : 'text-slate-500 hover:text-slate-300 border-transparent hover:bg-[var(--c-0d2035)]',
                )}
              >
                {t(opt.label)}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Bulk actions */}
          {selected.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{t('{{count}} selected', { count: selected.length })}</span>
              <Button size="xs" variant="ghost" onClick={async () => { await planApi.batchArchive(selected); setSelected([]); loadPlans(); }}>
                <Archive size={12} /> {t('Batch Archive')}
              </Button>
              <Button size="xs" variant="danger" onClick={() => setBulkDeleteOpen(true)}>
                <Trash2 size={12} /> {t('Batch Delete')}
              </Button>
            </div>
          )}

          <Button size="xs" variant="ghost">
            <Download size={12} /> {t('Export List')}
          </Button>
          <Button size="xs" variant="ghost" onClick={loadPlans}>
            <RefreshCw size={12} />
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--c-142235)] bg-[var(--c-0a1929)]">
              <th className="w-10 px-4 py-3">
                <input type="checkbox" className="rounded border-[var(--c-1e3a55)] bg-[var(--c-07111e)] accent-blue-500"
                  checked={filteredPlans.length > 0 && selected.length === filteredPlans.length}
                  onChange={() => setSelected(prev => prev.length === filteredPlans.length ? [] : filteredPlans.map(p => p.id))} />
              </th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('Plan Name')}</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('Simulators')}</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('Status')}</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('Simulation Time Range')}</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('Creator')}</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('Last Run')}</th>
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--c-0e1e2e)]">
            {filteredPlans.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-16 text-slate-600 text-sm">
                  {searchText || statusFilter !== 'ALL' ? t('No matching plans found, please adjust the filter criteria') : t('No simulation plans yet. Click "New Plan" to start your first Operations Simulation')}
                </td>
              </tr>
            ) : (
              filteredPlans.map((plan) => {
                const sc = STATUS_CONFIG[plan.status];
                return (
                  <tr
                    key={plan.id}
                    className="hover:bg-[var(--c-0d2035)]/50 transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.includes(plan.id)}
                        onChange={() => toggleSelect(plan.id)}
                        className="rounded border-[var(--c-1e3a55)] bg-[var(--c-07111e)] accent-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => navigate(
                          plan.status === 'COMPLETED' || plan.status === 'ARCHIVED'
                            ? `/simulation/plan/${plan.id}/result`
                            : `/simulation/plan/${plan.id}/config`
                        )}
                        className="text-sm text-slate-200 hover:text-blue-400 transition-colors font-medium text-left"
                      >
                        {plan.name}
                      </button>
                      {plan.tags && plan.tags.length > 0 && (
                        <div className="flex gap-1 mt-1">
                          {plan.tags.map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 bg-[var(--c-0a1929)] rounded text-slate-600">{tag}</span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <SimulatorTags simulators={plan.simulators} />
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        className={sc.cls}
                        dot={sc.dot}
                        animated={plan.status === 'RUNNING'}
                      >
                        {t(sc.label)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400">{plan.timeRange}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">
                      <span>{plan.creator}</span>
                      <span className="text-slate-600 ml-1">#{plan.creatorId}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {plan.lastRunTime ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <PlanActions plan={plan} navigate={navigate} onRefresh={loadPlans} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="border-t border-[var(--c-142235)] px-5 py-3 flex items-center justify-between">
          <span className="text-[11px] text-slate-600">{t('{{count}} items total', { count: filteredPlans.length })}</span>
          <div className="flex items-center gap-1">
            {[1].map(p => (
              <button key={p} className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 text-xs font-medium">{p}</button>
            ))}
          </div>
        </div>
      </div>

      {showNewModal && (
        <NewPlanModal onClose={() => setShowNewModal(false)} onConfirm={handleNewPlan} />
      )}
      {bulkDeleteOpen && (() => {
        const selectedPlans = plans.filter(p => selected.includes(p.id));
        const completedCount = selectedPlans.filter(p => p.status === 'COMPLETED').length;
        const warning = completedCount > 0
          ? t('{{count}} plans selected, of which {{completedCount}} have completed simulation. Deletion will also clear simulation results, AI analysis, line balance results, status snapshots and archived versions, and cannot be recovered. Continue?', { count: selected.length, completedCount })
          : t('Are you sure you want to delete the {{count}} selected plans? This action cannot be undone.', { count: selected.length });
        return (
          <DeleteConfirmModal
            title={t('Batch Delete Plans')}
            warning={warning}
            strong={completedCount > 0}
            onClose={() => setBulkDeleteOpen(false)}
            onConfirm={async () => {
              setBulkDeleteOpen(false);
              await planApi.batchDelete(selected);
              setSelected([]);
              loadPlans();
            }}
          />
        );
      })()}
    </div>
  );
}

function PlanActions({ plan, navigate, onRefresh }: { plan: SimPlan; navigate: ReturnType<typeof useNavigate>; onRefresh: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });

    const onClick = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('scroll', () => setOpen(false), true);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('scroll', () => setOpen(false), true);
    };
  }, [open]);

  const handleArchive = async () => { setOpen(false); await planApi.archive(plan.id); onRefresh(); };
  const handleCopy = async () => { setOpen(false); await planApi.copy(plan.id); onRefresh(); };
  const handleDelete = async () => { setConfirmOpen(false); await planApi.delete(plan.id); onRefresh(); };

  const isCompleted = plan.status === 'COMPLETED';
  const deleteWarning = isCompleted
    ? t('Plan "{{name}}" has completed simulation. Deletion will also clear simulation results, AI analysis, line balance results, status snapshots and archived versions, and cannot be recovered. Continue?', { name: plan.name })
    : t('Are you sure you want to delete plan "{{name}}"? This action cannot be undone.', { name: plan.name });

  return (
    <div className="flex items-center gap-1">
      {plan.status === 'READY' && (
        <Button size="xs" variant="primary" onClick={() => navigate(`/simulation/plan/${plan.id}/running`, { state: { autoStart: true } })}>
          <PlayCircle size={11} /> {t('Start')}
        </Button>
      )}
      {(plan.status === 'COMPLETED' || plan.status === 'ARCHIVED') && (
        <Button size="xs" variant="secondary" onClick={() => navigate(`/simulation/plan/${plan.id}/result`)}>
          <Eye size={11} /> {t('View')}
        </Button>
      )}
      {(plan.status === 'DRAFT' || plan.status === 'READY') && (
        <Button size="xs" variant="secondary" onClick={() => navigate(`/simulation/plan/${plan.id}/config`)}>
          {t('Configure')}
        </Button>
      )}
      {plan.status === 'FAILED' && (
        <Button
          size="xs"
          variant="primary"
          onClick={async () => {
            // FAILED 只读：先 /reconfigure 退到 DRAFT，再进配置页让用户改完重新过就绪门
            await planApi.reconfigure(plan.id);
            navigate(`/simulation/plan/${plan.id}/config`);
          }}
        >
          {t('Reconfigure')}
        </Button>
      )}
      {plan.status === 'RUNNING' && (
        <Button size="xs" variant="secondary" onClick={() => navigate(`/simulation/plan/${plan.id}/running`)}>
          {t('Monitor')}
        </Button>
      )}
      {(plan.status === 'COMPLETED' || plan.status === 'ARCHIVED') && (
        <Button size="xs" variant="secondary" onClick={() => navigate(`/simulation/plan/${plan.id}/export`)}>
          <FileBarChart size={11} /> {t('Report')}
        </Button>
      )}
      <Button ref={triggerRef} size="xs" variant="ghost" onClick={() => setOpen(!open)}>
        <MoreHorizontal size={12} />
      </Button>
      {open && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, right: menuPos.right }}
          className="z-50 bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-xl shadow-xl w-36 py-1"
        >
          {['DRAFT','READY','COMPLETED','FAILED'].includes(plan.status) && (
            <button onClick={handleArchive} className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-[var(--c-0d2035)] flex items-center gap-2">
              <Archive size={12} /> {t('Archive')}
            </button>
          )}
          <button onClick={handleCopy} className="w-full text-left px-3 py-2 text-xs text-slate-300 hover:bg-[var(--c-0d2035)] flex items-center gap-2">
            {t('Duplicate Plan')}
          </button>
          {plan.status !== 'RUNNING' && plan.status !== 'ARCHIVED' && (
            <button onClick={() => { setOpen(false); setConfirmOpen(true); }} className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-[var(--c-0d2035)] flex items-center gap-2">
              <Trash2 size={12} /> {t('Delete')}
            </button>
          )}
        </div>,
        document.body,
      )}
      {confirmOpen && (
        <DeleteConfirmModal
          title={t('Delete Plan')}
          warning={deleteWarning}
          strong={isCompleted}
          onClose={() => setConfirmOpen(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
