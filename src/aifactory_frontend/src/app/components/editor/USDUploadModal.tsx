import React, { useState, useRef } from "react";
import {
  HardDrive,
  FolderOpen,
  Link2,
  X,
  LinkIcon,
  Unlink,
  FileBox,
  AlertCircle,
  Check,
} from "lucide-react";
import type { USDFile, USDFileFormat } from "../../../types/factoryEditor";

import { uploadFactoryModelApi } from "../../api";
import { t, useLocalized } from "../../utils/i18n";
import { toast } from "sonner";

const isZipFile = (file: File) => /\.zip$/i.test(file.name);

const toUSDFile = (file: File): USDFile => ({
  id: `selected-${Date.now()}`,
  name: file.name,
  size: Math.round(file.size / 1024 / 1024),
  format: "zip",
  uploadedAt: new Date().toISOString().slice(0, 10),
  status: "uploaded",
});

const FORMAT_COLOR: Record<USDFileFormat, string> = {
  usd: "bg-blue-600/20 text-blue-400 border-blue-600/40",
  zip: "bg-blue-600/20 text-green-400 border-green-600/40",
  usda: "bg-violet-600/20 text-violet-400 border-violet-600/40",
  usdc: "bg-cyan-600/20 text-cyan-400 border-cyan-600/40",
  usdz: "bg-emerald-600/20 text-emerald-400 border-emerald-600/40",
  // folder: "bg-amber-600/20 text-amber-400 border-amber-600/40",
};

export function USDUploadModal({
  projectId,
  projectName,
  files,
  onSuccess,
  onClose,
  onLink,
  onUnlink,
  onRemove,
  onAdd,
}: {
  projectId: string;
  projectName: string;
  files: USDFile[];
  onSuccess: () => void;
  onClose: () => void;
  onLink: (id: string) => void;
  onUnlink: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: (files: USDFile[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<USDFile | null>(null);
  const [manualPath, setManualPath] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 确保语言切换时组件重渲染
  useLocalized();

  function handlePathSelect(pathValue: string) {
    const path = pathValue.trim();
    if (!path) return;
    if (!/\.zip$/i.test(path)) {
      toast.error(t("usdUploadModal.zipOnly"));
      return;
    }

    const fileName = path.split("/").pop() || path.split("\\").pop() || path;

    const newFile: USDFile = {
      id: `selected-${Date.now()}`,
      name: fileName,
      size: 1.0,
      format: "zip",
      uploadedAt: new Date().toISOString().slice(0, 10),
      status: "uploaded",
    };
    setSelectedFile(newFile);
  }

  // 处理文件选择
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log("handleFileSelect", e.target.files);

    const selectedFile = e?.target?.files?.[0];
    console.log(selectedFile);
    if (!selectedFile) return;
    if (!isZipFile(selectedFile)) {
      e.target.value = "";
      toast.error(t("usdUploadModal.zipOnly"));
      return;
    }

    setSelectedFile(toUSDFile(selectedFile));
    void handleUpload(selectedFile);
  };

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);

    const droppedFile = e.dataTransfer.files?.[0];
    console.log("handleDrop", droppedFile);
    if (!droppedFile) return;
    if (!isZipFile(droppedFile)) {
      toast.error(t("usdUploadModal.zipOnly"));
      return;
    }

    setSelectedFile(toUSDFile(droppedFile));
    void handleUpload(droppedFile);
  }

  function handleLink() {
    if (selectedFile) {
      // Unlink any currently linked file first
      const currentlyLinked = files.find((f) => f.status === "linked");
      if (currentlyLinked) {
        onUnlink(currentlyLinked.id);
      }

      onAdd([selectedFile]);
      onLink(selectedFile.id);
      setSelectedFile(null);
    }
  }

  function handleRemove() {
    if (selectedFile) {
      onRemove(selectedFile.id);
      setSelectedFile(null);
    }
  }

  const linkedFile = files.find((f) => f.status === "linked");

  // 处理上传
  const handleUpload = async (file: File) => {
    setSelectedFile((prev) =>
      prev ? { ...prev, uploadStatus: "uploading", progress: 0 } : prev,
    );

    try {
      // 创建 FormData 对象
      const formData = new FormData();
      formData.append("file", file);
      formData.append("project_id", projectId);

      // 调用上传接口，添加进度监听
      await uploadFactoryModelApi(
        formData,
        (progressEvent) => {
          // console.log("上传进度:", progressEvent);
          if (progressEvent.total) {
            const progress = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total,
            );
            setSelectedFile((prev) =>
              prev ? { ...prev, uploadStatus: "uploading", progress } : prev,
            );
          }
        },
      );
      console.log("上传成功");
      // 先设置上传成功状态，保持进度条显示
      setSelectedFile((prev) =>
        prev ? { ...prev, uploadStatus: "completed", progress: 100 } : prev,
      );

      // 上传成功后调用回调;
      onSuccess();

      // 延迟关闭，让用户看到成功提示
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (error) {
      console.error("上传失败:", error);
      // 上传失败处理
      setSelectedFile((prev) =>
        prev ? { ...prev, uploadStatus: "error", progress: 0 } : prev,
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      toast.error(
        error instanceof Error
          ? error.message
          : t("usdUploadModal.uploadFailed"),
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded-xl w-[680px] max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-142235)] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-600/30 flex items-center justify-center">
              <HardDrive size={15} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-100">
                {t("usdUploadModal.title")}
              </h2>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {t("usdUploadModal.subtitle", { projectName })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[10px] text-slate-500 flex items-center gap-2">
              <span className="text-slate-300 font-medium">{files.length}</span>{" "}
              {t("usdUploadModal.filesTotal", { count: files.length })}
              {linkedFile && (
                <>
                  <span className="w-1 h-1 rounded-full bg-slate-700" />
                  <span className="text-emerald-400 font-medium">1</span>{" "}
                  {t("usdUploadModal.linkedCount", { count: 1 })}
                </>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-200 transition-colors p-1"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* File Selection Area */}
        <div className="px-5 pt-4 flex-shrink-0">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDrop={handleDrop}
            onDragLeave={() => setDragging(false)}
            // onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg py-6 flex flex-col items-center justify-center cursor-pointer transition-all ${
              dragging
                ? "border-blue-500 bg-blue-600/10"
                : "border-[var(--c-1e3a55)] hover:border-blue-500/60 hover:bg-[var(--c-0b1d30)]"
            }`}
          >
            {!selectedFile ? (
              <>
                <div className="w-10 h-10 rounded-full bg-blue-600/10 border border-blue-600/20 flex items-center justify-center mb-3">
                  <FolderOpen size={18} className="text-blue-400" />
                </div>
                <p className="text-xs text-slate-300 font-medium">
                  {t("usdUploadModal.dropHint")}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  {t("usdUploadModal.supportedFormats")}
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <div className="mt-3 flex gap-2 justify-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="text-[11px] text-slate-300 bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded px-3 py-1.5 hover:border-blue-500/60 hover:bg-[var(--c-0b1d30)] transition-colors flex items-center gap-1.5"
                  >
                    <FolderOpen size={11} /> {t("usdUploadModal.selectFile")}
                  </button>
                </div>
                <div className="mt-3 pt-3 border-t border-[var(--c-142235)] w-full">
                  <p className="text-[11px] text-slate-500 mb-2 text-center">
                    {t("usdUploadModal.manualPathLabel")}
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={manualPath}
                      onChange={(e) => setManualPath(e.target.value)}
                      placeholder={t("usdUploadModal.pathPlaceholder")}
                      className="flex-1 text-[11px] bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded px-2.5 py-1.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      onClick={() => handlePathSelect(manualPath)}
                      className="text-[11px] text-white bg-blue-600 hover:bg-blue-700 rounded px-3 py-1.5 transition-colors flex-shrink-0"
                    >
                      {t("usdUploadModal.use")}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full px-4">
                <div className="flex items-center gap-3 bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-lg px-3 py-2.5">
                  {/* Format badge */}
                  <span
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase flex-shrink-0 tracking-wider ${FORMAT_COLOR[selectedFile.format] ?? "bg-slate-600/20 text-slate-400 border-slate-600/40"}`}
                  >
                    {selectedFile.format}
                  </span>

                  {/* Name + info */}
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-medium text-slate-200 truncate">
                      {selectedFile.name}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                      <span>{selectedFile.size} MB</span>
                      <span className="w-1 h-1 rounded-full bg-slate-700" />
                      <span>{selectedFile.uploadedAt}</span>
                    </div>

                    {/* Upload progress bar */}
                    {selectedFile.uploadStatus === "uploading" && (
                      <div className="mt-2">
                        <div className="flex items-center justify-between text-[9px] text-slate-500 mb-0.5">
                          <span>{t("usdUploadModal.uploading")}</span>
                          <span>{selectedFile.progress}%</span>
                        </div>
                        <div className="h-0.5 bg-[var(--c-071526)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-300"
                            style={{ width: `${selectedFile.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {selectedFile.uploadStatus === "completed" && (
                      <div className="mt-2 flex items-center gap-1.5 text-[9px] text-emerald-400">
                        <Check size={9} />
                        <span>{t("usdUploadModal.uploadCompleted")}</span>
                      </div>
                    )}
                    {selectedFile.uploadStatus === "error" && (
                      <div className="mt-2 flex items-center gap-1.5 text-[9px] text-red-400">
                        <AlertCircle size={9} />
                        <span>{t("usdUploadModal.uploadFailed")}</span>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={handleLink}
                      title={t("usdUploadModal.linkToScene")}
                      className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-blue-400 hover:bg-blue-400/10 transition-colors"
                    >
                      <Link2 size={11} />
                    </button>
                    <button
                      onClick={handleRemove}
                      title={t("usdUploadModal.remove")}
                      className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      <X size={11} />
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-600 mt-2 text-center">
                  {t("usdUploadModal.changeSelection")}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Currently Linked File/Folder */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <div className="text-[11px] font-medium text-slate-400 mb-3">
            <span>{t("usdUploadModal.currentlyLinked")}</span>
          </div>

          {linkedFile ? (
            <div className="flex items-center gap-3 bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-lg px-3 py-2.5">
              {/* Format badge */}
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded border uppercase flex-shrink-0 tracking-wider ${FORMAT_COLOR[linkedFile.format] ?? "bg-slate-600/20 text-slate-400 border-slate-600/40"}`}
              >
                {linkedFile.format}
              </span>

              {/* Name + info */}
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-slate-200 truncate">
                  {linkedFile.name}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 flex items-center gap-2">
                  <span>{linkedFile.size} MB</span>
                  <span className="w-1 h-1 rounded-full bg-slate-700" />
                  <span>{linkedFile.uploadedAt}</span>
                </div>
              </div>

              {/* Status + actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                  <LinkIcon size={10} /> {t("usdUploadModal.linked")}
                </span>
                <button
                  onClick={() => onUnlink(linkedFile.id)}
                  title={t("usdUploadModal.unlink")}
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                >
                  <Unlink size={11} />
                </button>
                <button
                  onClick={() => onRemove(linkedFile.id)}
                  title={t("usdUploadModal.remove")}
                  className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                >
                  <X size={11} />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 text-[11px] text-slate-600">
              <FileBox size={22} className="mx-auto mb-2 opacity-40" />
              {t("usdUploadModal.noFileLinked")}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--c-142235)] flex items-center justify-between flex-shrink-0">
          <p className="text-[10px] text-slate-600 flex items-center gap-1.5">
            <AlertCircle size={10} />
            {t("usdUploadModal.footerNote")}
          </p>
          <button
            onClick={onClose}
            className="text-[11px] text-white bg-blue-600 hover:bg-blue-700 rounded px-4 py-1.5 transition-colors"
          >
            {t("usdUploadModal.done")}
          </button>
        </div>
      </div>
    </div>
  );
}
