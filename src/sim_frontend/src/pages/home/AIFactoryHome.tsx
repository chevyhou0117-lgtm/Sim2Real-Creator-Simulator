import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Brain, Database, Monitor, CheckSquare, Box, CalendarClock,
  BarChart3, Bell, Leaf, Zap, LayoutGrid, Settings,
  ChevronRight, FlaskConical, Cpu, Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { LanguageToggle } from '@/components/LanguageToggle';
import { ThemeToggle } from '@/components/ThemeToggle';

interface Module {
  id: string;
  icon: React.ReactNode;
  label: string;
  desc: string;
  path?: string;
  active?: boolean;
  badge?: string;
  color: string;
}

const MODULES: Module[] = [
  {
    id: 'ai-assistant',
    icon: <Brain size={22} />,
    label: 'AI Assistant',
    desc: 'Smart Q&A and knowledge base',
    color: 'from-violet-600 to-purple-700',
    active: true,
  },
  {
    id: 'data-collect',
    icon: <Database size={22} />,
    label: 'Data Collection Platform',
    desc: 'Equipment IoT data integration',
    color: 'from-cyan-600 to-blue-700',
    active: true,
  },
  {
    id: 'device-mgmt',
    icon: <Monitor size={22} />,
    label: 'Equipment Management',
    desc: 'Equipment ledger and maintenance',
    color: 'from-blue-600 to-indigo-700',
    active: true,
  },
  {
    id: 'quality-mgmt',
    icon: <CheckSquare size={22} />,
    label: 'Quality Management',
    desc: 'SPC/SQC quality analysis',
    color: 'from-emerald-600 to-teal-700',
    active: true,
  },
  {
    id: 'digital-twin',
    icon: <Box size={22} />,
    label: '3D Enterprise Twin IoT Decision Platform',
    desc: 'Omniverse digital twin',
    color: 'from-blue-500 to-cyan-600',
    active: true,
    badge: 'Creator',
  },
  {
    id: 'adv-planning',
    icon: <CalendarClock size={22} />,
    label: 'Advanced Planning & Scheduling',
    desc: 'APS intelligent scheduling optimization',
    color: 'from-orange-600 to-amber-700',
    active: true,
  },
  {
    id: 'ops-decision',
    icon: <BarChart3 size={22} />,
    label: 'Operations Decision Center',
    desc: 'KPI dashboard and decisions',
    color: 'from-rose-600 to-pink-700',
    active: true,
  },
  {
    id: 'andon',
    icon: <Bell size={22} />,
    label: 'Andon System',
    desc: 'On-site anomaly call response',
    color: 'from-red-600 to-rose-700',
    active: true,
  },
  {
    id: 'simulation',
    icon: <FlaskConical size={22} />,
    label: 'Operations Simulation',
    desc: 'Line simulation and capacity optimization',
    path: '/simulation',
    color: 'from-blue-500 to-cyan-500',
    active: true,
    badge: 'New',
  },
  {
    id: 'carbon-mgmt',
    icon: <Leaf size={22} />,
    label: 'Carbon Management',
    desc: 'Carbon accounting and reduction',
    color: 'from-green-600 to-emerald-700',
    active: false,
  },
  {
    id: 'energy-mgmt',
    icon: <Zap size={22} />,
    label: 'Energy Management',
    desc: 'Energy monitoring and analysis',
    color: 'from-yellow-600 to-amber-700',
    active: false,
  },
  {
    id: 'master-data',
    icon: <LayoutGrid size={22} />,
    label: 'Master Data',
    desc: 'Factory master data management',
    color: 'from-slate-600 to-slate-700',
    active: true,
  },
];

const STATS = [
  { label: 'Online Equipment', value: '64', sub: '2 alerts', icon: <Cpu size={14} />, color: 'text-blue-400', bg: 'bg-blue-600/10' },
  { label: "Today's Output", value: '3,842', sub: '96% completion', icon: <Activity size={14} />, color: 'text-emerald-400', bg: 'bg-emerald-600/10' },
  { label: 'Active Simulations', value: '3', sub: '2 running', icon: <FlaskConical size={14} />, color: 'text-cyan-400', bg: 'bg-cyan-600/10' },
  { label: 'System Alerts', value: '7', sub: '3 pending', icon: <Bell size={14} />, color: 'text-amber-400', bg: 'bg-amber-600/10' },
];

export function AIFactoryHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [hoveredModule, setHoveredModule] = useState<string | null>(null);

  const handleModuleClick = (mod: Module) => {
    if (mod.path) navigate(mod.path);
  };

  return (
    <div className="min-h-screen bg-[var(--c-07111e)] text-slate-100 select-none">
      {/* Top bar */}
      <header className="h-12 bg-[var(--c-07111e)]/95 backdrop-blur border-b border-[var(--c-142235)] flex items-center px-6 sticky top-0 z-20">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
            <Cpu size={12} className="text-white" />
          </div>
          <span className="text-sm font-bold tracking-widest text-slate-200">{t('Foxconn Industrial Internet')}</span>
          <span className="text-[10px] text-slate-600 font-normal">AI Factory Platform</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-3">
          <ThemeToggle variant="bare" />
          <LanguageToggle variant="bare" />
          <button className="w-8 h-8 rounded-lg bg-[var(--c-0b1d30)] border border-[var(--c-142235)] flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors">
            <Bell size={14} />
          </button>
          <button className="w-8 h-8 rounded-lg bg-[var(--c-0b1d30)] border border-[var(--c-142235)] flex items-center justify-center text-slate-500 hover:text-slate-300 transition-colors">
            <Settings size={14} />
          </button>
          <button className="w-8 h-8 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xs text-blue-400 font-bold">
            L
          </button>
        </div>
      </header>

      {/* Hero Banner */}
      <div className="relative h-72 overflow-hidden">
        {/* Background gradient layers */}
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--c-050e1a)] via-[var(--c-07111e)] to-[var(--c-07111e)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(59,130,246,0.15)_0%,_transparent_60%)]" />
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-5"
          style={{ backgroundImage: 'linear-gradient(rgba(59,130,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.5) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />

        {/* Content */}
        <div className="relative h-full flex flex-col items-center justify-center text-center px-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-400 mb-4">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
            {t('Smart Manufacturing & Industrial Internet Solutions Provider')}
          </div>
          <h1 className="text-4xl font-bold text-white mb-3 tracking-tight">{t('Foxconn Industrial Internet')} · AI Factory</h1>
          <p className="text-sm text-slate-400 max-w-lg leading-relaxed">
            {t('Build an enterprise-grade digital twin platform that combines Omniverse with the MOM system to enable end-to-end validation from design and simulation through deployment. Integrate production SFC data and equipment IoT data visualization, providing remote real-time monitoring and alerts to improve efficiency and operational performance.')}
          </p>
        </div>

        {/* Stats Bar */}
        <div className="absolute bottom-0 left-0 right-0 px-6 pb-0">
          <div className="bg-[var(--c-0b1d30)]/80 backdrop-blur border border-[var(--c-142235)] rounded-t-xl px-6 py-3 flex items-center divide-x divide-[var(--c-142235)]">
            {STATS.map((s) => (
              <div key={s.label} className="flex items-center gap-3 px-6 first:pl-0 last:pr-0">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', s.bg, s.color)}>
                  {s.icon}
                </div>
                <div>
                  <div className={cn('text-lg font-bold leading-none', s.color)}>{s.value}</div>
                  <div className="text-[10px] text-slate-600 mt-0.5">{t(s.label)} · {t(s.sub)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modules Grid */}
      <div className="px-6 pt-4 pb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-300">{t('Modules')}</h2>
          <span className="text-[11px] text-slate-600">{t('{{count}} modules available', { count: MODULES.filter(m => m.active).length })}</span>
        </div>

        <div className="grid grid-cols-4 gap-3 xl:grid-cols-6">
          {MODULES.map((mod) => (
            <div
              key={mod.id}
              onClick={() => handleModuleClick(mod)}
              onMouseEnter={() => setHoveredModule(mod.id)}
              onMouseLeave={() => setHoveredModule(null)}
              className={cn(
                'relative group bg-[var(--c-0b1d30)] border rounded-xl p-4 flex flex-col items-center text-center gap-2 transition-all duration-200',
                mod.active
                  ? 'border-[var(--c-142235)] hover:border-[var(--c-1e3a55)] cursor-pointer hover:bg-[var(--c-0d2035)]'
                  : 'border-[var(--c-0e1e2e)] opacity-40 cursor-not-allowed',
                mod.id === 'simulation' && 'ring-1 ring-blue-500/30',
                hoveredModule === mod.id && mod.active && 'shadow-lg shadow-black/20',
              )}
            >
              {/* Icon */}
              <div className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br text-white transition-transform',
                mod.color,
                hoveredModule === mod.id && mod.active && 'scale-110',
              )}>
                {mod.icon}
              </div>

              {/* Label */}
              <div className="text-[11px] font-semibold text-slate-300 leading-tight">{t(mod.label)}</div>
              <div className="text-[10px] text-slate-600 leading-tight">{t(mod.desc)}</div>

              {/* Badge */}
              {mod.badge && (
                <span className="absolute top-2 right-2 text-[9px] font-bold bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
                  {mod.badge}
                </span>
              )}

              {/* Arrow on hover */}
              {mod.active && mod.path && (
                <div className={cn(
                  'absolute bottom-2 right-2 text-slate-600 transition-all',
                  hoveredModule === mod.id && 'text-blue-400',
                )}>
                  <ChevronRight size={12} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Recent Activity */}
      <div className="px-6 pb-8">
        <div className="grid grid-cols-2 gap-4">
          {/* Recent Plans */}
          <div className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-xl">
            <div className="px-5 py-4 border-b border-[var(--c-142235)] flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-300">{t('Recent Simulation Plans')}</h3>
              <button onClick={() => navigate('/simulation')} className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5 transition-colors">
                {t('View All')} <ChevronRight size={11} />
              </button>
            </div>
            <div className="p-2 space-y-0.5">
              {[
                { name: 'SMT Line A - NPI Capacity Assessment', status: 'Completed', time: '09:23', color: 'text-emerald-400' },
                { name: 'Two-Shift Capacity Expansion Plan - Line B', status: 'Running', time: '10:05', color: 'text-amber-400' },
                { name: 'Changeover Optimization - Line L03', status: 'Ready', time: '08:44', color: 'text-blue-400' },
              ].map((item, i) => (
                <div key={i} onClick={() => navigate('/simulation')} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--c-0d2035)] cursor-pointer transition-colors">
                  <div className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', item.color, 'bg-current/10')}>{t(item.status)}</div>
                  <span className="text-xs text-slate-300 flex-1 truncate">{t(item.name)}</span>
                  <span className="text-[10px] text-slate-600">{item.time}</span>
                </div>
              ))}
            </div>
          </div>

          {/* System Status */}
          <div className="bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-xl">
            <div className="px-5 py-4 border-b border-[var(--c-142235)]">
              <h3 className="text-sm font-semibold text-slate-300">{t('System Status')}</h3>
            </div>
            <div className="p-4 space-y-3">
              {[
                { label: 'Master Data Platform', status: 'Normal', color: 'bg-emerald-400', time: 'Synced 2h ago' },
                { label: 'ERP Interface', status: 'Normal', color: 'bg-emerald-400', time: 'Last check 5m ago' },
                { label: 'MES Interface', status: 'Warning', color: 'bg-amber-400', time: 'Response delay >2s' },
                { label: 'Simulation Compute Service', status: 'Normal', color: 'bg-emerald-400', time: '3 tasks running' },
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={cn('w-2 h-2 rounded-full flex-shrink-0', item.color)} />
                  <span className="text-xs text-slate-400 flex-1">{t(item.label)}</span>
                  <span className={cn('text-[11px] font-medium', item.status === 'Warning' ? 'text-amber-400' : 'text-emerald-400')}>{t(item.status)}</span>
                  <span className="text-[10px] text-slate-600 w-32 text-right">{t(item.time)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
