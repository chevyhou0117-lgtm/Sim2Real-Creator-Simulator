import React, { useState, useMemo, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router";
import {
  ChevronRight,
  ChevronLeft,
  Plus,
  MoreHorizontal,
  Eye,
  Send,
  Layers3,
  Check,
  Save,
  ShieldCheck,
  Link2,
  ClipboardList,
  Upload,
  Building2,
  Loader2,
} from "lucide-react";
import { useLocalized, t } from '../utils/i18n';
import { type ProjectStatus } from "../../types/factoryEditor";
import { LanguageToggle } from "../components/LanguageToggle";
import { NewProjectModal } from "../components/editor/NewProjectModal";
import { ValidationModal } from "../components/editor/ValidationModal";
import { ActionBtn } from "../components/editor/UiComponents";
import { TreeNode } from "../components/editor/TreePanel";
import { AssetLibraryPanel } from "../components/editor/AssetLibraryPanel";
import { Viewport3D } from "../components/editor/Viewport3D";
import { RightPanel } from "../components/editor/RightPanel";
import { USDUploadModal } from "../components/editor/USDUploadModal";
import { updateTreeStatuses } from "../utils/statusCalculator";
import {
  findNode,
  getNodePath,
  updateNodeStatus,
  updateNodeData,
  type RightTab,
  type ViewMode,
  type USDFile,
  STATUS_CONFIG,
} from "../../types/factoryEditor";
import "../components/editor/editor.css";
import {
  getAssetListApi,
  getFactoryProjectTreeApi,
  bindLineNodeApi,
  saveOVModelApi,
  getFactoryProjectDetailByNodeIdApi,
  focusPerspectiveApi,
  deleteOvPrimApi,
  deleteFactoryAssetNodeApi,
} from "../api";
import { toast } from "sonner";

// ══════════════════════════════════════════════════════════════════════════════
// Main FactoryEditorPage
// ══════════════════════════════════════════════════════════════════════════════
export function FactoryEditorPage() {
  useLocalized();
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const isNew = !projectId || projectId === "new";

  const STATUS_LABEL_KEY: Record<string, string> = {
    DRAFT: 'status.draft',
    COMPLETE: 'status.complete_project',
    PUBLISHED: 'status.published',
    ARCHIVED: 'status.archived',
  };
  // console.log("projectId:", projectId);

  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  // 工厂名称
  const [projectName, setProjectName] = useState("");
  // 工厂状态
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>("DRAFT");
  // 工厂树
  const [factoryTree, setFactoryTree] = useState<any>([]);
  // asset list
  const [assetList, setAssetList] = useState<any[]>([]);
  // 工厂根USD路径
  const [rootUsdPath, setRootUsdPath] = useState<string>("");

  const [selectedNodeId, setSelectedNodeId] = useState<string>("new-factory");

  const [rightTab, setRightTab] = useState<RightTab>("base");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set([
      "houston-p9",
      "smt-process",
      "smt01-line",
      "smt02-line",
      "smt03-line",
      "assembly-process",
      "pth-process",
      "california",
      "new-factory",
    ]),
  );
  const [viewMode, setViewMode] = useState<ViewMode>("floor");
  const [viewContextId, setViewContextId] = useState<string | null>(null);

  const [showValidation, setShowValidation] = useState(false);
  const [savedMessage, setSavedMessage] = useState(false);
  const [showUSDUpload, setShowUSDUpload] = useState(false);
  const [usdFiles, setUsdFiles] = useState<USDFile[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const selectedNode = useMemo(
    () => findNode(factoryTree, selectedNodeId),
    [factoryTree, selectedNodeId],
  );

  const viewContextNode = useMemo(
    () => (viewContextId ? findNode(factoryTree, viewContextId) : null),
    [factoryTree, viewContextId],
  );

  const breadcrumb = useMemo((): any[] => {
    if (viewMode === "floor") return [factoryTree];
    const contextId = viewContextId ?? selectedNodeId;
    return getNodePath(factoryTree, contextId);
  }, [viewMode, viewContextId, selectedNodeId, factoryTree]);

  function handleTreeNodeClick(nodeId: string) {
    const node = findNode(factoryTree, nodeId);
    if (!node) return;
    setSelectedNodeId(nodeId);
    setRightTab("base");
    // Auto-expand all ancestors in tree
    const path = getNodePath(factoryTree, nodeId);
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      path.forEach((n) => next.add(n.id));
      return next;
    });
    // View navigation: single-click only goes back to floor view on factory/process
    // line/equipment nodes do NOT switch view on single click (PRD C1.2.2)
    if (node.type === "factory" || node.type === "process") {
      setViewMode("floor");
      setViewContextId(null);
    }
    // line/equipment: view switching (drill-in) happens on double-click or drill-in button
  }

  function handleDrillIn(nodeId: string) {
    console.log("handleDrillIn called with nodeId:", nodeId);
    const node = findNode(factoryTree, nodeId);
    if (!node) {
      console.log("Node not found:", nodeId);
      return;
    }
    console.log("Node found:", node.name, "type:", node.type);
    setSelectedNodeId(nodeId);
    setRightTab("base");
    // Auto-expand all ancestors in tree
    const path = getNodePath(factoryTree, nodeId);
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      path.forEach((n) => next.add(n.id));
      return next;
    });

    // Switch to appropriate view based on node type
    if (node.type === "factory" || node.type === "process") {
      console.log("Setting view to floor");
      setViewMode("floor");
      setViewContextId(null);
    } else if (node.type === "line") {
      console.log("Setting view to line");
      setViewMode("line");
      setViewContextId(nodeId);
    } else if (node.type === "equipment") {
      console.log("Setting view to equipment");
      setViewMode("equipment");
      setViewContextId(nodeId);
    }
  }

  /** 双击节点：钻入视图 + 拉取节点详情 */
  const handleNodeDoubleClick = async (nodeId: string) => {
    const node = findNode(factoryTree, nodeId);
    if (!node) return;

    // 钻入视图（根据节点类型切换 viewMode / viewContextId）
    handleDrillIn(nodeId);

    // 拉取节点详情
    try {
      const res = await getFactoryProjectDetailByNodeIdApi(nodeId);
      if (res.code == 200) {
        console.log(
          `[FactoryEditor] 节点 ${node.name} (${node.type}) 详情:`,
          res.data,
        );
        // 设备节点：平滑运镜到该设备 + 高亮（参考 fastapi.service.setup 的 focus-perspective）
        const isEquipment = String(node.type).toUpperCase() === "EQUIPMENT";
        const primPath =
          (node as any)?.detail?.primPath ||
          (res.data as any)?.primPath ||
          (res.data as any)?.detail?.primPath ||
          (node as any)?.primPath ||
          "";
        if (isEquipment && primPath) {
          focusPerspectiveApi({ primPath }).catch((err) =>
            console.error("[FactoryEditor] focus-perspective 失败:", err),
          );
        } else if (isEquipment) {
          console.warn(
            "[FactoryEditor] 设备节点缺少 primPath，无法聚焦:",
            node,
          );
        }
      } else {
        console.warn(
          `[FactoryEditor] 获取节点 ${nodeId} 详情失败:`,
          res.message,
        );
      }
    } catch (error) {
      console.error(`[FactoryEditor] 获取节点 ${nodeId} 详情异常:`, error);
    }
  };

  function toggleExpand(id: string) {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSave() {
    saveOVFactoryModel();
  }

  function handlePublish() {
    if (projectStatus === "complete") {
      setProjectStatus("published");
    }
  }

  // 上传成功后刷新工厂树
  const onUploadSuccess = () => {
    fetchProjectAssetById();
  };

  const onDragNodeComplete = (node: any) => {
    console.log("onDragNodeComplete 绑定 lineNode:", node);
    // 绑定 lineNode
    bindLineNode(node);
  };

  // 使用useRef确保只调用一次
  const hasCalledRef = React.useRef(false);

  useEffect(() => {
    if (!hasCalledRef.current) {
      fetchAssetList();
      if (projectId) {
        fetchProjectAssetById();
      }
      hasCalledRef.current = true;
    }
  }, []);

  const fetchAssetList = async () => {
    const res = await getAssetListApi({});
    if (res.code == 200) {
      const resData = res.data || {};
      setAssetList(resData);
    }
  };

  const fetchProjectAssetById = async () => {
    const res = await getFactoryProjectTreeApi(projectId || "");
    if (res.code == 200) {
      const resData: any = res.data || {};
      console.log("ProjectAsset resData:", resData);
      // setFactoryTree(resData);

      setProjectName(resData.projectName);
      setProjectStatus(resData.status);
      setRootUsdPath(resData.rootUsdPath || "");

      const factoryTree = resData.factoryAssetNodeVo || [];
      setFactoryTree(factoryTree?.[0] || {});
    }
  };

  const bindLineNode = async (node: any) => {
    const params = {
      factoryProjectId: projectId || "",
      primPath: node.primPath || "",
      lineId: node.lineId || "",
    };
    const res = await bindLineNodeApi(params);
    if (res.code == 200) {
      fetchProjectAssetById();
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    try {
      // 删前取 prim_path：删 LINE 容器会连带移除其下全部设备；删 EQUIPMENT 删单个。
      // primPath 在 node.detail 里（VO 顶层没有）；拿不到再走详情接口（与双击高亮同源，已验证可用）。
      const node = findNode(factoryTree, nodeId);
      let primPath =
        (node as any)?.detail?.primPath || (node as any)?.primPath || "";
      if (!primPath) {
        try {
          const d = await getFactoryProjectDetailByNodeIdApi(nodeId);
          primPath =
            (d?.data as any)?.primPath ||
            (d?.data as any)?.detail?.primPath ||
            "";
        } catch (e) {
          console.warn("[FactoryEditor] 取节点详情拿 primPath 失败:", e);
        }
      }
      const res = await deleteFactoryAssetNodeApi(nodeId);
      if (res?.code === 200) {
        // 同步从 Kit stage 删除对应 prim，否则 3D 场景里模型还在
        if (primPath) {
          deleteOvPrimApi(primPath).catch((e) =>
            console.error("[FactoryEditor] OV prim 删除失败:", e),
          );
        } else {
          console.warn(
            "[FactoryEditor] 节点无 primPath，跳过 OV prim 删除:",
            nodeId,
          );
        }
        toast.success(t("common.deleteSuccess"));
        fetchProjectAssetById();
      } else {
        toast.error(res?.message || t("common.deleteFailed"));
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || t("common.deleteFailed");
      toast.error(msg);
    }
  };

  const saveOVFactoryModel = async () => {
    setIsSaving(true);
    try {
      const params = {
        rootUsdPath: rootUsdPath || "",
      };
      const res = await saveOVModelApi(params);
      if (res.code == 200) {
        toast.success(t("common.saveSuccess"));
        setSavedMessage(true);
        setTimeout(() => setSavedMessage(false), 2000);
      }
    } catch (error) {
      console.error("Save failed:", error);
      toast.error(t("common.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--c-07111e)] text-slate-100 overflow-hidden">
      {/* ── Top Header Bar ── */}
      <header className="h-11 bg-[var(--c-050f1a)] border-b border-[var(--c-142235)] flex items-center px-4 flex-shrink-0 z-20">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center">
            <Layers3 size={11} />
          </div>
          <span className="text-xs font-semibold tracking-widest text-blue-300 uppercase">
            {t("home.appTitle")}
          </span>
        </div>
        {/* Breadcrumb */}
        <div className="ml-4 flex items-center gap-1.5 text-[11px] text-slate-500 flex-1 min-w-0">
          <span
            className="hover:text-slate-300 cursor-pointer transition-colors flex-shrink-0"
            onClick={() => navigate("/")}
          >
            {t("common.home")}
          </span>
          <ChevronRight size={11} />
          <span
            className="hover:text-slate-300 cursor-pointer transition-colors flex-shrink-0"
            onClick={() => navigate("/factories")}
          >
            {t("project.title")}
          </span>
          <ChevronRight size={11} />
          <span className="text-blue-400 truncate">{projectName}</span>
          <div
            className={`text-[9px] px-2 py-0.5 rounded border font-medium flex-shrink-0 ml-1 ${STATUS_CONFIG[projectStatus]?.cls}`}
          >
            {t(STATUS_LABEL_KEY[projectStatus] || 'status.draft')}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <LanguageToggle />
          {savedMessage && (
            <span className="text-[10px] text-emerald-400 flex items-center gap-1 animate-pulse">
              <Check size={10} /> {t("common.saveSuccess")}
            </span>
          )}
          <button
            onClick={() => setShowUSDUpload(true)}
            className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-200 border border-[var(--c-1e3a55)] hover:border-blue-500/60 rounded px-2.5 py-1 transition-colors"
          >
            <Upload size={11} /> {t("editor.uploadUSD")}
          </button>
          <button
            onClick={() => setShowValidation(true)}
            className="flex items-center gap-1.5 text-[10px] text-slate-400 hover:text-slate-200 border border-[var(--c-1e3a55)] rounded px-2.5 py-1 transition-colors"
          >
            <ShieldCheck size={11} /> {t("editor.validate")}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={`flex items-center gap-1.5 text-[10px] rounded px-2.5 py-1 transition-colors ${
              isSaving
                ? "text-blue-200 bg-blue-800/50 cursor-not-allowed"
                : "text-white bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {isSaving ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Save size={11} />
            )}
            {isSaving ? t("common.saving") : t("common.save")}
          </button>
          <ActionBtn
            icon={<Eye size={11} />}
            label={t("common.preview")}
            color="blue"
            onClick={() => {}}
          />
          <ActionBtn
            icon={<Send size={11} />}
            label={t("common.publish")}
            color="indigo"
            onClick={handlePublish}
            disabled={projectStatus !== "complete"}
          />
        </div>
      </header>

      {/* ── Project Sub Navigation ── */}
      {!isNew && (
        <div className="h-8 bg-[var(--c-050f1a)] border-b border-[var(--c-142235)] flex items-end px-4 flex-shrink-0">
          {(
            [
              {
                id: "editor",
                label: t("editor.3dEditor"),
                icon: <Layers3 size={10} />,
                path: `/factory/${projectId}`,
              },
              {
                id: "binding",
                label: t("home.dataBinding"),
                icon: <Link2 size={10} />,
                path: `/factory/${projectId}/data-binding`,
              },
              {
                id: "versions",
                label: t("home.logs"),
                icon: <ClipboardList size={10} />,
                path: `/factory/${projectId}/versions`,
              },
            ] as {
              id: string;
              label: string;
              icon: React.ReactNode;
              path: string;
            }[]
          ).map((tab) => (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`h-full flex items-center gap-1.5 px-4 text-[11px] border-b-2 transition-colors ${
                tab.id === "editor"
                  ? "border-blue-500 text-blue-300"
                  : "border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* ── Left Panel ── */}
        <div
          className={`flex flex-col bg-[var(--c-071526)] border-r border-[var(--c-142235)] transition-all duration-200 flex-shrink-0 ${
            leftCollapsed ? "w-8" : "w-60"
          }`}
        >
          {/* Collapse Toggle */}
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-[var(--c-142235)] flex-shrink-0 min-h-[30px]">
            {!leftCollapsed && (
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 size={11} className="text-blue-400" /> {t("editor.factoryModeling")}
              </span>
            )}
            <button
              onClick={() => setLeftCollapsed(!leftCollapsed)}
              className="text-slate-500 hover:text-slate-200 ml-auto p-0.5 transition-colors"
            >
              {leftCollapsed ? (
                <ChevronRight size={13} />
              ) : (
                <ChevronLeft size={13} />
              )}
            </button>
          </div>

          {!leftCollapsed && (
            <>
              {/* 左侧 上方 3D Asset Library*/}
              <AssetLibraryPanel assetList={assetList} />

              {/* 左侧 Factory Tree */}
              <div className="flex items-center justify-between px-2 py-1.5 border-b border-[var(--c-142235)] flex-shrink-0">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                  {projectName}
                </span>
                <div className="flex items-center gap-1">
                  <button className="text-slate-500 hover:text-blue-400 transition-colors p-0.5">
                    <Plus size={11} />
                  </button>
                  <button className="text-slate-500 hover:text-slate-200 transition-colors p-0.5">
                    <MoreHorizontal size={11} />
                  </button>
                </div>
              </div>

              <div className="flex-1 py-1 tree-content">
                <TreeNode
                  node={factoryTree}
                  depth={0}
                  selectedId={selectedNodeId}
                  expandedIds={expandedNodes}
                  onSelect={handleTreeNodeClick}
                  onToggle={toggleExpand}
                  onDrillIn={handleDrillIn}
                  onDoubleClick={handleNodeDoubleClick}
                  onRefresh={fetchProjectAssetById}
                  onDeleteNode={handleDeleteNode}
                />
              </div>
            </>
          )}
        </div>

        {/* ── Center Viewport ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Viewport Area */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[var(--c-07111e)]">
            <Viewport3D
              selectedNode={selectedNode}
              viewMode={viewMode}
              viewContextNode={viewContextNode}
              breadcrumb={breadcrumb}
              onBreadcrumbClick={handleDrillIn}
              onCanvasNodeClick={handleTreeNodeClick}
              rootUsdPath={rootUsdPath}
              onDragNodeComplete={onDragNodeComplete}
            />
          </div>
        </div>

        {/* ── Right Panel ── */}
        <RightPanel
          selectedNode={selectedNode}
          rightTab={rightTab}
          onTabChange={setRightTab}
          projectStatus={projectStatus}
          projectId={projectId}
          factoryTree={factoryTree}
          onTreeNodeStatusChange={(nodeId, newStatus) =>
            setFactoryTree((prev) => updateNodeStatus(prev, nodeId, newStatus))
          }
          onNodeUpdate={(nodeId, updates) => {
            const updatedTree = updateNodeData(factoryTree, nodeId, updates);
            setFactoryTree(updatedTree);
          }}
          onDeleteNode={handleDeleteNode}
        />
      </div>

      {/* Modals */}
      {showNewProjectModal && (
        <NewProjectModal
          onClose={() => {
            setShowNewProjectModal(false);
            if (isNew) navigate("/");
          }}
          onCreate={(id) => {
            setShowNewProjectModal(false);
          }}
        />
      )}
      {showValidation && (
        <ValidationModal
          status={projectStatus}
          onClose={() => setShowValidation(false)}
          onMarkComplete={() => setProjectStatus("complete")}
          factoryName={projectName}
        />
      )}
      {showUSDUpload && (
        <USDUploadModal
          projectId={projectId}
          projectName={projectName}
          files={usdFiles}
          onSuccess={onUploadSuccess}
          onClose={() => setShowUSDUpload(false)}
          onLink={(id) =>
            setUsdFiles((prev) =>
              prev.map((f) => (f.id === id ? { ...f, status: "linked" } : f)),
            )
          }
          onUnlink={(id) =>
            setUsdFiles((prev) =>
              prev.map((f) => (f.id === id ? { ...f, status: "uploaded" } : f)),
            )
          }
          onRemove={(id) =>
            setUsdFiles((prev) => prev.filter((f) => f.id !== id))
          }
          onAdd={(files) => setUsdFiles((prev) => [...prev, ...files])}
        />
      )}
    </div>
  );
}
