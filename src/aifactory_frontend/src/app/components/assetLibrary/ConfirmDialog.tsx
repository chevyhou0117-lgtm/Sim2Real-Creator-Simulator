import React from "react";
import { Loader2 } from "lucide-react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  confirmCls?: string;
  loading?: boolean;
}

export function ConfirmDialog({ title, message, onConfirm, onCancel, confirmLabel, confirmCls, loading }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0b1d30] border border-[#1e3a55] rounded-xl w-[380px] shadow-2xl">
        <div className="px-5 py-4 border-b border-[#142235]">
          <span className="text-sm font-semibold text-slate-100">{title}</span>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs text-slate-400 leading-relaxed">{message}</p>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[#142235]">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2 text-xs text-slate-400 border border-[#1e3a55] rounded-md hover:border-[#2a4a6a] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-5 py-2 text-xs text-white rounded-md font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 ${confirmCls ?? "bg-red-600 hover:bg-red-700"}`}
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
            {confirmLabel ?? "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
