import { useTranslation } from 'react-i18next';
import { AlertCircle, X } from 'lucide-react';
import type { ReadyValidationError, ReadyRuleReport } from '@/types/api';

const DIM_LABEL: Record<string, string> = {
  input: 'Input Data',
  params: 'Parameter Configuration',
  constraints: 'Constraint Settings',
};

function RuleBlock({ r }: { r: ReadyRuleReport }) {
  const { t } = useTranslation();
  return (
    <div className="border border-[var(--c-142235)] rounded-lg overflow-hidden">
      <div className="px-3 py-2 bg-[var(--c-0a1929)] text-xs font-semibold text-slate-300">
        {r.label}
        <span className="ml-2 text-[10px] text-slate-600 font-mono">{r.rule_id}</span>
      </div>
      <ul className="divide-y divide-[var(--c-0e1e2e)]">
        {r.issues.length === 0 ? (
          <li className="px-3 py-2 text-[11px] text-slate-500">{t('validation failed')}</li>
        ) : (
          r.issues.map((it, i) => (
            <li key={i} className="px-3 py-2 text-[11px] text-slate-400 flex gap-2">
              {it.row > 0 && (
                <span className="text-slate-600 font-mono flex-shrink-0">#{it.row}</span>
              )}
              <span>{it.message}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

export function ReadyValidationModal({
  error,
  onClose,
}: {
  error: ReadyValidationError;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const byDim: Record<string, ReadyRuleReport[]> = {};
  for (const r of error.failed_rules) (byDim[r.dimension] ??= []).push(r);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-2xl w-[560px] max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-142235)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-amber-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-200">{t('Cannot save as Ready')}</h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {t('The following {{count}} validation(s) failed. Fix them, then click "Save & Set Ready".', { count: error.failed_rules.length })}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {Object.entries(byDim).map(([dim, rules]) => (
            <div key={dim} className="space-y-2">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                {DIM_LABEL[dim] ? t(DIM_LABEL[dim]) : dim}
              </div>
              {rules.map(r => <RuleBlock key={r.rule_id} r={r} />)}
            </div>
          ))}

          {error.warnings.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-amber-500/80 uppercase tracking-wider">
                {t('Warnings (non-blocking)')}
              </div>
              {error.warnings.map(r => <RuleBlock key={r.rule_id} r={r} />)}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[var(--c-142235)] flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
          >
            {t('Go Fix')}
          </button>
        </div>
      </div>
    </div>
  );
}
