import { cn } from '@/lib/utils';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  size?: 'xs' | 'sm' | 'md';
}

const VARIANT_STYLES = {
  primary:   'bg-blue-600 hover:bg-blue-500 text-white border-transparent',
  secondary: 'bg-[#0b1d30] hover:bg-[#0e243a] text-slate-300 border-[#1e3a55]',
  ghost:     'bg-transparent hover:bg-[#0b1d30] text-slate-400 border-transparent',
  danger:    'bg-red-600/20 hover:bg-red-600/30 text-red-400 border-red-500/40',
  outline:   'bg-transparent hover:bg-[#0b1d30] text-slate-300 border-[#1e3a55]',
};

const SIZE_STYLES = {
  xs: 'px-2 py-1 text-[11px] rounded gap-1',
  sm: 'px-3 py-1.5 text-xs rounded-md gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { children, variant = 'secondary', size = 'sm', className, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      {...props}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center font-medium border transition-all cursor-pointer select-none',
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        disabled && 'opacity-40 cursor-not-allowed pointer-events-none',
        className,
      )}
    >
      {children}
    </button>
  );
});
