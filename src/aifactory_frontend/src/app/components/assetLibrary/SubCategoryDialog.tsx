import React, { useState } from "react";
import { X } from "lucide-react";
import type { CategoryNode } from "../../../types/category";

interface SubCategoryDialogProps {
  catId: string;
  target: CategoryNode | undefined;
  onSave: (catId: string, name: string, code: string, type: string, desc: string) => void;
  onCancel: () => void;
}

const TYPE_OPTIONS = [
  { value: "line_type", label: "Line Type（线体类型）" },
  { value: "equipment_type", label: "Equipment Type（设备类型）" },
];

export function SubCategoryDialog({
  catId,
  target,
  onSave,
  onCancel,
}: SubCategoryDialogProps) {
  const isEdit = target !== undefined;
  const [name, setName] = useState(target?.name ?? "");
  const [code, setCode] = useState(target?.code ?? "");
  const [type, setType] = useState(target?.type && target.type !== "category" ? target.type : "line_type");
  const [desc, setDesc] = useState(target?.description ?? "");

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim() || !code.trim()) return;
    onSave(catId, name.trim(), code.trim(), type, desc.trim());
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0b1d30] border border-[#1e3a55] rounded-xl w-[400px] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#142235]">
          <span className="text-sm font-semibold text-slate-100">
            {isEdit ? "Edit Category Type" : "Add Category Type"}
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
            {/* Type selection */}
            <div>
              <label className="block text-[11px] text-slate-400 mb-1.5">
                Type <span className="text-red-400">*</span>
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors appearance-none cursor-pointer"
                disabled={isEdit}
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Name */}
            <div>
              <label className="block text-[11px] text-slate-400 mb-1.5">
                Name <span className="text-red-400">*</span>
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. SMT Lines"
                className="w-full bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                autoFocus
              />
            </div>

            {/* Code */}
            <div>
              <label className="block text-[11px] text-slate-400 mb-1.5">
                Code <span className="text-red-400">*</span>
              </label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. smt_line_type_01"
                className="w-full bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-[11px] text-slate-400 mb-1.5">
                Description
              </label>
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Optional description..."
                rows={2}
                className="w-full bg-[#071526] border border-[#1e3a55] rounded-md px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors resize-none"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-[#142235]">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-xs text-slate-400 border border-[#1e3a55] rounded-md hover:border-[#2a4a6a] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !code.trim()}
              className="px-5 py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/40 disabled:text-slate-400 text-white rounded-md font-medium transition-colors"
            >
              {isEdit ? "Save Changes" : "Add Category Type"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
