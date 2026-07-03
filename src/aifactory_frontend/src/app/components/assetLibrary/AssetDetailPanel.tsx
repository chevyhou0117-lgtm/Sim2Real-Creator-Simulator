import React, { useState, useEffect, useRef } from "react";
import { X, Eye, Copy, Trash2, CheckCircle, Archive, Camera } from "lucide-react";
import type { AssetItemDetail, AssetStatus } from "../../../types/category";
import {
  getLineAssetDetailApi,
  getEquipmentAssetDetailApi,
} from "../../api/index";
import { proxyMinioUrl } from "../../utils/minioProxy";
import { t, useLocalized } from "../../utils/i18n";

interface AssetDetailPanelProps {
  asset: any;
  onClose: () => void;
  onOpenEditor: (id: string) => void;
  onCopyAsset: (asset: AssetItemDetail) => void;
  onDeleteAsset?: (asset: any) => void;
  onEnableAsset?: (asset: any) => void;
  onArchiveAsset?: (asset: any) => void;
  onUpdateThumbnail?: (asset: any, file: File) => void;
}

export function AssetDetailPanel({
  asset,
  onClose,
  onOpenEditor,
  onCopyAsset,
  onDeleteAsset,
  onEnableAsset,
  onArchiveAsset,
  onUpdateThumbnail,
}: AssetDetailPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [detailData, setDetailData] = useState<any>(null);
  const L = useLocalized();

  /** 获取当前资产状态（统一小写，兼容 asset.status / asset.detail.status / detailData.status） */
  const currentStatus: AssetStatus | "" = (() => {
    const raw = asset?.status || asset?.detail?.status || detailData?.status || "";
    const status = typeof raw === "string" ? (raw.toLowerCase() as AssetStatus) : "";
    console.log("[AssetDetailPanel] status debug:", { assetStatus: asset?.status, detailStatus: asset?.detail?.status, detailDataStatus: detailData?.status, raw, result: status, isLeaf: isLeafNode(asset) });
    return status;
  })();

  const ASSET_STATUS_CONFIG: Record<
    AssetStatus,
    { labelKey: string; cls: string }
  > = {
    draft: {
      labelKey: "status.draft",
      cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    },
    active: {
      labelKey: "status.active",
      cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    },
    inactive: {
      labelKey: "status.inactive",
      cls: "bg-slate-500/15 text-slate-400 border-slate-500/30",
    },
    archived: {
      labelKey: "status.archived",
      cls: "bg-orange-500/15 text-orange-400 border-orange-500/30",
    },
  };

  useEffect(() => {
    if (asset) {
      fetchAssetDetail(asset);
    } else {
      setDetailData(null);
    }
  }, [asset]);

  const fetchAssetDetail = async (asset: any) => {
    console.log(asset);
    if (!asset.detail) {
      return;
    }
    try {
      let res = null;
      if (asset.type.includes("line")) {
        res = await getLineAssetDetailApi(asset.detail.id);
      } else if (asset.type.includes("equipment")) {
        res = await getEquipmentAssetDetailApi(asset.detail.id);
      }
      if (res?.code === 200) {
        setDetailData(res.data);
      }
    } catch (error) {
      console.error("Failed to fetch asset detail:", error);
      setDetailData(asset);
    }
  };

  if (!detailData) {
    return null;
  }

  return (
    <aside className="w-64 bg-[var(--c-071526)] border-l border-[var(--c-142235)] flex flex-col overflow-hidden flex-shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--c-142235)]">
        <span className="text-xs font-semibold text-slate-200">
          {t("detail.assetDetails")}
        </span>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-slate-200 p-1 rounded hover:bg-[var(--c-142235)] transition-colors"
        >
          <X size={12} />
        </button>
      </div>

      <div className="h-40 overflow-hidden relative bg-[var(--c-07111e)] group">
        <img
          src={proxyMinioUrl(detailData?.thumbnailPath || "")}
          alt={L(detailData, 'name', 'nameEn') || ""}
          className="w-full h-full object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--c-071526)] to-transparent" />
        {/* 缩略图上传按钮 — 悬浮显示 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="absolute top-2 right-2 flex items-center gap-1 text-[10px] text-white bg-black/50 hover:bg-black/70 border border-white/20 rounded px-2 py-1 transition-colors opacity-0 group-hover:opacity-100"
          title={t("detail.updateThumbnail")}
        >
          <Camera size={11} /> {t("detail.update")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && onUpdateThumbnail) {
              onUpdateThumbnail(asset, file);
            }
            // 重置 input 以便可以重复选择同一文件
            e.target.value = "";
          }}
        />
        {/* Open Editor 悬浮覆盖层 — 暂时注释，避免遮挡缩略图更新按钮 */}
        {/* <button
          onClick={() => onOpenEditor(detailData?.id || "")}
          className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40"
        >
          <div className="flex items-center gap-1.5 text-white text-xs bg-blue-600/80 px-3 py-1.5 rounded-md">
            <Eye size={12} /> Open Editor
          </div>
        </button> */}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div>
          <div className="text-sm font-semibold text-slate-100">
            {L(detailData, 'name', 'nameEn') || ""}
          </div>
          <div className="text-[11px] text-blue-400 mt-0.5">
            {detailData?.type || ""}
          </div>
        </div>

        {/* PROPERTIES 标题 + 操作按钮 */}
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            {t("detail.properties")}
          </div>
          <div className="flex items-center gap-1">
            {/* 激活按钮：仅叶子节点 + DRAFT/INACTIVE 状态显示 */}
            {isLeafNode(asset) && (currentStatus === "draft" || currentStatus === "inactive") && onEnableAsset && (
              <button
                onClick={() => onEnableAsset(asset)}
                className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-200 border border-emerald-500/30 hover:border-emerald-500/60 hover:bg-emerald-600/15 px-2 py-0.5 rounded transition-colors"
                title={t("detail.activate")}
              >
                <CheckCircle size={10} /> {t("detail.activate")}
              </button>
            )}
            {/* 按钮：仅叶子节点 + 非 ARCHIVED 状态显示 */}
            {isLeafNode(asset) && currentStatus !== "archived" && onArchiveAsset && (
              <button
                onClick={() => onArchiveAsset(asset)}
                className="flex items-center gap-1 text-[10px] text-orange-400 hover:text-orange-200 border border-orange-500/30 hover:border-orange-500/60 hover:bg-orange-600/15 px-2 py-0.5 rounded transition-colors"
                title={t("detail.archive")}
              >
                <Archive size={10} /> {t("detail.archive")}
              </button>
            )}
          </div>
        </div>

        <DetailSection title={t("detail.basicInformation")}>
          <DetailRow label={t("detail.category")} value={detailData?.category || ""} />
          <DetailRow label={t("detail.type")} value={detailData?.type || ""} />
          <DetailRow label={t("detail.status")} value={detailData?.status ? t(`status.${detailData.status.toLowerCase()}` as any) : "—"} />
          {detailData?.manufacturer && (
            <DetailRow
              label={t("detail.manufacturer")}
              value={detailData?.manufacturer || ""}
            />
          )}
          {detailData?.model && (
            <DetailRow label={t("detail.model")} value={detailData?.model || ""} />
          )}
        </DetailSection>

        <DetailSection title={t("detail.threeDModelInfo")}>
          <DetailRow label={t("detail.usdPath")} value={detailData?.rootUsdPath} />
          <DetailRow label={t("detail.format")} value="USD" />
          <DetailRow label={t("detail.polyCount")} value={detailData?.polyCount || ""} />
        </DetailSection>

        <DetailSection title={t("detail.businessData")}>
          <DetailRow label={t("detail.standardCT")} value={t("detail.notConfigured")} dim />
          <DetailRow label={t("detail.capacityPerDay")} value={t("detail.notConfigured")} dim />
          <DetailRow label={t("detail.iotPoints")} value={t("detail.notMapped")} dim />
        </DetailSection>
      </div>

      <div className="p-4 border-t border-[var(--c-142235)] space-y-2">
        {/* Open Editor 按钮 — 暂时注释，避免遮挡缩略图更新功能 */}
        {/* <button
          onClick={() => onOpenEditor(detailData?.id)}
          className="w-full text-xs bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 hover:border-blue-500/60 text-blue-300 px-3 py-2 rounded-md transition-colors flex items-center justify-center gap-1.5"
        >
          <Eye size={11} /> Open Editor
        </button> */}
        <button
          onClick={() => onCopyAsset(detailData)}
          className="w-full text-xs bg-[var(--c-0b1d30)] hover:bg-[var(--c-0e243a)] border border-[var(--c-1e3a55)] hover:border-emerald-500/50 text-slate-400 hover:text-emerald-300 px-3 py-2 rounded-md transition-colors flex items-center justify-center gap-1.5"
        >
          <Copy size={11} /> {t("detail.copyAsset")}
        </button>
        {/* 删除按钮：仅叶子节点（line_model / equipment_model）显示 */}
        {/*{isLeafNode(asset) && onDeleteAsset && (*/}
        {/*  <button*/}
        {/*    onClick={() => onDeleteAsset(asset)}*/}
        {/*    className="w-full text-xs bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 hover:border-red-500/60 text-red-400 hover:text-red-300 px-3 py-2 rounded-md transition-colors flex items-center justify-center gap-1.5"*/}
        {/*  >*/}
        {/*    <Trash2 size={11} /> Delete Asset*/}
        {/*  </button>*/}
        {/*)}*/}
      </div>
    </aside>
  );
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function DetailRow({
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

/**
 * 判断节点是否为叶子节点（line_model / equipment_model）
 * 叶子节点的特征：没有 children 或 children 为空数组
 */
function isLeafNode(node: any): boolean {
  if (!node) return false;
  // 有 children 且非空 → 不是叶子节点
  if (node.children && Array.isArray(node.children) && node.children.length > 0) {
    return false;
  }
  // 类型为 line_model 或 equipment_model → 叶子节点
  const leafTypes = ["line_model", "equipment_model"];
  if (node.type && leafTypes.includes(node.type)) {
    return true;
  }
  // 没有 children 或 children 为空 → 也可视为叶子节点
  if (!node.children || (Array.isArray(node.children) && node.children.length === 0)) {
    return true;
  }
  return false;
}
