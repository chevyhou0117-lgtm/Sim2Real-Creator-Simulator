import React, { useState } from "react";
import { X } from "lucide-react";
import type { AssetLibraryCategory } from "../../data/mockData";

interface CategoryDialogProps {
  parentId: string;
  target: AssetLibraryCategory | null;
  onSave: (parentId: string, name: string, code: string, desc: string) => void;
  onCancel: () => void;
}

export function CategoryDialog({ parentId, target, onSave, onCancel }: CategoryDialogProps) {
  const isEdit = target !== null;
  const [name, setName] = useState(target?.name ?? "");
  const [code, setCode] = useState(target?.code ?? "");
  const [desc, setDesc] = useState(target?.description ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    onSave(parentId, name.trim(), code.trim(), desc.trim());
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-xl w-[400px] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-142235)]">
          <span className="text-sm font-semibold text-slate-100">
            {isEdit ? "Edit Category" : "Add Category"}
          </span>
          <button
            onClick={onCancel}
            className="text-slate-500 hover:text-slate-200 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1.5">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. SMT Process"
                className="w-full bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1.5">
                Code <span className="text-red-400">*</span>
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. smt_process_01"
                className="w-full bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1.5">
                Description
              </label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Category description..."
                rows={3}
                className="w-full bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[var(--c-142235)]">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs text-slate-400 border border-[var(--c-1e3a55)] rounded-md hover:border-[var(--c-2a4a6a)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !code.trim()}
              className="px-5 py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/40 disabled:text-slate-400 text-white rounded-md font-medium transition-colors"
            >
              {isEdit ? "Save Changes" : "Add Category"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}