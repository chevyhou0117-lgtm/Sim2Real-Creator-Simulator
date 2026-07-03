import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import {
  Plus,
  ChevronRight,
  Clock,
  Package,
  Send,
  CheckCircle2,
  FileEdit,
  Layers3,
  GitBranch,
  Link2,
  Settings,
  Database,
  Users,
  Box,
  RefreshCw,
  FolderArchive,
  Camera,
} from "lucide-react";
import {
  // mockFactoryProjects,
  recentFacilities,
  mockDataSources,
  type ProjectStatus,
  type SourceStatus,
} from "../data/mockData";
import { NewProjectModal } from "../components/editor/NewProjectModal";
import { NavSidebar } from "../components/NavSidebar";
import { useLocalized, t } from "../utils/i18n";
import {
  getProcessAssetListApi,
  getFactoryProjectListApi,
  updateThumbnailApi,
} from "../api/index";
import { proxyMinioUrl } from "../utils/minioProxy";
import { toast } from "sonner";

const STATUS_CONFIG: Record<
  ProjectStatus,
  { label: string; cls: string; icon: React.ReactNode }
> = {
  DRAFT: {
    label: t("status.draft"),
    cls: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    icon: <FileEdit size={10} />,
  },
  COMPLETED: {
    label: t("status.complete"),
    cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    icon: <CheckCircle2 size={10} />,
  },
  PUBLISHED: {
    label: t("status.published"),
    cls: "bg-blue-500/20 text-blue-400 border-blue-500/40",
    icon: <Send size={10} />,
  },
  ARCHIVED: {
    label: t("status.archived"),
    cls: "bg-slate-500/20 text-slate-400 border-slate-500/40",
    icon: <FolderArchive size={10} />,
  },
};

const SOURCE_STATUS: Record<SourceStatus, { dot: string; label: string }> = {
  connected: {
    dot: "bg-emerald-400",
    label: t("status.connected"),
    cls: "text-emerald-400",
  },
  disconnected: {
    dot: "bg-slate-500",
    label: t("status.disconnected"),
    cls: "text-slate-500",
  },
  error: { dot: "bg-red-400", label: t("status.error"), cls: "text-red-400" },
  syncing: { dot: "bg-blue-400", label: t("status.syncing"), cls: "text-blue-400" },
};

interface StatItem {
  label: string;
  value: string;
  subValue?: string;
  subTitle: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}

interface AssetCategory {
  id: string;
  name: string;
  count: number;
  thumbnail: string;
  description: string;
}

const initialStats: StatItem[] = [
  {
    label: t("home.factoryProjects"),
    value: "--",
    subValue: "--",
    subTitle: t("home.publishedCount"),
    icon: <GitBranch size={16} />,
    color: "text-blue-400",
    bg: "bg-blue-600/10",
  },
  {
    label: t("home.assetModels"),
    value: "--",
    subValue: "--",
    subTitle: t("home.categoriesCount"),
    icon: <Box size={16} />,
    color: "text-violet-400",
    bg: "bg-violet-600/10",
  },
  {
    label: t("home.dataSources"),
    value: "--",
    subValue: "--",
    subTitle: t("status.error"),
    icon: <Database size={16} />,
    color: "text-emerald-400",
    bg: "bg-emerald-600/10",
  },
  {
    label: t("home.activeUsers"),
    value: "--",
    subTitle: t("home.thisMonth"),
    icon: <Users size={16} />,
    color: "text-amber-400",
    bg: "bg-amber-600/10",
  },
];

const initialAssetCategories: AssetCategory[] = [
  { id: "1", name: t("common.loading"), count: 0, thumbnail: "", description: "" },
  { id: "2", name: t("common.loading"), count: 0, thumbnail: "", description: "" },
  { id: "3", name: t("common.loading"), count: 0, thumbnail: "", description: "" },
  { id: "4", name: t("common.loading"), count: 0, thumbnail: "", description: "" },
];

export function HomePage() {
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [stats, setStats] = useState<StatItem[]>(initialStats);
  const [assetCategories, setAssetCategories] = useState<AssetCategory[]>(
    initialAssetCategories,
  );

  const [factoryProjects, setFactoryProjects] = useState<any[]>([]);
  const L = useLocalized();

  const version = "1.0.1";

  // 使用useRef确保只调用一次
  const hasCalledRef = React.useRef(false);

  // 缩略图上传
  const thumbnailInputRef = useRef<HTMLInputElement>(null);
  const pendingThumbCatIdRef = useRef<string | null>(null);
  const [uploadingThumbId, setUploadingThumbId] = useState<string | null>(null);

  useEffect(() => {
    if (!hasCalledRef.current) {
      fetchStats();
      fetchAssetCategories();
      fetchFactoryProjects();
      hasCalledRef.current = true;
    }
  }, []);

  const fetchStats = async () => {
    try {
      // TODO: 替换为真实的 API 调用
      // const response = await fetch('/api/stats');
      // const data = await response.json();

      // 模拟接口返回的数据结构（后续替换为真实接口）
      const mockApiResponse = {
        factoryProjects: { total: 4, published: 2 },
        assetModels: { total: 85, categories: 4 },
        dataSources: { total: 4, error: 1 },
        activeUsers: { total: 6 },
      };

      setStats([
        {
          ...initialStats[0],
          value: String(mockApiResponse.factoryProjects.total),
          subValue: String(mockApiResponse.factoryProjects.published),
        },
        {
          ...initialStats[1],
          value: String(mockApiResponse.assetModels.total),
          subValue: String(mockApiResponse.assetModels.categories),
        },
        {
          ...initialStats[2],
          value: String(mockApiResponse.dataSources.total),
          subValue: String(mockApiResponse.dataSources.error),
        },
        {
          ...initialStats[3],
          value: String(mockApiResponse.activeUsers.total),
        },
      ]);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  const fetchAssetCategories = async () => {
    try {
      const res = await getProcessAssetListApi();
      if (res.code == 200) {
        const resData = res.data || [];
        // 计算每个分类下的叶子节点数量（实际的资产模型数量）
        const categoriesWithCount = resData.map((cat: any) => {
          const count = countLeafNodes(cat);
          return { ...cat, count };
        });
        setAssetCategories(categoriesWithCount);
      }
    } catch (error) {
      console.error("Failed to fetch asset categories:", error);
    }
  };

  /** 递归计算树中的叶子节点数量（line_model / equipment_model） */
  const countLeafNodes = (node: any): number => {
    if (!node) return 0;
    // 如果是叶子节点（没有 children 或 children 为空）
    if (!node.children || node.children.length === 0) {
      return 1;
    }
    // 递归计算所有子节点的叶子数量
    return node.children.reduce(
      (sum: number, child: any) => sum + countLeafNodes(child),
      0,
    );
  };

  const fetchFactoryProjects = async () => {
    try {
      const params = {
        current: 1,
        pageSize: 2,
        sortField: " descend",
        projectName: "",
      };
      const res = await getFactoryProjectListApi(params);
      if (res.code == 200) {
        const resData = res.data?.items || [];
        console.log("factoryProjects:", resData);
        setFactoryProjects(resData);
      }
    } catch (error) {
      console.error("Failed to fetch factory projects:", error);
    }
  };

  // 处理点击资产分类 跳转到 资产列表页面 -- 默认选中对应的资产分类
  const handleBrowseAssetsByCategory = (cat: AssetCategory) => {
    navigate(`/asset-library/${cat.id}`);
  };

  // 处理缩略图上传（制程节点）
  const handleThumbnailUpload = (cat: AssetCategory) => {
    pendingThumbCatIdRef.current = cat.id;
    thumbnailInputRef.current?.click();
  };

  const handleThumbnailChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const catId = pendingThumbCatIdRef.current;
    if (!catId) {
      toast.error(t("home.noStageId"));
      return;
    }

    setUploadingThumbId(catId);
    try {
      const res = await updateThumbnailApi("process", catId, file);
      if (res.code === 200) {
        const newPath =
          res.data?.thumbnail_path || res.data?.thumbnailPath || "";
        if (newPath) {
          setAssetCategories((prev) =>
            prev.map((c: any) =>
              c.id === catId ? { ...c, thumbnailPath: newPath } : c,
            ),
          );
        }
        toast.success(t("project.thumbnailUpdated"));
      } else {
        toast.error(res.message || t("common.updateFailed"));
      }
    } catch (error: any) {
      console.error("[HomePage] thumbnail upload failed:", error);
      toast.error(
        error?.response?.data?.message || error?.message || t("home.uploadFailed"),
      );
    } finally {
      setUploadingThumbId(null);
      pendingThumbCatIdRef.current = null;
      // 重置 input，允许重复选择同一文件
      if (thumbnailInputRef.current) thumbnailInputRef.current.value = "";
    }
  };

  const handleViewProject = (proj: any) => {
    navigate(`/factory/${proj.projectId}`);
  };

  const handleNewProject = () => setShowModal(true);
  const handleBrowseAssets = () => navigate("/asset-library");
  const handleIntegrationConfig = () => {
    navigate("/integration");
  };
  const handleSystemAdmin = () => {
    // navigate("/admin");
  };

  // 新建工厂成功后，刷新项目列表, 跳转 editor 页面
  const onProjectCreate = (id: string) => {
    navigate(`/factory/${id}`);
  };

  return (
    <div className="flex h-screen bg-[var(--c-07111e)] text-slate-100 overflow-hidden select-none">
      <NavSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="h-11 bg-[var(--c-07111e)] border-b border-[var(--c-142235)] flex items-center px-6 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center">
              <Layers3 size={13} />
            </div>
            <span className="text-sm font-semibold tracking-[0.15em] text-blue-300 uppercase">
              {t("home.appTitle")}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-3 text-[11px] text-slate-500">
            <span>{t("home.version", { version })}</span>
            <span className="w-1 h-1 rounded-full bg-slate-700" />
            <span>{t("home.workspaceName")}</span>
          </div>
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-7">
          {/* ── Stats Row ── */}
          <div className="grid grid-cols-4 gap-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-lg p-4 flex items-center gap-4"
              >
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${s.bg} ${s.color}`}
                >
                  {s.icon}
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-100">
                    {s.value}
                  </div>
                  <div className="text-[11px] text-slate-500">{s.label}</div>
                  <div className="text-[10px] text-slate-600 mt-0.5">
                    {s.subValue} {s.subTitle}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Quick Actions ── */}
          <section>
            <SectionHeader title={t("home.quickActions")} />
            <div className="grid grid-cols-4 gap-3 mt-3">
              {[
                {
                  icon: <Plus size={14} />,
                  label: t("home.createNewProject"),
                  sub: t("home.createNewProject"),
                  color: "bg-blue-600 hover:bg-blue-700",
                  onClick: handleNewProject,
                },
                {
                  icon: <Package size={14} />,
                  label: t("home.browseAssetLibrary"),
                  sub: t("home.browseAssetLibrary"),
                  color:
                    "bg-[var(--c-0b1d30)] hover:bg-[var(--c-0e243a)] border border-[var(--c-1e3a55)]",
                  onClick: handleBrowseAssets,
                },
                {
                  icon: <Link2 size={14} />,
                  label: t("home.integrationConfig"),
                  sub: t("home.integrationConfig"),
                  color:
                    "bg-[var(--c-0b1d30)] hover:bg-[var(--c-0e243a)] border border-[var(--c-1e3a55)]",
                  onClick: handleIntegrationConfig,
                },
                {
                  icon: <Settings size={14} />,
                  label: t("home.systemAdmin"),
                  sub: t("home.systemAdmin"),
                  color:
                    "bg-[var(--c-0b1d30)] hover:bg-[var(--c-0e243a)] border border-[var(--c-1e3a55)]",
                  onClick: handleSystemAdmin,
                },
              ].map((a) => (
                <button
                  key={a.label}
                  onClick={a.onClick}
                  className={`${a.color} rounded-lg px-4 py-3 text-left transition-all group`}
                >
                  <div className="flex items-center gap-2 mb-1 text-slate-100">
                    {a.icon}
                    <span className="text-xs font-medium">{a.label}</span>
                  </div>
                  <div className="text-[10px] text-slate-400">{a.sub}</div>
                </button>
              ))}
            </div>
          </section>

          {/* ── 3D Asset Library + Integration status (2 cols) ── */}
          <div className="grid grid-cols-2 gap-6">
            {/* 3D Asset Management */}
            <section>
              <SectionHeader
                title={t("home.digitalAsset")}
                onViewAll={() => navigate("/asset-library")}
              />
              <div className="grid grid-cols-2 gap-3 mt-3">
                {assetCategories.map((cat) => (
                  <div
                    key={cat?.id}
                    onClick={() => handleBrowseAssetsByCategory(cat)}
                    className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-lg overflow-hidden cursor-pointer hover:border-blue-500/50 hover:bg-[var(--c-0e243a)] transition-all group"
                  >
                    <div className="h-24 relative overflow-hidden">
                      {cat?.thumbnailPath ? (
                        <img
                          src={proxyMinioUrl(cat?.thumbnailPath || "")}
                          className="w-full h-full object-cover opacity-70 group-hover:opacity-90 group-hover:scale-105 transition-all duration-500"
                        />
                      ) : (
                        <div className="w-full h-full bg-[var(--c-040d18)] flex items-center justify-center">
                          <Layers3 size={32} className="text-slate-700" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[var(--c-0b1d30)] via-transparent to-transparent" />
                      {/* 缩略图更新按钮（hover 右上角出现，与资产库一致） */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (uploadingThumbId === cat.id) return;
                          handleThumbnailUpload(cat);
                        }}
                        className="absolute top-2 right-2 flex items-center gap-1 text-[10px] text-white bg-black/50 hover:bg-black/70 border border-white/20 rounded px-2 py-1 transition-colors opacity-0 group-hover:opacity-100 z-10"
                        title={t("project.updateThumbnail")}
                      >
                        {uploadingThumbId === cat.id ? (
                          <RefreshCw size={11} className="animate-spin" />
                        ) : (
                          <Camera size={11} />
                        )}
                        {t("common.update")}
                      </button>
                      <div className="absolute top-2 left-2 bg-blue-700/80 rounded px-1.5 py-0.5 text-[9px] text-white font-medium">
                        {cat?.count || 0}
                      </div>
                    </div>
                    <div className="p-2.5">
                      <div className="text-[11px] font-medium text-slate-100 truncate">
                        {L(cat, 'name', 'nameEn')}
                      </div>
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-blue-400 group-hover:text-blue-300">
                        {t("common.browse")} <ChevronRight size={9} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {/* 隐藏文件上传 input */}
              <input
                ref={thumbnailInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleThumbnailChange}
              />
            </section>

            {/* Integration Status */}
            <section>
              <SectionHeader
                title={t("home.integrationStatus")}
                onViewAll={() => navigate("/integration")}
              />
              <div className="space-y-2.5 mt-3">
                {mockDataSources.map((source) => {
                  const st = SOURCE_STATUS[source.status];
                  const TYPE_LABEL: Record<string, string> = {
                    platform: t("home.integration.platform"),
                    erp: t("home.integration.erp"),
                    mes: t("home.integration.mes"),
                    wms: t("home.integration.wms"),
                    custom: t("home.integration.custom"),
                  };
                  return (
                    <div
                      key={source.id}
                      onClick={() => navigate("/integration")}
                      className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-lg px-4 py-3 cursor-pointer hover:border-blue-500/40 transition-all group flex items-center gap-3"
                    >
                      <span
                        className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${st.dot}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-slate-200 truncate">
                            {source.name}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded border border-[var(--c-1e3a55)] text-slate-500 uppercase tracking-wider flex-shrink-0">
                            {TYPE_LABEL[source.type] ?? source.type}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-600 mt-0.5 truncate">
                          {source.lastSync
                            ? t("home.lastSyncTime", { time: source.lastSync.split(" ")[1] ?? source.lastSync })
                            : t("home.notSynced")}
                        </div>
                      </div>
                      <span className={`text-[10px] flex-shrink-0 ${st.cls}`}>
                        {st.label}
                      </span>
                    </div>
                  );
                })}
                <button
                  onClick={() => navigate("/integration")}
                  className="w-full text-[10px] text-blue-400 hover:text-blue-300 flex items-center justify-center gap-1 py-1.5 transition-colors"
                >
                  <RefreshCw size={10} /> {t("home.manageIntegrations")}
                </button>
              </div>
            </section>
          </div>

          {/* ── Recent Factory Projects ── */}
          <section>
            <SectionHeader
              title={t("home.recentProjects")}
              onViewAll={() => navigate("/factories")}
            />
            <div className="grid grid-cols-3 gap-4 mt-3">
              {/* New Project Card */}
              <div
                onClick={() => setShowModal(true)}
                className="bg-[var(--c-0b1d30)] border border-dashed border-[var(--c-1e3a55)] rounded-lg h-48 flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/60 hover:bg-[var(--c-0e243a)] transition-all group"
              >
                <div className="w-10 h-10 rounded-full border border-dashed border-[var(--c-2a4a6a)] group-hover:border-blue-500 flex items-center justify-center mb-3 transition-colors">
                  <Plus
                    size={18}
                    className="text-slate-500 group-hover:text-blue-400 transition-colors"
                  />
                </div>
                <span className="text-sm text-slate-400 group-hover:text-slate-100 transition-colors">
                  {t("home.createNewProject")}
                </span>
                <span className="text-xs text-slate-600 mt-1 group-hover:text-slate-400 transition-colors">
                  {t("home.createNewProject")}
                </span>
              </div>

              {factoryProjects.map((proj) => {
                const sc = STATUS_CONFIG[proj.status];
                return (
                  <div
                    key={proj.projectId}
                    onClick={() => handleViewProject(proj)}
                    className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-lg overflow-hidden cursor-pointer hover:border-blue-500/50 transition-all group relative"
                  >
                    <div className="h-32 relative overflow-hidden">
                      {proj?.thumbnailUrl ? (
                        <img
                          src={proxyMinioUrl(proj?.thumbnailUrl)}
                          className="w-full h-full object-cover opacity-60 group-hover:opacity-85 group-hover:scale-105 transition-all duration-500"
                        />
                      ) : (
                        <div className="w-full h-full bg-[var(--c-040d18)] flex items-center justify-center">
                          <Layers3 size={32} className="text-slate-700" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-[var(--c-0b1d30)] via-[var(--c-0b1d30)]/30 to-transparent" />
                      <div
                        className={`absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 font-medium ${sc?.cls || ""}`}
                      >
                        {sc?.icon} {sc?.label || ""}
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="text-sm font-medium text-slate-100">
                        {L(proj, 'projectName', 'projectNameEn')}
                      </div>
                      {proj?.description && (
                        <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
                          {L(proj, 'description', 'descriptionEn')}
                        </div>
                      )}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="text-[10px] text-slate-500 flex items-center gap-1">
                          <Clock size={9} /> {proj?.updatedAt?.substring(0, 10)}
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={(e) => {
                              // e.stopPropagation();
                              // navigate(`/factory/${proj.id}/versions`);
                            }}
                            className="text-[10px] text-slate-500 hover:text-blue-400 transition-colors"
                          >
                            {t("home.logs")}
                          </button>
                          <button
                            onClick={(e) => {
                              // e.stopPropagation();
                              // navigate(`/factory/${proj.id}/data-binding`);
                            }}
                            className="text-[10px] text-slate-500 hover:text-blue-400 transition-colors"
                          >
                            {t("home.dataBinding")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Recent Facilities Model ── */}
          <section>
            <SectionHeader title={t("home.recentFacilities")} />
            <p className="text-[11px] text-slate-500 mt-1 mb-3">
              {t("home.recentFacilitiesDesc")}
            </p>
            <div className="grid grid-cols-4 gap-4">
              {recentFacilities.map((f) => (
                <div
                  key={f.id}
                  className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-lg overflow-hidden cursor-pointer hover:border-blue-500/50 transition-all group"
                >
                  <div className="h-24 overflow-hidden relative">
                    {/* 占位背景：图片加载失败时显示 */}
                    <div className="absolute inset-0 bg-[var(--c-040d18)] flex items-center justify-center">
                      <Package size={28} className="text-slate-700" />
                    </div>
                    <img
                      src={f.thumbnail}
                      alt={f.name}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = "none";
                      }}
                      className="relative z-10 w-full h-full object-cover opacity-55 group-hover:opacity-80 group-hover:scale-105 transition-all duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--c-0b1d30)]/70 to-transparent" />
                  </div>
                  <div className="p-2.5">
                    <div className="text-xs font-medium text-slate-200">
                      {f.name}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 flex items-center justify-between">
                      <span>{f.type}</span>
                      <span className="flex items-center gap-1">
                        <Clock size={8} /> {f.updatedAt}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      {showModal && (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          onCreate={(id) => {
            setShowModal(false);
            onProjectCreate(id);
          }}
        />
      )}
    </div>
  );
}

function SectionHeader({
  title,
  onViewAll,
}: {
  title: string;
  onViewAll?: () => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2.5">
        <div className="w-[3px] h-4 bg-blue-500 rounded-full" />
        {title}
      </h2>
      {onViewAll && (
        <button
          onClick={onViewAll}
          className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5 transition-colors"
        >
          {t("common.viewAll")} <ChevronRight size={11} />
        </button>
      )}
    </div>
  );
}
