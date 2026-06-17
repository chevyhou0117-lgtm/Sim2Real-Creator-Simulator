import React, { useState, useEffect } from "react";
import { X, Layers3 } from "lucide-react";
// import { factoryInfos, type FactoryProject } from "../../data/mockData";
import {
  getFactoryProjectListWithVersionApi,
  createFactoryProjectApi,
} from "../../api";
import { toast } from "sonner";
import { t } from "../../utils/i18n";

interface Props {
  onClose: () => void;
  onCreate: (projectId: string) => void;
  existingProjects?: any[];
}

// function computeNextVersion(
//   selectedProjectId: string,
//   existingProjects: any[],
//   versionNumber: number,
// ): number {
//   if (!selectedProjectId) return versionNumber;
//   const count = existingProjects.filter(
//     (p) =>
//       p.projectId === selectedProjectId ||
//       p.projectId.startsWith(selectedProjectId + "-") ||
//       p.projectId.startsWith(selectedProjectId + "_"),
//   ).length;
//   return versionNumber + 1;
// }

export function NewProjectModal({ onClose, onCreate }: Props) {
  const [factoryInfos, setFactoryInfos] = useState<any[]>([]);

  const [selectedFactoryId, setSelectedFactoryId] = useState("");
  const [factoryName, setFactoryName] = useState("");
  const [factoryId, setFactoryId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectCode, setProjectCode] = useState("");
  const [versionNumber, setVersionNumber] = useState(1);
  const [location, setLocation] = useState("");
  const [siteLength, setSiteLength] = useState("");
  const [siteWidth, setSiteWidth] = useState("");
  const [description, setDescription] = useState("");

  // const generatedVersion = computeNextVersion(
  //   selectedProjectId,
  //   existingProjects,
  //   versionNumber,
  // );

  // Auto-fill form fields when a factory is selected from dropdown
  useEffect(() => {
    if (selectedFactoryId) {
      const selectedFactory = factoryInfos.find(
        (factory: any) => factory.factoryId === selectedFactoryId,
      );
      if (selectedFactory) {
        setFactoryName(selectedFactory.factoryName || "");
        setFactoryId(selectedFactory.factoryId || "");
        setProjectName(selectedFactory.projectName || "");
        setProjectCode(selectedFactory.projectCode || "");
        setVersionNumber(selectedFactory.versionNumber || 1);
        setLocation(selectedFactory.location || "");
        setDescription(selectedFactory.description || "");
        setSiteLength(selectedFactory.siteLength?.toString() || "");
        setSiteWidth(selectedFactory.siteWidth?.toString() || "");
      }
    } else {
      // Clear fields when "Create New Factory" is selected
      setFactoryId("");
      setFactoryName("");
      setProjectName("");
      setProjectCode("");
      setVersionNumber(1);
      setLocation("");
      setDescription("");
      setSiteLength("");
      setSiteWidth("");
    }
  }, [selectedFactoryId, factoryInfos]);

  function handleCreate() {
    if (!selectedFactoryId) return;  // 必须选择已有工厂
    if (!projectName.trim()) return;
    if (!projectCode.trim()) return;
    createProject();
  }

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
      const res = await getFactoryProjectListWithVersionApi();
      if (res.code == 200) {
        let resData = res.data || [];
        console.log("factoryInfos:", resData);
        // 工厂项目必须建在已有工厂之上：不再提供「新建工厂」选项，默认选中第一个工厂。
        setFactoryInfos(resData);
        if (resData.length > 0) {
          setSelectedFactoryId(resData[0].factoryId);
        }
      }
    } catch (error) {
      console.error("Failed to fetch factory projects:", error);
    }
  };

  const createProject = async () => {
    let params: any = {
      factoryName,
      projectName,
      projectCode,
      versionNumber,
      location,
      siteLength: Number(siteLength),
      siteWidth: Number(siteWidth),
      description,
    };
    if (selectedFactoryId) {
      params.factoryId = selectedFactoryId;
    }
    console.log("createProject params:", params);
    const res = await createFactoryProjectApi(params);
    if (res.code == 200) {
      onCreate(res.data?.project_id || "");
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0b1d30] border border-[#1e3a55] rounded-xl w-[520px] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#142235]">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center">
              <Layers3 size={13} />
            </div>
            <span className="text-sm font-semibold text-slate-100">
              {t("newProjectModal.title")}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          <Field label={t("newProjectModal.selectFactory")}>
            <select
              value={selectedFactoryId}
              onChange={(e) => setSelectedFactoryId(e.target.value)}
              className="w-full bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer"
            >
              {factoryInfos.map((factory) => (
                <option key={factory.factoryId} value={factory.factoryId}>
                  {factory.factoryName}
                </option>
              ))}
            </select>
          </Field>

          <div className="text-[10px] text-slate-500 mb-2">
            {selectedFactoryId
              ? t("newProjectModal.selectedHint", {
                  name:
                    factoryInfos.find((f) => f.factoryId === selectedFactoryId)
                      ?.factoryName || "",
                })
              : t("newProjectModal.noSelectionHint")}
          </div>

          {selectedFactoryId && (
            <Field label={t("newProjectModal.factoryId")}>
              <input
                value={factoryId}
                disabled={true}
                onChange={(e) => setFactoryId(e.target.value)}
                placeholder={t("newProjectModal.placeholderFactoryId")}
                className="w-full bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </Field>
          )}

          <Field label={t("newProjectModal.factoryName")}>
            <input
              value={factoryName}
              disabled={true}
              placeholder={t("newProjectModal.placeholderFactoryName")}
              className="w-full bg-[#040d18] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-slate-400 placeholder-slate-600 focus:outline-none transition-colors cursor-not-allowed"
            />
          </Field>

          <Field label={t("newProjectModal.projectName")} required>
            <input
              value={projectName}
              onChange={(e) => {
                setProjectName(e.target.value);
              }}
              placeholder={t("newProjectModal.placeholderProjectName")}
              className="w-full bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </Field>

          <Field label={t("newProjectModal.projectCode")} required>
            <input
              value={projectCode}
              onChange={(e) => {
                setProjectCode(e.target.value);
              }}
              placeholder={t("newProjectModal.placeholderProjectCode")}
              className="w-full bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </Field>

          <Field label={t("newProjectModal.projectVersion")}>
            <div className="w-full bg-[#040d18] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-blue-400 font-mono flex items-center gap-2 select-none">
              <span className="text-slate-600 text-[10px]">{t("newProjectModal.auto")}</span>
              <span>V{versionNumber}</span>
              <span className="ml-auto text-[10px] text-slate-600">
                {selectedFactoryId
                  ? t("newProjectModal.incrementedFromExisting")
                  : t("newProjectModal.newFactoryStartsAtV1")}
              </span>
            </div>
          </Field>

          <Field label={t("newProjectModal.factoryLocation")}>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={t("newProjectModal.placeholderLocation")}
              className="w-full bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("newProjectModal.siteLength")}>
              <input
                type="number"
                value={siteLength}
                onChange={(e) => setSiteLength(e.target.value)}
                placeholder={t("newProjectModal.placeholderSiteDimension")}
                className="w-full bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </Field>
            <Field label={t("newProjectModal.siteWidth")}>
              <input
                type="number"
                value={siteWidth}
                onChange={(e) => setSiteWidth(e.target.value)}
                placeholder={t("newProjectModal.placeholderSiteDimension")}
                className="w-full bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </Field>
          </div>

          <Field label={t("newProjectModal.description")}>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("newProjectModal.placeholderDescription")}
              rows={2}
              className="w-full bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
            />
          </Field>

          <div className="bg-[#071526] border border-[#142235] rounded-md p-3 text-[11px] text-slate-400">
            {t("newProjectModal.tip")}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-5 pb-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 hover:text-slate-200 border border-[#1e3a55] rounded-md hover:border-[#2a4a6a] transition-colors"
          >
            {t("newProjectModal.cancel")}
          </button>
          <button
            onClick={handleCreate}
            disabled={
              !selectedFactoryId || !projectName.trim() || !projectCode.trim()
            }
            className="px-5 py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
          >
            {t("newProjectModal.createProject")}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] text-slate-400 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}
