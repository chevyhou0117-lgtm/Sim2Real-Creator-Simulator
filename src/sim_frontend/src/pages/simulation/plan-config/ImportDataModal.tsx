/** Excel/CSV 数据导入弹窗 —— 3 步流：上传 → 校验 → 确认。
 *
 * 接入后端 importApi.validate / commit。section_id 决定走哪个落库路径；
 * 主数据型 section 后端会返 501，弹窗显示「请通过主数据平台 ETL 同步」。 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';

import { importApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { ImportValidationResult } from '@/types/api';

export interface ImportSectionDef {
  id: string;
  title: string;
  cols?: string[];
  /** 用作下载模板时的链接（可选） */
  templateUrl?: string;
}

interface Props {
  section: ImportSectionDef;
  planId: string;
  onClose: () => void;
  onDone?: (result: { inserted: number; skipped: number }) => void;
}

type Step = 'upload' | 'validation' | 'confirm';

export function ImportDataModal({ section, planId, onClose, onDone }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) {
      setErrorMsg(t('Only .xlsx / .xls / .csv are supported'));
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setErrorMsg(t('File size cannot exceed 10MB'));
      return;
    }
    setFile(f);
    setErrorMsg(null);
    setServerError(null);
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setServerError(null);
    try {
      const res = await importApi.validate(section.id, planId, file);
      setValidation(res);
      setStep(res.valid ? 'confirm' : 'validation');
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      const detail = (err as Error & { detail?: unknown }).detail;
      if (status === 501) {
        setServerError(typeof detail === 'string' ? detail : t('This data comes from the Master Data Platform; please sync via ETL. Manual import is not supported'));
      } else {
        setServerError(String(err));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!file || !validation) return;
    setCommitting(true);
    setServerError(null);
    try {
      const res = await importApi.commit(section.id, planId, file, true);
      onDone?.({ inserted: res.inserted, skipped: res.skipped });
      onClose();
    } catch (err) {
      setServerError(String(err));
    } finally {
      setCommitting(false);
    }
  };

  const handleRetry = () => {
    setFile(null);
    setValidation(null);
    setStep('upload');
    setErrorMsg(null);
    setServerError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-2xl w-[540px] max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-142235)] flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">{t('Import Data · {{title}}', { title: section.title })}</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">{t('Upload an Excel/CSV file and the system will automatically validate the data format')}</p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-5 pt-4 flex items-center justify-between">
          {(['upload', 'validation', 'confirm'] as Step[]).map((s, i) => {
            const order: Record<Step, number> = { upload: 0, validation: 1, confirm: 2 };
            const cur = order[step];
            const idx = order[s];
            return (
              <div key={s} className="flex items-center">
                <div className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold border flex-shrink-0',
                  cur === idx ? 'bg-blue-500/20 border-blue-500 text-blue-400' :
                  cur > idx ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' :
                  'bg-[var(--c-07111e)] border-[var(--c-1e3a55)] text-slate-500',
                )}>{i + 1}</div>
                <span className={cn(
                  'text-[10px] font-medium ml-2 whitespace-nowrap',
                  cur === idx ? 'text-slate-300' : cur > idx ? 'text-emerald-400' : 'text-slate-500',
                )}>
                  {s === 'upload' ? t('Upload File') : s === 'validation' ? t('Data Validation') : t('Confirm Import')}
                </span>
                {i < 2 && (
                  <div className={cn(
                    'w-12 h-px mx-2',
                    cur > idx ? 'bg-emerald-500/30' : 'bg-[var(--c-1e3a55)]',
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="flex items-center justify-center">
                <div className="w-32 h-32 rounded-full border-2 border-dashed border-[var(--c-1e3a55)] flex items-center justify-center hover:border-blue-500/50 transition-colors cursor-pointer relative">
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                    disabled={uploading}
                  />
                  {file ? (
                    <div className="text-center">
                      <FileText size={32} className="text-blue-400 mx-auto" />
                      <div className="text-xs text-slate-300 mt-2 truncate max-w-[120px]">{file.name}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                    </div>
                  ) : (
                    <div className="text-center">
                      <Upload size={32} className="text-slate-400 mx-auto" />
                      <div className="text-xs text-slate-400 mt-2">{t('Click to select a file')}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{t('Excel / CSV supported')}</div>
                    </div>
                  )}
                </div>
              </div>

              {errorMsg && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                  <AlertCircle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-red-300">{errorMsg}</span>
                </div>
              )}
              {serverError && (
                <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  <AlertCircle size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <span className="text-xs text-amber-300">{serverError}</span>
                </div>
              )}

              <div className="text-center">
                <p className="text-xs text-slate-400">{t('Please ensure the file contains the following columns:')}</p>
                <p className="text-[11px] text-slate-300 font-mono mt-1">
                  {section.cols?.join(' / ') ?? t('Refer to the template format')}
                </p>
                {section.templateUrl && (
                  <a
                    href={section.templateUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-[10px] text-blue-400 hover:text-blue-300"
                  >
                    <Download size={10} /> {t('Download Template')}
                  </a>
                )}
              </div>
            </div>
          )}

          {step === 'validation' && validation && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-amber-400" />
                <h3 className="text-sm font-semibold text-slate-200">{t('Data Validation Found Issues')}</h3>
              </div>

              <div className="bg-[var(--c-07111e)] border border-[var(--c-142235)] rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-center">
                    <div className="text-2xl font-bold font-mono text-slate-300">{validation.total_rows}</div>
                    <div className="text-[10px] text-slate-500">{t('Total Rows')}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold font-mono text-emerald-400">{validation.valid_rows}</div>
                    <div className="text-[10px] text-slate-500">{t('Valid Rows')}</div>
                  </div>
                </div>

                {validation.errors.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-red-400 flex items-center gap-1">
                      <XCircle size={10} /> {t('Errors ({{count}} items)', { count: validation.errors.length })}
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {validation.errors.map((err, i) => (
                        <div key={i} className="text-[10px] text-slate-400 bg-red-500/10 rounded px-2 py-1">
                          <span className="text-red-400">{t('Row {{row}}', { row: err.row })}</span>
                          <span className="mx-1">·</span>
                          <span className="text-slate-300">{err.field}</span>
                          <span className="mx-1">:</span>
                          <span>{err.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {validation.warnings.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-[11px] font-semibold text-amber-400 flex items-center gap-1">
                      <AlertCircle size={10} /> {t('Warnings ({{count}} items)', { count: validation.warnings.length })}
                    </div>
                    <div className="max-h-24 overflow-y-auto space-y-1">
                      {validation.warnings.map((w, i) => (
                        <div key={i} className="text-[10px] text-slate-400 bg-amber-500/10 rounded px-2 py-1">
                          <span className="text-amber-400">{t('Row {{row}}', { row: w.row })}</span>
                          <span className="mx-1">·</span>
                          <span className="text-slate-300">{w.field}</span>
                          <span className="mx-1">:</span>
                          <span>{w.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="text-xs text-slate-400">
                <p>{t('Please fix the errors and re-upload.')}</p>
              </div>
            </div>
          )}

          {step === 'confirm' && validation && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-400" />
                <h3 className="text-sm font-semibold text-slate-200">{t('Data Validation Passed')}</h3>
              </div>

              <div className="bg-[var(--c-07111e)] border border-[var(--c-142235)] rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="text-center">
                    <div className="text-xl font-bold font-mono text-slate-300">{validation.total_rows}</div>
                    <div className="text-[10px] text-slate-500">{t('Total Rows')}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold font-mono text-emerald-400">100%</div>
                    <div className="text-[10px] text-slate-500">{t('Pass Rate')}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold font-mono text-blue-400">{validation.warnings.length}</div>
                    <div className="text-[10px] text-slate-500">{t('Warnings')}</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-slate-400">{t('Data Preview (first {{count}} rows)', { count: validation.preview_rows.length })}</div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className="border-b border-[var(--c-0e1e2e)]">
                          {validation.columns.map((col, i) => (
                            <th key={i} className="text-left px-2 py-1 text-slate-400 font-medium">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {validation.preview_rows.map((row, i) => (
                          <tr key={i} className="border-b border-[var(--c-0e1e2e)]/50">
                            {row.map((cell, j) => (
                              <td key={j} className="px-2 py-1 text-slate-400 font-mono">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {serverError && step !== 'upload' && (
            <div className="mt-3 flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
              <span className="text-xs text-red-300">{serverError}</span>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="px-5 pb-5 border-t border-[var(--c-142235)] pt-4 flex justify-end gap-2 flex-shrink-0">
          {step === 'upload' && (
            <>
              <button
                onClick={onClose}
                disabled={uploading}
                className="text-[11px] px-3 py-1.5 rounded border border-[var(--c-1e3a55)] text-slate-400 hover:border-slate-500 hover:text-slate-300 disabled:opacity-50"
              >
                {t('Cancel')}
              </button>
              <button
                onClick={handleUpload}
                disabled={!file || uploading}
                className={cn(
                  'text-[11px] px-3 py-1.5 rounded inline-flex items-center gap-1',
                  file && !uploading
                    ? 'bg-blue-600 text-white hover:bg-blue-500'
                    : 'bg-[var(--c-0d2035)] text-slate-600 cursor-not-allowed',
                )}
              >
                {uploading && <Loader2 size={12} className="animate-spin" />}
                {uploading ? t('Uploading…') : t('Upload & Validate')}
              </button>
            </>
          )}
          {step === 'validation' && (
            <>
              <button onClick={handleRetry} className="text-[11px] px-3 py-1.5 rounded border border-[var(--c-1e3a55)] text-slate-400 hover:border-slate-500 hover:text-slate-300">
                {t('Re-upload')}
              </button>
              <button onClick={onClose} className="text-[11px] px-3 py-1.5 rounded border border-[var(--c-1e3a55)] text-slate-400 hover:border-slate-500 hover:text-slate-300">
                {t('Cancel')}
              </button>
            </>
          )}
          {step === 'confirm' && (
            <>
              <button onClick={handleRetry} disabled={committing} className="text-[11px] px-3 py-1.5 rounded border border-[var(--c-1e3a55)] text-slate-400 hover:border-slate-500 hover:text-slate-300 disabled:opacity-50">
                {t('Re-upload')}
              </button>
              <button
                onClick={handleConfirm}
                disabled={committing}
                className={cn(
                  'text-[11px] px-3 py-1.5 rounded inline-flex items-center gap-1',
                  !committing ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-[var(--c-0d2035)] text-slate-600 cursor-not-allowed',
                )}
              >
                {committing && <Loader2 size={12} className="animate-spin" />}
                {committing ? t('Importing…') : t('Confirm Import')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
