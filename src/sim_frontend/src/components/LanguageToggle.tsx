import { useTranslation } from 'react-i18next';
import { Languages } from 'lucide-react';
import { cn } from '@/lib/utils';
import { setLang, type Lang } from '@/i18n';

interface Props {
  /** sidebar = 整行（图标 + 标签 + 分段控件）；bare = 仅分段控件，用于顶栏 */
  variant?: 'sidebar' | 'bare';
  /** 侧边栏收起时只显示一个图标按钮 */
  collapsed?: boolean;
}

/** 中 / 英语言切换。选择持久化在 localStorage。 */
export function LanguageToggle({ variant = 'sidebar', collapsed = false }: Props) {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language === 'en' ? 'en' : 'zh';

  if (variant === 'sidebar' && collapsed) {
    return (
      <button
        onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
        title={lang === 'zh' ? 'Switch to English' : '切换到中文'}
        className="w-full flex items-center justify-center px-2 py-2.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-[#0b1d30] transition-all"
      >
        <Languages size={15} />
      </button>
    );
  }

  const segmented = (
    <div className="flex items-center rounded-md border border-[#1e3a55] overflow-hidden flex-shrink-0">
      {(['zh', 'en'] as const).map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          className={cn(
            'px-2 py-0.5 text-[10px] font-medium transition-colors',
            lang === l
              ? 'bg-blue-600/30 text-blue-300'
              : 'text-slate-500 hover:text-slate-300',
          )}
        >
          {l === 'zh' ? '中文' : 'EN'}
        </button>
      ))}
    </div>
  );

  if (variant === 'bare') return segmented;

  return (
    <div className="w-full flex items-center gap-2.5 px-2 py-2 text-slate-500">
      <Languages size={15} className="flex-shrink-0" />
      <span className="text-xs flex-1 whitespace-nowrap">{t('Language')}</span>
      {segmented}
    </div>
  );
}
