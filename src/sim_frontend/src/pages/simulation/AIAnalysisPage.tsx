import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, Brain, Lightbulb, TrendingUp, Users, Wrench, ChevronDown, ChevronUp, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/Button';

interface Suggestion {
  id: string;
  category: 'Equipment Optimization' | 'Headcount Adjustment' | 'Process Improvement' | 'Material Optimization';
  priority: 'P0' | 'P1' | 'P2';
  title: string;
  desc: string;
  impact: string;
  effort: 'Low' | 'Medium' | 'High';
  expanded?: boolean;
}

const SUGGESTIONS: Suggestion[] = [
  {
    id: 'S001', category: 'Equipment Optimization', priority: 'P0',
    title: 'Add a Selective Soldering Station (or Outsource)',
    desc: 'The selective soldering operation has CT=55s against Takt=42s, with utilization as high as 131%, making it the most severe bottleneck. It is recommended to add 1 selective soldering machine or outsource the excess to a partner plant, which can reduce the bottleneck operation CT to <42s.',
    impact: 'Expected to raise LBR from 73.2% to 86.5%, increasing total output by about 18%',
    effort: 'High',
  },
  {
    id: 'S002', category: 'Process Improvement', priority: 'P0',
    title: 'Optimize SMT Operation Cycle Time Balancing',
    desc: 'Both SMT (Front) (CT=48s) and SMT (Back) (CT=45s) exceed Takt (42s). It is recommended to optimize the placement program and reasonably distribute components across the two SMT machines to balance the cycle time to within 42s.',
    impact: 'Expected to reduce SMT operation utilization from 107/114% to ≤100%, removing the bottleneck',
    effort: 'Medium',
  },
  {
    id: 'S003', category: 'Headcount Adjustment', priority: 'P1',
    title: 'Add Operators to the Selective Soldering Operation',
    desc: 'The ICT test operation is only 52% utilized, while selective soldering is severely overloaded. It is recommended to temporarily reassign 1 spare ICT operator to assist with the selective soldering operation, which can improve its effective output.',
    impact: 'In the short term when adding equipment is not feasible, can reduce selective soldering wait time by about 15%',
    effort: 'Low',
  },
  {
    id: 'S004', category: 'Material Optimization', priority: 'P1',
    title: 'Advance the Stocking Time for IC Main Controller Material',
    desc: 'An IC Main Controller shortage occurred at T+04:30 in the simulation, lasting 45 minutes and affecting 3 work orders. It is recommended to advance the IC Main Controller arrival plan by 2 hours and set the safety stock warning level to 600pcs (currently 500pcs).',
    impact: 'Eliminates the material shortage gap, expected to reduce 3 work order delays',
    effort: 'Low',
  },
  {
    id: 'S005', category: 'Process Improvement', priority: 'P2',
    title: 'Release AOI Inspection Capacity to Downstream Buffer',
    desc: 'The AOI inspection operation is only 67% utilized, with significant idle time. It is recommended to add a line-side store (2-pallet capacity) after AOI to serve as a buffer for the downstream selective soldering operation, reducing upstream and downstream waiting.',
    impact: 'Expected to reduce AOI line stoppage time caused by a full line-side store by about 12%',
    effort: 'Low',
  },
];

const CATEGORY_CONFIG: Record<Suggestion['category'], { icon: React.ReactNode; color: string; bg: string }> = {
  'Equipment Optimization': { icon: <Wrench size={12} />, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
  'Headcount Adjustment': { icon: <Users size={12} />, color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/20' },
  'Process Improvement': { icon: <TrendingUp size={12} />, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
  'Material Optimization': { icon: <Lightbulb size={12} />, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
};

const PRIORITY_CONFIG = {
  P0: { label: 'Urgent', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  P1: { label: 'Important', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  P2: { label: 'Suggested', cls: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

export function AIAnalysisPage() {
  const { t } = useTranslation();
  const { planId } = useParams();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<string[]>(['S001']);
  const [accepted, setAccepted] = useState<string[]>([]);

  const toggle = (id: string) => setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const accept = (id: string) => setAccepted(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-[#142235] flex-shrink-0">
        <button onClick={() => navigate(`/simulation/plan/${planId}/result`)} className="text-slate-600 hover:text-slate-300 transition-colors">
          <ChevronLeft size={18} />
        </button>
        <div>
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-violet-400" />
            <h1 className="text-base font-bold text-slate-200">{t('AI Optimization Suggestions')}</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{t('Improvement suggestions auto-generated from the lean production knowledge base, based on simulation results')}</p>
        </div>
        <div className="flex-1" />
        <Button variant="primary" size="sm">
          {t('Export Suggestion Report')}
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Summary */}
        <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <Brain size={20} className="text-violet-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-violet-300 mb-2">{t('Bottleneck Root Cause Analysis')}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {t('The simulation results show that the core bottleneck of this plan is the')} <span className="text-red-400 font-semibold">{t('"Selective Soldering Operation"')}</span> {t('with severely insufficient capacity (131% utilization), causing downstream operations to wait and accumulate backlog. The Line Balance Rate LBR=73.2%, below the industry standard of 85%.')}
                {t('The secondary bottleneck is the')} <span className="text-amber-400 font-semibold">{t('"SMT Operation"')}</span> {t('(Front 107%, Back 114%), combined with a material shortage event (T+04:30) that delayed the completion of 5 work orders.')}
                {t('Overall improvement priority: increase selective soldering capacity > optimize SMT cycle time balancing > flexible headcount reallocation > advance material stocking.')}
              </p>
            </div>
          </div>
        </div>

        {/* Improvement Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Suggestions', value: SUGGESTIONS.length.toString(), unit: '' },
            { label: 'P0 Urgent Suggestions', value: SUGGESTIONS.filter(s => s.priority === 'P0').length.toString(), unit: '', color: 'text-red-400' },
            { label: 'Accepted Suggestions', value: accepted.length.toString(), unit: '', color: 'text-emerald-400' },
            { label: 'Expected LBR Improvement', value: '+13.3%', unit: '(if all accepted)', color: 'text-cyan-400' },
          ].map(m => (
            <div key={m.label} className="bg-[#0a1929] border border-[#142235] rounded-xl p-4">
              <div className="text-[11px] text-slate-600 mb-1">{t(m.label)}</div>
              <div className={cn('text-2xl font-bold', m.color || 'text-slate-200')}>{m.value}<span className="text-sm font-normal text-slate-500 ml-1">{m.unit && t(m.unit)}</span></div>
            </div>
          ))}
        </div>

        {/* Suggestions List */}
        <div className="space-y-3">
          {SUGGESTIONS.map(s => {
            const cat = CATEGORY_CONFIG[s.category];
            const pri = PRIORITY_CONFIG[s.priority];
            const isExpanded = expanded.includes(s.id);
            const isAccepted = accepted.includes(s.id);
            return (
              <div
                key={s.id}
                className={cn(
                  'border rounded-xl overflow-hidden transition-all',
                  isAccepted ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-[#142235] bg-[#0a1929]',
                )}
              >
                {/* Summary Row */}
                <div className="px-5 py-4 flex items-start gap-4">
                  <div className={cn('flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-semibold flex-shrink-0', cat.bg, cat.color)}>
                    {cat.icon}{t(s.category)}
                  </div>
                  <span className={cn('text-[11px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0', pri.cls)}>{t(pri.label)}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-200">{t(s.title)}</span>
                      {isAccepted && <span className="text-[11px] text-emerald-400 flex items-center gap-1"><CheckCircle2 size={11} />{t('Accepted')}</span>}
                    </div>
                    {!isExpanded && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{t(s.desc)}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[11px] text-slate-600">{t('Implementation Difficulty:')} <span className={s.effort === 'Low' ? 'text-emerald-400' : s.effort === 'Medium' ? 'text-amber-400' : 'text-red-400'}>{t(s.effort)}</span></span>
                    <button onClick={() => toggle(s.id)} className="text-slate-600 hover:text-slate-300 transition-colors">
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  </div>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="px-5 pb-4 pt-0 border-t border-[#142235]">
                    <div className="mt-3 space-y-2">
                      <p className="text-xs text-slate-400 leading-relaxed">{t(s.desc)}</p>
                      <div className="flex items-start gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
                        <TrendingUp size={12} className="text-emerald-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-emerald-300">{t(s.impact)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-4">
                      <Button
                        size="xs"
                        variant={isAccepted ? 'secondary' : 'primary'}
                        onClick={() => accept(s.id)}
                      >
                        {isAccepted ? t('Unaccept') : t('Accept Suggestion')}
                      </Button>
                      <Button size="xs" variant="ghost">
                        {t('Create New Plan Based on This Suggestion')}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
