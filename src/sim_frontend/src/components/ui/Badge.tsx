import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  className?: string;
  dot?: string;
  animated?: boolean;
}

export function Badge({ children, className, dot, animated }: BadgeProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border', className)}>
      {dot && (
        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', dot, animated && 'animate-pulse')} />
      )}
      {children}
    </span>
  );
}
