import React, { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ChevronLeft,
  Move,
  RotateCcw,
  MousePointer2,
  ZoomIn,
  Maximize2,
  Grid3X3,
  Settings,
  Cpu,
  GitBranch,
  Box,
  ChevronDown,
  Edit2,
  Check,
  X,
  Package,
  Plus,
  Minus,
  Upload,
  Download,
  Trash2,
  Archive,
  Save,
} from "lucide-react";
import { type CategoryNode, type AssetStatus } from "../../types/category";
import WebComposerView from "../components/composer/WebComposerView";
import {
  getAssetListByIdApi,
  getLineAssetDetailApi,
  getEquipmentAssetDetailApi,
  notifyOpenOvApi,
  enableAssetApi,
  disableAssetApi,
  archiveAssetApi,
  updateLineModelDetailApi,
  updateEquipmentModelDetailApi,
  updateAssetCategoryApi,
  getEquipmentsByLineApi,
  highlightNodeApi,
} from "../api";
import { useLocalized, t } from "../utils/i18n";
import { LanguageToggle } from "../components/LanguageToggle";
import { toast } from "sonner";
import { baseUrl } from "../api/baseUrl";
import {
  isZipContentType,
  readFetchDownloadError,
} from "../utils/downloadResponse";

// ── Asset status display config (computed dynamically for i18n reactivity) ──
function getStatusConfig(lang: string): Record<string, { label: string; cls: string }> {
  return {
    draft: {
      label: t("status.draft"),
      cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    },
    active: {
      label: t("status.active"),
      cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    },
    inactive: {
      label: t("status.inactive"),
      cls: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    },
    archived: {
      label: t("status.archived"),
      cls: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    },
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// AssetEditorPage — full-screen asset viewer
// ══════════════════════════════════════════════════════════════════════════════
export function AssetEditorPage() {
  const navigate = useNavigate();
  const { assetId } = useParams<{ assetId: string }>();

  const [rootUsdPath, setRootUsdPath] = useState("");

  const isNew = assetId === "new";
  // Asset data
  const [asset, setAsset] = useState<CategoryNode | undefined>(undefined);
  // Asset tree
  const [tree, setTree] = useState<CategoryNode[]>([]);

  const [selectedNodeId, setSelectedNodeId] = useState(assetId ?? "");
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set([assetId ?? "", `${assetId}-s1`, `${assetId}-s2`, `${assetId}-s3`]),
  );
  const L = useLocalized();

  // Dynamically compute status config so labels react to language switch
  const ASSET_STATUS_CONFIG = useMemo(() => getStatusConfig(""), [L]);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set([
      "basic-info",
      "3d-model",
      "dimensions",
      "iot-config",
      "production",
      "maintenance",
    ]),
  );
  const [viewTool, setViewTool] = useState<
    "select" | "move" | "rotate" | "zoom"
  >("select");
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 2500);
    return () => clearTimeout(t);
  }, [hint]);

  // Biz form state (inline edit)
  const emptyBiz = {
    protocol: "",
    ipAddress: "",
    port: "",
    standardCT: "",
    capacityPerHr: "",
    availability: "",
    mtbf: "",
    lastMaintenance: "",
  };
  const [bizData, setBizData] = useState(emptyBiz);
  const [pendingBiz, setPendingBiz] = useState(emptyBiz);
  const [isEditingBiz, setIsEditingBiz] = useState(false);
  const [savingBiz, setSavingBiz] = useState(false);

  // Name editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(asset?.name ?? "New Asset");
  const [originalAssetName, setOriginalAssetName] = useState("");

  // 当前资产的 assetType 和 detailId（用于状态变更 API）
  const [assetType, setAssetType] = useState<"line" | "equipment">("line");
  const [detailId, setDetailId] = useState<string>("");

  // Demo status toggle for action buttons
  const [currentStatus, setCurrentStatus] = useState<AssetStatus>(
    asset?.status ?? "draft",
  );
  const statusCfg =
    ASSET_STATUS_CONFIG[currentStatus] ?? ASSET_STATUS_CONFIG.draft;

  // 当 asset 数据加载后，同步 currentStatus
  useEffect(() => {
    const raw = asset?.status || asset?.detail?.status;
    if (raw && typeof raw === "string") {
      setCurrentStatus(raw.toLowerCase() as AssetStatus);
    }
  }, [asset]);

  // Action button handlers（连接后端 API）
  function handleUpload() {
    alert(t("editor.uploadNewVersion"));
  }
  function handleSave() {
    void saveBiz();
  }
  function handleDownload() {
    // alert("Download started");
    downloadAssetFile(assetType, asset?.categoryId || "");
  }
  async function handleActivate() {
    if (!detailId) return;
    try {
      const res = await enableAssetApi(assetType, detailId);
      if (res?.code === 200) {
        setCurrentStatus("active");
      }
    } catch (e) {
      console.error("[AssetEditorPage] activate failed:", e);
    }
  }
  async function handleDeactivate() {
    if (!detailId) return;
    try {
      const res = await disableAssetApi(assetType, detailId);
      if (res?.code === 200) {
        setCurrentStatus("inactive");
      }
    } catch (e) {
      console.error("[AssetEditorPage] deactivate failed:", e);
    }
  }
  async function handleArchive() {
    if (!detailId) return;
    try {
      const res = await archiveAssetApi(assetType, detailId);
      if (res?.code === 200) {
        setCurrentStatus("archived");
      }
    } catch (e) {
      console.error("[AssetEditorPage] archive failed:", e);
    }
  }
  function handleDelete() {
    if (window.confirm(t("editor.deleteAssetQuestion"))) handleArchive();
  }
  function handleRestore() {
    alert(t("editor.archiveWarning"));
  }

  function toggleSection(id: string) {
    setExpandedSections((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }
  function toggleExpand(id: string) {
    setExpandedNodes((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  }
  function startEditBiz() {
    setPendingBiz({ ...bizData });
    setIsEditingBiz(true);
  }
  async function saveBiz() {
    if (!detailId) {
      toast.error(t("editor.noDetailId"));
      return;
    }
    const nextName = (asset?.name ?? editName).trim();
    if (!nextName) {
      toast.error(t("asset.nameRequired"));
      return;
    }
    setSavingBiz(true);
    try {
      const params: Record<string, any> = { id: detailId };
      const editableDetailFields = {
        rootUsdPath: asset?.rootUsdPath,
        format: asset?.format,
        polyCount: asset?.polyCount,
        width: asset?.width,
        height: asset?.height,
        depth: asset?.depth,
      };
      for (const [key, value] of Object.entries(editableDetailFields)) {
        if (value !== undefined && value !== null && value !== "") {
          params[key] = value;
        }
      }
      if (assetType === "equipment") {
        // specifications only exists on EquipmentModelDetailUpdateDto.
        const specs: Record<string, any> = {
          ...((asset as any)?.specifications || {}),
        };
        const map: [keyof typeof emptyBiz, string][] = [
          ["protocol", "protocol"],
          ["ipAddress", "ipAddress"],
          ["port", "port"],
          ["standardCT", "standardCT"],
          ["capacityPerHr", "capacityPerHr"],
          ["availability", "availability"],
          ["mtbf", "mtbf"],
          ["lastMaintenance", "lastMaintenance"],
        ];
        for (const [bizKey, specKey] of map) {
          const value = pendingBiz[bizKey];
          if (value === undefined || value === "") {
            delete specs[specKey];
          } else {
            specs[specKey] = value;
          }
        }
        params.specifications = specs;
        await updateEquipmentModelDetailApi(params);
      } else {
        // LineModelDetailUpdateDto does not support name/specifications.
        await updateLineModelDetailApi(params);
      }

      const categoryId = String(asset?.categoryId || assetId || "");
      if (nextName !== originalAssetName) {
        if (!categoryId) {
          throw new Error(t("editor.noDetailId"));
        }
        await updateAssetCategoryApi({ id: categoryId, name: nextName });
        setOriginalAssetName(nextName);
      }

      setBizData({ ...pendingBiz });
      setAsset((prev) => ({ ...prev, name: nextName }));
      setEditName(nextName);
      setIsEditingName(false);
      setIsEditingBiz(false);
      toast.success(t("editor.detailUpdated"));
    } catch (error: any) {
      console.error("[AssetEditorPage] saveBiz failed:", error);
      toast.error(
        error?.response?.data?.message || error?.message || t("editor.detailUpdateFailed"),
      );
    } finally {
      setSavingBiz(false);
    }
  }
  function cancelBiz() {
    setIsEditingBiz(false);
  }
  function updatePending(key: keyof typeof emptyBiz, value: string) {
    setPendingBiz((prev) => ({ ...prev, [key]: value }));
  }
  const displayBiz = isEditingBiz ? pendingBiz : bizData;

  const updateAsset = (key: string, value: string) => {
    setAsset((prev) => ({ ...prev, [key]: value }));
    if (key === "name") setEditName(value);
  };

  const viewTools = [
    { id: "select", icon: <MousePointer2 size={13} />, title: t("editor.view.select") },
    { id: "move", icon: <Move size={13} />, title: t("editor.view.move") },
    { id: "rotate", icon: <RotateCcw size={13} />, title: t("editor.view.rotate") },
    { id: "zoom", icon: <ZoomIn size={13} />, title: t("editor.view.zoom") },
  ] as const;

  function renderNode(node: TreeNode, depth = 0): React.ReactNode {
    const hasChildren = !!node.children && node.children.length > 0;
    const expanded = expandedNodes.has(node.id);
    const selected = selectedNodeId === node.id;
    const isLine = node.type?.includes("line");
    const icon = isLine ? (
      <GitBranch size={11} className="flex-shrink-0" />
    ) : (
      <Cpu size={11} className="flex-shrink-0" />
    );

    /** 双击设备节点时高亮对应的 OV Prim */
    const handleDoubleClick = (e: React.MouseEvent) => {
      e.stopPropagation();
      // 仅设备叶子节点（非线体、无子节点）支持双击高亮
      if (isLine || hasChildren) return;
      const primPath =
        (node as any).detail?.primPath || (node as any).primPath;
      if (!primPath) {
        console.warn("[AssetEditorPage] 设备节点缺少 primPath:", node);
        return;
      }
      highlightNodeApi({ primPath: [primPath] }).catch((err) => {
        console.error("[AssetEditorPage] highlight failed:", err);
      });
    };

    return (
      <div key={node.id}>
        <button
          onClick={() => {
            setSelectedNodeId(node.id);
            if (hasChildren) toggleExpand(node.id);
          }}
          onDoubleClick={handleDoubleClick}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          className={`w-full flex items-center gap-1.5 pr-3 py-1.5 text-left text-[11px] transition-colors ${
            selected
              ? "bg-blue-600/15 text-blue-300"
              : "text-slate-400 hover:text-slate-200 hover:bg-[var(--c-0e243a)]"
          }`}
        >
          {hasChildren ? (
            <ChevronDown
              size={10}
              className={`flex-shrink-0 transition-transform ${expanded ? "" : "-rotate-90"}`}
            />
          ) : (
            <span className="w-2.5 flex-shrink-0" />
          )}
          {icon}
          <span className="flex-1 truncate">{L(node, 'name', 'nameEn')}</span>
        </button>
        {hasChildren &&
          expanded &&
          node.children?.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  // 使用useRef确保只调用一次
  const hasCalledRef = React.useRef(false);

  useEffect(() => {
    if (!hasCalledRef.current) {
      fetchAssetById();
      hasCalledRef.current = true;
    }
  }, []);

  const fetchAssetById = async () => {
    const res = await getAssetListByIdApi(assetId);
    if (res.code == 200) {
      const resData = res.data || {};
      setTree(resData);
      const categoryName = resData?.name || "";
      setOriginalAssetName(categoryName);
      setEditName(categoryName);
      const rootUsdPath2 = resData?.detail?.rootUsdPath || "";
      setRootUsdPath(rootUsdPath2);

      // 获取资产详情
      const type = resData?.type || "";
      const dId = resData?.detail?.id || "";
      // 保存 assetType 和 detailId 供状态变更 API 使用
      setAssetType(type.includes("line") ? "line" : "equipment");
      setDetailId(String(dId));
      // 如果是线体，获取线体下面挂载的设备
      if (type.includes("line")) {
        fetchEquipmentAssetListByLine(String(dId), resData);
      }
      // 同步初始状态
      const rawStatus = resData?.detail?.status || resData?.status || "";
      if (rawStatus && typeof rawStatus === "string") {
        setCurrentStatus(rawStatus.toLowerCase() as AssetStatus);
      }
      fetchAssetDetail(type, dId, resData);
      // 通知OV要打开的资产场景
      if (rootUsdPath2) {
        openAssetStage(rootUsdPath2);
      }
    }
  };

  const fetchEquipmentAssetListByLine = async (id: string, parentTree) => {
    const res = await getEquipmentsByLineApi({ id: id });
    if (res?.code == 200) {
      const resData = res.data || [];
      // 改造一下数据，填充 tree的 children 字段
      resData.forEach((item, index) => {
        item.id = `${item.instanceName}_${index}`;
      });
      // 创建新引用触发 React 重渲染，避免 setTree 同一对象引用导致 UI 不更新
      setTree({ ...parentTree, children: resData });
    }
  };

  const fetchAssetDetail = async (
    type: string,
    detailId: string,
    categoryNode?: CategoryNode,
  ) => {
    let res = null;
    if (type.includes("line")) {
      res = await getLineAssetDetailApi(detailId);
    } else if (type.includes("equipment")) {
      res = await getEquipmentAssetDetailApi(detailId);
    }
    if (res?.code == 200) {
      const resData = res.data || {};
      setAsset({
        ...categoryNode,
        ...resData,
        id: categoryNode?.id || resData.categoryId || resData.id,
        name: categoryNode?.name || resData.name || "",
        type: categoryNode?.type || type,
        categoryId: resData.categoryId || categoryNode?.id,
      });

      // 回填可编辑的业务字段
      const specs = resData.specifications || {};
      const loadedBiz = {
        protocol: specs.protocol || "",
        ipAddress: specs.ipAddress || "",
        port: specs.port || "",
        standardCT: specs.standardCT || "",
        capacityPerHr: specs.capacityPerHr || "",
        availability: specs.availability || "",
        mtbf: specs.mtbf || "",
        lastMaintenance: specs.lastMaintenance || "",
      };
      setBizData(loadedBiz);
      setPendingBiz(loadedBiz);
    }
  };

  const openAssetStage = (rootUsdPath: string) => {
    console.log("openAssetStage, rootUsdPath:", rootUsdPath);
    notifyOpenOvApi({
      rootUsdPath: rootUsdPath || "",
    });
  };

  const downloadAssetFile = async (type: string, id: string) => {
    try {
      // 直接使用 fetch 获取二进制数据，以便获取响应头
      const response = await fetch(
        `${baseUrl}/v1/asset-download/${type}/download/${id}`,
      );

      const contentType = response.headers.get("Content-Type");
      if (!response.ok || !isZipContentType(contentType)) {
        throw new Error(await readFetchDownloadError(response));
      }

      // 从响应头获取文件名
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `asset_${id}.zip`;

      if (contentDisposition) {
        const match = contentDisposition.match(
          /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/,
        );
        if (match && match[1]) {
          filename = decodeURIComponent(match[1].replace(/['"]/g, ""));
        }
      }

      // 获取 Blob 数据
      const blob = await response.blob();

      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success(t("editor.fileDownloadSuccess", { name: filename }));
    } catch (error) {
      console.error("[downloadAssetFile] Error:", error);
      toast.error(t("editor.downloadFailed") + ": " + (error as Error).message);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[var(--c-07111e)] text-slate-100 overflow-hidden">
      {/* ── Header ── */}
      <header className="h-11 bg-[var(--c-050f1a)] border-b border-[var(--c-142235)] flex items-center px-4 gap-3 flex-shrink-0 z-20">
        <button
          onClick={() => navigate("/asset-library")}
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-[11px] transition-colors flex-shrink-0"
        >
          <ChevronLeft size={13} /> {t("asset.title")}
        </button>
        <div className="w-px h-4 bg-[var(--c-1e3a55)]" />
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Package size={12} className="text-blue-400 flex-shrink-0" />
          {isNew ? (
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded px-2 py-0.5 text-[11px] text-slate-100 w-48 focus:outline-none focus:border-blue-500"
              placeholder={t("editor.newAssetName")}
              autoFocus
            />
          ) : (
            <>
              {isEditingName ? (
                <input
                  value={editName}
                  onChange={(e) => updateAsset("name", e.target.value)}
                  onBlur={() => setIsEditingName(false)}
                  onKeyDown={(e) =>
                    e.key === "Enter" && setIsEditingName(false)
                  }
                  className="bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded px-2 py-0.5 text-[11px] text-slate-100 w-48 focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              ) : (
                <span className="text-[11px] font-medium text-slate-200 truncate">
                  {L(asset, 'name', 'nameEn')}
                </span>
              )}
              <button
                onClick={() => {
                  setEditName(asset?.name);
                  setIsEditingName(!isEditingName);
                }}
                className="text-slate-500 hover:text-blue-400 p-0.5 rounded transition-colors flex-shrink-0"
                title={t("editor.editName")}
              >
                <Edit2 size={11} />
              </button>
              <span className="text-[9px] px-2 py-0.5 rounded border border-blue-500/40 bg-blue-500/10 text-blue-400 flex-shrink-0">
                {asset?.type}
              </span>
              <span
                className={`text-[9px] px-2 py-0.5 rounded border flex-shrink-0 ${statusCfg.cls}`}
              >
                {statusCfg.label}
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <LanguageToggle />
          {/* <button
            onClick={handleUpload}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 border border-[var(--c-1e3a55)] rounded px-2 py-1 transition-colors"
            title="Upload new version"
          >
            <Upload size={11} /> Upload
          </button> */}
          <button
            onClick={handleSave}
            className="flex items-center gap-1 text-[10px] text-white bg-blue-600 hover:bg-blue-700 rounded px-2 py-1 transition-colors"
          >
            <Save size={11} /> {t("common.save")}
          </button>
          <button
            onClick={handleDownload}
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-slate-200 border border-[var(--c-1e3a55)] rounded px-2 py-1 transition-colors"
            title={t("common.download")}
          >
            <Download size={11} />
          </button>
          <div className="w-px h-4 bg-[var(--c-1e3a55)]" />
          {currentStatus === "draft" && (
            <button
              onClick={handleActivate}
              className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-white border border-emerald-500/30 hover:bg-emerald-600/40 rounded px-2 py-1 transition-colors"
            >
              <Check size={11} /> {t("common.activate")}
            </button>
          )}
          {currentStatus === "inactive" && (
            <button
              onClick={handleActivate}
              className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-white border border-emerald-500/30 hover:bg-emerald-600/40 rounded px-2 py-1 transition-colors"
            >
              <Check size={11} /> {t("common.activate")}
            </button>
          )}
          {currentStatus === "active" && (
            <button
              onClick={handleDeactivate}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-white border border-[var(--c-1e3a55)] hover:bg-amber-600/40 rounded px-2 py-1 transition-colors"
            >
              <X size={11} /> {t("common.deactivate")}
            </button>
          )}
          {(currentStatus === "draft" ||
            currentStatus === "active" ||
            currentStatus === "inactive") && (
            <button
              onClick={handleArchive}
              className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-orange-400 border border-[var(--c-1e3a55)] hover:border-orange-500/40 rounded px-2 py-1 transition-colors"
            >
              <Archive size={11} /> {t("common.archive")}
            </button>
          )}
          {currentStatus === "draft" && (
            <button
              onClick={handleDelete}
              className="flex items-center gap-1 text-[10px] text-red-400 hover:text-white border border-red-500/30 hover:bg-red-600/40 rounded px-2 py-1 transition-colors"
            >
              <Trash2 size={11} /> {t("common.delete")}
            </button>
          )}
          {currentStatus === "archived" && (
            <button
              onClick={handleRestore}
              className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-white border border-blue-500/30 hover:bg-blue-600/40 rounded px-2 py-1 transition-colors"
            >
              <RotateCcw size={11} /> {t("common.restore")}
            </button>
          )}
        </div>
      </header>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Asset Structure Tree */}
        <aside className="w-52 bg-[var(--c-050f1a)] border-r border-[var(--c-142235)] flex flex-col flex-shrink-0 overflow-hidden">
          <div className="px-3 py-2.5 border-b border-[var(--c-142235)]">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {t("editor.assetStructure")}
            </span>
          </div>
          <div className="flex-1 tree-content py-1">
            {isNew ? (
              <div className="flex items-center justify-center h-full text-slate-600 text-[10px] px-3 text-center">
                {t("editor.saveToGenerateTree")}
              </div>
            ) : (
              renderNode(tree)
            )}
          </div>
        </aside>

        {/* Center: 3D Viewport */}
        <div className="flex-1 flex flex-col overflow-hidden bg-[var(--c-07111e)]">
          {/* Canvas */}
          <div
            className="flex-1 relative overflow-hidden"
            style={{
              backgroundImage: `
                linear-gradient(rgba(20,34,53,0.6) 1px, transparent 1px),
                linear-gradient(90deg, rgba(20,34,53,0.6) 1px, transparent 1px)
              `,
              backgroundSize: "40px 40px",
            }}
          >
            {/* Floating vertical toolbar (FactoryEditorPage style) */}
            {hint && (
              <div className="fixed left-[4.5rem] top-1/2 -translate-y-1/2 ml-2 bg-[var(--c-0f2638)] border border-blue-500/30 rounded-md px-3 py-1.5 text-xs text-blue-300 whitespace-nowrap shadow-lg z-[9999] pointer-events-none">
                {hint}
              </div>
            )}
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 bg-[var(--c-071526)]/90 border border-[var(--c-142235)] rounded-lg p-1.5 backdrop-blur-sm z-10">
              {viewTools.map((t) => (
                <button
                  key={t.id}
                  title={t.title}
                  onClick={() => {
                    setViewTool(t.id);
                    if (t.id === "rotate") setHint("快捷键: Alt + 鼠标左键");
                    else setHint(null);
                  }}
                  className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                    viewTool === t.id
                      ? "bg-blue-600/30 text-blue-400"
                      : "text-slate-500 hover:text-slate-200 hover:bg-[var(--c-142235)]"
                  }`}
                >
                  {t.icon}
                </button>
              ))}
              <div className="my-0.5 border-t border-[var(--c-142235)]" />
              <button
                title={t("editor.view.fitView")}
                className="w-7 h-7 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 hover:bg-[var(--c-142235)] transition-colors"
              >
                <Maximize2 size={13} />
              </button>
              <button
                title={t("editor.view.toggleGrid")}
                className="w-7 h-7 flex items-center justify-center rounded text-slate-500 hover:text-slate-200 hover:bg-[var(--c-142235)] transition-colors"
              >
                <Grid3X3 size={13} />
              </button>
            </div>

            {/* Center glow */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-96 h-96 rounded-full bg-blue-600/5 blur-3xl" />
            </div>

            {/* 视频流 */}
            <WebComposerView rootUsdPath={rootUsdPath || ""} />

            {/* Coordinates overlay */}
            <div className="absolute bottom-3 left-3 text-[9px] text-slate-700 font-mono">
              X: 0.00 Y: 0.00 Z: 0.00
            </div>

            {/* Zoom controls */}
            <div className="absolute bottom-3 right-3 flex items-center gap-2">
              <button className="w-6 h-6 rounded bg-[var(--c-0b1d30)] border border-[var(--c-142235)] flex items-center justify-center text-slate-500 hover:text-slate-200 transition-colors text-xs">
                <Minus size={10} />
              </button>
              <span className="text-[10px] text-slate-600">100%</span>
              <button className="w-6 h-6 rounded bg-[var(--c-0b1d30)] border border-[var(--c-142235)] flex items-center justify-center text-slate-500 hover:text-slate-200 transition-colors text-xs">
                <Plus size={10} />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Properties Panel */}
        <aside className="w-64 bg-[var(--c-050f1a)] border-l border-[var(--c-142235)] flex flex-col flex-shrink-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-[var(--c-142235)] flex-shrink-0 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
              {t("common.properties")}
            </span>
            <div className="flex items-center gap-0.5">
              {isEditingBiz ? (
                <>
                  <button
                    onClick={saveBiz}
                    disabled={savingBiz}
                    title={savingBiz ? t("asset.saving") : t("common.save")}
                    className="w-6 h-6 flex items-center justify-center rounded text-green-400 hover:bg-green-500/15 transition-colors disabled:opacity-50"
                  >
                    <Check size={12} />
                  </button>
                  <button
                    onClick={cancelBiz}
                    disabled={savingBiz}
                    title={t("common.cancel")}
                    className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:bg-[var(--c-142235)] transition-colors disabled:opacity-50"
                  >
                    <X size={12} />
                  </button>
                </>
              ) : (
                <button
                  onClick={startEditBiz}
                  title={t("common.edit")}
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-300 hover:bg-[var(--c-142235)] transition-colors"
                >
                  <Edit2 size={12} />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 tree-content">
            {
              <>
                {/* Basic Info */}
                <AccordionSection
                  title={t("common.basicInfo")}
                  expanded={expandedSections.has("basic-info")}
                  onToggle={() => toggleSection("basic-info")}
                >
                  {/* <PropRow label={t("editor.prop.name")} value={asset?.name} /> */}
                  <BizInputRow
                    label={t("editor.prop.name")}
                    value={asset?.name || ""}
                    placeholder=""
                    onChange={(v) => updateAsset("name", v)}
                    editing={isEditingBiz}
                  />

                  <PropRow label={t("editor.prop.type")} value={asset?.type} />
                  <PropRow label={t("editor.prop.category")} value={asset?.category ?? "—"} />
                  {asset?.manufacturer && (
                    <PropRow label={t("editor.prop.manufacturer")} value={asset?.manufacturer} />
                  )}
                  {asset?.model && (
                    <PropRow label={t("editor.prop.modelNo")} value={asset?.model} />
                  )}
                </AccordionSection>

                {/* 3D Model */}
                <AccordionSection
                  title={t("editor.threeDModel")}
                  expanded={expandedSections.has("3d-model")}
                  onToggle={() => toggleSection("3d-model")}
                >
                  {/* <PropRow label="USD Path" value={asset?.rootUsdPath || ""} /> */}
                  {/* <PropRow label="Format" value="USD" />
                  <PropRow label="Poly Count" value={asset?.polyCount || "-"} />
                  <PropRow
                    label="LOD Levels"
                    value={(asset?.type || "").includes("line") ? 2 : 3}
                  /> */}

                  <BizInputRow
                    label={t("editor.prop.usdPath")}
                    value={asset?.rootUsdPath || ""}
                    placeholder=""
                    onChange={(v) => updateAsset("rootUsdPath", v)}
                    editing={isEditingBiz}
                  />

                  <BizInputRow
                    label={t("editor.prop.format")}
                    value={asset?.format || "USD"}
                    placeholder={t("editor.placeholder.format")}
                    onChange={(v) => updateAsset("format", v)}
                    editing={isEditingBiz}
                  />

                  <BizInputRow
                    label={t("editor.prop.polyCount")}
                    value={asset?.polyCount || ""}
                    placeholder=""
                    onChange={(v) => updateAsset("polyCount", v)}
                    editing={isEditingBiz}
                  />

                  <BizInputRow
                    label={t("editor.prop.lodLevels")}
                    value={(asset?.type || "").includes("line") ? 2 : 3}
                    placeholder=""
                    onChange={(v) => updateAsset("lodLevels", v)}
                    editing={isEditingBiz}
                  />
                </AccordionSection>

                {/* Dimensions */}
                <AccordionSection
                  title={t("editor.dimensions")}
                  expanded={expandedSections.has("dimensions")}
                  onToggle={() => toggleSection("dimensions")}
                >
                  {/* <PropRow label="Width" value={asset?.width || "- mm"} />
                  <PropRow label="Depth" value={asset?.depth || "- mm"} />
                  <PropRow label="Height" value={asset?.height || "- mm"} /> */}

                  <BizInputRow
                    label={t("editor.prop.width")}
                    value={asset?.width}
                    placeholder={t("editor.placeholder.dimension")}
                    onChange={(v) => updateAsset("width", v)}
                    editing={isEditingBiz}
                  />
                  <BizInputRow
                    label={t("editor.prop.depth")}
                    value={asset?.depth}
                    placeholder={t("editor.placeholder.dimension")}
                    onChange={(v) => updateAsset("depth", v)}
                    editing={isEditingBiz}
                  />
                  <BizInputRow
                    label={t("editor.prop.height")}
                    value={asset?.height}
                    placeholder={t("editor.placeholder.dimension")}
                    onChange={(v) => updateAsset("height", v)}
                    editing={isEditingBiz}
                  />
                </AccordionSection>

                {/* IoT Configuration */}
                <AccordionSection
                  title={t("editor.iotConfig")}
                  expanded={expandedSections.has("iot-config")}
                  onToggle={() => toggleSection("iot-config")}
                >
                  <BizInputRow
                    label={t("editor.prop.protocol")}
                    value={displayBiz.protocol}
                    onChange={(v) => updatePending("protocol", v)}
                    placeholder={t("editor.placeholder.protocol")}
                    editing={isEditingBiz}
                  />
                  <BizInputRow
                    label={t("editor.prop.ipAddress")}
                    value={displayBiz.ipAddress}
                    onChange={(v) => updatePending("ipAddress", v)}
                    placeholder={t("editor.placeholder.ipAddress")}
                    editing={isEditingBiz}
                  />
                  <BizInputRow
                    label={t("editor.prop.port")}
                    value={displayBiz.port}
                    onChange={(v) => updatePending("port", v)}
                    placeholder={t("editor.placeholder.port")}
                    editing={isEditingBiz}
                  />
                </AccordionSection>

                {/* Production Data */}
                <AccordionSection
                  title={t("editor.productionData")}
                  expanded={expandedSections.has("production")}
                  onToggle={() => toggleSection("production")}
                >
                  <BizInputRow
                    label={t("editor.prop.standardCT")}
                    value={displayBiz.standardCT}
                    onChange={(v) => updatePending("standardCT", v)}
                    placeholder={t("editor.placeholder.standardCT")}
                    editing={isEditingBiz}
                  />
                  <BizInputRow
                    label={t("editor.prop.capacityPerHr")}
                    value={displayBiz.capacityPerHr}
                    onChange={(v) => updatePending("capacityPerHr", v)}
                    placeholder={t("editor.placeholder.capacityPerHr")}
                    editing={isEditingBiz}
                  />
                  <BizInputRow
                    label={t("editor.prop.availability")}
                    value={displayBiz.availability}
                    onChange={(v) => updatePending("availability", v)}
                    placeholder={t("editor.placeholder.availability")}
                    editing={isEditingBiz}
                  />
                </AccordionSection>

                {/* Maintenance */}
                <AccordionSection
                  title={t("editor.maintenance")}
                  expanded={expandedSections.has("maintenance")}
                  onToggle={() => toggleSection("maintenance")}
                >
                  <BizInputRow
                    label={t("editor.prop.mtbf")}
                    value={displayBiz.mtbf}
                    onChange={(v) => updatePending("mtbf", v)}
                    placeholder={t("editor.placeholder.mtbf")}
                    editing={isEditingBiz}
                  />
                  <BizInputRow
                    label={t("editor.prop.lastMaintenance")}
                    value={displayBiz.lastMaintenance}
                    onChange={(v) => updatePending("lastMaintenance", v)}
                    placeholder={t("editor.placeholder.lastMaintenance")}
                    editing={isEditingBiz}
                  />
                </AccordionSection>
              </>
            }
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function AccordionSection({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--c-142235)]">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-[var(--c-0a1c2e)] transition-colors"
      >
        <span className="text-[11px] font-semibold text-slate-300">
          {title}
        </span>
        <ChevronDown
          size={12}
          className={`text-slate-500 transition-transform ${expanded ? "" : "-rotate-90"}`}
        />
      </button>
      {expanded && <div className="px-3 pb-3 space-y-1.5">{children}</div>}
    </div>
  );
}

function PropRow({
  label,
  value,
  dim,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="text-[10px] text-slate-500 flex-shrink-0">{label}</span>
      <span
        className={`text-[10px] text-right ${dim ? "text-slate-600 italic" : "text-slate-300"} whitespace-pre-wrap break-words max-w-[70%]`}
      >
        {value}
      </span>
    </div>
  );
}

function BizInputRow({
  label,
  value,
  onChange,
  placeholder,
  editing,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  editing: boolean;
}) {
  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] text-slate-500 flex-shrink-0">
          {label}
        </span>
        <span className="text-[10px] text-right text-slate-300 italic whitespace-pre-wrap break-words max-w-[70%]">
          {value || "-"}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-slate-500 w-24 flex-shrink-0">
        {label}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "Not configured"}
        className="flex-1 bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded px-2 py-1 text-[10px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/60 transition-colors min-w-0"
      />
    </div>
  );
}
