import { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard, FlaskConical, GitCompare, Database,
  FileText, ChevronLeft, ChevronRight, Settings,
  Factory, Home,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ThemeToggle } from '@/components/ThemeToggle';

const NAV_ITEMS = [
  { icon: LayoutDashboard, label: 'Plan Management', path: '/simulation' },
  { icon: GitCompare,      label: 'Plan Comparison', path: '/simulation/compare' },
  { icon: Database,        label: 'Master Data Management', path: '/simulation/master-data' },
  { icon: FileText,        label: 'Parameter Templates', path: '/simulation/templates' },
];

export function SimulationLayout() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/simulation') return location.pathname === '/simulation';
    return location.pathname.startsWith(path);
  };

  // 方案配置页：主题/语言/头像已并入页面自己的单行顶栏，应用级顶栏隐藏，给串流腾纵向空间
  const hideHeader = /^\/simulation\/plan\/[^/]+\/config/.test(location.pathname);

  return (
    <div className="flex h-screen bg-[var(--c-07111e)] overflow-hidden">
      {/* Sidebar
          沉浸式：串流页（PlanConfig/Running 3D）把 Kit 串流放成全窗口 fixed 层，侧边栏/顶栏
          用半透明玻璃 + z-30 浮在其上（串流延伸到玻璃后面）；非串流页玻璃底色与页面底色
          同色，视觉与原不透明一致，故无需按路由区分。 */}
      <aside className={cn(
        'relative z-30 flex flex-col bg-[var(--c-07111e)]/70 backdrop-blur-md border-r border-[var(--c-142235)]/70 shadow-md transition-all duration-200 flex-shrink-0',
        collapsed ? 'w-12' : 'w-52',
      )}>
        {/* Logo */}
        <div className={cn('h-12 flex items-center border-b border-[var(--c-142235)] px-3 gap-2.5 flex-shrink-0')}>
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center flex-shrink-0">
            <FlaskConical size={14} className="text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div className="text-xs font-semibold text-blue-300 tracking-wider whitespace-nowrap">{t('Operations Simulation')}</div>
              <div className="text-[10px] text-slate-600 whitespace-nowrap">AI Factory</div>
            </div>
          )}
        </div>

        {/* Back to Home */}
        <div className="px-2 pt-2">
          <button
            onClick={() => navigate('/')}
            className={cn(
              'w-full flex items-center gap-2 px-2 py-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-[var(--c-0b1d30)] transition-all text-xs',
              collapsed && 'justify-center',
            )}
          >
            <Home size={14} />
            {!collapsed && <span>{t('Back to Home')}</span>}
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 px-2 pt-2 space-y-0.5">
          {NAV_ITEMS.map(({ icon: Icon, label, path }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                'w-full flex items-center gap-2.5 px-2 py-2.5 rounded-lg transition-all text-xs',
                collapsed && 'justify-center',
                isActive(path)
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-500 hover:text-slate-200 hover:bg-[var(--c-0b1d30)] border border-transparent',
              )}
            >
              <Icon size={15} className="flex-shrink-0" />
              {!collapsed && <span className="font-medium whitespace-nowrap">{t(label)}</span>}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="px-2 pb-3 space-y-0.5 border-t border-[var(--c-142235)] pt-2">
          <button
            onClick={() => navigate('/simulation/settings')}
            className={cn(
              'w-full flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-[var(--c-0b1d30)] transition-all text-xs',
              collapsed && 'justify-center',
            )}
          >
            <Settings size={15} />
            {!collapsed && <span>{t('Settings')}</span>}
          </button>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'w-full flex items-center gap-2.5 px-2 py-2.5 rounded-lg text-slate-600 hover:text-slate-400 hover:bg-[var(--c-0b1d30)] transition-all text-xs',
              collapsed && 'justify-center',
            )}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
            {!collapsed && <span>{t('Collapse')}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header — 同侧边栏：玻璃条浮在全窗口串流上（方案配置页隐藏，见 hideHeader） */}
        {!hideHeader && (
        <header className="relative z-30 h-12 bg-[var(--c-07111e)]/70 backdrop-blur-md border-b border-[var(--c-142235)]/70 shadow-md flex items-center px-6 flex-shrink-0 gap-4">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <Factory size={13} />
            <span>{t('Yantai Plant')}</span>
            <span className="w-1 h-1 bg-slate-700 rounded-full" />
            <span className="text-slate-400">{t('Operations Simulation')}</span>
          </div>
          <div className="flex-1" />
          <div className="flex items-center gap-3 text-[11px] text-slate-500">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>{t('Master data synced · 2026-04-10 08:30')}</span>
          </div>
          <ThemeToggle variant="bare" />
          <LanguageToggle variant="bare" />
          <div className="w-7 h-7 rounded-full bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] flex items-center justify-center text-xs text-slate-400 font-medium cursor-pointer hover:border-blue-500/40 transition-colors">
            L
          </div>
        </header>
        )}

        {/* Page Content */}
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
