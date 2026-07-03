import { useTranslation } from 'react-i18next';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme, type Theme } from '@/lib/theme';

interface Props {
  /** sidebar = 整行（图标 + 标签 + 分段控件）；bare = 仅分段控件，用于顶栏 */
  variant?: 'sidebar' | 'bare';
  /** 侧边栏收起时只显示一个图标按钮 */
  collapsed?: boolean;
}

/** 深色 / 浅色主题切换。选择持久化在 localStorage。 */
export function ThemeToggle({ variant = 'sidebar', collapsed = false }: Props) {
  const { t } = useTranslation();
  const { theme, setTheme, toggle } = useTheme();

  if (variant === 'sidebar' && collapsed) {
    return (
      <button
        onClick={toggle}
        title={theme === 'dark' ? t('Light theme') : t('Dark theme')}
        className="w-full flex items-center justify-center px-2 py-2.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-[var(--c-0b1d30)] transition-all"
      >
        {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
      </button>
    );
  }

  const segmented = (
    <div className="flex items-center rounded-md border border-[var(--c-1e3a55)] overflow-hidden flex-shrink-0">
      {(['dark', 'light'] as const).map((m: Theme) => (
        <button
          key={m}
          onClick={() => setTheme(m)}
          title={m === 'dark' ? t('Dark theme') : t('Light theme')}
          className={cn(
            'px-1.5 py-[3px] flex items-center transition-colors',
            theme === m
              ? 'bg-blue-600/30 text-blue-300'
              : 'text-slate-500 hover:text-slate-300',
          )}
        >
          {m === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
        </button>
      ))}
    </div>
  );

  if (variant === 'bare') return segmented;

  return (
    <div className="w-full flex items-center gap-2.5 px-2 py-2 text-slate-500">
      {theme === 'dark' ? <Moon size={15} className="flex-shrink-0" /> : <Sun size={15} className="flex-shrink-0" />}
      <span className="text-xs flex-1 whitespace-nowrap">{t('Theme')}</span>
      {segmented}
    </div>
  );
}
