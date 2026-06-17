import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

// ── Action Button ──────────────────────────────────────────────────────────

export function ActionBtn({
  icon, label, color, onClick, disabled,
}: {
  icon: React.ReactNode; label: string; color: string; onClick: () => void; disabled?: boolean;
}) {
  const colorMap: Record<string, string> = {
    blue:   'bg-blue-900/40 text-blue-400 border-blue-700/40 hover:bg-blue-800/50',
    indigo: 'bg-indigo-900/40 text-indigo-400 border-indigo-700/40 hover:bg-indigo-800/50',
    slate:  'bg-slate-800/60 text-slate-400 border-slate-700/40 hover:bg-slate-700/50',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded border transition-colors ${
        colorMap[color] ?? colorMap.slate
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {icon} {label}
    </button>
  );
}

// ── Config Section ─────────────────────────────────────────────────────────

export function ConfigSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold text-slate-400 mb-2 flex items-center gap-1.5 uppercase tracking-wider">
        <div className="w-[2px] h-3 bg-blue-500 rounded-full" />
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

// ── Collapsible Section ────────────────────────────────────────────────────

export function CollapsibleSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-[#1e3a55] rounded-md overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-[#0f2035] transition-colors"
      >
        <span className="font-medium">{title}</span>
        <ChevronDown size={11} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>
      {open && <div className="px-3 pb-3 pt-1 border-t border-[#1e3a55] space-y-1">{children}</div>}
    </div>
  );
}

// ── Config Row ─────────────────────────────────────────────────────────────

export function ConfigRow({
  label, value, editing, dropdown,
  nodeId, fieldPath, onFieldChange,
}: {
  label: string; value: string; editing?: boolean; dropdown?: boolean;
  nodeId?: string;
  fieldPath?: string;
  onFieldChange?: (nodeId: string, fieldPath: string, newValue: string) => void;
}) {
  const [localValue, setLocalValue] = useState(value);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleBlur = () => {
    if (nodeId && fieldPath && onFieldChange && localValue !== value) {
      onFieldChange(nodeId, fieldPath, localValue);
    }
  };

  return (
    <div className="flex items-center justify-between py-1 border-b border-[#142235]/60">
      <div className="flex items-center gap-1 flex-shrink-0 mr-2">
        {dropdown && <ChevronDown size={9} className="text-slate-600" />}
        <span className="text-[10px] text-slate-500">{label}</span>
      </div>
      {editing ? (
        <input
          value={localValue}
          onChange={handleChange}
          onBlur={handleBlur}
          className="text-[10px] text-slate-200 bg-[#071526] text-right border border-[#1e3a55] focus:border-blue-500 focus:outline-none rounded px-1.5 py-0.5 max-w-[55%]"
        />
      ) : (
        <span className="text-[10px] text-slate-200 text-right max-w-[55%] truncate">{value || '—'}</span>
      )}
    </div>
  );
}

// ── IoT Field ──────────────────────────────────────────────────────────────

export function IoTField({ label, value, placeholder, editing }: { label: string; value: string; placeholder: string; editing: boolean }) {
  return (
    <div className="flex items-center justify-between py-1 border-b border-[#142235]/60">
      <span className="text-[10px] text-slate-500 flex-shrink-0 mr-2">{label}</span>
      {editing ? (
        <input
          defaultValue={value}
          placeholder={placeholder}
          className="text-[10px] text-slate-200 bg-[#071526] border border-[#1e3a55] rounded px-2 py-0.5 text-right focus:outline-none focus:border-blue-500 w-28"
        />
      ) : (
        <span className="text-[10px] text-slate-200">{value || <span className="text-slate-600 italic">Not set</span>}</span>
      )}
    </div>
  );
}

// ── Form Card ──────────────────────────────────────────────────────────────

export function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-[#07111e] border border-[#1e3a55] rounded-lg p-4">
      <h4 className="text-xs font-semibold text-slate-200 mb-4 flex items-center gap-2">
        <div className="w-[2px] h-4 bg-blue-500 rounded-full" />
        {title}
      </h4>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

// ── Form Field ─────────────────────────────────────────────────────────────

export function FormField({
  label, placeholder, type = 'text', options,
}: {
  label: string; placeholder?: string; type?: string; options?: string[];
}) {
  return (
    <div>
      <label className="block text-[11px] text-slate-400 mb-1">{label}</label>
      {type === 'select' && options ? (
        <select className="w-full bg-[#0b1d30] border border-[#1e3a55] rounded px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-blue-500">
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={type}
          placeholder={placeholder}
          className="w-full bg-[#0b1d30] border border-[#1e3a55] rounded px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500"
        />
      )}
    </div>
  );
}
