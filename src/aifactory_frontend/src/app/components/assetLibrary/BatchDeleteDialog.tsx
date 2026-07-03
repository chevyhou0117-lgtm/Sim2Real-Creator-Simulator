import React from "react";
import { Check, AlertTriangle } from "lucide-react";
import { t } from "../../utils/i18n";

interface BatchDeleteDialogProps {
  deleteIds: string[];
  blockedIds: { id: string; reason: string }[];
  onConfirm: () => void;
  onCancel: () => void;
}

export function BatchDeleteDialog({ deleteIds, blockedIds, onConfirm, onCancel }: BatchDeleteDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-xl w-[440px] shadow-2xl">
        <div className="px-5 py-4 border-b border-[var(--c-142235)]">
          <span className="text-sm font-semibold text-slate-100">{t("asset.batchDeleteDialog.title")}</span>
        </div>
        <div className="px-5 py-4 space-y-3">
          {deleteIds.length > 0 ? (
            <div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 mb-2">
                <Check size={13} />
                <span>{t("asset.batchDeleteDialog.assetsDeletable", { n: deleteIds.length })}</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {t("asset.batchDeleteDialog.confirmMessage", { n: deleteIds.length })}
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-amber-400">
              <AlertTriangle size={13} />
              <span>{t("asset.batchDeleteDialog.noAssets")}</span>
            </div>
          )}
          {blockedIds.length > 0 && (
            <div className="bg-red-600/10 border border-red-500/30 rounded-md p-3 space-y-1.5">
              <div className="text-[11px] font-medium text-red-400">
                {t("asset.batchDeleteDialog.blockedWarning", { n: blockedIds.length })}
              </div>
              {blockedIds.map((b) => (
                <div key={b.id} className="text-[10px] text-slate-400">
                  {b.id}: {b.reason}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--c-142235)]">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs text-slate-400 border border-[var(--c-1e3a55)] rounded-md hover:border-[var(--c-2a4a6a)] transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={deleteIds.length === 0}
            className="px-5 py-2 text-xs bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
          >
            {t("asset.batchDeleteDialog.confirmBtn")}
          </button>
        </div>
      </div>
    </div>
  );
}