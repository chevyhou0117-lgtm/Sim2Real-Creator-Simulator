import React, { useState } from "react";
import { Copy, X } from "lucide-react";
import type { AssetItem } from "../../data/mockData";

interface CopyAssetModalProps {
  asset: AssetItem;
  onClose: () => void;
}

export function CopyAssetModal({ asset, onClose }: CopyAssetModalProps) {
  const latestVersion = asset.versions?.[asset.versions.length - 1];
  const [sourceVersionId, setSourceVersionId] = useState(
    latestVersion?.id ?? "",
  );
  const [newName, setNewName] = useState(`${asset.name}_copy`);

  function handleConfirm() {
    // In a real app this would create the new asset via API
    alert(
      `已创建新资产：${newName}（从 ${asset.name} ${latestVersion?.versionLabel ?? "V1.0"} 复制）`,
    );
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0b1d30] border border-[#1e3a55] rounded-xl w-[440px] shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#142235]">
          <div className="flex items-center gap-2">
            <Copy size={14} className="text-emerald-400" />
            <span className="text-sm font-semibold text-slate-100">
              Copy Asset
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-[11px] text-slate-400">
            Creates a fully independent new asset with its own version history
            starting at <span className="text-blue-300 font-medium">V1.0</span>.
          </p>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Source Version
            </label>
            {asset.versions && asset.versions.length > 0 ? (
              <select
                value={sourceVersionId}
                onChange={(e) => setSourceVersionId(e.target.value)}
                className="w-full bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
              >
                {asset.versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.versionLabel} — {v.status}{" "}
                    {v.referencedByProjects
                      ? `(${v.referencedByProjects} projects)`
                      : ""}
                  </option>
                ))}
              </select>
            ) : (
              <div className="text-[11px] text-slate-500 bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2">
                V1.0 (current)
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              New Asset Name
            </label>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
              placeholder="Enter new asset name"
            />
          </div>

          <div className="bg-[#071526] border border-[#1e3a55] rounded-md p-3">
            <div className="text-[10px] text-slate-500 space-y-1">
              <div className="flex justify-between">
                <span>Copied from</span>
                <span className="text-slate-300">
                  {asset.name}{" "}
                  {asset.versions?.find((v) => v.id === sourceVersionId)
                    ?.versionLabel ?? "V1.0"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>New version</span>
                <span className="text-blue-300 font-medium">V1.0</span>
              </div>
              <div className="flex justify-between">
                <span>Initial status</span>
                <span className="text-amber-400">Draft</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[#142235]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 border border-[#1e3a55] rounded-md hover:border-[#2a4a6a] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!newName.trim()}
            className="px-4 py-2 text-xs bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-md transition-colors flex items-center gap-1.5"
          >
            <Copy size={11} /> Confirm Copy
          </button>
        </div>
      </div>
    </div>
  );
}