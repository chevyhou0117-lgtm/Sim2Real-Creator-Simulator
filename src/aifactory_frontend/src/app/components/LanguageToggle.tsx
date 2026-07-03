import React from 'react';
import { Globe } from 'lucide-react';
import { getCurrentLang, setCurrentLang, useLocalized } from '../utils/i18n';

/**
 * 独立的中英文切换按钮组件
 * 用于没有 NavSidebar/PageHeader 的页面
 */
export function LanguageToggle({ className = '' }: { className?: string }) {
  const L = useLocalized();
  const currentLang = getCurrentLang();

  return (
    <button
      onClick={() => setCurrentLang(currentLang === 'zh-CN' ? 'en' : 'zh-CN')}
      title={currentLang === 'zh-CN' ? 'Switch to English' : '切换到中文'}
      className={`flex items-center gap-1.5 text-[10px] font-medium text-slate-400 hover:text-slate-200 bg-[var(--c-0b1d30)] hover:bg-[var(--c-142235)] border border-[var(--c-1e3a55)] hover:border-[var(--c-2a4a6a)] rounded px-2.5 py-1 transition-colors ${className}`}
    >
      <Globe size={11} />
      <span className="uppercase tracking-wider">{currentLang === 'zh-CN' ? 'EN' : '中'}</span>
    </button>
  );
}
