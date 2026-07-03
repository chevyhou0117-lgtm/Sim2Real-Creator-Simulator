import React from 'react';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '../utils/theme';
import { getCurrentLang } from '../utils/i18n';

/** 深色 / 浅色主题切换按钮。样式对齐 NavSidebar 底部图标按钮。 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const zh = getCurrentLang() === 'zh-CN';
  const title = theme === 'dark'
    ? (zh ? '切换到浅色' : 'Switch to light')
    : (zh ? '切换到深色' : 'Switch to dark');

  return (
    <button
      onClick={toggle}
      title={title}
      className={`w-8 h-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-[var(--c-142235)] transition-colors ${className}`}
    >
      {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
    </button>
  );
}
