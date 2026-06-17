import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import {
  AlertCircle,
  LinkIcon,
  Unlink,
  Edit2,
  RefreshCw,
  Search,
  X,
  Plus,
} from "lucide-react";
import type {
  BindingRecord,
  PlatformRecord,
  ConflictModalState,
} from "../../../types/factoryEditor";
import { PLATFORM_RECORDS } from "../../../types/factoryEditor";
import { ConfigSection } from "./UiComponents";
import "./editor.css";

import { getLineAssetListApi, getEquipmentAssetListByLineApi } from "../../api";
import { type FactoryNode } from "../../../types/factoryEditor";
import { t, useLocalized } from "../../utils/i18n";

// ── RuleBindingEntry ───────────────────────────────────────────────────────

export function RuleBindingEntry({
  label,
  icon,
  locked,
  configuredCount,
  projectId,
}: {
  label: string;
  icon: React.ReactNode;
  locked: boolean;
  configuredCount: number;
  projectId?: string;
}) {
  const navigate = useNavigate();

  if (locked) {
    return (
      <div className="flex items-center justify-between py-1.5 px-2 rounded border border-[#142235] bg-[#040d18]/50">
        <div className="flex items-center gap-1.5 text-slate-600">
          <span className="text-[9px]">{icon}</span>
          <span className="text-[10px]">{label}</span>
          <span className="text-[9px] text-slate-700">{t("bindingComponents.ruleBindingEntry.optional")}</span>
        </div>
        <div className="flex items-center gap-1 text-slate-700">
          <svg
            width="9"
            height="9"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="text-[9px]">{t("bindingComponents.ruleBindingEntry.requiresBasicDataBinding")}</span>
        </div>
      </div>
    );
  }

  if (configuredCount === 0) {
    return (
      <div className="flex items-center justify-between py-1.5 px-2 rounded border border-[#142235] bg-[#040d18]/50">
        <div className="flex items-center gap-1.5 text-slate-500">
          <span className="text-[9px]">{icon}</span>
          <span className="text-[10px]">{label}</span>
          <span className="text-[9px] text-slate-600">{t("bindingComponents.ruleBindingEntry.optional")}</span>
        </div>
        <button
          onClick={() =>
            projectId && navigate(`/factory/${projectId}/data-binding`)
          }
          className="text-[9px] text-blue-400 hover:text-blue-300 transition-colors"
        >
          {t("bindingComponents.ruleBindingEntry.configure")}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between py-1.5 px-2 rounded border border-emerald-500/20 bg-emerald-500/5">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] text-emerald-400">{icon}</span>
        <span className="text-[10px] text-slate-300">{label}</span>
        <span className="text-[9px] px-1.5 py-0.5 bg-emerald-500/15 border border-emerald-500/25 rounded text-emerald-400">
          {t("bindingComponents.ruleBindingEntry.configured")}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[9px] text-slate-500">
          {t("bindingComponents.ruleBindingEntry.rules", { count: configuredCount })}
        </span>
        <button
          onClick={() =>
            projectId && navigate(`/factory/${projectId}/data-binding`)
          }
          className="text-[9px] text-blue-400 hover:text-blue-300 transition-colors"
        >
          {t("bindingComponents.ruleBindingEntry.manage")}
        </button>
      </div>
    </div>
  );
}

// ── DataBindingSection ─────────────────────────────────────────────────────

export function DataBindingSection({
  node,
  nodeId,
  nodeType,
  label,
  platformConnected,
  bindingRecord,
  onBind,
  onUnbind,
}: {
  node: FactoryNode;
  nodeId: string;
  nodeType: "FACTORY" | "LINE" | "EQUIPMENT";
  label?: string;
  platformConnected: boolean;
  bindingRecord?: any;
  onBind: () => void;
  onUnbind: () => void;
}) {
  const [showUnbindConfirm, setShowUnbindConfirm] = useState(false);
  useLocalized();

  const prevId = useRef(nodeId);
  if (prevId.current !== nodeId) {
    prevId.current = nodeId;
    if (showUnbindConfirm) setShowUnbindConfirm(false);
  }

  // const platformRecord = bindingRecord
  //   ? PLATFORM_RECORDS.find((r) => r.id === bindingRecord.externalId)
  //   : undefined;
  const sectionTitle = label ?? t("bindingComponents.dataBindingSection.title");
  const nodeLabel = t(
    nodeType === "FACTORY"
      ? "bindingComponents.dataBindingSection.nodeTypeFactory"
      : nodeType === "LINE"
        ? "bindingComponents.dataBindingSection.nodeTypeLine"
        : "bindingComponents.dataBindingSection.nodeTypeEquipment"
  );

  useEffect(() => {
    reInitBindingRecord();
  }, [bindingRecord]);

  const reInitBindingRecord = () => {
    if (nodeType === "LINE") {
      bindingRecord.externalId = bindingRecord?.baseLine?.lineId || "";
      bindingRecord.externalName = bindingRecord?.baseLine?.lineName || "";
    } else {
      bindingRecord.externalId =
        bindingRecord?.baseEquipment?.equipmentId || "";
      bindingRecord.externalName =
        bindingRecord?.baseEquipment?.equipmentName || "";
    }
    bindingRecord.lastSync = bindingRecord?.updatedAt?.substring(0, 10) || "";
  };

  if (!platformConnected) {
    return (
      <ConfigSection title={sectionTitle}>
        <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-[10px] text-amber-400 leading-relaxed">
          <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
          <span>
            {t("bindingComponents.dataBindingSection.platformNotConnected")}
          </span>
        </div>
      </ConfigSection>
    );
  }

  if (node?.bindStatus === "UNBOUND") {
    return (
      <ConfigSection title={sectionTitle}>
        <div className="text-[10px] text-slate-500 leading-relaxed mb-2">
          {t("bindingComponents.dataBindingSection.unboundMessage", { nodeLabel })}
        </div>
        <button
          onClick={onBind}
          className="flex items-center justify-center gap-1.5 w-full py-1.5 bg-blue-600/15 border border-blue-500/40 rounded text-[10px] text-blue-300 hover:bg-blue-600/25 hover:border-blue-400/60 transition-colors"
        >
          <LinkIcon size={11} />
          {t("bindingComponents.dataBindingSection.bindButton")}
        </button>
      </ConfigSection>
    );
  }

  const unbindBtn = showUnbindConfirm ? (
    <div className="bg-red-900/20 border border-red-700/40 rounded p-2">
      <div className="text-[10px] text-red-300 mb-2">
        {t("bindingComponents.dataBindingSection.unbindConfirm")}
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={() => {
            onUnbind();
            setShowUnbindConfirm(false);
          }}
          className="flex-1 py-1 bg-red-600/30 border border-red-500/50 rounded text-[10px] text-red-300 hover:bg-red-600/50 transition-colors"
        >
          {t("bindingComponents.dataBindingSection.confirmUnbind")}
        </button>
        <button
          onClick={() => setShowUnbindConfirm(false)}
          className="flex-1 py-1 bg-[#071526] border border-[#1e3a55] rounded text-[10px] text-slate-400 hover:bg-[#0e243a] transition-colors"
        >
          {t("bindingComponents.dataBindingSection.cancel")}
        </button>
      </div>
    </div>
  ) : (
    <button
      onClick={() => setShowUnbindConfirm(true)}
      className="flex items-center gap-1 text-[9px] text-slate-500 hover:text-red-400 transition-colors"
    >
      <Unlink size={9} /> {t("bindingComponents.dataBindingSection.unbind")}
    </button>
  );

  if (node?.bindStatus === "PARTIALLY_BOUND" || node?.bindStatus === "BOUND") {
    return (
      <ConfigSection title={sectionTitle}>
        <div className="space-y-2">
          <div className="flex items-center justify-between px-2 py-1.5 rounded border bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
            <div className="flex items-center gap-1.5">
              <LinkIcon size={10} />
              <span className="text-[10px] font-medium">{t("bindingComponents.dataBindingSection.bound")}</span>
            </div>
            <span className="text-[9px] opacity-70">
              {bindingRecord?.sourceSystem}
            </span>
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center justify-between py-1 border-b border-[#142235]/60">
              <span className="text-[10px] text-slate-500">{t("bindingComponents.dataBindingSection.externalId")}</span>
              <span className="text-[10px] text-slate-200 text-right max-w-[55%] truncate">
                {bindingRecord?.externalId}
              </span>
            </div>
            <div className="flex items-center justify-between py-1 border-b border-[#142235]/60">
              <span className="text-[10px] text-slate-500">{t("bindingComponents.dataBindingSection.sourceName")}</span>
              <span className="text-[10px] text-slate-200 text-right max-w-[55%] truncate">
                {bindingRecord?.externalName}
              </span>
            </div>
            {bindingRecord?.lastSync && (
              <div className="flex items-center justify-between py-1 border-b border-[#142235]/60">
                <span className="text-[10px] text-slate-500">{t("bindingComponents.dataBindingSection.lastSync")}</span>
                <span className="text-[10px] text-slate-200 text-right max-w-[55%] truncate">
                  {bindingRecord?.lastSync}
                </span>
              </div>
            )}
          </div>
          {bindingRecord?.missingFields &&
            bindingRecord?.missingFields.length > 0 && (
              <div className="bg-amber-900/15 border border-amber-700/30 rounded p-2">
                <div className="text-[9px] text-amber-400/80 mb-1">
                  {t("bindingComponents.dataBindingSection.missingFieldsHint")}
                </div>
                <div className="flex flex-wrap gap-1">
                  {bindingRecord?.missingFields.map((f) => (
                    <span
                      key={f}
                      className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-amber-300"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            )}
          {unbindBtn}
        </div>
      </ConfigSection>
    );
  }

  if (node?.bindStatus === "BIND_FAILED") {
    return (
      <ConfigSection title={sectionTitle}>
        <div className="space-y-2">
          <div className="flex items-center justify-between px-2 py-1.5 rounded border bg-red-500/10 border-red-500/30 text-red-400">
            <div className="flex items-center gap-1.5">
              <AlertCircle size={10} />
              <span className="text-[10px] font-medium">{t("bindingComponents.dataBindingSection.bindingError")}</span>
            </div>
            <span className="text-[9px] opacity-70">
              {bindingRecord?.sourceSystem}
            </span>
          </div>
          {bindingRecord?.errorMessage && (
            <div className="flex items-start gap-1.5 bg-red-900/15 border border-red-700/30 rounded p-2">
              <AlertCircle
                size={10}
                className="text-red-400 flex-shrink-0 mt-0.5"
              />
              <p className="text-[10px] text-red-300/90 leading-relaxed">
                {bindingRecord?.errorMessage}
              </p>
            </div>
          )}
          <div className="flex justify-between py-0.5">
            <span className="text-[10px] text-slate-500">{t("bindingComponents.dataBindingSection.sourceName")}</span>
            <span className="text-[10px] text-slate-400">
              {bindingRecord?.externalName}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="text-[10px] text-slate-500">{t("bindingComponents.dataBindingSection.lastSync")}</span>
            <span className="text-[10px] text-slate-500 italic">
              {bindingRecord?.lastSync}
            </span>
          </div>
          <button
            onClick={onBind}
            className="flex items-center justify-center gap-1.5 w-full py-1.5 bg-blue-600/15 border border-blue-500/40 rounded text-[10px] text-blue-300 hover:bg-blue-600/25 transition-colors"
          >
            <RefreshCw size={10} />
            {t("bindingComponents.dataBindingSection.resync")}
          </button>
          {unbindBtn}
        </div>
      </ConfigSection>
    );
  }

  return (
    <ConfigSection title={sectionTitle}>
      <div className="space-y-2">
        <div className="flex items-center justify-between px-2 py-1.5 rounded border bg-emerald-500/10 border-emerald-500/30 text-emerald-400">
          <div className="flex items-center gap-1.5">
            <LinkIcon size={10} />
            <span className="text-[10px] font-medium">{t("bindingComponents.dataBindingSection.bound")}</span>
          </div>
          <span className="text-[9px] opacity-70">
            {bindingRecord?.sourceSystem}
          </span>
        </div>
        <div className="space-y-0.5">
          <div className="flex items-center justify-between py-1 border-b border-[#142235]/60">
            <span className="text-[10px] text-slate-500">{t("bindingComponents.dataBindingSection.externalId")}</span>
            <span className="text-[10px] text-slate-200 text-right max-w-[55%] truncate">
              {bindingRecord?.externalId}
            </span>
          </div>
          <div className="flex items-center justify-between py-1 border-b border-[#142235]/60">
            <span className="text-[10px] text-slate-500">{t("bindingComponents.dataBindingSection.lastSync")}</span>
            <span className="text-[10px] text-slate-200 text-right max-w-[55%] truncate">
              {bindingRecord?.lastSync}
            </span>
          </div>
        </div>
        {unbindBtn}
      </div>
    </ConfigSection>
  );
}

// ── BindPickerModal ────────────────────────────────────────────────────────

export function BindPickerModal({
  parentLineId,
  nodeType,
  onSelect,
  onClose,
}: {
  parentLineId: string;
  nodeType: "LINE" | "EQUIPMENT";
  onSelect: (record: PlatformRecord) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [recordsByNodeType, setRecordsByNodeType] = useState<PlatformRecord[]>(
    [],
  );
  useLocalized();

  // const records = recordsByNodeType.filter(
  //   (r) =>
  //     r.entityType === nodeType &&
  //     (search === "" ||
  //       r.name.toLowerCase().includes(search.toLowerCase()) ||
  //       r.code.toLowerCase().includes(search.toLowerCase())),
  // );
  const entityLabel = t(
    nodeType === "LINE"
      ? "bindingComponents.bindPickerModal.labelLine"
      : "bindingComponents.bindPickerModal.labelEquipment"
  );

  // 防抖定时器
  const debounceTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // 使用useRef确保只调用一次
  const hasCalledRef = React.useRef(false);

  const getRecordsByNodeType = async (keyword?: string) => {
    const searchKeyword = keyword !== undefined ? keyword : search;
    let res = null;

    if (nodeType === "LINE") {
      const params = {
        current: 1,
        pageSize: 20,
        keyword: searchKeyword,
        sortField: "descend",
        status: "ACTIVE",
      };
      res = await getLineAssetListApi(params);
    } else if (nodeType === "EQUIPMENT") {
      const params = {
        parentId: parentLineId,
        keyword: searchKeyword,
      };
      res = await getEquipmentAssetListByLineApi(params);
    }
    if (res.code === 200) {
      let data: any[] = [];
      if (nodeType === "LINE") {
        // Page<BaseProductionLineVo> → .items
        data = res.data?.items || [];
      } else {
        // List<BaseEquipmentVo> → 直接是数组
        data = Array.isArray(res.data) ? res.data : [];
      }

      data.forEach((item: any) => {
        if (nodeType === "LINE") {
          item.id = item.lineId;
          item.name = item.lineName;
          item.code = item.lineCode;
        } else if (nodeType === "EQUIPMENT") {
          item.id = item.equipmentId;
          item.name = item.equipmentName;
          item.code = item.equipmentCode;
        }
      });
      setRecordsByNodeType(data);
    }
  };

  useEffect(() => {
    if (!hasCalledRef.current) {
      getRecordsByNodeType();
      hasCalledRef.current = true;
    }
  }, []);

  const onFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchValue = e.target?.value?.trim() || "";
    setSearch(searchValue);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    // 直接传 searchValue 避免闭包捕获旧 state
    debounceTimerRef.current = setTimeout(() => {
      getRecordsByNodeType(searchValue);
    }, 500);
  };

  useEffect(() => {
    // 禁止背景滚动
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-[#07111e] border border-[#1e3a55] rounded-xl shadow-2xl w-96 max-h-[70vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#142235]">
          <div>
            <div className="text-[12px] font-semibold text-slate-200">
              {t("bindingComponents.bindPickerModal.title")}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {t("bindingComponents.bindPickerModal.subtitle", { entityLabel })}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-[#142235] rounded transition-colors"
          >
            <X size={12} />
          </button>
        </div>

        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center gap-2 bg-[#040d18] border border-[#1e3a55] rounded px-2.5 py-1.5">
            <Search size={11} className="text-slate-500 flex-shrink-0" />
            <input
              value={search}
              onChange={onFilterChange}
              placeholder={t("bindingComponents.bindPickerModal.searchPlaceholder", { entityLabel })}
              className="flex-1 bg-transparent text-[11px] text-slate-300 placeholder-slate-600 outline-none"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 px-4 pb-4 space-y-2 tree-content">
          {recordsByNodeType.map((rec) => (
            <button
              key={rec.id}
              onClick={() => onSelect(rec)}
              className="w-full text-left bg-[#040d18] border border-[#1e3a55] rounded-lg p-3 hover:border-blue-500/50 hover:bg-blue-500/5 transition-colors group"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-medium text-slate-200 group-hover:text-blue-300 transition-colors">
                  {rec?.name || ""}
                </span>
                <span className="text-[9px] font-mono text-blue-400/70 bg-blue-500/10 px-1.5 py-0.5 rounded">
                  {rec?.code || ""}
                </span>
              </div>
              {rec?.id && (
                <div className="text-[9px] text-slate-500 mb-1">
                  {rec?.id || ""}
                </div>
              )}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                {/* {Object.entries(rec?.fields)
                  .slice(0, 3)
                  .map(([k, v]) => (
                    <span key={k} className="text-[9px] text-slate-600">
                      {v.label}：
                      <span className="text-slate-400">{v.value}</span>
                    </span>
                  ))} */}
              </div>
            </button>
          ))}
          {recordsByNodeType.length === 0 && (
            <div className="text-center py-8 text-slate-600 text-[11px]">
              {t("bindingComponents.bindPickerModal.noMatch", { entityLabel })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── ConflictDiffModal ──────────────────────────────────────────────────────

export function ConflictDiffModal({
  conflictState,
  onConfirm,
  onCancel,
}: {
  conflictState: ConflictModalState;
  onConfirm: (record: PlatformRecord) => void;
  onCancel: () => void;
}) {
  useLocalized();

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#07111e] border border-[#1e3a55] rounded-xl shadow-2xl w-[420px] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[#142235] flex items-start gap-2.5">
          <AlertCircle
            size={15}
            className="text-amber-400 flex-shrink-0 mt-0.5"
          />
          <div>
            <div className="text-[12px] font-semibold text-slate-200">
              {t("bindingComponents.conflictDiffModal.title")}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {t("bindingComponents.conflictDiffModal.subtitle")}
            </div>
          </div>
        </div>

        <div className="px-4 py-3 max-h-60 overflow-y-auto">
          <div className="grid grid-cols-3 gap-2 text-[9px] text-slate-500 pb-1.5 border-b border-[#142235] mb-1">
            <span>{t("bindingComponents.conflictDiffModal.fieldHeader")}</span>
            <span>{t("bindingComponents.conflictDiffModal.currentValueHeader")}</span>
            <span>{t("bindingComponents.conflictDiffModal.platformValueHeader")}</span>
          </div>
          {conflictState.conflicts.map((c) => (
            <div
              key={c.field}
              className="grid grid-cols-3 gap-2 text-[10px] py-1.5 border-b border-[#142235]/40"
            >
              <span className="text-slate-400">{c.label}</span>
              <span className="text-slate-500 line-through">
                {c.localValue}
              </span>
              <span className="text-amber-300 font-medium">
                {c.platformValue}
              </span>
            </div>
          ))}
        </div>

        <div className="px-4 py-3 border-t border-[#142235] flex gap-2">
          <button
            onClick={() => onConfirm(conflictState.platformRecord)}
            className="flex-1 py-1.5 bg-blue-600/25 border border-blue-500/50 rounded text-[11px] text-blue-300 hover:bg-blue-600/40 transition-colors"
          >
            {t("bindingComponents.conflictDiffModal.confirmButton")}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 py-1.5 bg-[#071526] border border-[#1e3a55] rounded text-[11px] text-slate-400 hover:bg-[#0e243a] transition-colors"
          >
            {t("bindingComponents.conflictDiffModal.cancel")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── LineMismatchModal ──────────────────────────────────────────────────────

export function LineMismatchModal({
  recordLineName,
  currentLineName,
  onClose,
}: {
  recordLineName: string;
  currentLineName: string;
  onClose: () => void;
}) {
  useLocalized();

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#07111e] border border-[#1e3a55] rounded-xl shadow-2xl w-[400px] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[#142235] flex items-start gap-2.5">
          <AlertCircle
            size={15}
            className="text-amber-400 flex-shrink-0 mt-0.5"
          />
          <div>
            <div className="text-[12px] font-semibold text-slate-200">
              {t("bindingComponents.lineMismatchModal.title")}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {t("bindingComponents.lineMismatchModal.subtitle")}
            </div>
          </div>
        </div>
        <div className="px-4 py-4 space-y-3">
          <p className="text-[11px] text-slate-300 leading-relaxed">
            {t("bindingComponents.lineMismatchModal.messagePart1")}
            <span className="mx-1 px-1.5 py-0.5 bg-amber-500/15 border border-amber-500/30 rounded text-amber-300 font-medium">
              {recordLineName}
            </span>
            {t("bindingComponents.lineMismatchModal.messagePart2")}
            <span className="mx-1 px-1.5 py-0.5 bg-blue-500/15 border border-blue-500/30 rounded text-blue-300 font-medium">
              {currentLineName}
            </span>
            {t("bindingComponents.lineMismatchModal.messagePart3")}
          </p>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            {t("bindingComponents.lineMismatchModal.suggestionPart1")}
            <span className="text-slate-300 mx-0.5">{currentLineName}</span>
            {t("bindingComponents.lineMismatchModal.suggestionPart2")}
          </p>
        </div>
        <div className="px-4 py-3 border-t border-[#142235] flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-600/25 border border-blue-500/50 rounded text-[11px] text-blue-300 hover:bg-blue-600/40 transition-colors"
          >
            {t("bindingComponents.lineMismatchModal.gotIt")}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
