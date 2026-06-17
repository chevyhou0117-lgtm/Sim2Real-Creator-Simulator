import React, { useState } from 'react';
import {
  X, CheckCircle2, XCircle, AlertCircle, ShieldCheck,
  AlertTriangle, Info, ChevronDown, ChevronRight,
} from 'lucide-react';
import {
  generateValidationItems,
  generateValidationReport,
  type ProjectStatus,
  type ValidationCategoryResult,
  type ValidationIssue,
  type ValidationSeverity,
  type ValidationStatus,
} from '../../data/mockData';
import { t, useLocalized } from '../../utils/i18n';

interface Props {
  status: ProjectStatus;
  onClose: () => void;
  onMarkComplete: () => void;
  factoryName?: string;
}

// ── helpers ──────────────────────────────────────

function severityColor(s: ValidationSeverity) {
  if (s === 'critical') return 'text-red-400';
  if (s === 'high') return 'text-orange-400';
  if (s === 'medium') return 'text-amber-400';
  return 'text-slate-400';
}

function severityBg(s: ValidationSeverity) {
  if (s === 'critical') return 'bg-red-500/10 border-red-500/20';
  if (s === 'high') return 'bg-orange-500/10 border-orange-500/20';
  if (s === 'medium') return 'bg-amber-500/10 border-amber-500/20';
  return 'bg-slate-500/10 border-slate-500/20';
}

function statusIcon(s: ValidationStatus, size = 14) {
  if (s === 'passed') return <CheckCircle2 size={size} className="text-emerald-400 flex-shrink-0" />;
  if (s === 'failed') return <XCircle size={size} className="text-red-400 flex-shrink-0" />;
  return <AlertTriangle size={size} className="text-amber-400 flex-shrink-0" />;
}

function IssueRow({ issue }: { issue: ValidationIssue }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-md border text-xs ${severityBg(issue.severity)}`}>
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`uppercase font-semibold text-[9px] px-1.5 py-0.5 rounded ${severityColor(issue.severity)} border ${severityBg(issue.severity)}`}>
          {issue.severity}
        </span>
        <span className="flex-1 text-slate-200 font-medium">{issue.title}</span>
        {open ? <ChevronDown size={12} className="text-slate-500" /> : <ChevronRight size={12} className="text-slate-500" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
          <p className="text-slate-400 leading-relaxed">{issue.description}</p>
          {issue.affectedItems.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {issue.affectedItems.map((item) => (
                <span key={item} className="px-2 py-0.5 bg-[#0b1d30] border border-[#1e3a55] rounded text-slate-300">
                  {item}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-start gap-1.5 text-blue-300/80">
            <Info size={11} className="mt-0.5 flex-shrink-0" />
            <span>{issue.suggestion}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoryRow({ cat }: { cat: ValidationCategoryResult }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md bg-[#071526] border border-[#1e3a55]">
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {statusIcon(cat.status)}
        <span className="flex-1 text-xs font-medium text-slate-200">{cat.label}</span>
        <span className="text-[10px] text-slate-500">{cat.passCount}/{cat.totalCount}</span>
        {cat.issues.length > 0 && (
          open ? <ChevronDown size={12} className="text-slate-500" /> : <ChevronRight size={12} className="text-slate-500" />
        )}
      </button>
      {open && cat.issues.length > 0 && (
        <div className="px-3 pb-3 space-y-2 border-t border-[#1e3a55] pt-2">
          <p className="text-[10px] text-slate-500 mb-1">{cat.description}</p>
          {cat.issues.map((iss) => <IssueRow key={iss.id} issue={iss} />)}
        </div>
      )}
    </div>
  );
}

// ── main component ────────────────────────────────

export function ValidationModal({ status, onClose, onMarkComplete, factoryName }: Props) {
  useLocalized();

  const [tab, setTab] = useState<'checklist' | 'report'>('checklist');

  // — Checklist tab data —
  const items = generateValidationItems(status);
  const passed = items.filter((v) => v.pass).length;
  const total = items.length;
  const allPassed = passed === total;

  // — Report tab data —
  const report = generateValidationReport(factoryName);
  const criticalCount = report.allIssues.filter((i) => i.severity === 'critical').length;
  const highCount = report.allIssues.filter((i) => i.severity === 'high').length;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0b1d30] border border-[#1e3a55] rounded-xl w-[600px] max-h-[80vh] shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#142235] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <ShieldCheck size={16} className="text-blue-400" />
            <span className="text-sm font-semibold text-slate-100">{t("editor.validation.title")}</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#142235] flex-shrink-0">
          {(['checklist', 'report'] as const).map((tabKey) => (
            <button
              key={tabKey}
              onClick={() => setTab(tabKey)}
              className={`px-5 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
                tab === tabKey
                  ? 'border-blue-500 text-blue-400'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              {tabKey === 'checklist' ? t("editor.validation.checklist") : t("editor.validation.report")}
            </button>
          ))}
        </div>

        {/* ── CHECKLIST TAB ── */}
        {tab === 'checklist' && (
          <>
            <div className="px-5 py-4 border-b border-[#142235] flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400">{t("editor.validation.progress")}</span>
                <span className="text-xs font-medium text-slate-200">{t("editor.validation.checksPassed", { passed, total })}</span>
              </div>
              <div className="w-full h-2 bg-[#071526] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${allPassed ? 'bg-emerald-500' : 'bg-blue-500'}`}
                  style={{ width: `${(passed / total) * 100}%` }}
                />
              </div>
              {allPassed ? (
                <p className="text-[11px] text-emerald-400 mt-2 flex items-center gap-1.5">
                  <CheckCircle2 size={11} /> {t("editor.validation.allPassed")}
                </p>
              ) : (
                <p className="text-[11px] text-amber-400 mt-2 flex items-center gap-1.5">
                  <AlertCircle size={11} /> {t("editor.validation.someFailed", { n: total - passed })}
                </p>
              )}
            </div>
            <div className="px-5 py-3 overflow-y-auto space-y-1.5 flex-1">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-start gap-3 p-2.5 rounded-md ${item.pass ? 'bg-emerald-500/5' : 'bg-red-500/5'}`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {item.pass ? <CheckCircle2 size={14} className="text-emerald-400" /> : <XCircle size={14} className="text-red-400" />}
                  </div>
                  <div className="flex-1">
                    <div className={`text-xs font-medium ${item.pass ? 'text-slate-200' : 'text-slate-300'}`}>{item.label}</div>
                    {item.note && (
                      <div className={`text-[10px] mt-0.5 ${item.pass ? 'text-slate-500' : 'text-amber-500/80'}`}>{item.note}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── REPORT TAB ── */}
        {tab === 'report' && (
          <>
            {/* Report summary bar */}
            <div className="px-5 py-4 border-b border-[#142235] flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {statusIcon(report.overallStatus, 16)}
                  <span className="text-xs font-semibold text-slate-100 capitalize">{report.overallStatus === 'passed' ? t("editor.validation.allChecksPassed") : report.overallStatus === 'failed' ? t("editor.validation.validationFailed") : t("editor.validation.warningsDetected")}</span>
                </div>
                <span className="text-[10px] text-slate-500">
                  {new Date(report.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: t("editor.validation.instances"), value: report.stats.totalInstances },
                  { label: t("editor.validation.bindingRate"), value: `${report.stats.bindingRate}%` },
                  { label: t("editor.validation.critical"), value: criticalCount, color: criticalCount > 0 ? 'text-red-400' : 'text-slate-300' },
                  { label: t("editor.validation.high"), value: highCount, color: highCount > 0 ? 'text-orange-400' : 'text-slate-300' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2 text-center">
                    <div className={`text-sm font-semibold ${color ?? 'text-slate-200'}`}>{value}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Category list */}
            <div className="px-5 py-3 overflow-y-auto space-y-2 flex-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">{t("editor.validation.categories")}</p>
              {report.categories.map((cat) => <CategoryRow key={cat.category} cat={cat} />)}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[#142235] flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 border border-[#1e3a55] rounded-md hover:border-[#2a4a6a] transition-colors"
          >
            {t("editor.validation.close")}
          </button>
          {tab === 'checklist' && allPassed && (
            <button
              onClick={() => { onMarkComplete(); onClose(); }}
              className="px-5 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-medium transition-colors flex items-center gap-1.5"
            >
              <CheckCircle2 size={12} /> {t("editor.validation.markComplete")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
