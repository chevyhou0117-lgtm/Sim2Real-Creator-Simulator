import React from "react";
import { Check, X } from "lucide-react";
import { t } from "../../utils/i18n";

interface BatchResultDialogProps {
  result: {
    type: "download" | "toggle" | "delete";
    success: number;
    fail: { id: string; name: string; reason: string }[];
  };
  onClose: () => void;
}

const RESULT_TITLE_KEY: Record<string, string> = {
  download: "asset.batchResult.titleDownload",
  toggle: "asset.batchResult.titleToggle",
  delete: "asset.batchResult.titleDelete",
};

const RESULT_ACTION_KEY: Record<string, string> = {
  download: "asset.batchResult.download",
  delete: "asset.batchResult.delete",
  toggle: "asset.batchResult.operation",
};

export function BatchResultDialog({ result, onClose }: BatchResultDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0b1d30] border border-[#1e3a55] rounded-xl w-[400px] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#142235]">
          <span className="text-sm font-semibold text-slate-100">{t(RESULT_TITLE_KEY[result.type])}</span>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-center gap-2">
            <Check size={16} className="text-emerald-400" />
            <span className="text-xs text-slate-200">
              {t("asset.batchResult.successCount", {
                n: result.success,
                action: t(RESULT_ACTION_KEY[result.type]),
              })}
            </span>
          </div>
          {result.fail.length > 0 && (
            <div className="bg-red-600/10 border border-red-500/30 rounded-md p-3 space-y-1.5">
              <div className="text-[11px] font-medium text-red-400">
                {t("asset.batchResult.failureDetail")}
              </div>
              {result.fail.map((f) => (
                <div key={f.id} className="text-[10px] text-slate-400">
                  {f.name}: {f.reason}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end px-5 py-4 border-t border-[#142235]">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md font-medium transition-colors"
          >
            {t("asset.batchResult.btnOK")}
          </button>
        </div>
      </div>
    </div>
  );
}
