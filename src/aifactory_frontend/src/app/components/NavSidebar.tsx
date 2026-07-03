import React from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  Layers3, LayoutDashboard, Package, GitBranch,
  Link2, Settings, ChevronRight, Bell, User, Globe,
} from 'lucide-react';
import { getCurrentLang, setCurrentLang, useLocalized } from '../utils/i18n';
import { ThemeToggle } from './ThemeToggle';

const NAV_ITEMS = [
  { icon: <LayoutDashboard size={15} />, label: 'Dashboard', path: '/' },
  { icon: <Package size={15} />, label: 'Asset Library', path: '/asset-library' },
  { icon: <GitBranch size={15} />, label: 'Factory Projects', path: '/factories' },
  { icon: <Link2 size={15} />, label: 'Integration', path: '/integration' },
  { icon: <Settings size={15} />, label: 'System Admin', path: '/admin' },
];

export function NavSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const L = useLocalized();
  const currentLang = getCurrentLang();

  function isActive(path: string) {
    if (path === '/') return location.pathname === '/';
    if (path === '/factories') return location.pathname.startsWith('/factories') || location.pathname.startsWith('/factory/');
    return location.pathname.startsWith(path);
  }

  return (
    <aside className="w-12 bg-[var(--c-040d18)] border-r border-[var(--c-142235)] flex flex-col items-center py-3 gap-1 flex-shrink-0">
      {/* Logo */}
      <button
        onClick={() => navigate('/')}
        className="w-8 h-8 rounded-md flex items-center justify-center bg-blue-600 text-white mb-3 hover:bg-blue-500 transition-colors"
        title="AI Factory Creator"
      >
        <Layers3 size={16} />
      </button>

      {/* Nav items */}
      {NAV_ITEMS.map((item) => (
        <button
          key={item.path}
          onClick={() => navigate(item.path)}
          title={item.label}
          className={`w-8 h-8 rounded-md flex items-center justify-center transition-colors ${
            isActive(item.path)
              ? 'bg-blue-600/30 text-blue-400'
              : 'text-slate-500 hover:text-slate-200 hover:bg-[var(--c-142235)]'
          }`}
        >
          {item.icon}
        </button>
      ))}

      {/* Bottom: theme toggle + lang toggle + notifications + avatar */}
      <div className="mt-auto flex flex-col items-center gap-2">
        {/* Theme toggle */}
        <ThemeToggle />
        {/* Language toggle */}
        <button
          onClick={() => setCurrentLang(currentLang === 'zh-CN' ? 'en' : 'zh-CN')}
          title={currentLang === 'zh-CN' ? 'Switch to English' : '切换到中文'}
          className="w-8 h-8 rounded-md flex items-center justify-center text-[10px] font-bold text-slate-400 hover:text-slate-200 hover:bg-[var(--c-142235)] transition-colors"
        >
          <Globe size={14} />
        </button>
        <button
          title="Notifications"
          className="relative w-8 h-8 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-200 hover:bg-[var(--c-142235)] transition-colors"
        >
          <Bell size={14} />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500" />
        </button>
        <button
          title="Grace Liu — IE Engineer"
          className="w-8 h-8 rounded-full bg-blue-700 flex items-center justify-center text-white text-[10px] font-bold hover:bg-blue-600 transition-colors"
        >
          GL
        </button>
      </div>
    </aside>
  );
}

// ── Shared page header (breadcrumb bar) ───────────────────────────────────
export function PageHeader({
  crumbs,
  actions,
}: {
  crumbs: { label: string; path?: string }[];
  actions?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const L = useLocalized();
  const currentLang = getCurrentLang();
  return (
    <div className="h-11 bg-[var(--c-07111e)] border-b border-[var(--c-142235)] flex items-center px-5 flex-shrink-0 z-10">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
        <div className="flex items-center gap-1.5 mr-2">
          <div className="w-5 h-5 rounded bg-blue-600 flex items-center justify-center">
            <Layers3 size={11} />
          </div>
          <span className="font-semibold tracking-widest text-blue-300 uppercase text-[11px]">AI Factory Creator</span>
        </div>
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            <ChevronRight size={11} />
            {c.path ? (
              <button
                onClick={() => navigate(c.path!)}
                className="hover:text-slate-300 cursor-pointer transition-colors"
              >
                {c.label}
              </button>
            ) : (
              <span className="text-blue-400">{c.label}</span>
            )}
          </React.Fragment>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-3">
        {/* Language toggle */}
        <button
          onClick={() => setCurrentLang(currentLang === 'zh-CN' ? 'en' : 'zh-CN')}
          title={currentLang === 'zh-CN' ? 'Switch to English' : '切换到中文'}
          className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 hover:text-slate-200 bg-[var(--c-0b1d30)] hover:bg-[var(--c-142235)] border border-[var(--c-1e3a55)] hover:border-[var(--c-2a4a6a)] rounded px-2.5 py-1 transition-colors"
        >
          <Globe size={11} />
          <span className="uppercase tracking-wider">{currentLang === 'zh-CN' ? 'EN' : '中'}</span>
        </button>
        {actions}
      </div>
    </div>
  );
}
