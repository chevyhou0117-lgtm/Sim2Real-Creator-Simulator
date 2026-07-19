import React, { useState, useRef } from "react";
import { createPortal } from "react-dom";
import {
  ChevronRight,
  ChevronDown,
  Building2,
  Layers3,
  GitBranch,
  Cog,
  Maximize2,
  Plus,
  Copy,
  Trash2,
  AlertCircle,
  MousePointer2,
} from "lucide-react";
import { type FactoryNode } from "../../../types/factoryEditor";
import { NODE_STATUS_TEXT } from "../../../types/factoryEditor";
import { highlightNodeApi, createStageNodeApi } from "../../api/index";
import { useLocalized } from "../../utils/i18n";

// ══════════════════════════════════════════════════════════════════════════════
// ErrorDot — red pulsing indicator with hover tooltip
// ══════════════════════════════════════════════════════════════════════════════
function ErrorDot({ message }: { message: string }) {
  const dotRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  function handleMouseEnter() {
    if (dotRef.current) {
      const r = dotRef.current.getBoundingClientRect();
      setPos({ x: r.right + 10, y: r.top });
    }
  }

  return (
    <>
      <span
        ref={dotRef}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setPos(null)}
        className="flex-shrink-0 w-2 h-2 rounded-full bg-red-400 animate-pulse cursor-help"
      />
      {pos &&
        createPortal(
          <div
            className="fixed z-[9999] w-60 bg-[var(--c-0c1c2e)] border border-red-600/50 rounded-lg shadow-2xl p-3 pointer-events-none"
            style={{ left: pos.x, top: pos.y - 4 }}
          >
            <div className="absolute -left-[5px] top-3 w-2.5 h-2.5 bg-[var(--c-0c1c2e)] border-l border-b border-red-600/50 rotate-45" />
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertCircle size={11} className="text-red-400 flex-shrink-0" />
              <span className="text-[10px] font-semibold text-red-300 uppercase tracking-wide">
                配置错误
              </span>
            </div>
            <p className="text-[10px] text-slate-300 leading-relaxed">
              {message}
            </p>
            <div className="mt-2 pt-2 border-t border-red-900/40 text-[9px] text-slate-500 flex items-center gap-1">
              <MousePointer2 size={9} className="text-slate-600" />
              点击节点在右侧面板修复
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tree Node Component
// ══════════════════════════════════════════════════════════════════════════════
export function TreeNode({
  node,
  depth,
  selectedId,
  expandedIds,
  onSelect,
  onToggle,
  onDrillIn,
  onDoubleClick,
  onAddStage,
  onRefresh,
  onDeleteNode,
}: {
  node: FactoryNode;
  depth: number;
  selectedId: string;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onDrillIn: (id: string) => void;
  onDoubleClick?: (id: string) => void;
  onAddStage?: (parentNode: FactoryNode, stageName: string) => Promise<void>;
  onRefresh?: () => void;
  onDeleteNode?: (nodeId: string) => void;
}) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [showAddStage, setShowAddStage] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [stageName, setStageName] = useState("");
  const [stageCode, setStageCode] = useState("");
  const [stageDescription, setStageDescription] = useState("");
  const [addingStage, setAddingStage] = useState(false);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = node.id === selectedId;
  // 只有线体和设备类型可以钻入
  const canDrillIn = node.type === "LINE" || node.type === "EQUIPMENT";
  const L = useLocalized();

  /** 双击节点：通知父级拉取详情 + 对 LINE/EQUIPMENT 高亮 OV Prim */
  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();

    // 通知父级：钻入视图 + 拉取节点详情 API
    onDoubleClick?.(node.id);

    // LINE / EQUIPMENT：高亮 OV 中的对应 Prim
    if (!canDrillIn) return;
    const primPath = (node as any).detail?.primPath as string | undefined;
    if (!primPath) return;
    highlightNodeApi({ primPath: [primPath] }).catch((err) => {
      console.error("[TreePanel] highlight failed:", err);
    });
  };

  /** 确认添加 Stage 节点 */
  const handleConfirmAddStage = async () => {
    const name = stageName.trim();
    if (!name) return;
    if (node.type !== "FACTORY" || !node.factoryProjectsId) {
      alert("只能在 Factory 节点下添加 Stage");
      resetAddStageDialog();
      return;
    }
    if (!node.versionId) {
      alert("无法创建制程：缺少项目版本信息，请刷新后重试");
      resetAddStageDialog();
      return;
    }
    setAddingStage(true);
    try {
      const payload: Parameters<typeof createStageNodeApi>[0] = {
        factoryProjectsId: node.factoryProjectsId,
        versionId: node.versionId,
        name,
        type: "STAGE",
        parentId: node.id,
      };
      const code = stageCode.trim();
      const description = stageDescription.trim();
      if (code) payload.code = code;
      if (description) payload.description = description;
      const res = await createStageNodeApi(payload);
      if (res.code === 200) {
        resetAddStageDialog();
        onRefresh?.();
      } else {
        alert(`创建失败: ${res.message || "未知错误"}`);
      }
    } catch (error: any) {
      console.error("[TreePanel] Create stage failed:", error);
      alert(`创建失败: ${error?.response?.data?.message || error?.message || "网络错误"}`);
    } finally {
      setAddingStage(false);
    }
  };

  const resetAddStageDialog = () => {
    setShowAddStage(false);
    setStageName("");
    setStageCode("");
    setStageDescription("");
  };

  // console.log("TreeNode", node);

  const icon = (() => {
    if (node.bindStatus === "BIND_FAILED") {
      switch (node.type) {
        // case "FACTORY":
        //   return <Building2 size={11} className="text-red-400 flex-shrink-0" />;
        // case "PROCESS":
        //   return <Layers3 size={11} className="text-red-400 flex-shrink-0" />;
        case "LINE":
          return <GitBranch size={10} className="text-red-400 flex-shrink-0" />;
        case "EQUIPMENT":
          return <Cog size={10} className="text-red-400 flex-shrink-0" />;
      }
    }
    switch (node.type) {
      case "FACTORY":
        return <Building2 size={11} className="text-blue-400 flex-shrink-0" />;
      case "PROCESS":
        return <Layers3 size={11} className="text-amber-400 flex-shrink-0" />;
      case "LINE":
        return (
          <GitBranch size={10} className="text-emerald-400 flex-shrink-0" />
        );
      case "EQUIPMENT":
        return <Cog size={10} className="text-purple-400 flex-shrink-0" />;
    }
  })();

  const statusDot =
    (node.type === "EQUIPMENT" || node.type === "LINE") && node.bindStatus ? (
      node.bindStatus === "BIND_FAILED" ? (
        <ErrorDot
          message={node.errorMessage || NODE_STATUS_TEXT["BIND_FAILED"]}
        />
      ) : (
        <span
          className={`flex-shrink-0 w-1.5 h-1.5 rounded-full ${
            node.bindStatus === "BOUND"
              ? "bg-emerald-400"
              : node.bindStatus === "PARTIALLY_BOUND"
                ? "bg-amber-400"
                : "bg-slate-600"
          }`}
          title={NODE_STATUS_TEXT[node.bindStatus]}
        />
      )
    ) : null;

  return (
    <div>
      <div
        onClick={() => {
          onSelect(node.id);
        }}
        onDoubleClick={handleDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (canDrillIn) setCtxMenu({ x: e.clientX, y: e.clientY });
        }}
        className={`flex items-center gap-1 px-2 py-1 cursor-pointer rounded-sm mx-1 group transition-colors text-[11px] 
          ${
            node.type !== "FACTORY" && node.bindStatus === "BIND_FAILED"
              ? isSelected
                ? "bg-blue-600/20 text-red-300"
                : "text-red-400 hover:text-red-300 hover:bg-[var(--c-0f2035)]"
              : isSelected
                ? "bg-blue-600/20 text-blue-300"
                : "text-slate-400 hover:text-slate-200 hover:bg-[var(--c-0f2035)]"
          }
        `}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }}
            className="flex-shrink-0 text-slate-500 hover:text-slate-300 p-0 bg-transparent border-none cursor-pointer focus:outline-none"
          >
            {isExpanded ? (
              <ChevronDown size={10} />
            ) : (
              <ChevronRight size={10} />
            )}
          </button>
        ) : (
          <span className="w-[10px]" />
        )}

        {icon}
        <span className="flex-1 truncate text-[11px]">
          {(node.type === "LINE" || node.type === "EQUIPMENT") && node?.code
            ? `${L(node, 'name', 'nameEn')} - ${node.code}`
            : L(node, 'name', 'nameEn')}
        </span>
        {statusDot}

        {/* Add Stage — 始终显示在 FACTORY 根节点右侧 */}
        {node.type === "FACTORY" && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setStageName("");
              setStageCode("");
              setStageDescription("");
              setShowAddStage(true);
            }}
            className="text-slate-500 hover:text-blue-400 p-0.5 transition-colors flex-shrink-0"
            title="Add Stage"
          >
            <Plus size={10} />
          </button>
        )}

        <div className="hidden group-hover:flex items-center gap-0.5 ml-1 flex-shrink-0">
          {canDrillIn && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDrillIn(node.id);
                }}
                className="text-slate-600 hover:text-blue-400 p-0.5 transition-colors"
                title={
                  node.type === "LINE"
                    ? "Enter Line View"
                    : "Enter Equipment View"
                }
              >
                <Maximize2 size={9} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                }}
                className="text-slate-600 hover:text-blue-400 p-0.5 transition-colors"
                title="Duplicate"
              >
                <Copy size={9} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm(true);
                }}
                className="text-slate-600 hover:text-red-400 p-0.5 transition-colors"
                title="Delete"
              >
                <Trash2 size={9} />
              </button>
            </>
          )}
        </div>
      </div>

      {ctxMenu &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setCtxMenu(null)}
            />
            <div
              className="fixed z-50 bg-[var(--c-0d1f33)] border border-[var(--c-1e3a55)] rounded-lg shadow-xl py-1 text-[11px] min-w-[140px]"
              style={{ left: ctxMenu.x, top: ctxMenu.y }}
            >
              <button
                onClick={() => {
                  onDrillIn(node.id);
                  setCtxMenu(null);
                }}
                className="w-full text-left px-3 py-1.5 text-blue-300 hover:bg-[var(--c-142235)] flex items-center gap-2"
              >
                <Maximize2 size={10} />
                {node.type === "LINE"
                  ? "Enter Line View"
                  : "Enter Equipment View"}
              </button>
              <div className="my-1 border-t border-[var(--c-142235)]" />
              <button
                onClick={() => setCtxMenu(null)}
                className="w-full text-left px-3 py-1.5 text-slate-400 hover:bg-[var(--c-142235)] flex items-center gap-2"
              >
                <Copy size={10} /> 复制
              </button>
              <button
                onClick={() => {
                  setCtxMenu(null);
                  setShowDeleteConfirm(true);
                }}
                className="w-full text-left px-3 py-1.5 text-red-400 hover:bg-[var(--c-142235)] flex items-center gap-2"
              >
                <Trash2 size={10} /> 删除
              </button>
            </div>
          </>,
          document.body,
        )}

      {/* 删除确认弹窗 */}
      {showDeleteConfirm &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowDeleteConfirm(false)}
            />
            <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--c-0d1f33)] border border-[var(--c-1e3a55)] rounded-xl shadow-2xl p-5 w-80">
              <div className="flex items-center gap-2.5 mb-3">
                <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center flex-shrink-0">
                  <Trash2 size={14} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-slate-200">确认删除</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">此操作不可撤销</p>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                确定要删除节点 <span className="text-slate-200 font-medium">"{node.name}"</span> 及其所有子节点吗？
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="px-4 py-1.5 text-xs text-slate-400 hover:text-slate-200 border border-[var(--c-1e3a55)] rounded-md hover:border-[var(--c-2a4a6a)] transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    onDeleteNode?.(node.id);
                  }}
                  className="px-4 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-md font-medium transition-colors flex items-center gap-1.5"
                >
                  <Trash2 size={10} /> 确认删除
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}

      {/* Add Stage 弹窗 */}
      {showAddStage &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-50 bg-black/50"
              onClick={resetAddStageDialog}
            />
            <div className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--c-0d1f33)] border border-[var(--c-1e3a55)] rounded-lg shadow-2xl p-4 w-80">
              <h3 className="text-sm font-medium text-slate-200 mb-3">
                Add Stage
              </h3>
              <input
                type="text"
                value={stageName}
                onChange={(e) => setStageName(e.target.value)}
                placeholder="Stage name *"
                className="w-full bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-md px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/60 mb-2"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && stageName.trim()) {
                    handleConfirmAddStage();
                  }
                  if (e.key === "Escape") {
                    resetAddStageDialog();
                  }
                }}
              />
              <input
                type="text"
                value={stageCode}
                onChange={(e) => setStageCode(e.target.value)}
                placeholder="Stage code (optional)"
                className="w-full bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-md px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/60 mb-2"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    resetAddStageDialog();
                  }
                }}
              />
              <textarea
                value={stageDescription}
                onChange={(e) => setStageDescription(e.target.value)}
                placeholder="Description (optional)"
                rows={2}
                className="w-full bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-md px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/60 mb-3 resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    resetAddStageDialog();
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={resetAddStageDialog}
                  className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmAddStage}
                  disabled={!stageName.trim() || addingStage}
                  className="px-3 py-1.5 text-xs bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingStage ? "Adding..." : "Add"}
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}

      {hasChildren && isExpanded && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggle={onToggle}
              onDrillIn={onDrillIn}
              onDoubleClick={onDoubleClick}
              onAddStage={onAddStage}
              onRefresh={onRefresh}
              onDeleteNode={onDeleteNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}
