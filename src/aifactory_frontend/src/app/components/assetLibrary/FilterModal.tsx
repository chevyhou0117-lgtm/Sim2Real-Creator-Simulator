import React, { useState } from "react";
import { X } from "lucide-react";
import { t } from "../../utils/i18n";
import type { AssetStatus } from "../../../types/category";

const TYPE_OPTIONS = ["line_model", "equipment_model"];

const ASSET_STATUS_LABEL_KEY: Record<AssetStatus, string> = {
  DRAFT: "status.draft",
  ACTIVE: "status.active",
  INACTIVE: "status.inactive",
  ARCHIVED: "status.archived",
};

const ASSET_STATUS_CLASS: Record<AssetStatus, string> = {
  DRAFT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  ACTIVE: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  INACTIVE: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  ARCHIVED: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  processOptions: string[];
  selectedProcessNode: string;
  selectedType: string;
  selectedStatus: AssetStatus | "all";
  activeFilterCount: number;
  searchQuery: string;
  onSelectProcess: (id: string) => void;
  onToggleType: (type: string) => void;
  onSetStatus: (status: AssetStatus | "all") => void;
  onClearAll: () => void;
}

export function FilterModal({
  isOpen,
  onClose,
  anchorEl,
  processOptions,
  selectedProcessNode,
  selectedType,
  selectedStatus,
  activeFilterCount,
  searchQuery,
  onSelectProcess,
  onToggleType,
  onSetStatus,
  onClearAll,
}: FilterModalProps) {
  if (!isOpen || !anchorEl) return null;

  const rect = anchorEl.getBoundingClientRect();

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal - positioned below the filter button */}
      <div
        className="absolute bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded-md shadow-xl overflow-hidden"
        style={{
          left: rect.left,
          top: rect.bottom + 4,
          width: "280px",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-142235)]">
          <span className="text-sm font-semibold text-slate-100">{t("asset.filter.title")}</span>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-300 p-1 rounded transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto">
          {/* 制程 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                {t("asset.filter.process")}
              </span>
            </div>
            <div className="flex flex-wrap gap-1">
              {processOptions.map((proc) => (
                <button
                  key={proc}
                  onClick={() => {
                    onSelectProcess(proc);
                  }}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    selectedProcessNode === proc || ""
                      ? "bg-blue-600/25 text-blue-300 border-blue-500/60"
                      : "text-slate-500 border-[var(--c-1e3a55)] hover:text-slate-300 hover:border-[var(--c-2a4a6a)]"
                  }`}
                >
                  {proc}
                </button>
              ))}
            </div>
          </div>

          {/* 类型 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                {t("asset.filter.type")}
              </span>
              {/* {selectedTypes.size > 0 && (
                <button
                  onClick={() => {
                    // Clear all types by toggling each one
                    selectedTypes.forEach((type) => onToggleType(type));
                  }}
                  className="text-[9px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Clear
                </button>
              )} */}
            </div>
            <div className="flex flex-wrap gap-1">
              {TYPE_OPTIONS.map((type) => (
                <button
                  key={type}
                  onClick={() => onToggleType(type)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    selectedType === type
                      ? "bg-blue-600/25 text-blue-300 border-blue-500/60"
                      : "text-slate-500 border-[var(--c-1e3a55)] hover:text-slate-300 hover:border-[var(--c-2a4a6a)]"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* 状态 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                {t("asset.filter.status")}
              </span>
              {/* {selectedStatus !== "all" && (
                <button
                  onClick={() => onSetStatus("all")}
                  className="text-[9px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  Clear
                </button>
              )} */}
            </div>
            <div className="flex flex-wrap gap-1">
              {(
                ["all", "DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"] as const
              ).map((s) => (
                <button
                  key={s}
                  onClick={() => onSetStatus(s)}
                  className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                    selectedStatus === s
                      ? "bg-blue-600/25 text-blue-300 border-blue-500/60"
                      : "text-slate-500 border-[var(--c-1e3a55)] hover:text-slate-300 hover:border-[var(--c-2a4a6a)]"
                  }`}
                >
                  {s === "all" ? t("asset.filter.all") : t(ASSET_STATUS_LABEL_KEY[s])}
                </button>
              ))}
            </div>
          </div>

          {/* Clear all */}
          {(activeFilterCount > 0 || searchQuery) && (
            <button
              onClick={() => {
                onClearAll();
              }}
              className="w-full text-[10px] text-slate-500 hover:text-slate-300 border border-[var(--c-1e3a55)] rounded py-1 transition-colors"
            >
              {t("asset.filter.clearAll")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
