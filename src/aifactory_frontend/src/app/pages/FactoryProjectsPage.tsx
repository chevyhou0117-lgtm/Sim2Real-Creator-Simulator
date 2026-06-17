import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  Plus,
  Grid3X3,
  List,
  Search,
  MoreHorizontal,
  Edit2,
  Copy,
  Trash2,
  CheckCircle2,
  FileEdit,
  Send,
  Layers3,
  Clock,
  FolderArchive,
  Lock,
  X,
  Check,
  AlertTriangle,
  Camera,
} from "lucide-react";
import { NavSidebar, PageHeader } from "../components/NavSidebar";
import { NewProjectModal } from "../components/editor/NewProjectModal";
import { proxyMinioUrl } from "../utils/minioProxy";
import {
  getFactoryProjectListApi,
  duplicateFactoryProjectApi,
  deleteFactoryProjectApi,
  updateFactoryProjectApi,
  updateFactoryProjectThumbnailApi,
} from "../api/index";
import { useLocalized, t } from "../utils/i18n";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

type ProjectStatus = "DRAFT" | "COMPLETED" | "PUBLISHED" | "ARCHIVED";

/** 状态 → i18n 键 映射表 */
const STATUS_LABEL_KEY: Record<ProjectStatus, string> = {
  DRAFT: "status.draft",
  COMPLETED: "status.complete",
  PUBLISHED: "status.published",
  ARCHIVED: "status.archived",
};

/** 纯样式（不依赖 i18n，模块常量安全） */
const STATUS_STYLE: Record<ProjectStatus, { cls: string; icon: React.ReactNode }> = {
  DRAFT: {
    cls: "bg-amber-500/20 text-amber-400 border-amber-500/40",
    icon: <FileEdit size={10} />,
  },
  COMPLETED: {
    cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
    icon: <CheckCircle2 size={10} />,
  },
  PUBLISHED: {
    cls: "bg-blue-500/20 text-blue-400 border-blue-500/40",
    icon: <Send size={10} />,
  },
  ARCHIVED: {
    cls: "bg-slate-500/20 text-slate-400 border-slate-500/40",
    icon: <FolderArchive size={10} />,
  },
};

/** 后端 status 为小写词汇(active/inactive/archived/draft)，且与前端展示词汇不完全一致；
 *  统一归一化为前端 ProjectStatus(大写)，避免 STATUS_LABEL_KEY/STATUS_STYLE 取到 undefined。 */
const normStatus = (s?: string): ProjectStatus => {
  const u = (s ?? "").toUpperCase();
  if (u === "COMPLETE") return "COMPLETED";
  if (u === "ACTIVE" || u === "INACTIVE") return "DRAFT"; // 后端生命周期值 → 展示为草稿
  return (["DRAFT", "COMPLETED", "PUBLISHED", "ARCHIVED"].includes(u) ? u : "DRAFT") as ProjectStatus;
};

/** 筛选器键定义（label 在组件内动态翻译） */
const STATUS_FILTER_KEYS: { key: "all" | ProjectStatus; labelKey: string }[] = [
  { key: "all", labelKey: "status.all" },
  { key: "DRAFT", labelKey: "status.draft" },
  { key: "COMPLETED", labelKey: "status.complete" },
  { key: "PUBLISHED", labelKey: "status.published" },
  { key: "ARCHIVED", labelKey: "status.archived" },
];

// ── Rename Modal ──────────────────────────────────────────────────────────────
function RenameModal({
  initialName,
  onConfirm,
  onClose,
}: {
  initialName: string;
  onConfirm: (name: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0b1d30] border border-[#1e3a55] rounded-xl w-[400px] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#142235]">
          <span className="text-sm font-semibold text-slate-100">
            {t("project.renameProject")}
          </span>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-5">
          <label className="block text-[11px] text-slate-400 mb-1.5">
            {t("project.projectName")}
          </label>
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm(value.trim());
              if (e.key === "Escape") onClose();
            }}
            className="w-full bg-[#071526] border border-[#1e3a55] rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 border border-[#1e3a55] rounded hover:border-[#2a4a6a] transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={() => onConfirm(value?.trim())}
            disabled={!value?.trim()}
            className="px-5 py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded font-medium transition-colors"
          >
            {t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Modal ──────────────────────────────────────────────────────
function DeleteModal({
  name,
  onConfirm,
  onClose,
}: {
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0b1d30] border border-[#1e3a55] rounded-xl w-[400px] shadow-2xl">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-[#142235]">
          <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-slate-100">
            {t("project.deleteProject")}
          </span>
        </div>
        <div className="px-5 py-4">
          <p className="text-[12px] text-slate-400">
            {t("project.deleteConfirm", { name: name })}
          </p>
          <p className="text-[11px] text-slate-500 mt-1.5">
            {t("project.deleteWarning")}
          </p>
        </div>
        <div className="flex justify-end gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 border border-[#1e3a55] rounded hover:border-[#2a4a6a] transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            className="px-5 py-2 text-xs bg-red-600 hover:bg-red-700 text-white rounded font-medium transition-colors"
          >
            {t("common.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Context Menu ──────────────────────────────────────────────────────────────
function ContextMenu({
  project,
  onRename,
  onDuplicate,
  onArchive,
  onDelete,
  onClose,
  anchorRef,
}: {
  project: any;
  onRename: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isArchived = normStatus(project.status) === "ARCHIVED";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, anchorRef]);

  return (
    <div
      ref={menuRef}
      className="absolute right-0 top-full mt-1 w-44 bg-[#0b1d30] border border-[#1e3a55] rounded-lg shadow-xl z-30 py-1 overflow-hidden"
    >
      {!isArchived && (
        <MenuItem
          icon={<Edit2 size={11} />}
          label={t("common.rename")}
          onClick={() => {
            onRename();
            onClose();
          }}
        />
      )}
      <MenuItem
        icon={<Copy size={11} />}
        label={t("common.duplicate")}
        onClick={() => {
          onDuplicate();
          onClose();
        }}
      />
      {!isArchived ? (
        <MenuItem
          icon={<FolderArchive size={11} />}
          label={t("common.archive")}
          onClick={() => {
            onArchive();
            onClose();
          }}
        />
      ) : (
        <MenuItem
          icon={<FolderArchive size={11} />}
          label={t("common.unarchive")}
          onClick={() => {
            onArchive();
            onClose();
          }}
        />
      )}
      <div className="my-1 border-t border-[#142235]" />
      <MenuItem
        icon={<Trash2 size={11} />}
        label={t("common.delete")}
        onClick={() => {
          onDelete();
          onClose();
        }}
        danger
      />
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-[11px] transition-colors ${
        danger
          ? "text-red-400 hover:bg-red-500/10"
          : "text-slate-300 hover:bg-[#0e243a]"
      }`}
    >
      {icon} {label}
    </button>
  );
}

// ── Card View ─────────────────────────────────────────────────────────────────
function ProjectCard({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onArchive,
  onDelete,
  onUpdateThumbnail,
}: {
  project: any;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onUpdateThumbnail: (project: any, file: File) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const L = useLocalized();
  const _st = normStatus(project.status);
  const style = STATUS_STYLE[_st];
  const statusLabel = t(STATUS_LABEL_KEY[_st]);
  const isArchived = _st === "ARCHIVED";

  return (
    <div
      className={`bg-[#0b1d30] border rounded-lg overflow-hidden relative transition-all group ${
        isArchived
          ? "border-[#142235] opacity-60"
          : "border-[#142235] hover:border-blue-500/50 cursor-pointer"
      }`}
    >
      {/* Thumbnail */}
      <div
        className="h-36 relative overflow-hidden"
        onClick={!isArchived ? onOpen : undefined}
      >
        {project.thumbnailUrl ? (
          <img
            src={proxyMinioUrl(project.thumbnailUrl)}
            className={`w-full h-full object-cover transition-all duration-500 ${
              isArchived
                ? "opacity-30"
                : "opacity-60 group-hover:opacity-85 group-hover:scale-105"
            }`}
          />
        ) : (
          <div className="w-full h-full bg-[#040d18] flex items-center justify-center">
            <Layers3 size={32} className="text-slate-700" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1d30] via-[#0b1d30]/20 to-transparent" />

        {/* Update thumbnail button (hover) */}
        {!isArchived && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              fileInputRef.current?.click();
            }}
            className="absolute bottom-2 right-2 w-7 h-7 rounded bg-black/50 border border-white/20 flex items-center justify-center text-white/60 hover:text-white hover:bg-blue-600/80 hover:border-blue-400/60 opacity-0 group-hover:opacity-100 transition-all"
            title={t("project.updateThumbnail")}
          >
            <Camera size={12} />
          </button>
        )}

        {/* Status badge */}
        <div
          className={`absolute top-2 left-2 text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 font-medium ${style?.cls}`}
        >
          {style?.icon} {statusLabel}
        </div>

        {/* Archived lock overlay */}
        {isArchived && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Lock size={24} className="text-slate-600" />
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onUpdateThumbnail(project, file);
            // 重置 input，允许重复上传同一文件
            e.target.value = "";
          }
        }}
      />

      {/* Info */}
      <div className="p-3" onClick={!isArchived ? onOpen : undefined}>
        <div className="flex items-baseline gap-1.5">
          <div className="text-sm font-medium text-slate-100 truncate">
            {L(project, 'projectName', 'project_name_en')}
          </div>
          <span className="text-[10px] text-blue-400 font-mono flex-shrink-0">
            _V{project?.versionNumber}
          </span>
        </div>
        {project.description && (
          <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">
            {L(project, 'description')}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between">
          <div className="text-[10px] text-slate-600 flex items-center gap-1">
            <Clock size={9} /> {project?.updatedAt?.substring(0, 10)}
          </div>
          <div className="text-[10px] text-slate-600">
            {t("project.createdDate", { date: project?.createdAt?.substring(0, 10) })}
          </div>
        </div>
      </div>

      {/* More actions button */}
      <div className="absolute top-2 right-2">
        <button
          ref={btnRef}
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="w-6 h-6 rounded bg-[#0b1d30]/80 border border-[#1e3a55] flex items-center justify-center text-slate-500 hover:text-slate-200 opacity-0 group-hover:opacity-100 transition-all"
        >
          <MoreHorizontal size={12} />
        </button>
        {menuOpen && (
          <ContextMenu
            project={project}
            onRename={onRename}
            onDuplicate={onDuplicate}
            onArchive={onArchive}
            onDelete={onDelete}
            onClose={() => setMenuOpen(false)}
            anchorRef={btnRef}
          />
        )}
      </div>
    </div>
  );
}

// ── List Row ──────────────────────────────────────────────────────────────────
function ProjectRow({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onArchive,
  onDelete,
  onUpdateThumbnail,
}: {
  project: any;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onUpdateThumbnail: (project: any, file: File) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const L = useLocalized();
  const _st = normStatus(project.status);
  const style = STATUS_STYLE[_st];
  const statusLabel = t(STATUS_LABEL_KEY[_st]);
  const isArchived = _st === "ARCHIVED";

  return (
    <tr
      className={`border-b border-[#142235] transition-colors group ${
        isArchived ? "opacity-60" : "hover:bg-[#0b1d30] cursor-pointer"
      }`}
      onClick={!isArchived ? onOpen : undefined}
    >
      <td className="py-3 pl-5 pr-3">
        <div
          className="w-10 h-8 rounded overflow-hidden flex-shrink-0 bg-[#040d18] flex items-center justify-center relative group/thumb cursor-pointer"
          onClick={(e) => {
            if (!isArchived) {
              e.stopPropagation();
              fileInputRef.current?.click();
            }
          }}
          title={!isArchived ? t("project.clickToUpdate") : undefined}
        >
          {project?.thumbnailUrl ? (
            <img
              src={proxyMinioUrl(project?.thumbnailUrl)}
              alt=""
              className="w-full h-full object-cover opacity-60 group-hover/thumb:opacity-100 transition-opacity"
            />
          ) : (
            <Layers3 size={14} className="text-slate-700 group-hover/thumb:text-slate-500 transition-colors" />
          )}
          {!isArchived && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/thumb:opacity-100 transition-opacity">
              <Camera size={10} className="text-white/80" />
            </div>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              onUpdateThumbnail(project, file);
              e.target.value = "";
            }
          }}
        />
      </td>
      <td className="py-3 pr-4">
        <div className="text-[12px] font-medium text-slate-100 flex items-center gap-2">
          {L(project, 'projectName', 'project_name_en')}
          <span className="text-[10px] text-blue-400 font-mono">
            _V{project?.versionNumber}
          </span>
          {isArchived && <Lock size={10} className="text-slate-600" />}
        </div>
        {project.description && (
          <div className="text-[10px] text-slate-500 mt-0.5 truncate max-w-xs">
            {L(project, 'description')}
          </div>
        )}
      </td>
      <td className="py-3 pr-4">
        <span
          className={`text-[10px] px-2 py-0.5 rounded border flex items-center gap-1 w-fit ${style?.cls}`}
        >
          {style?.icon} {statusLabel}
        </span>
      </td>
      <td className="py-3 pr-4 text-[11px] text-slate-500">
        {project?.createdAt?.substring(0, 10)}
      </td>
      <td className="py-3 pr-4 text-[11px] text-slate-500">
        {project?.updatedAt?.substring(0, 10)}
      </td>
      <td className="py-3 pr-5">
        <div className="relative flex items-center justify-end">
          <button
            ref={btnRef}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
            className="w-7 h-7 rounded flex items-center justify-center text-slate-600 hover:text-slate-200 hover:bg-[#142235] opacity-0 group-hover:opacity-100 transition-all"
          >
            <MoreHorizontal size={13} />
          </button>
          {menuOpen && (
            <ContextMenu
              project={project}
              onRename={onRename}
              onDuplicate={onDuplicate}
              onArchive={onArchive}
              onDelete={onDelete}
              onClose={() => setMenuOpen(false)}
              anchorRef={btnRef}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function FactoryProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [statusFilter, setStatusFilter] = useState<"all" | ProjectStatus>(
    "all",
  );
  const [search, setSearch] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [showNewModal, setShowNewModal] = useState(false);

  const L = useLocalized();

  const filtered = projects.filter((p) => {
    if (statusFilter !== "all" && normStatus(p.status) !== statusFilter) return false;
    if (search && !p?.projectName?.includes(search)) return false;
    return true;
  });

  const counts = projects.reduce(
    (acc, p) => {
      acc[normStatus(p.status)] = (acc[normStatus(p.status)] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const handleViewProject = (proj: any) => {
    navigate(`/factory/${proj.id}`);
  };

  const handleRenameProject = (proj: any) => {
    setRenameId(proj.id);
  };

  const handleDeleteProject = (proj: any) => {
    setDeleteId(proj.id);
  };

  function handleDuplicateProject(project: any) {
    duplicateFactoryProject(project.id);
  }

  function handleArchiveProject(project: any) {
    // 后端 ProjectStatus 为小写枚举值（draft/archived）；归一化判断当前是否归档，发送小写目标值。
    updateFactoryProject(
      project.id,
      null,
      normStatus(project.status) === "ARCHIVED" ? "draft" : "archived",
    );
  }

  async function handleUpdateThumbnail(project: any, file: File) {
    try {
      const res = await updateFactoryProjectThumbnailApi(project.id, file);
      if (res.code === 200) {
        toast.success(t("project.thumbnailUpdated"));
        // 更新本地 state 的 thumbnailUrl
        setProjects((prev) =>
          prev.map((p) =>
            p.id === project.id
              ? { ...p, thumbnailUrl: res.data.thumbnail_url }
              : p,
          ),
        );
      } else {
        toast.error(res.message || t("project.thumbnailUpdateFailed"));
      }
    } catch (error) {
      console.error("Failed to update thumbnail:", error);
      toast.error(t("project.thumbnailUpdateFailed"));
    }
  }

  //  menu 确认事件
  function handleConfirmRename(project: any, newName: string) {
    if (!newName) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.id === project.id
          ? {
              ...p,
              projectName: newName,
            }
          : p,
      ),
    );
    setRenameId(null);
    // 调用接口更新
    updateFactoryProject(project.id, newName, null);
  }

  function handleConfirmDelete(project: any) {
    setDeleteId(null);
    // 调用接口删除
    deleteFactoryProject(project.id);
  }

  const renameTarget = renameId
    ? projects.find((p: any) => p.id == renameId)
    : null;

  const deleteTarget = deleteId
    ? projects.find((p: any) => p.id == deleteId)
    : null;

  // 新建工厂成功后，刷新项目列表, 跳转 editor 页面
  const onProjectCreate = (id: string) => {
    navigate(`/factory/${id}`);
  };

  // 使用useRef确保只调用一次
  const hasCalledRef = React.useRef(false);

  useEffect(() => {
    if (!hasCalledRef.current) {
      fetchFactoryProjects();
      hasCalledRef.current = true;
    }
  }, []);

  const fetchFactoryProjects = async () => {
    try {
      const params = {
        current: 1,
        pageSize: 99,
        sortField: "descend",
        projectName: search,
      };
      const res = await getFactoryProjectListApi(params);
      if (res.code == 200) {
        const resData = res.data?.items || [];
        const projects = resData.map((item: any) => ({
          ...item,
          id: item.projectId,
        }));
        setProjects(projects);
      }
    } catch (error) {
      console.error("Failed to fetch factory projects:", error);
    }
  };

  const updateFactoryProject = async (
    projectId: any,
    newName: string,
    newStatus: ProjectStatus,
  ) => {
    try {
      let params: any = {
        projectId: projectId,
        // projectName: newName,
        // status: newStatus,
      };
      if (newName) params.projectName = newName;
      if (newStatus) params.status = newStatus;
      const res = await updateFactoryProjectApi(params);
      if (res.code == 200) {
        fetchFactoryProjects();
      }
    } catch (error) {
      console.error("Failed to update factory project:", error);
    }
  };

  const deleteFactoryProject = async (projectId: any) => {
    try {
      const params = {
        projectId: projectId,
      };
      const res = await deleteFactoryProjectApi(params);
      if (res.code == 200) {
        fetchFactoryProjects();
      }
    } catch (error) {
      console.error("Failed to delete factory project:", error);
    }
  };

  const duplicateFactoryProject = async (projectId: any) => {
    try {
      const params = {
        sourceProjectId: projectId,
      };
      const res = await duplicateFactoryProjectApi(params);
      if (res.code == 200) {
        fetchFactoryProjects();
      } else {
        toast.error(res.message);
      }
    } catch (error) {
      console.error("Failed to duplicate factory project:", error);
    }
  };

  return (
    <div className="flex h-screen bg-[#07111e] text-slate-100 overflow-hidden select-none">
      <NavSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader
          crumbs={[{ label: t("common.home"), path: "/" }, { label: t("project.title") }]}
          actions={
            <button
              onClick={() => setShowNewModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors"
            >
              <Plus size={12} /> {t("project.newProject")}
            </button>
          }
        />

        {/* ── Toolbar ── */}
        <div className="flex items-center gap-3 px-6 py-3 border-b border-[#142235] flex-shrink-0 bg-[#07111e]">
          {/* Status filters */}
          <div className="flex gap-1">
            {STATUS_FILTER_KEYS.map((f) => {
              const count =
                f.key === "all" ? projects.length : (counts[f.key] ?? 0);
              return (
                <button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  className={`px-3 py-1 text-[11px] rounded-full border transition-colors ${
                    statusFilter === f.key
                      ? "border-blue-500/60 bg-blue-600/15 text-blue-400"
                      : "border-[#1e3a55] text-slate-500 hover:border-[#2a4a6a] hover:text-slate-300"
                  }`}
                >
                  {t(f.labelKey)}
                  <span className="ml-1.5 text-[10px] opacity-60">{count}</span>
                </button>
              );
            })}
          </div>

          {/* Search */}
          <div className="relative ml-auto">
            <Search
              size={11}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("project.searchProjects")}
              className="w-52 bg-[#0b1d30] border border-[#1e3a55] rounded pl-7 pr-3 py-1.5 text-[11px] text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200"
              >
                <X size={10} />
              </button>
            )}
          </div>

          {/* View toggle */}
          <div className="flex bg-[#0b1d30] border border-[#1e3a55] rounded overflow-hidden">
            <button
              onClick={() => setViewMode("card")}
              className={`px-2.5 py-1.5 transition-colors ${viewMode === "card" ? "bg-blue-600/30 text-blue-400" : "text-slate-500 hover:text-slate-200"}`}
              title={t("project.cardView")}
            >
              <Grid3X3 size={13} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`px-2.5 py-1.5 transition-colors ${viewMode === "list" ? "bg-blue-600/30 text-blue-400" : "text-slate-500 hover:text-slate-200"}`}
              title={t("project.listView")}
            >
              <List size={13} />
            </button>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Layers3 size={32} className="text-slate-700 mb-3" />
              <div className="text-[13px] text-slate-500">
                {search
                  ? t("project.noMatchingProjects", { search: search })
                  : t("project.noProjects")}
              </div>
              {!search && (
                <button
                  onClick={() => setShowNewModal(true)}
                  className="mt-4 flex items-center gap-1.5 px-4 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors"
                >
                  <Plus size={12} /> {t("project.newProject")}
                </button>
              )}
            </div>
          ) : viewMode === "card" ? (
            <div className="grid grid-cols-4 gap-4">
              {/* New project card */}
              <div
                onClick={() => setShowNewModal(true)}
                className="bg-[#0b1d30] border border-dashed border-[#1e3a55] rounded-lg h-[220px] flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/60 hover:bg-[#0e243a] transition-all group"
              >
                <div className="w-10 h-10 rounded-full border border-dashed border-[#2a4a6a] group-hover:border-blue-500 flex items-center justify-center mb-3 transition-colors">
                  <Plus
                    size={18}
                    className="text-slate-500 group-hover:text-blue-400 transition-colors"
                  />
                </div>
                <span className="text-sm text-slate-400 group-hover:text-slate-100 transition-colors">
                  {t("project.newProject")}
                </span>
                <span className="text-xs text-slate-600 mt-1 group-hover:text-slate-400 transition-colors">
                  {t("project.createProject")}
                </span>
              </div>

              {filtered.map((project: any) => (
                <ProjectCard
                  key={project?.id}
                  project={project}
                  onOpen={() => handleViewProject(project)}
                  onRename={() => handleRenameProject(project)}
                  onDuplicate={() => handleDuplicateProject(project)}
                  onArchive={() => handleArchiveProject(project)}
                  onDelete={() => handleDeleteProject(project)}
                  onUpdateThumbnail={handleUpdateThumbnail}
                />
              ))}
            </div>
          ) : (
            <div className="bg-[#0b1d30] border border-[#142235] rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#142235] bg-[#071526]">
                    <th className="w-14 py-3 pl-5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider"></th>
                    <th className="py-3 pr-4 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      {t("common.name")}
                    </th>
                    <th className="py-3 pr-4 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      {t("common.status")}
                    </th>
                    <th className="py-3 pr-4 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      {t("common.created")}
                    </th>
                    <th className="py-3 pr-4 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      {t("common.lastModified")}
                    </th>
                    <th className="py-3 pr-5 text-right text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                      {t("common.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((project) => (
                    <ProjectRow
                      key={project?.id}
                      project={project}
                      onOpen={() => handleViewProject(project)}
                      onRename={() => handleRenameProject(project)}
                      onDuplicate={() => handleDuplicateProject(project)}
                      onArchive={() => handleArchiveProject(project)}
                      onDelete={() => handleDeleteProject(project)}
                      onUpdateThumbnail={handleUpdateThumbnail}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ── */}
      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          onCreate={(id) => {
            setShowNewModal(false);
            onProjectCreate(id);
          }}
          existingProjects={projects}
        />
      )}

      {renameTarget && (
        <RenameModal
          initialName={L(renameTarget, 'projectName', 'project_name_en')}
          onConfirm={(name) => handleConfirmRename(renameTarget, name)}
          onClose={() => setRenameId(null)}
        />
      )}

      {deleteTarget && (
        <DeleteModal
          name={L(deleteTarget, 'projectName', 'project_name_en')}
          onConfirm={() => handleConfirmDelete(deleteTarget)}
          onClose={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
