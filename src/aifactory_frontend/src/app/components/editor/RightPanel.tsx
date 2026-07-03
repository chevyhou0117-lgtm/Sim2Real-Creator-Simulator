import React, { useState, useRef, useEffect } from "react";
import {
  Cog,
  Check,
  X,
  Edit2,
  FileText,
  Zap,
  Activity,
  BarChart3,
  Wifi,
  AlertCircle,
  MousePointer2,
  Trash2,
} from "lucide-react";
import type {
  FactoryNode,
  ProjectType,
  ProjectStatus,
} from "../../../types/factoryEditor";
// import type { CategoryNode, ProjectStatus } from "../../../types/category";
import {
  findNode,
  findParentLine,
  detectConflicts,
  INITIAL_BINDING_MAP,
  type RightTab,
  type BindingType,
  type BindingRecord,
  type PlatformRecord,
  type ConflictModalState,
} from "../../../types/factoryEditor";
import {
  FactoryConfigPanel,
  ProcessConfigPanel,
  LineConfigPanel,
  LedgerPanel,
  IoTPanel,
  EventsPanel,
  MonitoringPanel,
  MetricsPanel,
} from "./ConfigPanels";
import {
  BindPickerModal,
  ConflictDiffModal,
  LineMismatchModal,
} from "./BindingComponents";
import "./editor.css";
import {
  bindAssetApi,
  unbindAssetApi,
  getFactoryProjectDetailByNodeIdApi,
} from "../../api";
import { toast } from "sonner";
import { t, useLocalized } from "../../utils/i18n";

export function RightPanel({
  selectedNode,
  rightTab,
  onTabChange,
  projectStatus,
  projectId,
  factoryTree,
  onTreeNodeStatusChange,
  onNodeUpdate,
  onDeleteNode,
}: {
  selectedNode: FactoryNode | null;
  rightTab: RightTab;
  onTabChange: (tab: RightTab) => void;
  projectStatus: ProjectStatus;
  projectId?: string;
  factoryTree: any;
  CategoryNode: (nodeId: string, newStatus: FactoryNode["status"]) => void;
  onNodeUpdate?: (nodeId: string, updates: Partial<FactoryNode>) => void;
  onDeleteNode?: (nodeId: string) => void;
}) {
  useLocalized();

  const isFactory = selectedNode?.type === "FACTORY";
  const isProcess = selectedNode?.type === "STAGE";
  const isLine = selectedNode?.type === "LINE";
  const isEquipment = selectedNode?.type === "EQUIPMENT";

  // selectedNodeDetail 存储选中节点的详细信息
  const [selectedNodeDetail, setSelectedNodeDetail] = useState({});

  if (selectedNode) {
    console.log("selectedNode", selectedNode);
  }

  // Edit state — reset whenever selected node changes
  const [isEditing, setIsEditing] = useState(false);
  const prevNodeId = useRef<string | null>(null);
  if (selectedNode?.id !== prevNodeId.current) {
    prevNodeId.current = selectedNode?.id ?? null;
    if (isEditing) setIsEditing(false);
  }

  function startEdit() {
    setIsEditing(true);
  }
  function saveEdit() {
    setIsEditing(false);
  }
  function cancelEdit() {
    setIsEditing(false);
  }

  // ── Binding state ──────────────────────────────────────────────────────────
  // Keys use compound format: `${nodeId}_${BindingType}`, e.g. 'smt01-line_BASIC_DATA'
  const [bindingMap, setBindingMap] = useState<Record<string, BindingRecord>>(
    {},
  );
  const [bindModalNode, setBindModalNode] = useState<{
    parentLineId: string;
    id: string;
    bindingType: BindingType;
    nodeType: ProjectType;
  } | null>(null);

  // Sync initial binding map → tree node status dots on first render
  const BINDING_TYPES_LIST: BindingType[] = [
    "BASIC_DATA",
    "LEDGER",
    "IOT",
    "EVENTS",
    "MONITOR",
    "METRICS",
  ];
  useEffect(() => {
    const synced: Record<string, any> = {};
    // Object.entries(INITIAL_BINDING_MAP).forEach(([key, record]) => {
    //   for (const type of BINDING_TYPES_LIST) {
    //     if (key.endsWith(`_${type}`)) {
    //       const nodeId = key.slice(0, -(type.length + 1));
    //       const existing = synced[nodeId];
    //       if (record.bindStatus === "BOUND") {
    //         synced[nodeId] = "BOUND";
    //       } else if (record.bindStatus === "BIND_FAILED") {
    //         synced[nodeId] = "BIND_FAILED";
    //       } else if (record.bindStatus === "PARTIALLY_BOUND") {
    //         synced[nodeId] = "PARTIALLY_BOUND";
    //       } else {
    //         synced[nodeId] = "UNBOUND";
    //       }
    //       break;
    //     }
    //   }
    // });
    // Object.entries(synced).forEach(([nodeId, status]) => {
    //   onTreeNodeStatusChange(nodeId, status);
    // });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [conflictModal, setConflictModal] = useState<ConflictModalState | null>(
    null,
  );
  const [lineMismatchModal, setLineMismatchModal] = useState<{
    recordLineName: string;
    currentLineName: string;
  } | null>(null);

  const platformConnected = true;

  function bindKey(nodeId: string, type: BindingType) {
    return `${nodeId}_${type}`;
  }

  function handleStartBind(
    parentLineId: string,
    nodeId: string,
    bindingType: BindingType,
    nodeType: "FACTORY" | "STAGE" | "LINE" | "EQUIPMENT",
  ) {
    setBindModalNode({ parentLineId, id: nodeId, bindingType, nodeType });
  }

  function applyBind(
    nodeId: string,
    bindingType: BindingType,
    record: PlatformRecord,
  ) {
    // const now = new Date()
    //   .toLocaleString("zh-CN", { hour12: false })
    //   .replace(/\//g, "-");
    // setBindingMap((m) => ({
    //   ...m,
    //   [bindKey(nodeId, bindingType)]: {
    //     externalId: record.id,
    //     externalName: record.name,
    //     sourceSystem: "ERP",
    //     lastSync: now,
    //     status: "BOUND",
    //   },
    // }));
    // onTreeNodeStatusChange(nodeId, "BOUND");

    console.log("applyBind", nodeId, record.id);
    bindLineOrEquipmentAssetNode(nodeId, record.id);
  }

  function handlePickRecord(record: PlatformRecord) {
    if (!bindModalNode) return;
    console.log("bindModalNode", bindModalNode.id, record.id);
    bindLineOrEquipmentAssetNode(bindModalNode.id, record.id);
    // 缺少逻辑：检查记录是否已绑定  以后再考虑是否需要

    // Situation C: equipment record belongs to a different line than the current node
    // if (bindModalNode.nodeType === "equipment" && record.parentLineId) {
    //   const actualParentLineId = findParentLine(factoryTree, bindModalNode.id);
    //   if (actualParentLineId && record.parentLineId !== actualParentLineId) {
    //     const recordLine = findNode(factoryTree, record.parentLineId);
    //     const currentLine = findNode(factoryTree, actualParentLineId);
    //     setLineMismatchModal({
    //       recordLineName: recordLine?.name ?? record.parentLineId,
    //       currentLineName: currentLine?.name ?? actualParentLineId,
    //     });
    //     setBindModalNode(null);
    //     return;
    //   }
    // }
    // const conflicts = detectConflicts(record);
    // if (conflicts.length > 0) {
    //   setConflictModal({
    //     nodeId: bindModalNode.id,
    //     platformRecord: record,
    //     conflicts,
    //   });
    //   setBindModalNode(null);
    // } else {
    //   applyBind(bindModalNode.id, bindModalNode.bindingType, record);
    //   setBindModalNode(null);
    // }
  }

  function handleConfirmBind(
    record: PlatformRecord,
    nodeId: string,
    bindingType: BindingType,
  ) {
    applyBind(nodeId, bindingType, record);
    setConflictModal(null);
  }

  function handleUnbind(nodeId: string, bindingType: BindingType) {
    unbindLineOrEquipmentAssetNode(nodeId, bindingType);
    // setBindingMap((m) => {
    //   const n = { ...m };
    //   delete n[bindKey(nodeId, bindingType)];
    //   return n;
    // });
    // onTreeNodeStatusChange(nodeId, "empty");
  }

  // ── Helpers to get binding record & locked state ───────────────────────────
  function getBinding(nodeId: string, type: BindingType) {
    return bindingMap[bindKey(nodeId, type)];
  }

  function isPrerequisiteBound(nodeId: string, nodeType: ProjectType) {
    if (nodeType === "EQUIPMENT")
      return getBinding(nodeId, "LEDGER")?.bindStatus === "BOUND";
    return getBinding(nodeId, "BASIC_DATA")?.bindStatus === "BOUND";
  }

  // ── Tab status dot helper ─────────────────────────────────────────────────
  function tabDot(nodeId: string, type: BindingType) {
    const rec = getBinding(nodeId, type);
    if (!rec) return null;
    if (rec.bindStatus === "BOUND")
      return (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
      );
    if (rec.bindStatus === "PARTIALLY_BOUND")
      return (
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
      );
    if (rec.bindStatus === "BIND_FAILED")
      return (
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
      );
    return null;
  }

  const panelTitle = isFactory
    ? t("editor.rightPanel.factoryConfig")
    : isProcess
      ? t("editor.rightPanel.processConfig")
      : isLine
        ? t("editor.rightPanel.lineConfig")
        : rightTab === "base"
          ? t("editor.rightPanel.ledgerInfo")
          : rightTab === "iot"
            ? t("editor.rightPanel.iotInfo")
            : rightTab === "events"
              ? t("editor.rightPanel.eventConfig")
              : rightTab === "monitoring"
                ? t("editor.rightPanel.monitoringConfig")
                : t("editor.rightPanel.metricsConfig");

  // ── 数据接口处理  ─────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedNode) return;
    getFactoryProjectDetail(selectedNode.id);
  }, [selectedNode]);

  const getFactoryProjectDetail = async (nodeId: string) => {
    const res = await getFactoryProjectDetailByNodeIdApi(nodeId);
    if (res.code === 200) {
      setSelectedNodeDetail(res.data || {});
    } else {
      // toast.error(res.message);
    }
  };

  // 绑定资产
  const bindLineOrEquipmentAssetNode = async (
    factoryAssetId: any,
    refId: any,
  ) => {
    const params = {
      factoryAssetId: factoryAssetId,
      refId: refId,
    };
    const res = await bindAssetApi(params);
    if (res.code === 200) {
      const resData = res.data || {};

      const bindStatus = resData.bind_status || "BOUND";
      if (bindStatus === "BIND_FAILED") {
        toast.error(resData?.message || t("editor.rightPanel.bindFailed"));
      }
      // 更新selectedNode 的绑定状态
      onTreeNodeStatusChange(factoryAssetId, bindStatus);
      setBindModalNode(null);
    } else {
      setBindModalNode(null);
      toast.error(res?.message);
    }
  };

  // 解绑资产
  const unbindLineOrEquipmentAssetNode = async (
    factoryAssetId: any,
    bindingType: any,
  ) => {
    const params = {
      factoryAssetId: factoryAssetId,
    };
    const res = await unbindAssetApi(params);
    if (res.code === 200) {
      // 更新selectedNode 的绑定状态
      onTreeNodeStatusChange(factoryAssetId, "UNBOUND");
      setBindModalNode(null);
    } else {
      setBindModalNode(null);
      toast.error(res?.message);
    }
  };

  // ── 数据接口处理  end ──────────────────────────────────────────────

  return (
    <>
      <div className="w-72 bg-[var(--c-071526)] border-l border-[var(--c-142235)] flex flex-col overflow-hidden flex-shrink-0">
        {/* Panel Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--c-142235)] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Cog size={12} className="text-blue-400" />
            <span className="text-[11px] font-semibold text-slate-200">
              {panelTitle}
            </span>
          </div>
          {selectedNode && (
            <div className="flex items-center gap-0.5">
              {/* 删除按钮：仅 LINE / EQUIPMENT 类型节点可删除 */}
              {(isLine || isEquipment) && onDeleteNode && (
                <button
                  onClick={() => {
                    if (window.confirm(t("editor.rightPanel.confirmDelete", { name: selectedNode.name }))) {
                      onDeleteNode(selectedNode.id);
                    }
                  }}
                  title={t("common.delete")}
                  className="w-6 h-6 flex items-center justify-center rounded text-red-400 hover:text-red-300 hover:bg-red-500/15 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              )}
              {isEditing ? (
                <>
                  <button
                    onClick={saveEdit}
                    title={t("editor.rightPanel.save")}
                    className="w-6 h-6 flex items-center justify-center rounded text-green-400 hover:bg-green-500/15 transition-colors"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={cancelEdit}
                    title={t("editor.rightPanel.cancel")}
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:bg-[var(--c-142235)] transition-colors"
                  >
                    <X size={12} />
                  </button>
                </>
              ) : (
                <button
                  onClick={startEdit}
                  title={t("editor.rightPanel.edit")}
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-300 hover:bg-[var(--c-142235)] transition-colors"
                >
                  <Edit2 size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Factory / Line tabs — Binding (required) + Metrics (optional config) */}
        {(isLine || isFactory) && selectedNode && (
          <div className="flex border-b border-[var(--c-142235)] flex-shrink-0 overflow-x-auto">
            {[
              {
                id: "base" as RightTab,
                icon: <FileText size={9} />,
                label: t("editor.rightPanel.binding"),
                bindType: "BASIC_DATA" as BindingType,
                optional: false,
              },
              {
                id: "events" as RightTab,
                icon: <Zap size={9} />,
                label: t("editor.rightPanel.events"),
                bindType: "EVENTS" as BindingType,
                optional: true,
              },
              {
                id: "monitoring" as RightTab,
                icon: <Activity size={9} />,
                label: t("editor.rightPanel.monitor"),
                bindType: "MONITOR" as BindingType,
                optional: true,
              },
              {
                id: "metrics" as RightTab,
                icon: <BarChart3 size={9} />,
                label: t("editor.rightPanel.metrics"),
                bindType: "METRICS" as BindingType,
                optional: true,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[9px] transition-colors border-b-2 ${
                  rightTab === tab.id
                    ? "border-blue-500 text-blue-400 bg-blue-500/10"
                    : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-[var(--c-0f2035)]"
                }`}
              >
                <div className="relative flex items-center justify-center">
                  {tab.icon}
                  <span className="absolute -top-0.5 -right-1.5">
                    {tabDot(selectedNode.id, tab.bindType)}
                  </span>
                </div>
                <span>{tab.label}</span>
                {tab.optional && (
                  <span className="text-[8px] text-slate-600 -mt-0.5">{t("editor.rightPanel.opt")}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Equipment tabs — Ledger/IoT are bindings; Events/Monitor/Metrics are optional configs */}
        {isEquipment && selectedNode && (
          <div className="flex border-b border-[var(--c-142235)] flex-shrink-0 overflow-x-auto">
            {[
              {
                id: "base" as RightTab,
                icon: <FileText size={9} />,
                label: t("editor.rightPanel.ledger"),
                bindType: "LEDGER" as BindingType,
                optional: false,
              },
              {
                id: "iot" as RightTab,
                icon: <Wifi size={9} />,
                label: t("editor.rightPanel.iot"),
                bindType: "IOT" as BindingType,
                optional: false,
              },
              {
                id: "events" as RightTab,
                icon: <Zap size={9} />,
                label: t("editor.rightPanel.events"),
                bindType: "EVENTS" as BindingType,
                optional: true,
              },
              {
                id: "monitoring" as RightTab,
                icon: <Activity size={9} />,
                label: t("editor.rightPanel.monitor"),
                bindType: "MONITOR" as BindingType,
                optional: true,
              },
              {
                id: "metrics" as RightTab,
                icon: <BarChart3 size={9} />,
                label: t("editor.rightPanel.metrics"),
                bindType: "METRICS" as BindingType,
                optional: true,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[9px] transition-colors border-b-2 ${
                  rightTab === tab.id
                    ? "border-blue-500 text-blue-400 bg-blue-500/10"
                    : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-[var(--c-0f2035)]"
                }`}
              >
                <div className="relative flex items-center justify-center">
                  {tab.icon}
                  <span className="absolute -top-0.5 -right-1.5">
                    {tabDot(selectedNode.id, tab.bindType)}
                  </span>
                </div>
                <span>{tab.label}</span>
                {tab.optional && (
                  <span className="text-[8px] text-slate-600 -mt-0.5">{t("editor.rightPanel.opt")}</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Panel Content */}
        <div className="flex-1 tree-content">
          {selectedNode?.bindStatus === "BIND_FAILED" && (
            <div className="m-3 p-2.5 bg-red-900/20 border border-red-700/40 rounded-sm">
              <div className="flex items-start gap-1.5">
                <AlertCircle
                  size={12}
                  className="text-red-400 flex-shrink-0 mt-0.5"
                />
                <div className="flex-1">
                  <div className="mb-1">
                    <div className="text-[10px] font-medium text-red-300">
                      {t("editor.rightPanel.configError")}
                    </div>
                  </div>
                  <div className="text-[9px] text-red-400/80">
                    {selectedNode.errorMessage ||
                      t("editor.rightPanel.configErrorDesc")}
                  </div>
                </div>
              </div>
            </div>
          )}

          {!selectedNode ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 p-6 text-center">
              <MousePointer2 size={28} strokeWidth={1} />
              <p className="text-[11px] mt-3">
                {t("editor.rightPanel.emptyHint")}
              </p>
            </div>
          ) : isFactory ? (
            rightTab === "metrics" ? (
              <MetricsPanel
                editing={isEditing}
                locked={!isPrerequisiteBound(selectedNode.id, "FACTORY")}
              />
            ) : (
              <FactoryConfigPanel
                editing={isEditing}
                node={selectedNode}
                nodeDetail={selectedNodeDetail}
                nodeId={selectedNode.id}
                platformConnected={platformConnected}
                // basicDataBinding={getBinding(selectedNode.id, "BASIC_DATA")}
                // onBindBasicData={() =>
                //   handleStartBind(selectedNode.id, "BASIC_DATA", "factory")
                // }
                // onUnbindBasicData={() =>
                //   handleUnbind(selectedNode.id, "BASIC_DATA")
                // }
              />
            )
          ) : isProcess ? (
            <ProcessConfigPanel node={selectedNode} editing={isEditing} />
          ) : isLine ? (
            rightTab === "events" ? (
              <EventsPanel
                editing={isEditing}
                locked={!isPrerequisiteBound(selectedNode.id, "LINE")}
              />
            ) : rightTab === "monitoring" ? (
              <MonitoringPanel
                editing={isEditing}
                locked={!isPrerequisiteBound(selectedNode.id, "LINE")}
              />
            ) : rightTab === "metrics" ? (
              <MetricsPanel
                editing={isEditing}
                locked={!isPrerequisiteBound(selectedNode.id, "LINE")}
              />
            ) : (
              <LineConfigPanel
                node={selectedNode}
                nodeDetail={selectedNodeDetail}
                editing={isEditing}
                platformConnected={platformConnected}
                bindingRecord={selectedNodeDetail}
                onBind={() =>
                  handleStartBind(
                    selectedNode.parentId,
                    selectedNode.id,
                    "BASIC_DATA",
                    "LINE",
                  )
                }
                onUnbind={() => handleUnbind(selectedNode.id, "BASIC_DATA")}
              />
            )
          ) : (
            <>
              {rightTab === "base" && (
                <LedgerPanel
                  node={selectedNode}
                  nodeDetail={selectedNodeDetail}
                  editing={isEditing}
                  platformConnected={platformConnected}
                  bindingRecord={selectedNodeDetail}
                  onBind={() =>
                    handleStartBind(
                      selectedNode.parentId,
                      selectedNode.id,
                      "LEDGER",
                      "EQUIPMENT",
                    )
                  }
                  onUnbind={() => handleUnbind(selectedNode.id, "LEDGER")}
                />
              )}
              {rightTab === "iot" && (
                // <IoTPanel
                //   node={selectedNode}
                //   editing={isEditing}
                //   bindingRecord={getBinding(selectedNode.id, "IOT")}
                //   locked={!isPrerequisiteBound(selectedNode.id, "equipment")}
                // />
                <div />
              )}
              {rightTab === "events" && (
                // <EventsPanel
                //   editing={isEditing}
                //   locked={!isPrerequisiteBound(selectedNode.id, "equipment")}
                // />
                <div />
              )}
              {rightTab === "monitoring" && (
                // <MonitoringPanel
                //   editing={isEditing}
                //   locked={!isPrerequisiteBound(selectedNode.id, "equipment")}
                // />
                <div />
              )}
              {rightTab === "metrics" && (
                // <MetricsPanel
                //   editing={isEditing}
                //   locked={!isPrerequisiteBound(selectedNode.id, "equipment")}
                // />
                <div />
              )}
            </>
          )}
        </div>
      </div>
      {bindModalNode && (
        <BindPickerModal
          parentLineId={bindModalNode.parentLineId}
          nodeType={bindModalNode.nodeType}
          onSelect={handlePickRecord}
          onClose={() => setBindModalNode(null)}
        />
      )}
      {conflictModal && (
        <ConflictDiffModal
          conflictState={conflictModal}
          onConfirm={(rec) =>
            handleConfirmBind(
              rec,
              conflictModal.nodeId,
              bindModalNode?.bindingType ?? "LEDGER",
            )
          }
          onCancel={() => setConflictModal(null)}
        />
      )}
      {lineMismatchModal && (
        <LineMismatchModal
          recordLineName={lineMismatchModal.recordLineName}
          currentLineName={lineMismatchModal.currentLineName}
          onClose={() => setLineMismatchModal(null)}
        />
      )}
    </>
  );
}
