import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Search,
  Package,
  Layers3,
  Grid3X3,
  List,
  Plus,
  Edit2,
  X,
  SlidersHorizontal,
  Check,
  Trash2,
  Download,
  CheckSquare,
  Copy,
  Eye,
} from "lucide-react";
import { type AssetStatus } from "../../types/category";
import { FilterModal } from "../components/assetLibrary/FilterModal";
import { useLocalized, t } from "../utils/i18n";
import { LanguageToggle } from "../components/LanguageToggle";
import { CopyAssetModal } from "../components/assetLibrary/CopyAssetModal";
import { CategoryDialog } from "../components/assetLibrary/CategoryDialog";
import { SubCategoryDialog } from "../components/assetLibrary/SubCategoryDialog";
import { BatchDeleteDialog } from "../components/assetLibrary/BatchDeleteDialog";
import { BatchResultDialog } from "../components/assetLibrary/BatchResultDialog";
import { ConfirmDialog } from "../components/assetLibrary/ConfirmDialog";
import { AssetDetailPanel } from "../components/assetLibrary/AssetDetailPanel";

import "./AssetLibraryPage.css";

import {
  getAssetListApi,
  deleteAssetCategoryApi,
  batchDeleteAssetCategoryApi,
  batchEnableAssetApi,
  batchDisableAssetApi,
  enableAssetApi,
  archiveAssetApi,
  updateThumbnailApi,
  createAssetCategoryApi,
  updateAssetCategoryApi,
  getFilterAssetCategoryTreeApi,
  getLineAssetListApi,
  getBatchDownloadAssetFileApi,
  moveAssetCategoryApi,
} from "../api/index";
import { proxyMinioUrl } from "../utils/minioProxy";
import type { CategoryNode } from "../../types/category";
import UploadAsset from "../components/assetLibrary/UploadAsset";
import { toast } from "sonner";
import { baseUrl } from "../api/baseUrl";
import axios from "axios";

/** 资产状态 → CSS 类名映射（label 在组件内通过 t() 动态获取以响应语言切换） */
const ASSET_STATUS_CLS: Record<AssetStatus, string> = {
  draft: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  inactive: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  archived: "bg-orange-500/15 text-orange-400 border-orange-500/30",
};

/** 根据状态值获取翻译 key */
function getStatusLabel(status: string): string {
  const keyMap: Record<string, string> = {
    active: "status.active",
    draft: "status.draft",
    inactive: "status.inactive",
    archived: "status.archived",
  };
  const key = keyMap[status?.toLowerCase()];
  return key ? t(key) : status;
}

// ══════════════════════════════════════════════════════════════════════════════
// AssetLibraryPage
// ══════════════════════════════════════════════════════════════════════════════
export function AssetLibraryPage() {
  const navigate = useNavigate();
  const { category } = useParams<{ category?: string }>();

  const [processNode, setProcessNode] = useState<string[]>([]);
  const [selectedCat, setSelectedCat] = useState(category || "smt");
  const [selectedSubCat, setSelectedSubCat] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedProcessNode, setSelectedProcessNode] = useState<any | null>(
    null,
  );
  const [selectedType, setSelectedType] = useState<string>(null);
  const [selectedStatus, setSelectedStatus] = useState<AssetStatus | "all">(
    "all",
  );
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(
    new Set(["smt-lines", "stencil-printers", "chip-mounters", "reflow-ovens"]),
  );
  const [selectedAsset, setSelectedAsset] = useState<any>(null);
  const [copyingAsset, setCopyingAsset] = useState<any>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [dragOverNodeId, setDragOverNodeId] = useState<string | null>(null);
  const L = useLocalized();
  const filterButtonRef = useRef<HTMLButtonElement>(null);

  // ── Batch selection state ──────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchConfirm, setBatchConfirm] = useState<{
    type: "toggle" | "delete";
    enableIds: string[];
    disableIds: string[];
    deleteIds: string[];
    blockedIds: { id: string; reason: string }[];
  } | null>(null);
  const [batchResult, setBatchResult] = useState<{
    type: "download" | "toggle" | "delete";
    success: number;
    fail: { id: string; name: string; reason: string }[];
  } | null>(null);

  // ── Categories state (from API, tree structure) ─────────────────
  const [categoryTree, setCategoryTree] = useState<CategoryNode[]>([]);

  // const [categoryTree, setCategoryTree] = useState<CategoryNode[]>(() => {
  //   try {
  //     const savedCategories = localStorage.getItem(LOCAL_STORAGE_KEY);
  //     return savedCategories ? JSON.parse(savedCategories) : [];
  //   } catch (err) {
  //     console.error(err);
  //     return [];
  //   }
  // });

  // ── Dialog states ──────────────────────────────────────────────────────
  const [showCatDialog, setShowCatDialog] = useState(false);
  const [editCatTarget, setEditCatTarget] = useState<CategoryNode | null>(null);
  const [showSubDialog, setShowSubDialog] = useState(false);
  const [editSubTarget, setEditSubTarget] = useState<{
    catId: string;
    sub?: CategoryNode;
  } | null>(null);
  // 叶子节点删除确认状态
  const [confirmDeleteAsset, setConfirmDeleteAsset] = useState<{
    id: string;
    name: string;
    loading: boolean;
  } | null>(null);

  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);

  // ── CRUD handlers (for tree structure) ──────────────────────────────────
  async function handleAddCategory(
    parentId: string,
    name: string,
    code: string,
    desc: string,
  ) {
    try {
      const res = await createAssetCategoryApi({
        name,
        code,
        type: "process",
        parentId,
        description: desc || undefined,
      });
      if (res.code === 200) {
        toast.success(t("asset.categoryCreatedWithName", { name }));
        fetchAssetLibraryCategories();
      } else {
        toast.error(res.message || t("asset.createCategoryFailed"));
      }
    } catch (error: any) {
      console.error("[AssetLibraryPage] Create process failed:", error);
      toast.error(
        error?.response?.data?.message || error?.message || t("asset.createCategoryFailed"),
      );
    }
  }

  async function handleEditCategory(
    id: string,
    name: string,
    code: string,
    desc: string,
  ) {
    try {
      const res = await updateAssetCategoryApi({
        id,
        name,
        code,
        description: desc || undefined,
      });
      if (res.code === 200) {
        setCategoryTree((prev) =>
          updateNodeInTree(prev, id, { name, code, description: desc }),
        );
        toast.success(t("asset.categoryUpdated"));
        fetchAssetLibraryCategories();
      } else {
        toast.error(res.message || t("asset.updateCategoryFailed"));
      }
    } catch (error: any) {
      console.error("[AssetLibraryPage] Update category failed:", error);
      toast.error(
        error?.response?.data?.message || error?.message || t("asset.updateCategoryFailed"),
      );
    }
  }

  async function handleAddSubCategory(
    catId: string,
    name: string,
    code: string,
    type: string,
    desc: string,
  ) {
    try {
      const res = await createAssetCategoryApi({
        name,
        code,
        type,
        parentId: catId,
        description: desc || undefined,
      });
      if (res.code === 200) {
        const typeLabel = type === "line_type" ? t("asset.lineType") : t("asset.equipmentType");
        toast.success(t("asset.subTypeCreatedWithName", { type: typeLabel, name }));
        fetchAssetLibraryCategories();
      } else {
        toast.error(res.message || t("asset.createSubTypeFailed"));
      }
    } catch (error: any) {
      console.error("[AssetLibraryPage] Create sub category failed:", error);
      toast.error(
        error?.response?.data?.message || error?.message || t("asset.createSubTypeFailed"),
      );
    }
  }

  async function handleEditSubCategory(
    catId: string,
    subId: string,
    name: string,
    code: string,
    type: string,
    desc: string,
  ) {
    try {
      const res = await updateAssetCategoryApi({
        id: subId,
        name,
        code,
        description: desc || undefined,
      });
      if (res.code === 200) {
        setCategoryTree((prev) =>
          updateNodeInTree(prev, subId, { name, code, description: desc }),
        );
        toast.success(t("asset.subTypeUpdated"));
        fetchAssetLibraryCategories();
      } else {
        toast.error(res.message || t("asset.updateSubTypeFailed"));
      }
    } catch (error: any) {
      console.error("[AssetLibraryPage] Update sub category failed:", error);
      toast.error(
        error?.response?.data?.message || error?.message || t("asset.updateSubTypeFailed"),
      );
    }
  }

  function findNodeById(
    tree: CategoryNode[],
    nodeId: string,
  ): CategoryNode | undefined {
    for (const node of tree) {
      if (node.id === nodeId) return node;
      if (node.children.length > 0) {
        const found = findNodeById(node.children, nodeId);
        if (found) return found;
      }
    }
    return undefined;
  }

  function updateNodeInTree(
    tree: CategoryNode[],
    nodeId: string,
    updates: Partial<CategoryNode>,
  ): CategoryNode[] {
    return tree.map((node) => {
      if (node.id === nodeId) {
        return { ...node, ...updates };
      }
      if (node.children.length > 0) {
        return {
          ...node,
          children: updateNodeInTree(node.children, nodeId, updates),
        };
      }
      return node;
    });
  }

  function addChildToNode(
    tree: CategoryNode[],
    parentId: string,
    child: CategoryNode,
  ): CategoryNode[] {
    return tree.map((node) => {
      if (node.id === parentId) {
        return { ...node, children: [...node.children, child] };
      }
      if (node.children.length > 0) {
        return {
          ...node,
          children: addChildToNode(node.children, parentId, child),
        };
      }
      return node;
    });
  }

  function removeNodeFromTree(
    tree: CategoryNode[],
    nodeId: string,
  ): CategoryNode[] {
    return tree
      .filter((node) => node.id !== nodeId)
      .map((node) => ({
        ...node,
        children:
          node.children.length > 0
            ? removeNodeFromTree(node.children, nodeId)
            : node.children,
      }));
  }

  const currentCat = findNodeById(categoryTree, selectedCat);

  const activeFilterCount =
    (selectedProcessNode ? 1 : 0) +
    (selectedType ? 1 : 0) +
    (selectedStatus !== "all" ? 1 : 0);

  const filteredItems = useMemo(() => {
    if (!currentCat) return [];

    const getAllItemsFromNode = (node: CategoryNode): CategoryNode[] => {
      const items: CategoryNode[] = [];
      // 只有模型节点（line_model / equipment_model）是资产卡片；
      // 分类节点（process / line_type / equipment_type）被删空后同样没有子节点，不能当资产渲染
      if (node.type === "line_model" || node.type === "equipment_model") {
        items.push(node);
      }
      node.children?.forEach((child) => {
        items.push(...getAllItemsFromNode(child));
      });
      return items;
    };

    let allItems: CategoryNode[] = [];

    if (selectedSubCat) {
      const subNode = findNodeById(categoryTree, selectedSubCat);
      if (subNode) {
        allItems = getAllItemsFromNode(subNode);
      }
    } else {
      allItems = getAllItemsFromNode(currentCat);
    }

    return allItems.filter((item) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(q);
    });
  }, [currentCat, selectedSubCat, searchQuery, selectedStatus, categoryTree]);

  function toggleSub(id: string) {
    setExpandedSubs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function selectProcess(processName: string) {
    setSelectedProcessNode(processName);

    getAssetsByFilterParams(processName, null, null);
  }

  function selectType(type: string) {
    setSelectedType(type);
    getAssetsByFilterParams(null, type, null);
  }

  function selectStatus(status: AssetStatus | "all") {
    setSelectedStatus(status);
    getAssetsByFilterParams(null, null, status);
  }

  function clearAllFilters() {
    setSelectedProcessNode("");
    setSelectedType("");
    setSelectedStatus("all");
    setSearchQuery("");
    fetchAssetLibraryCategories();
  }

  // ── Batch selection handlers ────────────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  }

  function enterSelectMode() {
    setSelectMode(true);
    setSelectedAsset(null);
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  /** 获取节点的状态（兼容 status 在顶层或 detail 内的情况） */
  function getNodeStatus(node: CategoryNode): string {
    const raw = node.status || node.detail?.status || "";
    return typeof raw === "string" ? raw.toLowerCase() : "";
  }

  /** Find all nodes across all categories by IDs */
  function findAssetsByIds(ids: Set<string>): CategoryNode[] {
    const result: CategoryNode[] = [];

    const searchTree = (tree: CategoryNode[]) => {
      for (const node of tree) {
        if (ids.has(node.id)) {
          result.push(node);
        }
        if (node.children.length > 0) {
          searchTree(node.children);
        }
      }
    };

    searchTree(categoryTree);
    return result;
  }

  /** Execute batch enable/disable — 调用后端 API */
  async function executeBatchToggle(enableIds: string[], disableIds: string[]) {
    const allIds = [...enableIds, ...disableIds];
    const assets = findAssetsByIds(new Set(allIds));

    let successCount = 0;
    const failList: { id: string; reason: string }[] = [];

    try {
      // ── 批量启用 ──
      if (enableIds.length > 0) {
        const enableAssets = assets.filter((a) => enableIds.includes(a.id));
        // 按 asset_type 分组，取 detail.id
        const lineIds = enableAssets
          .filter((a) => toFrontendAssetType(a.type) === "line")
          .map((a) => getDetailIdAsString(a))
          .filter((id): id is string => id !== null);
        const equipIds = enableAssets
          .filter((a) => toFrontendAssetType(a.type) === "equipment")
          .map((a) => getDetailIdAsString(a))
          .filter((id): id is string => id !== null);

        if (lineIds.length > 0) {
          try {
            const res = await batchEnableAssetApi("line", lineIds);
            if (res.code === 200) {
              successCount += Array.isArray(res.data)
                ? res.data.length
                : lineIds.length;
            } else {
              failList.push(
                ...lineIds.map((id) => ({
                  id: String(id),
                  reason: res.message || t("asset.enableFailed"),
                })),
              );
            }
          } catch (e: any) {
            failList.push(
              ...lineIds.map((id) => ({
                id: String(id),
                reason: e?.message || t("common.networkError"),
              })),
            );
          }
        }
        if (equipIds.length > 0) {
          try {
            const res = await batchEnableAssetApi("equipment", equipIds);
            if (res.code === 200) {
              successCount += Array.isArray(res.data)
                ? res.data.length
                : equipIds.length;
            } else {
              failList.push(
                ...equipIds.map((id) => ({
                  id: String(id),
                  reason: res.message || t("asset.enableFailed"),
                })),
              );
            }
          } catch (e: any) {
            failList.push(
              ...equipIds.map((id) => ({
                id: String(id),
                reason: e?.message || t("common.networkError"),
              })),
            );
          }
        }
      }

      // ── 批量禁用 ──
      if (disableIds.length > 0) {
        const disableAssets = assets.filter((a) => disableIds.includes(a.id));
        const lineIds = disableAssets
          .filter((a) => toFrontendAssetType(a.type) === "line")
          .map((a) => getDetailIdAsString(a))
          .filter((id): id is string => id !== null);
        const equipIds = disableAssets
          .filter((a) => toFrontendAssetType(a.type) === "equipment")
          .map((a) => getDetailIdAsString(a))
          .filter((id): id is string => id !== null);

        if (lineIds.length > 0) {
          try {
            const res = await batchDisableAssetApi("line", lineIds);
            if (res.code === 200) {
              successCount += Array.isArray(res.data)
                ? res.data.length
                : lineIds.length;
            } else {
              failList.push(
                ...lineIds.map((id) => ({
                  id: String(id),
                  reason: res.message || t("asset.disableFailed"),
                })),
              );
            }
          } catch (e: any) {
            failList.push(
              ...lineIds.map((id) => ({
                id: String(id),
                reason: e?.message || t("common.networkError"),
              })),
            );
          }
        }
        if (equipIds.length > 0) {
          try {
            const res = await batchDisableAssetApi("equipment", equipIds);
            if (res.code === 200) {
              successCount += Array.isArray(res.data)
                ? res.data.length
                : equipIds.length;
            } else {
              failList.push(
                ...equipIds.map((id) => ({
                  id: String(id),
                  reason: res.message || t("asset.disableFailed"),
                })),
              );
            }
          } catch (e: any) {
            failList.push(
              ...equipIds.map((id) => ({
                id: String(id),
                reason: e?.message || t("common.networkError"),
              })),
            );
          }
        }
      }

      // 成功的部分更新本地树状态
      const succeededEnableIds = enableIds.filter(
        (id) => !failList.some((f) => f.id === id),
      );
      const succeededDisableIds = disableIds.filter(
        (id) => !failList.some((f) => f.id === id),
      );

      setCategoryTree((prev) => {
        let next = [...prev];
        for (const id of succeededEnableIds) {
          next = updateNodeInTree(next, id, { status: "active" });
        }
        for (const id of succeededDisableIds) {
          next = updateNodeInTree(next, id, { status: "inactive" });
        }
        return next;
      });

      setBatchResult({
        type: "toggle",
        success: successCount,
        fail: failList,
      });
    } catch (error) {
      console.error("[AssetLibraryPage] Batch toggle error:", error);
      setBatchResult({
        type: "toggle",
        success: successCount,
        fail: failList,
      });
    }

    setSelectedIds(new Set());
    setBatchConfirm(null);
    // 刷新列表确保数据一致
    fetchAssetLibraryCategories();
  }

  /** Validate and prepare batch delete — 必须遵循状态-操作映射 */
  function prepareBatchDelete() {
    const assets = findAssetsByIds(selectedIds);
    const deleteIds: string[] = [];
    const blockedIds: { id: string; reason: string }[] = [];
    for (const a of assets) {
      const status = getNodeStatus(a);
      // 草稿: 可删除
      if (status === "draft") {
        deleteIds.push(a.id);
        continue;
      }
      // 禁用: 被项目引用的不可删除
      if (status === "inactive") {
        if (a.referencedByProjects && a.referencedByProjects > 0) {
          blockedIds.push({
            id: a.id,
            reason: t("asset.referencedWarning", { count: a.referencedByProjects }),
          });
        } else {
          deleteIds.push(a.id);
        }
        continue;
      }
      // 激活: 必须先禁用
      if (status === "active") {
        blockedIds.push({
          id: a.id,
          reason: t("asset.activateWarning"),
        });
        continue;
      }
      // 归档: 只有管理员可操作
      if (status === "archived") {
        blockedIds.push({ id: a.id, reason: t("asset.archivePermission") });
        continue;
      }
    }
    setBatchConfirm({
      type: "delete",
      enableIds: [],
      disableIds: [],
      deleteIds,
      blockedIds,
    });
  }

  /** Remove nodes from tree by IDs */
  function removeNodesFromTree(
    tree: CategoryNode[],
    ids: Set<string>,
  ): CategoryNode[] {
    return tree
      .filter((node) => !ids.has(node.id))
      .map((node) => ({
        ...node,
        children:
          node.children.length > 0
            ? removeNodesFromTree(node.children, ids)
            : node.children,
      }));
  }

  /** Execute batch delete */
  async function executeBatchDelete(ids: string[]) {
    setBatchConfirm(null);
    if (ids.length === 0) return;
    // 后端批删为整批事务：任一节点校验失败即全部回滚，要么全成功要么全失败
    try {
      const res = await batchDeleteAssetCategoryApi(ids);
      if (res.code === 200) {
        const deletedIds: string[] = Array.isArray(res.data) ? res.data : ids;
        setCategoryTree((prev) => removeNodesFromTree(prev, new Set(deletedIds)));
        setSelectedAsset((prev) => (prev && deletedIds.includes(prev.id) ? null : prev));
        setBatchResult({ type: "delete", success: deletedIds.length, fail: [] });
      } else {
        setBatchResult({
          type: "delete",
          success: 0,
          fail: findAssetsByIds(new Set(ids)).map((a) => ({
            id: a.id,
            name: a.name,
            reason: res.message || t("common.unknownError"),
          })),
        });
      }
    } catch (error: any) {
      console.error("[AssetLibraryPage] Batch delete error:", error);
      setBatchResult({
        type: "delete",
        success: 0,
        fail: findAssetsByIds(new Set(ids)).map((a) => ({
          id: a.id,
          name: a.name,
          reason:
            error?.response?.data?.message ||
            error?.message ||
            t("common.networkError"),
        })),
      });
    }
    setSelectedIds(new Set());
    // 刷新列表确保数据一致
    fetchAssetLibraryCategories();
  }

  /** Handle upload success */
  const handleUploadSuccess = () => {
    setIsUploadDialogOpen(false);
    fetchAssetLibraryCategories();
  };

  /** Batch download */
  function handleBatchDownload() {
    // const names = findAssetsByIds(selectedIds).map((a) => a.name);
    const ids = Array.from(selectedIds);
    const types = findAssetsByIds(selectedIds).map((a) => a.type);
    console.log("handleBatchDownload:", ids);

    let hasMixedTypes = false;
    if (types.length > 0) {
      hasMixedTypes = types.some((t) => t !== types[0]);
    }
    if (hasMixedTypes) {
      toast.error(t("asset.sameTypeRequired"));
      return;
    }
    const type = types[0].includes("line") ? "line" : "equipment";
    bacthDownloadAsset(type, ids);
  }

  const bacthDownloadAsset = async (type: string, ids: string[]) => {
    try {
      // 直接使用 fetch 获取二进制数据，以便获取响应头
      const params = {
        ids: ids,
      };
      const axiosInstance = axios.create({
        timeout: 600000,
        responseType: "blob", // 关键：设置响应类型为 blob，避免 JSON 解析损坏二进制数据
      });
      const response = await axiosInstance.post(
        `${baseUrl}/v1/asset-download/${type}/batch-download`,
        params,
      );
      if (response.status !== 200) {
        throw new Error("HTTP error!");
      }

      // 从响应头获取文件名
      let filename =
        type === "line" ? "Line_Library.zip" : "Equipment_Library.zip";
      const contentDisposition = response.headers["content-disposition"];
      if (contentDisposition) {
        console.log("contentDisposition:", contentDisposition);
        const match = contentDisposition.match(
          /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/,
        );
        if (match && match[1]) {
          filename = match[1].replace(/['"]/g, "");
        }
      }

      // 获取 Blob 数据（axios 已返回 Blob 对象）
      const blob = response.data;

      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setBatchResult({
        type: "download",
        success: ids.length,
        fail: [],
      });
    } catch (error) {
      console.error("[downloadAssetFile] Error:", error);
      toast.error(t("asset.downloadFailMessage", { message: (error as Error).message }));
    }
  };

  /** 拖拽移动叶子节点 */
  const handleMoveLeafNode = async (nodeId: string, newParentId: string) => {
    try {
      const res = await moveAssetCategoryApi({ id: nodeId, newParentId });
      if (res.code === 200) {
        toast.success(t("asset.moveSuccess"));
        fetchAssetLibraryCategories();
      } else {
        toast.error(res.message || t("asset.moveFailed", { message: "" }));
      }
    } catch (error: any) {
      toast.error(
        error?.response?.data?.message || t("asset.moveFailed", { message: (error as Error).message }),
      );
    }
  };

  const VALID_DROP_PARENT: Record<string, string> = {
    line_model: "line_type",
    equipment_model: "equipment_type",
  };

  /** Recursive Tree Node Component */
  const TreeNode: React.FC<{
    node: CategoryNode;
    parentCatId: string;
    level: number;
  }> = ({ node, parentCatId, level }) => {
    const plPadding = 7 + (level - 1) * 12;
    const isLeaf = node.children.length === 0;
    const isDropTarget = node.type === "line_type" || node.type === "equipment_type";
    const isDragOver = dragOverNodeId === node.id;

    return (
      <div key={node.id}>
        {/* ── Node row ── */}
        <div className="group relative">
          <div
            draggable={isLeaf}
            onDragStart={(e) => {
              if (!isLeaf) { e.preventDefault(); return; }
              e.dataTransfer.setData("application/asset-node", JSON.stringify({ id: node.id, type: node.type }));
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragEnd={() => {
              setDragOverNodeId(null);
            }}
            onDragOver={(e) => {
              if (!isDropTarget) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            onDragEnter={(e) => {
              if (!isDropTarget) return;
              e.preventDefault();
              setDragOverNodeId(node.id);
            }}
            onDragLeave={(e) => {
              if (!isDropTarget) return;
              const related = e.relatedTarget as Node | null;
              if (related && (e.currentTarget as Node).contains(related)) return;
              setDragOverNodeId(null);
            }}
            onDrop={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOverNodeId(null);
              if (!isDropTarget) return;
              const raw = e.dataTransfer.getData("application/asset-node");
              if (!raw) return;
              try {
                const data = JSON.parse(raw);
                const expectedParentType = VALID_DROP_PARENT[data.type];
                if (expectedParentType !== node.type) {
                  toast.error(t("asset.moveInvalidTarget"));
                  return;
                }
                await handleMoveLeafNode(data.id, node.id);
              } catch (err) {
                console.error("[Drop error]", err);
              }
            }}
            onClick={() => {
              if (node.children.length > 0) {
                toggleSub(node.id);
              }
              setSelectedSubCat(selectedSubCat === node.id ? null : node.id);
            }}
            className={`w-full flex items-center gap-2 pr-3 py-2 text-left text-[11px] transition-colors select-none ${
              selectedSubCat === node.id
                ? "text-slate-200 bg-[var(--c-0e243a)]"
                : "text-slate-500 hover:text-slate-300 hover:bg-[var(--c-0d1e2e)]"
            } ${isLeaf ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${
              isDragOver ? "ring-2 ring-blue-400 bg-blue-500/25 rounded" : ""
            }`}
            style={{ marginLeft: `${plPadding}px`, boxSizing: "border-box" }}
          >
            {node.children.length > 0 && (
              <ChevronDown
                size={10}
                className={`transition-transform flex-shrink-0 ${expandedSubs.has(node.id) ? "" : "-rotate-90"}`}
              />
            )}
            {node.children.length === 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 opacity-60" />
            )}
            <span className="flex-1 truncate">{L(node, 'name', 'nameEn')}</span>
            {node.children.length > 0 && (
              <span className="text-[10px] text-slate-600">
                {node.children.length}
              </span>
            )}
          </div>
          {/* Hover actions for all nodes */}
          <div className="hidden group-hover:flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-0.5 bg-[var(--c-07111e)]/90 pl-1">
            {node.children.length > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setEditSubTarget({ catId: parentCatId, sub: node });
                  setShowSubDialog(true);
                }}
                className="text-slate-500 hover:text-blue-400 p-0.5 rounded transition-colors"
                title={t("common.edit")}
              >
                <Edit2 size={10} />
              </button>
            )}
            {node.children.length === 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedAsset(node);
                  setShowEditModal(true);
                }}
                className="text-slate-500 hover:text-blue-400 p-0.5 rounded transition-colors"
                title={t("asset.editInfo")}
              >
                <Edit2 size={10} />
              </button>
            )}
            {node.children.length === 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDeleteAsset({
                    id: node.id,
                    name: L(node, 'name', 'nameEn'),
                    loading: false,
                  });
                }}
                className="text-slate-500 hover:text-red-400 p-0.5 rounded transition-colors"
                title={t("common.delete")}
              >
                <Trash2 size={10} />
              </button>
            )}
          </div>
        </div>

        {/* ── Children nodes ── */}
        {node.children.length > 0 && expandedSubs.has(node.id) && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.id}
                node={child}
                parentCatId={parentCatId}
                level={level + 1}
              />
            ))}
          </div>
        )}
      </div>
    );
  };

  const convertToTree = (assets: CategoryNode[]): CategoryNode[] => {
    const processNode = (node: CategoryNode): CategoryNode => {
      const children = node.children.map(processNode);
      const count = children.reduce(
        (sum, child) => sum + (child.count || 0) + 1,
        0,
      );
      return {
        ...node,
        // 后端 status 是大写 (ACTIVE/INACTIVE/DRAFT/ARCHIVED)，前端统一转小写
        // status 可能在顶层 node.status 或 node.detail.status
        status:
          (node.status || node.detail?.status || "").toLowerCase() || undefined,
        count,
        children,
      };
    };

    return assets.map(processNode);
  };

  // 使用useRef确保只调用一次
  const hasCalledRef = React.useRef(false);

  useEffect(() => {
    if (!hasCalledRef.current) {
      fetchAssetLibraryCategories();
      hasCalledRef.current = true;
    }
  }, []);

  const fetchAssetLibraryCategories = async () => {
    let params: any = {};
    const res = await getAssetListApi(params);
    if (res.code == 200) {
      const resData = res.data || [];
      const categoryTree = convertToTree(resData);
      console.log(categoryTree);
      setCategoryTree(categoryTree);

      // 找到第一层 所有 type = "process"的 node 只要 name属性
      const processNode = categoryTree
        .filter((node) => node.type === "process")
        .map((node) => node.name);
      setProcessNode(processNode || []);
    }
  };

  const getAssetsByFilterParams = async (
    processName: string | null,
    type: string | null,
    status: AssetStatus | "all" | null,
  ) => {
    let params: any = {
      processName:
        processName !== null ? processName : selectedProcessNode || "",
      type: type !== null ? type : selectedType || "",
    };
    if (status !== "all" && status !== null) {
      params.status = status;
    }
    const res = await getFilterAssetCategoryTreeApi(params);
    if (res.code == 200) {
      const resData = res.data || [];
      const categoryTree = convertToTree(resData);
      console.log(categoryTree);
      setCategoryTree(categoryTree);
    }
  };

  // 删除叶子节点（line_model / equipment_model）
  const handleDeleteAsset = async () => {
    if (!confirmDeleteAsset) return;
    const { id } = confirmDeleteAsset;
    setConfirmDeleteAsset({ ...confirmDeleteAsset, loading: true });
    try {
      const res = await deleteAssetCategoryApi(id);
      if (res.code === 200) {
        // 从本地树中移除该节点
        setCategoryTree((prev) => removeNodeFromTree(prev, id));
        // 清空选中状态
        setSelectedAsset(null);
        setConfirmDeleteAsset(null);
        // 刷新资产列表
        fetchAssetLibraryCategories();
      } else {
        alert(t("asset.deleteFailMessage", { message: res.message || t("common.unknownError") }));
        setConfirmDeleteAsset({ ...confirmDeleteAsset, loading: false });
      }
    } catch (error: any) {
      console.error("[AssetLibraryPage] Delete failed:", error);
      alert(
        t("asset.deleteFailMessage", { message: error?.response?.data?.message || error?.message || t("common.networkError") }),
      );
      setConfirmDeleteAsset({ ...confirmDeleteAsset, loading: false });
    }
  };

  // 激活单个资产（DRAFT/INACTIVE → ACTIVE）
  const handleEnableAsset = async (asset: CategoryNode) => {
    const assetType = toFrontendAssetType(asset.type);
    const detailId = getDetailIdAsString(asset);
    console.log("[AssetLibraryPage] handleEnableAsset:", {
      assetType,
      detailId,
      assetType_raw: asset.type,
      detail: asset.detail,
    });
    if (!detailId) {
      alert(t("asset.assetDetailIdFailed"));
      return;
    }
    try {
      const res = await enableAssetApi(assetType, detailId);
      console.log("[AssetLibraryPage] enableAssetApi response:", res);
      if (res.code === 200) {
        // 更新本地树状态
        setCategoryTree((prev) =>
          updateNodeInTree(prev, asset.id, { status: "active" }),
        );
        setSelectedAsset(null);
        // 刷新列表确保数据一致
        fetchAssetLibraryCategories();
      } else {
        alert(t("asset.activateFailMessage", { message: res.message || t("common.unknownError") }));
      }
    } catch (error: any) {
      console.error("[AssetLibraryPage] Enable failed:", error);
      alert(
        t("asset.activateFailMessage", { message: error?.response?.data?.message || error?.message || t("common.networkError") }),
      );
    }
  };

  // 归档单个资产（DRAFT/ACTIVE/INACTIVE → ARCHIVED）
  const handleArchiveAsset = async (asset: CategoryNode) => {
    const assetType = toFrontendAssetType(asset.type);
    const detailId = getDetailIdAsString(asset);
    console.log("[AssetLibraryPage] handleArchiveAsset:", {
      assetType,
      detailId,
      assetType_raw: asset.type,
      detail: asset.detail,
    });
    if (!detailId) {
      alert(t("asset.assetDetailIdFailed"));
      return;
    }
    try {
      const res = await archiveAssetApi(assetType, detailId);
      console.log("[AssetLibraryPage] archiveAssetApi response:", res);
      if (res.code === 200) {
        // 更新本地树状态
        setCategoryTree((prev) =>
          updateNodeInTree(prev, asset.id, { status: "archived" }),
        );
        setSelectedAsset(null);
        // 刷新列表确保数据一致
        fetchAssetLibraryCategories();
      } else {
        alert(t("asset.archiveFailMessage", { message: res.message || t("common.unknownError") }));
      }
    } catch (error: any) {
      console.error("[AssetLibraryPage] Archive failed:", error);
      alert(
        t("asset.archiveFailMessage", { message: error?.response?.data?.message || error?.message || t("common.networkError") }),
      );
    }
  };

  // 更新资产缩略图
  const handleUpdateThumbnail = async (asset: CategoryNode, file: File) => {
    const type = toFrontendAssetType(asset.type);
    const categoryId = asset.id;
    if (!categoryId) {
      alert(t("asset.categoryIdFailed"));
      return;
    }
    try {
      const res = await updateThumbnailApi(type, categoryId, file);
      if (res.code === 200) {
        // 先用返回的新路径立即更新本地树和选中资产
        const newThumbnailPath =
          res.data?.thumbnail_path || res.data?.thumbnailPath || "";
        if (newThumbnailPath) {
          setCategoryTree((prev) =>
            updateNodeInTree(prev, asset.id, {
              thumbnailPath: newThumbnailPath,
            }),
          );
          // 同步更新右侧详情面板的选中资产数据
          setSelectedAsset((prev) => {
            if (!prev) return prev;
            if (prev.detail) {
              return {
                ...prev,
                detail: { ...prev.detail, thumbnailPath: newThumbnailPath },
              };
            }
            return { ...prev, thumbnailPath: newThumbnailPath };
          });
        }
        // 刷新列表确保数据一致
        await fetchAssetLibraryCategories();
        // 刷新后从新树中找到更新后的节点，重新设置 selectedAsset
        setSelectedAsset((prev) => {
          if (!prev) return prev;
          const updatedNode = findNodeById(categoryTree, prev.id);
          return updatedNode || prev;
        });
      } else {
        alert(t("asset.thumbnailUpdateFailMessage", { message: res.message || t("common.unknownError") }));
      }
    } catch (error: any) {
      console.error("[AssetLibraryPage] Update thumbnail failed:", error);
      alert(
        t("asset.thumbnailUpdateFailMessage", { message: error?.response?.data?.message || error?.message || t("common.networkError") }),
      );
    }
  };

  /** 将 CategoryNode.type 映射为后端 asset_type 参数 */
  function toFrontendAssetType(t: string): "line" | "equipment" {
    if (t === "line_model" || t?.includes("line")) return "line";
    return "equipment";
  }

  /** 获取 detail.id 的字符串形式（Snowflake ID 用 string 避免精度丢失） */
  function getDetailIdAsString(node: CategoryNode): string | null {
    const rawId = node.detail?.id;
    if (rawId == null) return null;
    return String(rawId);
  }

  // 查看Asset模型详细
  const onViewAsset = (asset: CategoryNode) => {
    const id = asset.id || "";
    const type = asset.type || "";
    const rootUsdPath = asset.detail?.rootUsdPath || "";
    navigate(`/asset-library/editor/${id}`);
  };

  return (
    <div className="flex h-screen bg-[var(--c-07111e)] text-slate-100 overflow-hidden asset-library">
      {/* Top Header */}
      <div className="absolute top-0 left-0 right-0 h-11 bg-[var(--c-07111e)] border-b border-[var(--c-142235)] flex items-center px-4 z-10">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-slate-400 hover:text-slate-200 text-xs transition-colors mr-4"
        >
          <ChevronLeft size={14} /> {t("common.home")}
        </button>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center">
            <Layers3 size={11} />
          </div>
          <span className="text-xs font-semibold tracking-widest text-blue-300 uppercase">
            {t("home.appTitle")}
          </span>
        </div>
        <div className="ml-4 flex items-center gap-1.5 text-[11px] text-slate-500">
          <span
            className="hover:text-slate-300 cursor-pointer transition-colors"
            onClick={() => navigate("/")}
          >
            {t("common.home")}
          </span>
          <ChevronRight size={11} />
          <span
            className="hover:text-slate-300 cursor-pointer transition-colors"
            onClick={() => navigate("/asset-library")}
          >
            {t("asset.title")}
          </span>
          {currentCat && (
            <>
              <ChevronRight size={11} />
              <span className="text-blue-400">{L(currentCat, 'name', 'nameEn')}</span>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <LanguageToggle />
          {/* <button
            // onClick={() => navigate("/asset-library/lifecycle")}
            className="flex items-center gap-1.5 text-xs border border-[var(--c-1e3a55)] text-slate-400 hover:text-slate-200 hover:border-[var(--c-2a4a6a)] px-3 py-1.5 rounded-md transition-colors"
          >
            <History size={12} /> Lifecycle
          </button>
          <button
            // onClick={() => navigate('/asset-library/asset-versions/irb-4600')}
            className="flex items-center gap-1.5 text-xs border border-[var(--c-1e3a55)] text-slate-400 hover:text-slate-200 hover:border-[var(--c-2a4a6a)] px-3 py-1.5 rounded-md transition-colors"
          >
            <GitBranch size={12} /> Version Mgmt
          </button> */}
          <button
            className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md transition-colors"
            onClick={() => setIsUploadDialogOpen(true)}
          >
            <Plus size={12} /> {t("asset.uploadAsset")}
          </button>
        </div>
      </div>

      <div className="flex w-full pt-11">
        {/* Left Category Tree */}
        <aside className="w-60 bg-[var(--c-07111e)] border-r border-[var(--c-142235)] flex flex-col flex-shrink-0 overflow-hidden">
          {/* ── Search + Filter combo ── */}
          <div className="p-3 border-b border-[var(--c-142235)] space-y-2">
            {/* Input row */}
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
                />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t("asset.searchAssets")}
                  className="w-full bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded-md pl-7 pr-3 py-1.5 text-[11px] text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
              {/* Filter toggle button */}
              <button
                ref={filterButtonRef}
                onClick={() => setFilterOpen(true)}
                className={`relative flex items-center justify-center w-7 h-7 rounded border transition-colors flex-shrink-0 ${
                  activeFilterCount > 0
                    ? "border-blue-500/60 bg-blue-600/15 text-blue-400"
                    : "border-[var(--c-1e3a55)] text-slate-500 hover:text-slate-200 hover:border-[var(--c-2a4a6a)]"
                }`}
                title={t("common.filter")}
              >
                <SlidersHorizontal size={13} />
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-blue-500 text-white text-[8px] flex items-center justify-center font-bold leading-none">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Category Tree */}
          <div className="flex-1 overflow-y-auto leftTree-content">
            {/* ── Tree header with Add button ── */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--c-142235)] sticky top-0 bg-[var(--c-07111e)] z-10">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {t("asset.categories")}
              </span>
              <button
                onClick={() => {
                  setEditCatTarget(null);
                  setShowCatDialog(true);
                }}
                className="text-slate-500 hover:text-blue-400 p-0.5 rounded transition-colors"
                title={t("asset.addCategory")}
              >
                <Plus size={13} />
              </button>
            </div>
            {categoryTree.map((cat) => (
              <div key={cat.id}>
                {/* ── Category row ── */}
                <div className="group relative">
                  <button
                    onClick={() => {
                      setSelectedCat(cat.id);
                      setSelectedSubCat(null);
                      setSelectedType("");
                    }}
                    className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-[11px] transition-colors ${
                      selectedCat === cat.id
                        ? "bg-blue-600/15 text-blue-300 border-l-2 border-blue-500"
                        : "text-slate-400 hover:text-slate-200 hover:bg-[var(--c-0e243a)] border-l-2 border-transparent"
                    }`}
                  >
                    <Package
                      size={12}
                      className={
                        selectedCat === cat.id
                          ? "text-blue-400"
                          : "text-slate-600"
                      }
                    />
                    <span className="flex-1 font-medium truncate">
                      {L(cat, 'name', 'nameEn')}
                    </span>
                    <span className="text-[10px] text-slate-600 bg-[var(--c-071526)] px-1.5 py-0.5 rounded">
                      {cat.count}
                    </span>
                  </button>
                  {/* Hover actions */}
                  <div className="hidden group-hover:flex absolute right-2 top-1/2 -translate-y-1/2 items-center gap-0.5 bg-[var(--c-07111e)]/90 pl-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditCatTarget(cat);
                        setShowCatDialog(true);
                      }}
                      className="text-slate-500 hover:text-blue-400 p-0.5 rounded transition-colors"
                      title={t("asset.editCategory")}
                    >
                      <Edit2 size={10} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditSubTarget({ catId: cat.id });
                        setShowSubDialog(true);
                      }}
                      className="text-slate-500 hover:text-green-400 p-0.5 rounded transition-colors"
                      title={t("asset.addSubcategory")}
                    >
                      <Plus size={10} />
                    </button>
                  </div>
                </div>

                {selectedCat === cat.id &&
                  (() => {
                    console.log(
                      `[DEBUG] Rendering children for ${cat.name}:`,
                      cat.children,
                    );
                    return cat.children.map((sub) => (
                      <TreeNode
                        key={sub.id}
                        node={sub}
                        parentCatId={cat.id}
                        level={1}
                      />
                    ));
                  })()}
              </div>
            ))}
          </div>
        </aside>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="h-11 bg-[var(--c-071526)] border-b border-[var(--c-142235)] flex items-center px-4 gap-3 flex-shrink-0">
            <span className="text-xs text-slate-400">
              {L(currentCat, 'name', 'nameEn')} —
              <span className="text-slate-200 ml-1">
                {filteredItems.length} {t("asset.items")}
                {selectedSubCat
                  ? ` ${t("asset.inCategory")} ${L(currentCat?.children.find((s: { id: any }) => s.id === selectedSubCat), 'name', 'nameEn')}`
                  : ""}
                {selectedType ? ` · ${selectedType} ${t("asset.typeFilter")}` : ""}
              </span>
            </span>
            <div className="ml-auto flex items-center gap-2">
              {!selectMode && (
                <button
                  onClick={enterSelectMode}
                  className="flex items-center gap-1.5 text-xs border border-[var(--c-1e3a55)] text-slate-400 hover:text-slate-200 hover:border-[var(--c-2a4a6a)] px-2.5 py-1.5 rounded-md transition-colors"
                >
                  <CheckSquare size={13} /> {t("asset.batchSelect")}
                </button>
              )}
              <div className="flex border border-[var(--c-1e3a55)] rounded overflow-hidden">
                <button
                  onClick={() => setViewMode("grid")}
                  className={`px-2 py-1 transition-colors ${viewMode === "grid" ? "bg-[var(--c-1e3a55)] text-blue-300" : "text-slate-500 hover:text-slate-300"}`}
                >
                  <Grid3X3 size={13} />
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={`px-2 py-1 transition-colors ${viewMode === "list" ? "bg-[var(--c-1e3a55)] text-blue-300" : "text-slate-500 hover:text-slate-300"}`}
                >
                  <List size={13} />
                </button>
              </div>
            </div>
          </div>

          {/* Batch Toolbar (shown when in select mode) */}
          {selectMode && (
            <div className="h-10 bg-blue-600/10 border-b border-blue-500/30 flex items-center px-4 gap-3 flex-shrink-0">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={
                    selectMode &&
                    selectedIds.size === filteredItems.length &&
                    filteredItems.length > 0
                  }
                  onChange={toggleSelectAll}
                  className="w-3 h-3 rounded border-slate-500 bg-transparent accent-blue-500"
                />
                <span className="text-[11px] text-blue-300 font-medium">
                  {selectedIds.size} {t("asset.selected")}
                </span>
              </label>
              <div className="w-px h-4 bg-blue-500/30" />
              <button
                onClick={handleBatchDownload}
                disabled={selectedIds.size === 0}
                className="text-[11px] text-slate-300 hover:text-white bg-blue-600/20 hover:bg-blue-600/40 disabled:opacity-30 disabled:cursor-not-allowed px-2.5 py-1 rounded transition-colors"
              >
                <Download size={11} className="inline mr-1" />
                {t("asset.batchDownload")}
              </button>
              <button
                onClick={() => {
                  const assets = findAssetsByIds(selectedIds);
                  const enableIds = assets
                    .filter(
                      (a) =>
                        getNodeStatus(a) === "inactive" ||
                        getNodeStatus(a) === "draft",
                    )
                    .map((a) => a.id);
                  if (enableIds.length === 0) return;
                  setBatchConfirm({
                    type: "toggle",
                    enableIds,
                    disableIds: [],
                    deleteIds: [],
                    blockedIds: [],
                  });
                }}
                disabled={
                  !findAssetsByIds(selectedIds).some(
                    (a) =>
                      getNodeStatus(a) === "inactive" ||
                      getNodeStatus(a) === "draft",
                  )
                }
                className="text-[11px] text-white font-bold hover:text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 px-2.5 py-1 rounded transition-colors shadow-sm border border-blue-400/50 disabled:border-slate-600"
              >
                <Check size={11} className="inline mr-1" />
                {t("asset.batchEnable")}
              </button>
              <button
                onClick={() => {
                  const assets = findAssetsByIds(selectedIds);
                  const disableIds = assets
                    .filter((a) => getNodeStatus(a) === "active")
                    .map((a) => a.id);
                  if (disableIds.length === 0) return;
                  setBatchConfirm({
                    type: "toggle",
                    enableIds: [],
                    disableIds,
                    deleteIds: [],
                    blockedIds: [],
                  });
                }}
                disabled={
                  !findAssetsByIds(selectedIds).some(
                    (a) => getNodeStatus(a) === "active",
                  )
                }
                className="text-[11px] text-white font-bold hover:text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400 px-2.5 py-1 rounded transition-colors shadow-sm border border-amber-400/50 disabled:border-slate-600"
              >
                <SlidersHorizontal size={11} className="inline mr-1" />
                {t("asset.batchDisable")}
              </button>
              <button
                onClick={prepareBatchDelete}
                disabled={selectedIds.size === 0}
                className="text-[11px] text-red-300 hover:text-white bg-red-600/20 hover:bg-red-600/40 disabled:opacity-30 disabled:cursor-not-allowed px-2.5 py-1 rounded transition-colors"
              >
                <Trash2 size={11} className="inline mr-1" />
                {t("asset.batchDelete")}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={11} className="inline mr-1" />
                {t("common.clear")}
              </button>
              <button
                onClick={exitSelectMode}
                className="text-[11px] text-slate-300 hover:text-white bg-slate-600/30 hover:bg-slate-600/50 px-2.5 py-1 rounded transition-colors ml-auto"
              >
                {t("common.cancel")}
              </button>
            </div>
          )}

          {/* Asset Grid / List */}
          <div className="flex-1 p-5 asset-content">
            {filteredItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600">
                <Package size={48} strokeWidth={1} />
                <p className="text-sm mt-3">{t("asset.noAssets")}</p>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredItems.map((item) => (
                  <AssetCard
                    key={item.id}
                    item={item}
                    selected={selectedAsset?.id === item.id}
                    selectMode={selectMode}
                    isChecked={selectedIds.has(item.id)}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onClick={() => setSelectedAsset(item)}
                    onView={() => onViewAsset(item)}
                    // onCopy={() => setCopyingAsset(item)}
                  />
                ))}
                <div
                  className="bg-[var(--c-0b1d30)] border border-dashed border-[var(--c-1e3a55)] rounded-lg flex flex-col items-center justify-center h-44 cursor-pointer hover:border-blue-500/60 hover:bg-[var(--c-0e243a)] transition-all group"
                  onClick={() => navigate("/asset-library/new/editor")}
                >
                  <Plus
                    size={22}
                    className="text-slate-600 group-hover:text-blue-400 transition-colors"
                  />
                  <span className="text-[11px] text-slate-600 mt-2 group-hover:text-slate-400 transition-colors">
                    {t("asset.addAsset")}
                  </span>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                {filteredItems.map((item) => (
                  <AssetListRow
                    key={item.id}
                    item={item}
                    selected={selectedAsset?.id === item.id}
                    selectMode={selectMode}
                    isChecked={selectedIds.has(item.id)}
                    onToggleSelect={() => toggleSelect(item.id)}
                    onClick={() => setSelectedAsset(item)}
                    onEdit={() => {
                      setSelectedAsset(item);
                      setShowEditModal(true);
                    }}
                    onView={() => navigate(`/asset-library/${item.id}/editor`)}
                    // onCopy={() => setCopyingAsset(item)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Detail Panel */}
        <AssetDetailPanel
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onOpenEditor={(id) => navigate(`/asset-library/${id}/editor`)}
          onCopyAsset={(asset) => setCopyingAsset(asset)}
          onDeleteAsset={(asset) => {
            setConfirmDeleteAsset({
              id: asset.id,
              name: asset.name || asset.detail?.name || t("asset.thisAsset"),
              loading: false,
            });
          }}
          onEnableAsset={handleEnableAsset}
          onArchiveAsset={handleArchiveAsset}
          onUpdateThumbnail={handleUpdateThumbnail}
        />
      </div>

      {showEditModal && selectedAsset && (
        <AssetEditModal
          asset={selectedAsset}
          onClose={() => setShowEditModal(false)}
          onSaved={() => fetchAssetLibraryCategories()}
        />
      )}

      {copyingAsset && (
        <CopyAssetModal
          asset={copyingAsset}
          onClose={() => setCopyingAsset(null)}
        />
      )}

      {/* ── CRUD Dialogs ── */}
      {showCatDialog && (
        <CategoryDialog
          parentId={selectedCat || ""}
          target={editCatTarget}
          onSave={(parentId, name, code, desc) => {
            if (editCatTarget) {
              handleEditCategory(editCatTarget.id, name, code, desc);
            } else {
              handleAddCategory(parentId, name, code, desc);
            }
            setShowCatDialog(false);
            setEditCatTarget(null);
          }}
          onCancel={() => {
            setShowCatDialog(false);
            setEditCatTarget(null);
          }}
        />
      )}
      {showSubDialog && editSubTarget && (
        <SubCategoryDialog
          catId={editSubTarget.catId}
          target={editSubTarget.sub}
          onSave={(catId, name, code, type, desc) => {
            if (editSubTarget.sub) {
              handleEditSubCategory(
                catId,
                editSubTarget.sub.id,
                name,
                code,
                type,
                desc,
              );
            } else {
              handleAddSubCategory(catId, name, code, type, desc);
            }
            setShowSubDialog(false);
            setEditSubTarget(null);
          }}
          onCancel={() => {
            setShowSubDialog(false);
            setEditSubTarget(null);
          }}
        />
      )}
      {/* 叶子节点删除确认弹窗 */}
      {confirmDeleteAsset && (
        <ConfirmDialog
          title={t("asset.deleteAsset")}
          message={t("asset.deleteConfirmMessage", { name: confirmDeleteAsset.name })}
          confirmLabel={
            confirmDeleteAsset.loading ? t("asset.deleting") : t("common.confirmDelete")
          }
          confirmCls="bg-red-600 hover:bg-red-700"
          loading={confirmDeleteAsset.loading}
          onConfirm={handleDeleteAsset}
          onCancel={() => {
            if (!confirmDeleteAsset.loading) {
              setConfirmDeleteAsset(null);
            }
          }}
        />
      )}

      {/* ── Batch Operation Dialogs ── */}
      {batchConfirm?.type === "toggle" && (
        <ConfirmDialog
          title={t("asset.batchToggle")}
          message={
            batchConfirm.enableIds.length > 0 &&
            batchConfirm.disableIds.length > 0
              ? t("asset.batchToggleMessageBoth", { enableCount: batchConfirm.enableIds.length, disableCount: batchConfirm.disableIds.length })
              : batchConfirm.enableIds.length > 0
                ? t("asset.batchToggleMessageEnable", { count: batchConfirm.enableIds.length })
                : t("asset.batchToggleMessageDisable", { count: batchConfirm.disableIds.length })
          }
          confirmLabel={t("common.confirm")}
          confirmCls="bg-blue-600 hover:bg-blue-700"
          onConfirm={() =>
            executeBatchToggle(batchConfirm.enableIds, batchConfirm.disableIds)
          }
          onCancel={() => setBatchConfirm(null)}
        />
      )}
      {batchConfirm?.type === "delete" && (
        <BatchDeleteDialog
          deleteIds={batchConfirm.deleteIds}
          blockedIds={batchConfirm.blockedIds}
          onConfirm={() => executeBatchDelete(batchConfirm.deleteIds)}
          onCancel={() => setBatchConfirm(null)}
        />
      )}
      {batchResult && (
        <BatchResultDialog
          result={batchResult}
          onClose={() => setBatchResult(null)}
        />
      )}

      <FilterModal
        isOpen={filterOpen}
        onClose={() => setFilterOpen(false)}
        anchorEl={filterButtonRef.current}
        processOptions={processNode}
        selectedProcessNode={selectedProcessNode}
        selectedType={selectedType}
        selectedStatus={selectedStatus}
        activeFilterCount={activeFilterCount}
        searchQuery={searchQuery}
        onSelectProcess={selectProcess}
        onToggleType={selectType}
        onSetStatus={selectStatus}
        onClearAll={clearAllFilters}
      />

      <UploadAsset
        isOpen={isUploadDialogOpen}
        onClose={() => setIsUploadDialogOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </div>
  );
}

function AssetCard({
  item,
  selected,
  selectMode,
  isChecked,
  onToggleSelect,
  onClick,
  onView,
  onCopy,
}: {
  item: CategoryNode;
  selected: boolean;
  selectMode?: boolean;
  isChecked?: boolean;
  onToggleSelect?: () => void;
  onClick: () => void;
  onView: () => void;
  onCopy: () => void;
}) {
  const L = useLocalized();
  const statusCls = ASSET_STATUS_CLS[item.status] ?? ASSET_STATUS_CLS.active;
  const statusLabel = getStatusLabel(item.status);
  const versionCount = item.versions?.length ?? 0;
  return (
    <div
      onClick={onClick}
      className={`bg-[var(--c-0b1d30)] border rounded-lg overflow-hidden cursor-pointer transition-all group ${
        selected
          ? "border-blue-500 ring-1 ring-blue-500/30"
          : "border-[var(--c-142235)] hover:border-blue-500/40"
      } ${selectMode && isChecked ? "ring-1 ring-blue-500/30" : ""}`}
    >
      <div className="h-32 relative overflow-hidden bg-[var(--c-071526)]">
        {item.detail?.thumbnailPath || item.thumbnailPath ? (
          <img
            src={proxyMinioUrl(
              item.detail ? item.detail?.thumbnailPath : item.thumbnailPath,
            )}
            className="w-full h-full object-cover opacity-65 group-hover:opacity-85 transition-opacity duration-300"
          />
        ) : (
          <div className="w-full h-full bg-[var(--c-040d18)] flex items-center justify-center">
            <Layers3 size={32} className="text-slate-700" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--c-0b1d30)]/60 to-transparent" />
        {/* Select mode checkbox */}
        {selectMode && (
          <div
            className="absolute top-2 left-2 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              checked={!!isChecked}
              onChange={onToggleSelect}
              className="w-3.5 h-3.5 rounded border-slate-500 bg-[var(--c-071526)]/80 accent-blue-500 cursor-pointer"
            />
          </div>
        )}
        {/* Version count badge (top-left, hidden in select mode) */}
        {!selectMode && versionCount > 0 && (
          <div className="absolute top-2 left-2">
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-600/80 text-blue-100 font-medium">
              {versionCount}V
            </span>
          </div>
        )}
        {/* Status badge (top-right, always visible) */}
        <div className="absolute top-2 right-2">
          <span className={`text-[9px] px-1.5 py-0.5 rounded border ${statusCls}`}>
            {statusLabel}
          </span>
        </div>
        {/* Type badge */}
        <div className="absolute bottom-2 left-2 bg-[var(--c-071526)]/80 rounded px-1.5 py-0.5 text-[9px] text-slate-400">
          {item.type}
        </div>
        {/* Hover actions */}
        <div className="absolute bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCopy();
            }}
            className="bg-[var(--c-071526)]/80 hover:bg-emerald-600/80 rounded p-1 transition-colors"
            title={t("asset.copyAsset")}
          >
            <Copy size={10} className="text-slate-300" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onView();
            }}
            className="bg-blue-600/80 hover:bg-blue-600 rounded p-1 transition-colors"
            title={t("asset.openEditor")}
          >
            <Eye size={10} className="text-white" />
          </button>
        </div>
      </div>
      <div className="p-2.5">
        <div className="text-[11px] font-medium text-slate-200 truncate">
          {L(item, 'name', 'nameEn')}
        </div>
        {item.manufacturer && (
          <div className="text-[10px] text-slate-500 mt-0.5 truncate">
            {item.manufacturer}
          </div>
        )}
      </div>
    </div>
  );
}

function AssetListRow({
  item,
  selected,
  selectMode,
  isChecked,
  onToggleSelect,
  onClick,
  onEdit,
  onView,
  onCopy,
}: {
  item: CategoryNode;
  selected: boolean;
  selectMode?: boolean;
  isChecked?: boolean;
  onToggleSelect?: () => void;
  onClick: () => void;
  onEdit: () => void;
  onView: () => void;
  onCopy: () => void;
}) {
  const L = useLocalized();
  const statusCls = ASSET_STATUS_CLS[item.status] ?? ASSET_STATUS_CLS.active;
  const statusLabel = getStatusLabel(item.status);
  const versionCount = item.versions?.length ?? 0;
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-colors group ${
        selected
          ? "bg-blue-600/10 border border-blue-500/30"
          : "bg-[var(--c-0b1d30)] border border-[var(--c-142235)] hover:border-blue-500/30"
      }`}
    >
      {/* Checkbox (only in select mode) */}
      {selectMode && (
        <div onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={!!isChecked}
            onChange={onToggleSelect}
            className="w-3.5 h-3.5 rounded border-slate-500 bg-transparent accent-blue-500 cursor-pointer flex-shrink-0"
          />
        </div>
      )}
      <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-[var(--c-071526)]">
        {item.detail?.thumbnailPath || item.thumbnailPath ? (
          <img
            src={proxyMinioUrl(
              item.detail ? item.detail?.thumbnailPath : item.thumbnailPath,
            )}
            className="w-full h-full object-cover opacity-65 group-hover:opacity-85 transition-opacity duration-300"
          />
        ) : (
          <div className="w-full h-full bg-[var(--c-040d18)] flex items-center justify-center">
            <Layers3 size={32} className="text-slate-700" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-medium text-slate-200 truncate">
            {L(item, 'name', 'nameEn')}
          </span>
          {versionCount > 0 && (
            <span className="text-[9px] px-1 py-0.5 rounded bg-blue-600/30 text-blue-300 font-medium flex-shrink-0">
              {versionCount}V
            </span>
          )}
        </div>
        <div className="text-[10px] text-slate-500">
          {item.manufacturer} {item.model}
        </div>
      </div>
      {/* Status column */}
      <div className="w-16 flex-shrink-0">
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded border ${statusCls} inline-block`}
        >
          {statusLabel}
        </span>
      </div>
      <div className="text-[10px] text-slate-500 bg-[var(--c-071526)] px-2 py-0.5 rounded">
        {item.type}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
          className="text-slate-400 hover:text-emerald-400 transition-colors p-1"
          title={t("asset.copyAsset")}
        >
          <Copy size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onView();
          }}
          className="text-slate-400 hover:text-blue-400 transition-colors p-1"
          title={t("asset.openEditor")}
        >
          <Eye size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="text-slate-400 hover:text-blue-400 transition-colors p-1"
          title={t("asset.editBusinessData")}
        >
          <Edit2 size={12} />
        </button>
      </div>
    </div>
  );
}
function AssetEditModal({
  asset,
  onClose,
  onSaved,
}: {
  asset: CategoryNode;
  onClose: () => void;
  onSaved: () => void;
}) {
  const L = useLocalized();
  const [saving, setSaving] = useState(false);

  // ── Basic Info state ──
  const [name, setName] = useState(asset.name ?? "");
  const [code, setCode] = useState(asset.code ?? "");
  const [desc, setDesc] = useState(asset.description ?? "");

  async function handleSave() {
    if (!name.trim()) {
      toast.error(t("asset.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      const res = await updateAssetCategoryApi({
        id: asset.id,
        name: name.trim(),
        code: code.trim() || undefined,
        description: desc.trim() || undefined,
      });
      if (res.code === 200) {
        toast.success(t("asset.basicInfoUpdated", { name: name.trim() }));
        onSaved();
        onClose();
      } else {
        toast.error(res.message || t("common.updateFailed"));
      }
    } catch (error: any) {
      console.error("[AssetEditModal] Update failed:", error);
      toast.error(
        error?.response?.data?.message || error?.message || t("common.updateFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-xl w-[400px] shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-142235)] flex-shrink-0">
          <span className="text-sm font-semibold text-slate-100">
            {t("asset.editAssetLabel", { name: L(asset, 'name', 'nameEn') })}
          </span>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* ── 仅基础信息，线体模型/设备模型的详情（产能、维保、IoT等）不在此处修改 ── */}
          <ModalSection title={t("common.basicInfo")}>
            <ModalField
              label={t("common.name")}
              value={name}
              onChange={setName}
              placeholder={t("asset.assetNamePlaceholder")}
              required
            />
            <ModalField
              label={t("common.code")}
              value={code}
              onChange={setCode}
              placeholder={t("asset.assetCodePlaceholder")}
            />
            <div className="px-5 pb-3">
              <label className="block text-[11px] text-slate-400 mb-1.5">
                {t("common.description")}
              </label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                rows={2}
                placeholder={t("asset.descriptionPlaceholder")}
                className="w-full bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
              />
            </div>
          </ModalSection>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--c-142235)] flex-shrink-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-xs text-slate-400 border border-[var(--c-1e3a55)] rounded-md hover:border-[var(--c-2a4a6a)] transition-colors disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-5 py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/40 disabled:text-slate-400 text-white rounded-md font-medium transition-colors"
          >
            {saving ? t("asset.saving") : t("asset.saveChanges")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-[var(--c-142235)] last:border-b-0">
      <div className="px-5 pt-4 pb-2">
        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}

function ModalField({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="px-5 pb-3">
      <label className="block text-[11px] text-slate-400 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
      />
    </div>
  );
}
