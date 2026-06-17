import { cn } from '@/lib/utils';
import { type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className, ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs text-slate-400 font-medium">{label}</label>}
      <input
        {...props}
        className={cn(
          'bg-[#07111e] border border-[#1e3a55] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none',
          'placeholder:text-slate-600',
          'focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/20 transition-all',
          error && 'border-red-500/60',
          className,
        )}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

export function Select({ label, error, className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string; error?: string }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <label className="text-xs text-slate-400 font-medium">{label}</label>}
      <select
        {...props}
        className={cn(
          'bg-[#07111e] border border-[#1e3a55] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none cursor-pointer',
          'focus:border-blue-500/60 transition-all',
          error && 'border-red-500/60',
          className,
        )}
      >
        {children}
      </select>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
