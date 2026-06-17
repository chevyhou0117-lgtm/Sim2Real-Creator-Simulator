import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Plus, Trash2, Edit2, AlertTriangle, Package, ToggleLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { planApi } from '@/lib/api';

interface AnomalyEvent {
  id: string;
  type: 'Equipment Failure' | 'Material Shortage';
  target: string;
  startOffset: string;
  duration: string;
  enabled: boolean;
  detail?: string;
}

const MOCK_EVENTS: AnomalyEvent[] = [
  { id: 'EVT-001', type: 'Equipment Failure', target: 'SMT-L01-02 (SMT Placement Machine)', startOffset: 'T+3h', duration: '45 min', enabled: true, detail: 'Planned maintenance downtime' },
  { id: 'EVT-002', type: 'Material Shortage', target: 'Main Control IC (IC-12345)', startOffset: 'T+5h', duration: '2 h', enabled: true, detail: 'Risk of delayed supplier delivery' },
  { id: 'EVT-003', type: 'Equipment Failure', target: 'REFLOW-L02 (Reflow Soldering)', startOffset: 'T+7h 30min', duration: '30 min', enabled: false, detail: '' },
];

function AddEventModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [eventType, setEventType] = useState<'Equipment Failure' | 'Material Shortage'>('Equipment Failure');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0b1d30] border border-[#1e3a55] rounded-2xl p-6 w-[500px] shadow-2xl">
        <h2 className="text-base font-semibold text-slate-200 mb-5">{t('Add Anomaly Event')}</h2>
        <div className="space-y-4">
          {/* Event Type */}
          <div>
            <div className="text-xs text-slate-400 font-medium mb-2">{t('Event Type *')}</div>
            <div className="flex gap-3">
              {(['Equipment Failure', 'Material Shortage'] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setEventType(type)}
                  className={cn(
                    'flex-1 flex items-center gap-2 px-4 py-3 rounded-xl border text-sm transition-all',
                    eventType === type
                      ? 'bg-red-500/10 border-red-500/30 text-red-400'
                      : 'border-[#142235] text-slate-500 hover:border-[#1e3a55]',
                  )}
                >
                  {type === 'Equipment Failure' ? <AlertTriangle size={14} /> : <Package size={14} />}
                  {t(type)}
                </button>
              ))}
            </div>
          </div>

          {eventType === 'Equipment Failure' ? (
            <>
              <Select label={t('Faulty Equipment *')}>
                <option>{t('SMT-L01-01 (SMT Placement Machine Front)')}</option>
                <option>{t('SMT-L01-02 (SMT Placement Machine Rear)')}</option>
                <option>{t('SPI-L01 (Solder Paste Printer)')}</option>
                <option>{t('REFLOW-L01 (Reflow Soldering)')}</option>
                <option>{t('AOI-L01 (AOI Inspection)')}</option>
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Input label={t('Failure Start Offset *')} placeholder={t('e.g. T+3h or T+1d 2h')} defaultValue="T+3h" />
                <Input label={t('Failure Duration (min) *')} type="number" defaultValue="45" />
              </div>
              <Select label={t('Failure Type')}>
                <option>{t('Full Stop')}</option>
                <option>{t('Reduced Speed (specify reduction ratio)')}</option>
              </Select>
            </>
          ) : (
            <>
              <Select label={t('Short Material *')}>
                <option>{t('Main Control IC (IC-12345)')}</option>
                <option>{t('Capacitor 0402 (CAP-0402-100N)')}</option>
                <option>{t('Connector (CON-USB-B)')}</option>
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Input label={t('Shortage Start Offset *')} placeholder={t('e.g. T+5h')} defaultValue="T+5h" />
                <Input label={t('Shortage Duration (min) *')} type="number" defaultValue="120" />
              </div>
              <div>
                <div className="text-xs text-slate-400 font-medium mb-2">{t('Shortage Level *')}</div>
                <div className="flex gap-3">
                  <button className="flex-1 px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-400">{t('Full Outage')}</button>
                  <button className="flex-1 px-3 py-2 rounded-lg border border-[#142235] text-xs text-slate-500 hover:border-[#1e3a55]">{t('Partial Shortage')}</button>
                </div>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-400 font-medium">{t('Event Description')}</label>
            <input placeholder={t('Record the cause or scenario background (optional)')} className="bg-[#07111e] border border-[#1e3a55] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/60 placeholder:text-slate-600" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" onClick={onClose}>{t('Cancel')}</Button>
          <Button variant="primary" onClick={onClose}>{t('Save Event')}</Button>
        </div>
      </div>
    </div>
  );
}

export function AnomalyInjectionPage() {
  const { t } = useTranslation();
  const { planId } = useParams();
  const navigate = useNavigate();
  const [events, setEvents] = useState(MOCK_EVENTS);
  const [showModal, setShowModal] = useState(false);

  // Load anomalies from API
  useEffect(() => {
    if (!planId) return;
    planApi.anomalies(planId).then((data: any[]) => {
      if (data.length > 0) {
        setEvents(data.map((a: any) => ({
          id: a.anomaly_id,
          type: a.anomaly_type === 'EQUIPMENT_DOWNTIME' ? 'Equipment Failure' as const : 'Material Shortage' as const,
          target: a.target_id,
          startOffset: `T+${a.start_sim_hour}h`,
          duration: `${a.duration_minutes} min`,
          enabled: true,
          detail: a.description,
        })));
      }
    }).catch(() => {});
  }, [planId]);

  const toggleEvent = (id: string) => {
    setEvents(prev => prev.map(e => e.id === id ? { ...e, enabled: !e.enabled } : e));
  };

  const handleDeleteEvent = async (id: string) => {
    if (!planId) return;
    await planApi.deleteAnomaly(planId, id).catch(() => {});
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  // Simple Gantt visualization
  const simDuration = 12; // hours
  const getOffset = (offset: string): number => {
    const match = offset.match(/T\+(\d+)h(?:\s+(\d+)min)?/);
    if (!match) return 0;
    return parseInt(match[1]) + (parseInt(match[2] || '0') / 60);
  };
  const getDuration = (dur: string): number => {
    const match = dur.match(/(\d+)\s*(min|h)/);
    if (!match) return 0;
    return match[2] === 'h' ? parseInt(match[1]) : parseInt(match[1]) / 60;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[#142235] flex-shrink-0">
        <button onClick={() => navigate(`/simulation/plan/${planId}/config`)} className="text-slate-600 hover:text-slate-300 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div>
          <h1 className="text-base font-bold text-slate-200">{t('Anomaly Injection Config')}</h1>
          <p className="text-xs text-slate-500 mt-0.5">{t('Layer specific anomaly events onto a simulation plan to assess emergency response capability')}</p>
        </div>
        <div className="flex-1" />
        <Button variant="primary" size="sm" onClick={() => setShowModal(true)}>
          <Plus size={13} /> {t('Add Anomaly Event')}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Events List */}
        <div className="bg-[#0b1d30] border border-[#142235] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#142235] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300">{t('Configured Anomaly Events')}</h3>
            <span className="text-xs text-slate-500">{t('{{count}} enabled · {{disabled}} disabled', { count: events.filter(e => e.enabled).length, disabled: events.filter(e => !e.enabled).length })}</span>
          </div>

          {events.length === 0 ? (
            <div className="py-12 text-center text-slate-600 text-sm">
              {t('No anomaly injection events yet. Click "Add Event" to configure simulation anomaly scenarios.')}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-[11px] text-slate-600 border-b border-[#0e1e2e] bg-[#0a1929]">
                  <th className="text-left px-5 py-3">{t('Event ID')}</th>
                  <th className="text-left px-4 py-3">{t('Type')}</th>
                  <th className="text-left px-4 py-3">{t('Affected Target')}</th>
                  <th className="text-left px-4 py-3">{t('Start Time (Relative)')}</th>
                  <th className="text-left px-4 py-3">{t('Duration')}</th>
                  <th className="text-left px-4 py-3">{t('Description')}</th>
                  <th className="text-left px-4 py-3">{t('Status')}</th>
                  <th className="px-4 py-3">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0e1e2e]">
                {events.map(evt => (
                  <tr key={evt.id} className={cn('hover:bg-[#0d2035]/50 transition-colors', !evt.enabled && 'opacity-50')}>
                    <td className="px-5 py-3 font-mono text-xs text-slate-400">{evt.id}</td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        'flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md w-fit',
                        evt.type === 'Equipment Failure' ? 'bg-red-500/15 text-red-400' : 'bg-amber-500/15 text-amber-400',
                      )}>
                        {evt.type === 'Equipment Failure' ? <AlertTriangle size={10} /> : <Package size={10} />}
                        {t(evt.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-300">{evt.target}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-400">{evt.startOffset}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{evt.duration}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{evt.detail || '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleEvent(evt.id)}
                        className={cn(
                          'relative inline-flex h-5 w-9 items-center rounded-full transition-all',
                          evt.enabled ? 'bg-blue-600' : 'bg-slate-700',
                        )}
                      >
                        <span className={cn('w-3.5 h-3.5 bg-white rounded-full transition-all', evt.enabled ? 'translate-x-4.5' : 'translate-x-0.5')} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="xs" variant="ghost"><Edit2 size={11} /></Button>
                        <Button size="xs" variant="ghost" onClick={() => handleDeleteEvent(evt.id)}>
                          <Trash2 size={11} className="text-red-400" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Gantt Timeline */}
        <div className="bg-[#0b1d30] border border-[#142235] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">{t('Event Timeline')}</h3>
          <div className="relative">
            {/* Time axis */}
            <div className="flex border-b border-[#142235] pb-2 mb-3">
              {Array.from({ length: simDuration + 1 }, (_, i) => (
                <div key={i} className="flex-1 text-[10px] text-slate-600 text-center">{`T+${i}h`}</div>
              ))}
            </div>
            {/* Event bars */}
            <div className="space-y-2">
              {events.map(evt => {
                const left = (getOffset(evt.startOffset) / simDuration) * 100;
                const width = Math.max((getDuration(evt.duration) / simDuration) * 100, 2);
                return (
                  <div key={evt.id} className="relative h-7">
                    <div className="absolute inset-0 flex items-center">
                      <span className="text-[10px] text-slate-600 w-20 flex-shrink-0">{evt.id}</span>
                      <div className="flex-1 relative h-5">
                        <div
                          className={cn(
                            'absolute h-full rounded flex items-center px-2 text-[10px] font-medium transition-opacity',
                            evt.type === 'Equipment Failure' ? 'bg-red-500/40 text-red-300 border border-red-500/30' : 'bg-amber-500/40 text-amber-300 border border-amber-500/30',
                            !evt.enabled && 'opacity-40',
                          )}
                          style={{ left: `${left}%`, width: `${width}%` }}
                        >
                          {width > 8 ? evt.target.split(' ')[0] : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {showModal && <AddEventModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
