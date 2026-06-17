import { cn } from '@/lib/utils';
import { type ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  iconBg?: string;
  iconColor?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendVal?: string;
  status?: 'good' | 'warn' | 'bad' | 'neutral';
}

const STATUS_COLORS = {
  good:    'text-emerald-400',
  warn:    'text-amber-400',
  bad:     'text-red-400',
  neutral: 'text-slate-400',
};

export function MetricCard({ label, value, sub, icon, iconBg, iconColor, trendVal, status = 'neutral' }: MetricCardProps) {
  return (
    <div className="bg-[#0b1d30] border border-[#142235] rounded-xl p-4 flex items-start gap-3">
      {icon && (
        <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', iconBg, iconColor)}>
          {icon}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-xs text-slate-500 mb-1">{label}</div>
        <div className={cn('text-2xl font-bold leading-none', STATUS_COLORS[status])}>{value}</div>
        {(sub || trendVal) && (
          <div className="text-[11px] text-slate-500 mt-1.5">{sub} {trendVal}</div>
        )}
      </div>
    </div>
  );
}
