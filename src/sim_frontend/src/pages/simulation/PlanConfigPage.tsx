import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  ChevronLeft, Save, CheckCircle2, AlertCircle, Upload, RefreshCw,
  ChevronDown, ChevronRight, Building2, Info, X, BookOpen, Play,
  Loader2, Maximize2, Minimize2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { planApi, masterApi, planMdApi, simulatorsToFrontend, simulatorsToBackend, parseReadyError, resolveCreatorUrl } from '@/lib/api';
import { kitSelectPrim, kitSelectMany, kitFocusPerspective, kitFocusPerspectiveMany, kitEnsureStage, kitSetFullscreen, subscribeOpenedStageResult, subscribeKitSelection } from '@/lib/kit';
import { playbackStop } from '@/lib/playback';
import { mdName } from '@/lib/mdName';
import type { PlanOut, OverrideOut, TaskOut, CreatorProjectOut, ReadinessOut, ReadyValidationError } from '@/types/api';

// ── PlanConfig 重做：5 级资产树 + 参数继承表 + Creator 项目下拉 + readiness chip ──
import { KitViewport } from '@/components/KitViewport';
import BopSchematicView from '@/components/BopSchematicView';
import { ThemeToggle } from '@/components/ThemeToggle';
import { LanguageToggle } from '@/components/LanguageToggle';
import { AssetSidebar } from './plan-config/AssetSidebar';
import { ImportDataModal, type ImportSectionDef } from './plan-config/ImportDataModal';
import { ReadyValidationModal } from './plan-config/ReadyValidationModal';
import { buildAssetTree, findNode as findNodeV2, collectEquipmentPrimPaths } from './plan-config/asset-tree-builder';
import type { TreeNode as TreeNodeV2 } from './plan-config/types';

// ── Types ──────────────────────────────────────────────────────────────────────
type NodeStatus = 'normal' | 'bottleneck' | 'idle' | 'warning';
type RibbonTab = 'input' | 'params' | 'constraints';


// ── Data ───────────────────────────────────────────────────────────────────────

let VIEWPORT_LINES: Array<{ id: string; label: string; machines: Array<{ id: string; label: string; ct: string; status: NodeStatus }> }> = [
  {
    id: 'L01', label: 'SMT Line L01',
    machines: [
      { id: 'L01-SPI',    label: 'SPI Printing', ct: '32s', status: 'normal'     as NodeStatus },
      { id: 'L01-SMT1',   label: 'SMT (Front)', ct: '48s', status: 'bottleneck' as NodeStatus },
      { id: 'L01-SMT2',   label: 'SMT (Back)', ct: '45s', status: 'bottleneck' as NodeStatus },
      { id: 'L01-REFLOW', label: 'Reflow Soldering',   ct: '38s', status: 'normal'     as NodeStatus },
      { id: 'L01-AOI',    label: 'AOI Inspection',  ct: '28s', status: 'idle'       as NodeStatus },
    ],
  },
  {
    id: 'L02', label: 'SMT Line L02',
    machines: [
      { id: 'L02-SPI',  label: 'SPI Printing', ct: '30s', status: 'normal' as NodeStatus },
      { id: 'L02-SMT1', label: 'SMT',    ct: '50s', status: 'normal' as NodeStatus },
      { id: 'L02-AOI',  label: 'AOI Inspection', ct: '25s', status: 'normal' as NodeStatus },
    ],
  },
];

interface ConstraintDef {
  id: string;
  label: string;
  desc: string;
  defaultOn: boolean;
  depId?: string;       // id of another constraint this depends on
  depLabel?: string;    // human-readable dep name for the error message
  depNote?: string;     // why it's blocked (shown inline)
}

const CONSTRAINTS_DATA: ConstraintDef[] = [
  { id: 'device-fault',    label: 'Equipment Failure Constraint',   desc: 'Randomly triggers downtime events by MTBF/MTTR; equipment failure parameters must be ready',  defaultOn: true  },
  { id: 'material-supply', label: 'Material Supply Constraint',   desc: 'Tracks consumption and arrivals; stops when inventory reaches zero',                     defaultOn: true  },
  { id: 'agv-dispatch',    label: 'AGV Dispatch Constraint',   desc: 'Simulates AGV path planning and handling sequence, affecting loading/unloading wait time',       defaultOn: false,
    depNote: 'Depends on "Material Supply Constraint": AGV dispatch must be combined with material handling triggers; please enable the Material Supply Constraint first', depId: 'material-supply', depLabel: 'Material Supply Constraint' },
  { id: 'wip-buffer',      label: 'Line-side Warehouse Buffer Constraint', desc: 'Upstream pauses feeding when WIP exceeds capacity, affecting cycle time continuity',              defaultOn: true  },
  { id: 'workforce',       label: 'Workforce Constraint',   desc: 'Limits headcount by shift, affecting effective working hours and headcount shared across operations',        defaultOn: false },
  { id: 'changeover',      label: 'Changeover Time Constraint',   desc: 'Occupies the line by BoP changeover time when work orders switch',                     defaultOn: true  },
  { id: 'pm',              label: 'Preventive Maintenance Constraint', desc: 'Inserts planned downtime windows by maintenance plan; maintenance plan data must be configured',    defaultOn: false },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function machineStyle(status: NodeStatus | undefined, selected: boolean) {
  if (selected)                return { border: '#3b82f6', bg: '#0d2035ee', text: '#93c5fd', dot: '#3b82f6', glow: true };
  if (status === 'bottleneck') return { border: '#ef4444', bg: '#1a0808ee', text: '#f87171', dot: '#ef4444', glow: false };
  if (status === 'idle')       return { border: 'var(--c-243548)', bg: '#080f18ee', text: 'var(--c-64748b)', dot: 'var(--c-334155)', glow: false };
  return                               { border: 'var(--c-1e3a55)', bg: '#071520ee', text: 'var(--c-94a3b8)', dot: '#22c55e', glow: false };
}


// ── Factory Viewport ───────────────────────────────────────────────────────────
// Kit 串流页面 URL（WebRTC viewer）；未配置时降级到 2D mock
const KIT_STREAM_URL = (import.meta.env.VITE_KIT_STREAM_URL ?? '').trim();

function FactoryViewport({
  selectedId, onSelect, creatorUrl, showMasks = true,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  creatorUrl: string | null;
  /** 加载/报错遮罩是否显示：串流常驻后只在参数配置页签显示，避免挡住输入/约束页签的编辑 */
  showMasks?: boolean;
}) {
  const { t } = useTranslation();
  const hasStream = KIT_STREAM_URL.length > 0;
  // USD 场景加载态：打开后、加载完成前显示「加载中」遮罩
  const [stageLoading, setStageLoading] = useState(false);
  const [stageError, setStageError] = useState<string>('');
  // 重试计数：组件现在整页常驻不再随页签切换重挂，Kit 冷启动期加载失败后
  // ensure-stage effect 不会自然重跑，报错遮罩上给「重试」按钮显式重跑
  const [retryKey, setRetryKey] = useState(0);

  // 串流可见且方案关联了 Creator 工厂项目时，让 Kit 打开对应 USD。
  // kitEnsureStage 内部先查 current_stage，已是该 USD 则跳过（Kit 端亦有兜底幂等），
  // 避免重开把后续 playback 注入的 prim 冲掉。fail-soft：Kit 未起/出错不影响 UI。
  useEffect(() => {
    if (!hasStream || !creatorUrl) return;
    let cancelled = false;
    // 先挂订阅：保证 open 触发前监听已就绪（success→收起遮罩 / error→显示错误）。
    // 订阅也覆盖「同 URL 已打开」时 Kit 仍 dispatch 的 success（stage_loading.py:161-168）。
    const unsub = subscribeOpenedStageResult((r) => {
      if (cancelled) return;
      if (r.result === 'success') { setStageLoading(false); setStageError(''); }
      else { setStageLoading(false); setStageError(r.error || 'stage load failed'); }
    });
    (async () => {
      console.info('[Kit] ensure-stage start url=', creatorUrl);
      // 进参数页时把 Kit 主窗口设为全屏，让流出来的画面占满 iframe（去掉菜单栏/工具栏黑边）。
      // 桌面 / 串流模式都需要：串流下 Kit 走 carb.settings 路径，效果一致。
      // 失败原因主要是 Kit 还没启动完（kitFetch 已给 12s 超时覆盖冷启动期）。
      try { await kitSetFullscreen(true); }
      catch (err) { console.warn('[Kit] set-fullscreen failed', err); }

      setStageError('');
      setStageLoading(true);   // 开始加载前先亮遮罩
      try {
        const opened = await kitEnsureStage(creatorUrl);
        console.info('[Kit] ensure-stage ok opened=', opened, 'url=', creatorUrl);
        // HTTP /ov/open_stage 已阻塞到加载完成；resolve / 已打开 fast-path 都收起遮罩。
        if (!cancelled) setStageLoading(false);
      } catch (err) {
        // fail-soft：Kit 未起/不可达 → 不影响其它 UI；但要让开发者在 Console 看到。
        console.error('[Kit] ensure-stage failed url=', creatorUrl, err);
        if (!cancelled) { setStageLoading(false); setStageError(String((err as Error)?.message ?? err)); }
      }

      // 进入方案配置时清掉上一个方案 playback 残留的小球/指示器：
      // 同一 USD 幂等没重开时它们不会自己消失，配置视图不应看到回放叠加层。
      // playbackStop → Kit stop → _teardown（已会删 /World/Playback* 子树）。
      try { await playbackStop(); }
      catch (err) { console.warn('[Kit] playback-stop failed', err); }
    })();
    return () => { cancelled = true; unsub(); };
  }, [hasStream, creatorUrl, retryKey]);

  // 离开参数页时退出 Kit 全屏（hideUi=false，恢复菜单栏/停靠面板）——其它模块需要完整编辑器 UI。
  // 独立 effect：上面的 effect 随 creatorUrl 变化重跑（换方案重开 stage），不应闪一次 UI；
  // 这里只在组件真正卸载时恢复。
  useEffect(() => {
    if (!hasStream) return;
    return () => {
      void kitSetFullscreen(false).catch((err) => console.warn('[Kit] exit-fullscreen failed', err));
    };
  }, [hasStream]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--c-07111e)]">
      {/* Background: Kit WebRTC stream — viewer 内部按元素尺寸调用 AppStreamer.resize()。
          沉浸式：fixed inset-0 铺满整个浏览器窗口（不只内容区），页头/Ribbon/应用侧边栏
          都是半透明玻璃条（z-30）浮在串流上；面板类 absolute 浮层（z-20/30）仍相对内容区定位。
          fixed 不被 overflow-hidden 祖先裁剪；浏览器全屏（viewportRef）时 fixed 定位到全屏视口，几何不变。 */}
      {hasStream && (
        <div className="fixed inset-0">
          {/* 直连 Kit WebRTC（替代原 5183 iframe 页）。开 USD / 选中等控制面仍走 HTTP /ov。 */}
          <KitViewport className="w-full h-full" />
        </div>
      )}

      {/* USD 场景加载遮罩（z-20 盖在串流和 z-10 浮层之上）：加载中转圈 / 失败显示错误。
          串流是全窗口 fixed，遮罩同样 fixed 全窗口，避免玻璃 chrome 后露出未遮罩的画面。 */}
      {/* 遮罩底是主题无关的 bg-black/60，内容也必须用主题无关色（white / 500 档强调色不随
          html.light 翻转）——slate-200/blue-400 等浅档在浅色主题会翻成深色，黑纱上看不见。 */}
      {showMasks && hasStream && stageLoading && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={40} className="text-blue-500 animate-spin" />
            <div className="text-sm font-semibold text-white/90">{t('Loading…')}</div>
          </div>
        </div>
      )}
      {showMasks && hasStream && !stageLoading && stageError && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 max-w-md text-center px-4">
            <span className="text-sm font-semibold text-red-500">{t('Failed to load scene')}</span>
            <span className="text-[11px] text-white/70 break-words">{stageError}</span>
            <button
              onClick={() => setRetryKey((k) => k + 1)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors"
            >
              <RefreshCw size={12} />{t('Retry')}
            </button>
          </div>
        </div>
      )}

      {/* Fallback 2D mock — 未配置串流时显示静态厂区图 + 网格 */}
      {!hasStream && (
        <>
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none">
            <img
              src="/images/Group 1664466895.png"
              alt="factory"
              className="w-full h-full object-contain"
              style={{ opacity: 0.18, filter: 'brightness(0.6) saturate(0)' }}
            />
          </div>
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(rgba(13,29,48,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(13,29,48,0.3) 1px, transparent 1px)',
              backgroundSize: '40px 40px',
            }}
          />
        </>
      )}

      {/* Watermark — 串流模式下提示当前是真 Kit 视口 */}
      <div className="absolute top-2.5 left-3 text-[9px] font-mono text-slate-500 select-none pointer-events-none tracking-widest z-10 bg-black/40 px-1.5 py-0.5 rounded">
        {hasStream ? '🟢 OMNIVERSE KIT · LIVE STREAM' : t('⚠ KIT STREAM NOT CONFIGURED · 2D MOCK · Set VITE_KIT_STREAM_URL to enable')}
      </div>

      {/* Legend */}
      <div className="absolute top-2 right-3 flex items-center gap-2 z-10">
        {[
          { cls: 'bg-emerald-500', label: 'Normal' },
          { cls: 'bg-red-500',     label: 'Bottleneck' },
          { cls: 'bg-slate-600',   label: 'Low Load' },
          { cls: 'bg-blue-500',    label: 'Selected' },
        ].map(({ cls, label }) => (
          <div key={label} className="flex items-center gap-1 bg-black/50 backdrop-blur border border-[var(--c-1e3a55)]/50 px-2 py-0.5 rounded text-[9px] text-slate-400">
            <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', cls)} />
            {t(label)}
          </div>
        ))}
      </div>

      {/* Production lines — interactive overlay（仅在 2D mock 模式下显示；串流模式下点 prim 通过左侧资产树触发） */}
      {!hasStream && <div className="absolute inset-0 flex flex-col justify-center gap-8 px-8 pb-24 pt-12 z-10">
        {VIEWPORT_LINES.map((line) => (
          <div key={line.id}>
            {/* Line label row */}
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500/50 flex-shrink-0" />
              <span className="text-[9px] font-mono text-blue-400/70 uppercase tracking-[0.15em] flex-shrink-0">{t(line.label)}</span>
              <div className="flex-1 border-t border-dashed border-[var(--c-1e3a55)]/60" />
            </div>

            {/* Machines */}
            <div className="flex items-stretch gap-0">
              {line.machines.map((machine, idx) => {
                const st = machineStyle(machine.status, selectedId === machine.id);
                return (
                  <div key={machine.id} className="flex items-center flex-1 min-w-0">
                    <div
                      className="flex-1 min-w-0 cursor-pointer transition-all"
                      style={{ filter: st.glow ? 'drop-shadow(0 0 8px rgba(59,130,246,0.35))' : undefined }}
                      onClick={() => onSelect(machine.id)}
                    >
                      <div
                        className="rounded-lg px-2.5 pt-2.5 pb-2"
                        style={{ background: st.bg, border: `1px solid ${st.border}`, transition: 'all 0.15s' }}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-mono truncate pr-1" style={{ color: st.text }}>{t(machine.label)}</span>
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: st.dot }} />
                        </div>
                        <div className="text-[12px] font-bold font-mono leading-none" style={{ color: machine.status === 'bottleneck' ? '#f87171' : 'var(--c-4a6070)' }}>
                          {machine.ct}
                        </div>
                        <div className="text-[8px] font-mono mt-1 leading-none" style={{ color: machine.status === 'bottleneck' ? '#7f1d1d' : machine.status === 'idle' ? 'var(--c-1e2d3d)' : 'var(--c-0d2035)' }}>
                          {machine.status === 'bottleneck' ? '▲ BOTTLENECK' : machine.status === 'idle' ? '— IDLE' : '● RUNNING'}
                        </div>
                      </div>
                    </div>
                    {idx < line.machines.length - 1 && (
                      <div className="w-5 flex items-center justify-center flex-shrink-0">
                        <div className="w-full border-t border-slate-800" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>}

    </div>
  );
}

// ── Data Table Panel (center area in "input" mode) ─────────────────────────────

type DataStatus = 'ok' | 'warn' | 'missing';

interface DataSection {
  id: string;
  title: string;
  desc: string;                          // what this data type is
  sourceSystem: string;                  // where it comes from
  sourceNote: string;                    // sync details when expanded
  required: boolean;
  status: DataStatus;
  summary?: string;
  warning?: string;
  canSync: boolean;
  canImport: boolean;
  cols?: string[];
  rows?: string[][];
}

const DATA_SECTIONS: DataSection[] = [
  {
    id: 'bop',
    title: 'BoP (Process Route)',
    desc: 'Operation sequence, CT, yield rate, and headcount requirements for each product on each line',
    sourceSystem: 'Master Data Platform',
    sourceNote: 'Master Data Platform v2.1 · Snapshot version v1.2.8 · Synced 2026-04-10 08:30',
    required: true,
    status: 'ok',
    summary: '23 active versions · Covering 6 products × 2 lines',
    canSync: true,
    canImport: true,
    cols: ['BoP ID', 'Product Model', 'Line', 'Operation Count', 'Status'],
    rows: [
      ['BOP-A32X-L01', 'A32X', 'SMT Line L01', '5 ops', 'Active'],
      ['BOP-A32X-L02', 'A32X', 'SMT Line L02', '3 ops', 'Active'],
      ['BOP-B15Y-L01', 'B15Y', 'SMT Line L01', '5 ops', 'Active'],
      ['BOP-C08Z-L01', 'C08Z', 'SMT Line L01', '5 ops', 'Active'],
    ],
  },
  {
    id: 'equipment-config',
    title: 'Line Equipment Configuration',
    desc: 'Equipment list, count, layout on the line, and capability parameters per equipment (max speed, standard CT, etc.)',
    sourceSystem: 'Master Data Platform',
    sourceNote: 'Master Data Platform v2.1 · Snapshot version v1.2.8 · Synced 2026-04-10 08:30',
    required: true,
    status: 'ok',
    summary: '2 lines · 8 key equipment · Last updated: 2026-04-08',
    canSync: true,
    canImport: true,
    cols: ['Equipment ID', 'Operation', 'Line', 'Equipment Type', 'Standard CT (s)'],
    rows: [
      ['SPI-L01',      'Solder Paste Printing', 'SMT Line L01', 'SPI Printer',  '32'],
      ['SMT-L01-01',   'SMT (Front)', 'SMT Line L01', 'High-speed Mounter', '48'],
      ['SMT-L01-02',   'SMT (Back)', 'SMT Line L01', 'High-speed Mounter', '45'],
      ['REFLOW-L01',   'Reflow Soldering',   'SMT Line L01', 'Reflow Oven',     '38'],
      ['AOI-L01',      'AOI Inspection',  'SMT Line L01', 'AOI Equipment',    '28'],
    ],
  },
  {
    id: 'staffing',
    title: 'Headcount Configuration',
    desc: 'Headcount per workstation and the job-type-to-operation relationship; headcount is an adjustable parameter and can be temporarily overridden within a plan',
    sourceSystem: 'Master Data Platform',
    sourceNote: 'Master Data Platform v2.1 · Snapshot version v1.2.8 · Synced 2026-04-10 08:30',
    required: false,
    status: 'ok',
    summary: '2 lines · 9 workstations total · 12 headcount configured',
    canSync: true,
    canImport: true,
    cols: ['Operation', 'Line', 'Job Type', 'Configured Headcount', 'Minimum Headcount'],
    rows: [
      ['Solder Paste Printing', 'SMT Line L01', 'Printing Operator', '1', '1'],
      ['SMT (Front)', 'SMT Line L01', 'SMT Operator', '2', '1'],
      ['SMT (Back)', 'SMT Line L01', 'SMT Operator', '2', '1'],
      ['Reflow Soldering',   'SMT Line L01', 'Oven Temperature Operator', '1', '1'],
      ['AOI Inspection',  'SMT Line L01', 'Inspector', '1', '1'],
    ],
  },
  {
    id: 'changeover',
    title: 'Changeover Time Configuration',
    desc: 'Changeover time when products switch; the line is occupied per this data on work order switch; required when the Changeover Time Constraint is enabled',
    sourceSystem: 'Master Data Platform',
    sourceNote: 'Backend md_changeover_matrix table is not yet modeled (see sim_backend/CLAUDE.md TODO)',
    required: false,
    status: 'missing',
    summary: 'The current data model does not yet support a changeover matrix of "direction × line × changeover type"',
    warning: 'No changeover is triggered in the current single-product seed scenario; once a multi-product same-line scenario is onboarded, the md_changeover_matrix table and endpoint must be added',
    canSync: false,
    canImport: false,
  },
  {
    id: 'op-transition',
    title: 'Inter-operation Transition Time',
    desc: 'Transfer time between adjacent operations (conveyor / manual handling) and mandatory wait time (process-required cooling, etc.)',
    sourceSystem: 'Master Data Platform',
    sourceNote: 'Master Data Platform v2.1 · Snapshot version v1.2.8 · Synced 2026-04-10 08:30',
    required: false,
    status: 'ok',
    summary: '8 inter-operation configs · Operation with mandatory wait: Reflow Soldering → AOI (cooling 30s)',
    canSync: true,
    canImport: true,
    cols: ['Upstream Operation', 'Downstream Operation', 'Line', 'Transfer Time (s)', 'Mandatory Wait (s)'],
    rows: [
      ['Solder Paste Printing', 'SMT (Front)', 'SMT Line L01', '5',  '0'],
      ['SMT (Front)', 'SMT (Back)', 'SMT Line L01', '3',  '0'],
      ['SMT (Back)', 'Reflow Soldering',   'SMT Line L01', '5',  '0'],
      ['Reflow Soldering',   'AOI Inspection',  'SMT Line L01', '10', '30'],
    ],
  },
  {
    id: 'stage-transition',
    title: 'Stage Continuity (Inter-line)',
    desc: 'Continuity between stages/lines (S2S streaming / E2S batch) and the connection time from an upstream line to the downstream line',
    sourceSystem: 'Master Data Platform',
    sourceNote: 'Master Data Platform · md_stage_transition',
    required: false,
    status: 'ok',
    summary: '',
    canSync: true,
    canImport: false,
    cols: ['Upstream Stage', 'Downstream Stage', 'Connection Type', 'Connection Time'],
    rows: [],
  },
  {
    id: 'calendar',
    title: 'Work Calendar & Shifts',
    desc: 'The basis for advancing the simulation clock; determines working / non-working periods and Takt Time calculation',
    sourceSystem: 'Master Data Platform',
    sourceNote: 'Master Data Platform v2.1 · Snapshot version v1.2.8 · Synced 2026-04-10 08:30',
    required: true,
    status: 'ok',
    summary: 'Work calendar: 2026 Q2 · Shift: Morning 08:00–20:00 (12h) · 61 working days',
    canSync: true,
    canImport: true,
    cols: ['Shift Name', 'Start Time', 'End Time', 'Duration', 'Applicable Lines'],
    rows: [
      ['Morning Shift', '08:00', '20:00', '12h', 'All Lines'],
    ],
  },
  {
    id: 'equipment-params',
    title: 'Equipment Failure Parameters (MTBF/MTTR)',
    desc: 'Used when the Equipment Failure Constraint is enabled; randomly triggers failures and repair downtime by exponential distribution',
    sourceSystem: 'Master Data Platform',
    sourceNote: 'Master Data Platform v2.1 · Snapshot version v1.2.8 · Synced 2026-04-10 08:30',
    required: false,
    status: 'ok',
    summary: '64 equipment · All MTBF/MTTR configured · Distribution model: Exponential Distribution',
    canSync: true,
    canImport: true,
    cols: ['Equipment ID', 'Operation', 'MTBF (hours)', 'MTTR (minutes)', 'Failure Distribution'],
    rows: [
      ['SMT-L01-01', 'SMT (Front)', '120', '45', 'Exponential Distribution'],
      ['SMT-L01-02', 'SMT (Back)', '115', '42', 'Exponential Distribution'],
      ['REFLOW-L01', 'Reflow Soldering',   '200', '60', 'Exponential Distribution'],
      ['AOI-L01',    'AOI Inspection',  '500', '20', 'Exponential Distribution'],
    ],
  },
  {
    id: 'production-tasks',
    title: 'Production Tasks',
    desc: 'Simulation-driving work order list, including product model, planned quantity, and planned time',
    sourceSystem: 'ERP',
    sourceNote: 'ERP v3.2 · Synced 2026-04-10 08:35:22 · Operator: Li Ming',
    required: true,
    status: 'ok',
    summary: '23 work orders · 6 product models · Total planned quantity 4,800 pcs',
    canSync: true,
    canImport: true,
    cols: ['Work Order No.', 'Product Model', 'Planned Quantity', 'Planned Completion', 'Status'],
    rows: [
      ['WO-20260410-001', 'A32X', '500 pcs', '2026-04-10 14:00', 'Normal'],
      ['WO-20260410-002', 'A32X', '300 pcs', '2026-04-10 18:00', 'Normal'],
      ['WO-20260410-003', 'B15Y', '800 pcs', '2026-04-10 20:00', 'Normal'],
      ['WO-20260410-004', 'C08Z', '300 pcs', '2026-04-10 20:00', 'Normal'],
    ],
  },
  {
    id: 'material-supply',
    title: 'Material Supply Plan',
    desc: 'Used when the Material Supply Constraint is enabled; tracks the arrival time and quantity of each material',
    sourceSystem: 'ERP',
    sourceNote: 'ERP v3.2 · Synced 2026-04-10 08:35:25 · Operator: Li Ming',
    required: false,
    status: 'ok',
    summary: '42 material types · 18 supply batches · Time coverage: fully matched',
    canSync: true,
    canImport: true,
    cols: ['Material Code', 'Material Name', 'Supply Quantity', 'Arrival Time', 'Status'],
    rows: [
      ['IC-12345', 'Main Control IC',   '2000 pcs',  '2026-04-10 06:00', 'Normal'],
      ['CAP-0402', 'Capacitor 0402', '50000 pcs', '2026-04-10 07:00', 'Normal'],
      ['CON-A1',   'Connector A1', '1000 pcs',  '2026-04-10 07:30', 'Normal'],
    ],
  },
  {
    id: 'inventory',
    title: 'Inventory Snapshot',
    desc: 'Raw material warehouse stock at the simulation start time; affects when material shortage events trigger',
    sourceSystem: 'WMS',
    sourceNote: 'WMS · Not synced',
    required: false,
    status: 'missing',
    warning: 'No inventory snapshot configured; the simulation will assume zero initial inventory, which may trigger material shortage events early and affect result accuracy',
    canSync: true,
    canImport: true,
  },
  {
    id: 'wip',
    title: 'Line-side Warehouse Status Snapshot',
    desc: 'WIP quantity in the line-side warehouses between operations at the simulation start; affects line balance in the initial state',
    sourceSystem: 'MES',
    sourceNote: 'MES · Not synced',
    required: false,
    status: 'missing',
    warning: 'No line-side warehouse snapshot configured; the simulation will start with all line-side warehouses empty',
    canSync: true,
    canImport: true,
  },
  {
    id: 'wip-capacity',
    title: 'Line-side Buffer Capacity',
    desc: 'Per-buffer capacity (pcs) for the Line-side Buffer Constraint; un-imported buffers stay unbounded. Requires the plan to be Ready.',
    sourceSystem: 'MES',
    sourceNote: 'MES · Not synced',
    required: false,
    status: 'missing',
    warning: 'No buffer capacity imported; all line-side buffers are unbounded (no backpressure even if the constraint is enabled)',
    canSync: false,
    canImport: true,
    cols: ['Buffer Code', 'Capacity (pcs)'],
    // rows wired from planApi.wipBuffers() in DataTablePanel (bounded buffers only)
  },
];

const SOURCE_BADGE: Record<string, string> = {
  'Master Data Platform': 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  'ERP':        'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  'WMS':        'text-violet-400 bg-violet-500/10 border-violet-500/20',
  'MES':        'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
};

type SectionOverride = Partial<Pick<DataSection, 'cols' | 'rows' | 'summary' | 'status' | 'warning'>>;

function DataTablePanel({ planId, factoryId, reloadKey, onImportClick }: {
  planId: string | undefined;
  factoryId: string | undefined;
  reloadKey: number;
  onImportClick: (section: ImportSectionDef) => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<string[]>(['production-tasks']);
  const [overrides, setOverrides] = useState<Record<string, SectionOverride>>({});

  const toggle = (id: string) =>
    setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // Wire production-tasks
  useEffect(() => {
    if (!planId) return;
    planApi.tasks(planId).then(tasks => {
      const rows = tasks.map(t => [
        t.wo_no ?? '—',
        t.line_code ?? '—',
        t.line_name ?? '—',
        t.product_code,
      ]);
      const totalQty = tasks.reduce((s, t) => s + (t.plan_quantity ?? 0), 0);
      const productCount = new Set(tasks.map(t => t.product_code)).size;
      const woCount = new Set(tasks.map(t => t.wo_no).filter(Boolean)).size;
      setOverrides(prev => ({
        ...prev,
        'production-tasks': {
          cols: [t('Work Order No.'), t('Line'), t('Line Name'), t('Product Model')],
          rows,
          summary: tasks.length
            ? t('{{tasks}} tasks · {{woCount}} work orders · {{productCount}} products · Total planned quantity {{totalQty}} pcs', { tasks: tasks.length, woCount, productCount, totalQty: totalQty.toLocaleString() })
            : t('No production tasks'),
          status: tasks.length ? 'ok' : 'missing',
        },
      }));
    }).catch(() => {});
  }, [planId, reloadKey, t]);

  // Wire BOP + operation-transitions + equipment-failure-params — iterate lines
  useEffect(() => {
    if (!factoryId || !planId) return;
    (async () => {
      try {
        // 产品型号列显示编码而非 UUID；传 plan_id 以便命中方案克隆副本的 product_id
        const productCodeById = new Map<string, string>();
        try {
          const products = await masterApi.products(planId);
          products.forEach(p => productCodeById.set(p.product_id, p.product_code));
        } catch { /* ignore */ }

        const stages = await masterApi.stages(factoryId);
        const bopRows: string[][] = [];
        const transitionRows: string[][] = [];
        // 人员配置（路径 1 · 兜底）：从 BOPProcess.standard_worker_count 提取人工位，不分工种
        const staffingRows: string[][] = [];
        for (const stage of stages) {
          const lines = await masterApi.lines(stage.stage_id);
          for (const line of lines) {
            const opById = new Map<string, string>();
            try {
              const ops = await masterApi.operations(line.line_id);
              ops.forEach(o => opById.set(o.operation_id, mdName(o.operation_name, o.operation_name_cn)));
            } catch { /* ignore */ }

            try {
              const bop = await masterApi.bop(line.line_id);
              if (bop) {
                bopRows.push([
                  bop.bop_id.slice(0, 8),
                  productCodeById.get(bop.product_id) ?? bop.product_id.slice(0, 8),
                  line.line_name,
                  t('{{count}} ops', { count: bop.processes.length }),
                  bop.is_active ? t('Active') : t('Disabled'),
                ]);
                for (const proc of bop.processes) {
                  if (proc.standard_worker_count > 0) {
                    staffingRows.push([
                      opById.get(proc.operation_id) ?? proc.operation_id.slice(0, 8),
                      line.line_name,
                      String(proc.standard_worker_count),
                    ]);
                  }
                }
              }
            } catch { /* no bop */ }

            try {
              const transitions = await masterApi.transitions(line.line_id);
              for (const t of transitions) {
                transitionRows.push([
                  opById.get(t.from_operation_id) ?? t.from_operation_id.slice(0, 8),
                  opById.get(t.to_operation_id) ?? t.to_operation_id.slice(0, 8),
                  line.line_name,
                  String(Number(t.transfer_time)),
                  String(Number(t.mandatory_wait_time)),
                ]);
              }
            } catch { /* ignore */ }
          }
        }
        const activeCount = bopRows.filter(r => r[4] === t('Active')).length;
        const totalStaff = staffingRows.reduce((s, r) => s + Number(r[2] || 0), 0);
        const staffLineSet = new Set(staffingRows.map(r => r[1]));
        setOverrides(prev => ({
          ...prev,
          'bop': {
            rows: bopRows,
            summary: bopRows.length ? t('{{activeCount}} active versions · Covering {{lineCount}} lines', { activeCount, lineCount: bopRows.length }) : t('No BoP configuration'),
            status: bopRows.length ? 'ok' : 'missing',
          },
          'op-transition': {
            rows: transitionRows,
            summary: transitionRows.length
              ? t('{{count}} inter-operation configs', { count: transitionRows.length })
              : t('No inter-operation transition configuration'),
            status: transitionRows.length ? 'ok' : 'missing',
          },
          'staffing': {
            cols: [t('Operation'), t('Line'), t('Configured Headcount')],
            rows: staffingRows,
            summary: staffingRows.length
              ? t('{{lineCount}} lines · {{workstationCount}} manual workstations · {{totalStaff}} headcount total', { lineCount: staffLineSet.size, workstationCount: staffingRows.length, totalStaff })
              : t('No headcount configuration'),
            status: staffingRows.length ? 'ok' : 'missing',
            warning: t('Currently only the total headcount is shown, without distinguishing job types; the job type dictionary is pending release (see backend TODO · staffing path 2)'),
          },
        }));
      } catch { /* ignore */ }
    })();

    // Equipment failure params
    masterApi.equipmentFailureParams(factoryId, planId).then(params => {
      const rows = params.map(p => [
        p.equipment_id.slice(0, 8),
        '—',
        String(Number(p.mtbf_hours)),
        String(Number(p.mttr_minutes)),
        p.failure_distribution === 'EXPONENTIAL' ? t('Exponential Distribution') : (p.failure_distribution ?? '—'),
      ]);
      setOverrides(prev => ({
        ...prev,
        'equipment-params': {
          rows,
          summary: rows.length
            ? t('{{count}} equipment · All MTBF/MTTR configured', { count: rows.length })
            : t('No equipment failure parameters'),
          status: rows.length ? 'ok' : 'missing',
        },
      }));
    }).catch(() => {});

    // 产线设备配置 (dedicated aggregated endpoint)
    masterApi.equipmentConfig(factoryId, planId).then(cfg => {
      const rows = cfg.items.map(it => [
        it.equipment_code,
        mdName(it.operation_name, it.operation_name_cn),
        it.line_name,
        it.equipment_type,
        it.standard_ct != null ? String(Number(it.standard_ct)) : '—',
      ]);
      setOverrides(prev => ({
        ...prev,
        'equipment-config': {
          rows,
          summary: rows.length
            ? t('{{lineCount}} lines · {{equipmentCount}} key equipment · {{operationCount}} operations', { lineCount: cfg.line_count, equipmentCount: cfg.equipment_count, operationCount: cfg.operation_count })
            : t('No equipment configuration'),
          status: rows.length ? 'ok' : 'missing',
        },
      }));
    }).catch(() => {});

    // 制程间接续（StageTransition / md_stage_transition）：跨线 S2S/E2S + 接续时长
    Promise.all([planApi.stageTransitions(planId), masterApi.stages(factoryId, planId)])
      .then(([sts, stageList]) => {
        const nameById = new Map(stageList.map(s => [s.stage_id, s.stage_name]));
        const rows = sts.map(st => [
          nameById.get(st.from_stage_id) ?? st.from_stage_id.slice(0, 8),
          nameById.get(st.to_stage_id) ?? st.to_stage_id.slice(0, 8),
          st.connection_type,
          `${Number(st.connection_time)}s`,
        ]);
        setOverrides(prev => ({
          ...prev,
          'stage-transition': {
            rows,
            summary: rows.length
              ? t('{{count}} stage continuity configs', { count: rows.length })
              : t('No stage continuity configuration'),
            status: rows.length ? 'ok' : 'missing',
          },
        }));
      }).catch(() => {});

    // 工作日历 + 班次（来自 md_work_calendar / md_shift 聚合）
    masterApi.workCalendar(factoryId, planId).then(cal => {
      const rows = cal.shifts.map(s => [
        s.shift_name,
        s.start_time,
        s.end_time,
        `${Number(s.work_hours)}h${s.break_minutes ? t(' (incl. {{minutes}} min break)', { minutes: s.break_minutes }) : ''}`,
        t('All {{count}} lines', { count: cal.line_count }),
      ]);
      const dateRange = cal.date_start && cal.date_end
        ? (cal.date_start === cal.date_end ? cal.date_start : `${cal.date_start} ~ ${cal.date_end}`)
        : t('No date configured');
      const summary = cal.shifts.length
        ? t('Date: {{dateRange}} · {{workingDays}}/{{totalDays}} working days · {{shiftCount}} shifts', { dateRange, workingDays: cal.working_days, totalDays: cal.total_days, shiftCount: cal.shifts.length })
        : t('No work calendar or shift configured');
      setOverrides(prev => ({
        ...prev,
        'calendar': {
          rows,
          summary,
          status: cal.shifts.length ? 'ok' : 'missing',
          warning: cal.shifts.length === 0
            ? t('No shift configured; the engine cannot recognize working periods and will run 24h all day')
            : undefined,
        },
      }));
    }).catch(() => {});
  }, [factoryId, planId, reloadKey, t]);

  // Wire plan-scoped business snapshots
  useEffect(() => {
    if (!planId) return;

    planApi.materialSupplies(planId).then(supplies => {
      const rows = supplies.map(s => [
        s.material_code,
        s.material_name ?? '—',
        `${Number(s.supply_quantity).toLocaleString()} pcs`,
        `T+${Number(s.arrival_sim_hour).toFixed(1)}h`,
        s.data_source,
      ]);
      const matTypes = new Set(supplies.map(s => s.material_code)).size;
      setOverrides(prev => ({
        ...prev,
        'material-supply': {
          rows,
          summary: rows.length
            ? t('{{matTypes}} material types · {{batchCount}} supply batches', { matTypes, batchCount: rows.length })
            : t('No material supply plan'),
          status: rows.length ? 'ok' : 'missing',
        },
      }));
    }).catch(() => {});

    planApi.inventorySnapshots(planId).then(snaps => {
      const rows = snaps.map(s => [
        s.warehouse_id.slice(0, 8),
        s.material_code,
        Number(s.total_quantity).toLocaleString(),
        Number(s.available_quantity).toLocaleString(),
        s.snapshot_time?.slice(0, 16).replace('T', ' ') ?? '—',
      ]);
      setOverrides(prev => ({
        ...prev,
        'inventory': {
          cols: [t('Warehouse'), t('Material Code'), t('Total Inventory'), t('Available Quantity'), t('Snapshot Time')],
          rows,
          summary: rows.length ? t('{{count}} inventory snapshots', { count: rows.length }) : t('No inventory snapshot'),
          status: rows.length ? 'ok' : 'missing',
          warning: rows.length ? undefined : t('No inventory snapshot configured; the simulation will assume zero initial inventory'),
        },
      }));
    }).catch(() => {});

    planApi.wipSnapshots(planId).then(snaps => {
      const rows = snaps.map(s => [
        s.wip_id.slice(0, 8),
        s.material_code,
        Number(s.current_quantity).toLocaleString(),
        Number(s.current_volume).toFixed(3),
        s.snapshot_time?.slice(0, 16).replace('T', ' ') ?? '—',
      ]);
      setOverrides(prev => ({
        ...prev,
        'wip': {
          cols: [t('Line-side Warehouse'), t('Material Code'), t('Current Quantity'), t('Occupied Volume'), t('Snapshot Time')],
          rows,
          summary: rows.length ? t('{{count}} line-side warehouse snapshots', { count: rows.length }) : t('No line-side warehouse snapshot'),
          status: rows.length ? 'ok' : 'missing',
          warning: rows.length ? undefined : t('No line-side warehouse snapshot configured; the simulation will start with all line-side warehouses empty'),
        },
      }));
    }).catch(() => {});

    // 线边仓容量（WIP_CAPACITY 软约束）：导入后只展示已设容量的（有界）缓冲；其余保持无限
    planApi.wipBuffers(planId).then(buffers => {
      const bounded = buffers.filter(b => b.capacity_qty != null);
      const rows = bounded.map(b => [b.wip_code, String(b.capacity_qty)]);
      setOverrides(prev => ({
        ...prev,
        'wip-capacity': {
          cols: [t('Buffer Code'), t('Capacity (pcs)')],
          rows,
          summary: rows.length
            ? t('{{count}} buffers with capacity set · others unbounded', { count: rows.length })
            : t('No buffer capacity imported'),
          status: rows.length ? 'ok' : 'missing',
          warning: rows.length ? undefined : t('No buffer capacity imported; all line-side buffers are unbounded (no backpressure even if the constraint is enabled)'),
        },
      }));
    }).catch(() => {});
  }, [planId, reloadKey, t]);

  const groups = [
    { label: 'Master Data', note: 'From the Master Data Platform (read-only, version locked)', ids: ['bop', 'equipment-config', 'staffing', 'changeover', 'op-transition', 'stage-transition', 'calendar', 'equipment-params'] },
    { label: 'Business Data', note: 'From ERP / WMS / MES (snapshot synced on demand)', ids: ['production-tasks', 'material-supply', 'inventory', 'wip', 'wip-capacity'] },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {groups.map(group => {
        const sections = DATA_SECTIONS.filter(s => group.ids.includes(s.id));
        return (
          <div key={group.label}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t(group.label)}</span>
              <span className="text-[10px] text-slate-700">{t(group.note)}</span>
            </div>
            <div className="space-y-2">
              {sections.map(base => {
                const sec = { ...base, ...overrides[base.id] };
                const isExpanded = expanded.includes(sec.id);
                return (
                  <div key={sec.id} className={cn(
                    'border rounded-xl overflow-hidden transition-all',
                    sec.status === 'ok'      ? 'bg-[var(--c-07111e)] border-[var(--c-142235)]' :
                    sec.status === 'missing' ? 'bg-[var(--c-07111e)] border-[var(--c-142235)]' :
                    'bg-amber-900/5 border-amber-500/20',
                  )}>
                    {/* Header row */}
                    <div
                      className="px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-[var(--c-0d2035)]/30 transition-colors"
                      onClick={() => toggle(sec.id)}
                    >
                      {/* Status dot */}
                      <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0',
                        sec.status === 'ok'      ? 'bg-emerald-400' :
                        sec.status === 'warn'    ? 'bg-amber-400' :
                        'bg-slate-700',
                      )} />

                      {/* Title + description */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-slate-300">{t(sec.title)}</span>
                          {sec.required && (
                            <span className="text-[10px] text-red-400/70">{t('Required')}</span>
                          )}
                          {/* Source badge — always visible */}
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded border font-medium', SOURCE_BADGE[sec.sourceSystem] ?? '')}>
                            {t(sec.sourceSystem)}
                          </span>
                          {sec.status === 'missing' && (
                            <span className="text-[10px] text-slate-600 bg-[var(--c-0a1929)] px-1.5 py-0.5 rounded">{t('Not Configured')}</span>
                          )}
                        </div>
                        {!isExpanded && (
                          <p className="text-[11px] text-slate-600 mt-0.5 truncate">{sec.summary ? t(sec.summary) : t(sec.desc)}</p>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 flex-shrink-0" onClick={e => e.stopPropagation()}>
                        {/* per-section 同步按钮已移除：改为面板顶部「从主数据重新同步」全局同步 */}
                        {sec.canImport && (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => onImportClick({ id: sec.id, title: t(sec.title), cols: sec.cols })}
                          >
                            <Upload size={10} />{t('Import')}
                          </Button>
                        )}
                      </div>

                      {/* Expand toggle */}
                      <span className="text-slate-700 flex-shrink-0">
                        {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                      </span>
                    </div>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="border-t border-[var(--c-0e1e2e)]">
                        {/* Description + source info bar */}
                        <div className="px-4 py-2.5 bg-[var(--c-040d16)] flex items-start justify-between gap-4">
                          <p className="text-[11px] text-slate-500">{t(sec.desc)}</p>
                          <span className="text-[10px] text-slate-700 font-mono flex-shrink-0">{t(sec.sourceNote)}</span>
                        </div>

                        {/* Warning */}
                        {sec.warning && (
                          <div className="mx-4 mt-3 flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                            <AlertCircle size={11} className="text-amber-400 flex-shrink-0 mt-0.5" />
                            <span className="text-xs text-amber-300">{t(sec.warning)}</span>
                          </div>
                        )}

                        {/* Summary */}
                        {sec.summary && (
                          <div className="px-4 py-2 text-[11px] text-slate-400">{t(sec.summary)}</div>
                        )}

                        {/* Data table */}
                        {sec.rows && sec.rows.length > 0 && sec.cols && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-y border-[var(--c-0e1e2e)] bg-[var(--c-040d16)]">
                                  {sec.cols.map(col => (
                                    <th key={col} className="text-left px-4 py-2 text-[11px] text-slate-600 font-medium">{t(col)}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[var(--c-0e1e2e)]">
                                {sec.rows.map((row, i) => (
                                  <tr key={i} className="hover:bg-[var(--c-0d2035)]/30 transition-colors">
                                    {row.map((cell, j) => (
                                      <td key={j} className={cn('px-4 py-2', j === 0 ? 'font-mono text-slate-400' : 'text-slate-500')}>{t(cell)}</td>
                                    ))}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

    </div>
  );
}

// ── Constraint Version Manager Modal ──────────────────────────────────────────
interface ConstraintVersion {
  id: string;
  name: string;
  savedAt: string;
  savedBy: string;
  config: Record<string, boolean>;
}

const MOCK_CONSTRAINT_VERSIONS: ConstraintVersion[] = [
  { id: 'CV1', name: 'Standard Production Constraints', savedAt: '2026-04-08 14:30', savedBy: 'Li Ming',
    config: { 'device-fault': true, 'material-supply': true, 'agv-dispatch': false, 'wip-buffer': true, 'workforce': false, 'changeover': true, 'pm': false } },
  { id: 'CV2', name: 'With Workforce Constraint (Night Shift Assessment)', savedAt: '2026-04-09 09:15', savedBy: 'Wang Fang',
    config: { 'device-fault': true, 'material-supply': true, 'agv-dispatch': false, 'wip-buffer': true, 'workforce': true, 'changeover': true, 'pm': false } },
  { id: 'CV3', name: 'Ideal Capacity (No Constraints)', savedAt: '2026-04-10 08:00', savedBy: 'Li Ming',
    config: { 'device-fault': false, 'material-supply': false, 'agv-dispatch': false, 'wip-buffer': false, 'workforce': false, 'changeover': false, 'pm': false } },
];

function ConstraintVersionModal({
  current, onLoad, onSave, onClose,
}: {
  current: Record<string, boolean>;
  onLoad: (config: Record<string, boolean>) => void;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [versions, setVersions] = useState<ConstraintVersion[]>(MOCK_CONSTRAINT_VERSIONS);
  const [saveName, setSaveName] = useState('');
  const [showSaveInput, setShowSaveInput] = useState(false);

  const handleSave = () => {
    if (!saveName.trim()) return;
    const newVer: ConstraintVersion = {
      id: `CV${Date.now()}`,
      name: saveName.trim(),
      savedAt: new Date().toISOString().slice(0, 16).replace('T', ' '),
      savedBy: 'Li Ming',
      config: { ...current },
    };
    setVersions(prev => [newVer, ...prev]);
    onSave(saveName.trim());
    setSaveName('');
    setShowSaveInput(false);
  };

  const enabledLabel = (cfg: Record<string, boolean>) => {
    const count = Object.values(cfg).filter(Boolean).length;
    return t('{{count}} / {{total}} enabled', { count, total: CONSTRAINTS_DATA.length });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-2xl w-[480px] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-142235)]">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">{t('Constraint Configuration Version Management')}</h2>
            <p className="text-[11px] text-slate-600 mt-0.5">{t('Save the current constraint configuration as a version, or load a historical version')}</p>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300 transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Version list */}
        <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
          {versions.map(v => (
            <div key={v.id} className="flex items-center gap-3 bg-[var(--c-07111e)] border border-[var(--c-142235)] rounded-xl px-4 py-3 group">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-300 truncate">{t(v.name)}</div>
                <div className="text-[10px] text-slate-600 mt-0.5 flex items-center gap-2">
                  <span>{enabledLabel(v.config)}</span>
                  <span>·</span>
                  <span>{v.savedAt}</span>
                  <span>·</span>
                  <span>{t(v.savedBy)}</span>
                </div>
              </div>
              <Button size="xs" variant="outline" onClick={() => { onLoad(v.config); onClose(); }}>
                {t('Load')}
              </Button>
            </div>
          ))}
        </div>

        {/* Save current */}
        <div className="px-4 pb-4 border-t border-[var(--c-142235)] pt-4">
          {showSaveInput ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveInput(false); }}
                placeholder={t('Enter version name...')}
                className="flex-1 bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/60 placeholder:text-slate-600"
              />
              <Button size="xs" variant="primary" disabled={!saveName.trim()} onClick={handleSave}>{t('Save')}</Button>
              <Button size="xs" variant="ghost" onClick={() => setShowSaveInput(false)}>{t('Cancel')}</Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowSaveInput(true)} className="w-full justify-center">
              <Save size={12} /> {t('Save Current Configuration as New Version')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Constraints Panel ──────────────────────────────────────────────────────────
const SIMULATOR_OPTIONS: Array<{ id: string; label: string; desc: string; cls: string; requiresDes?: boolean }> = [
  { id: 'des',          label: 'Production Process Simulation', desc: 'Discrete event engine, drives work order scheduling and equipment events', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/25' },
  { id: 'line-balance', label: 'Line Balance Simulation',   desc: 'Calculates CT / cycle time ratio in real time and identifies bottleneck operations',     cls: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25' },
  { id: 'agv',          label: 'AGV Path Simulation', desc: 'Simulates material handling paths and timing; requires Production Process Simulation to be enabled', cls: 'bg-violet-500/15 text-violet-400 border-violet-500/25', requiresDes: true },
];

// FE constraint id ↔ backend constraint_type (PRD §4.5)
const CONSTRAINT_FE_TO_BE: Record<string, string> = {
  'device-fault': 'EQUIPMENT_FAILURE',
  'material-supply': 'MATERIAL_SUPPLY',
  'agv-dispatch': 'AGV_TRANSPORT',
  'wip-buffer': 'WIP_CAPACITY',
  'workforce': 'MANPOWER',
};
const CONSTRAINT_BE_TO_FE: Record<string, string> = Object.fromEntries(
  Object.entries(CONSTRAINT_FE_TO_BE).map(([k, v]) => [v, k]),
);

function ConstraintsPanel({ plan, planId, onOpenVersionManager }: {
  plan: PlanOut | null;
  planId: string | undefined;
  onOpenVersionManager: (getter: () => Record<string, boolean>, loader: (c: Record<string, boolean>) => void) => void;
}) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(CONSTRAINTS_DATA.map(c => [c.id, c.defaultOn]))
  );

  // 模拟时长
  const [duration, setDuration] = useState('8');
  const [durationUnit, setDurationUnit] = useState<'h' | 'd'>('h');

  // 模拟器选择
  const [simulators, setSimulators] = useState<Set<string>>(new Set(['des', 'line-balance']));

  // 工单关联模式（忽略 WO → 每条线独立模拟）
  const [ignoreWo, setIgnoreWo] = useState(false);

  // Sync from plan on load (once per plan)
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!plan || hydratedRef.current === plan.plan_id) return;
    hydratedRef.current = plan.plan_id;

    // Duration: prefer 'd' if cleanly divisible by 24
    const hrs = Number(plan.simulation_duration_hours ?? 0);
    if (hrs > 0 && hrs % 24 === 0) {
      setDuration(String(hrs / 24));
      setDurationUnit('d');
    } else {
      setDuration(String(hrs));
      setDurationUnit('h');
    }

    // Simulators
    const feSims = simulatorsToFrontend(plan.enabled_simulators ?? [])
      .filter(s => SIMULATOR_OPTIONS.some(o => o.id === s));
    setSimulators(new Set(feSims));

    // ignore_wo
    setIgnoreWo(!!plan.ignore_wo);
  }, [plan]);

  const onToggleIgnoreWo = (next: boolean) => {
    setIgnoreWo(next);
    if (planId) {
      planApi.update(planId, { ignore_wo: next }).catch(() => setIgnoreWo(!next));
    }
  };

  // Fetch soft constraints
  useEffect(() => {
    if (!planId) return;
    planApi.constraints(planId).then(rows => {
      setEnabled(prev => {
        const next = { ...prev };
        // Default to OFF per PRD §4.5 when we have the real data
        for (const c of CONSTRAINTS_DATA) next[c.id] = false;
        for (const r of rows) {
          const feId = CONSTRAINT_BE_TO_FE[r.constraint_type];
          if (feId) next[feId] = r.is_enabled;
        }
        return next;
      });
    }).catch(() => {});
  }, [planId]);

  const toggleSimulator = (id: string) => {
    setSimulators(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        if (id === 'des') next.delete('agv');
      } else {
        next.add(id);
      }
      if (planId) {
        planApi.update(planId, { enabled_simulators: simulatorsToBackend([...next]) }).catch(() => {});
      }
      return next;
    });
  };

  const maxDurationHours = 30 * 24;
  const durationHours = durationUnit === 'h' ? Number(duration) : Number(duration) * 24;
  const durationExceeds = durationHours > maxDurationHours;

  // Debounced save of duration
  useEffect(() => {
    if (!planId || !hydratedRef.current) return;
    if (durationExceeds || !Number.isFinite(durationHours) || durationHours <= 0) return;
    const t = setTimeout(() => {
      planApi.update(planId, { simulation_duration_hours: durationHours }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [durationHours, durationExceeds, planId]);

  const toggle = (id: string) => {
    const c = CONSTRAINTS_DATA.find(x => x.id === id)!;
    if (c.depId && !enabled[c.depId]) return;
    const nextValue = !enabled[id];
    setEnabled(prev => ({ ...prev, [id]: nextValue }));
    const beType = CONSTRAINT_FE_TO_BE[id];
    if (planId && beType) {
      planApi.setConstraint(planId, { constraint_type: beType, is_enabled: nextValue }).catch(() => {});
    }
  };

  const enabledCount = Object.values(enabled).filter(Boolean).length;

  const getEnabled = () => enabled;
  const loadEnabled = (cfg: Record<string, boolean>) => setEnabled(cfg);

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-6">

      {/* ── Section 1: 模拟时长 ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-slate-300">{t('Simulation Duration')}</span>
          <span className="text-[10px] text-slate-600">{t('Up to 30 days')}</span>
        </div>
        <div className="bg-[var(--c-07111e)] border border-[var(--c-142235)] rounded-xl p-4">
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={1}
              value={duration}
              onChange={e => setDuration(e.target.value.replace(/[^0-9]/g, '') || '1')}
              className={cn(
                'w-24 bg-[var(--c-040d16)] border rounded-lg px-3 py-1.5 text-sm text-slate-200 outline-none text-center font-mono',
                durationExceeds ? 'border-red-500/60 focus:border-red-500' : 'border-[var(--c-1e3a55)] focus:border-blue-500/60',
              )}
            />
            <div className="flex rounded-lg overflow-hidden border border-[var(--c-1e3a55)]">
              {([['h', 'Hours'], ['d', 'Days']] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => setDurationUnit(val)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors',
                    durationUnit === val ? 'bg-blue-600/30 text-blue-300' : 'text-slate-500 hover:text-slate-300 hover:bg-[var(--c-0d2035)]',
                  )}
                >
                  {t(lbl)}
                </button>
              ))}
            </div>
            <span className="text-xs text-slate-500">
              {durationUnit === 'h'
                ? t('= {{count}} work shifts', { count: (Number(duration) / 8).toFixed(1) })
                : t('= {{count}} hours', { count: Number(duration) * 24 })}
            </span>
          </div>
          {durationExceeds && (
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-red-400">
              <AlertCircle size={11} />
              <span>{t('Exceeds the maximum limit of 30 days (720 hours)')}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Section 2: 模拟器选择 ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-slate-300">{t('Simulator Selection')}</span>
          <span className="text-[10px] text-slate-600">{t('{{count}} selected', { count: simulators.size })}</span>
        </div>
        <div className="space-y-2">
          {SIMULATOR_OPTIONS.map(opt => {
            const isOn = simulators.has(opt.id);
            const desBlocked = opt.requiresDes && !simulators.has('des');
            const blocked = desBlocked;
            return (
              <div
                key={opt.id}
                className={cn(
                  'border rounded-xl p-3.5 transition-all',
                  blocked   ? 'opacity-40 border-[var(--c-142235)] bg-[var(--c-07111e)]' :
                  isOn      ? 'border-blue-500/20 bg-blue-600/5' :
                              'border-[var(--c-142235)] bg-[var(--c-07111e)]',
                )}
              >
                <div className="flex items-center gap-3">
                  <button
                    disabled={blocked}
                    onClick={() => !blocked && toggleSimulator(opt.id)}
                    className={cn(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-all flex-shrink-0',
                      isOn && !blocked ? 'bg-blue-600' : 'bg-slate-700',
                      blocked && 'cursor-not-allowed',
                    )}
                  >
                    <span className={cn('inline-block w-3.5 h-3.5 transform rounded-full bg-white transition-all', isOn && !blocked ? 'translate-x-4' : 'translate-x-0.5')} />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-300">{t(opt.label)}</span>
                      {isOn && !blocked && <span className={cn('text-[10px] px-1.5 py-0.5 rounded border', opt.cls)}>{t('Enabled')}</span>}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">{t(opt.desc)}</p>
                    {desBlocked && (
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-400">
                        <AlertCircle size={9} />
                        <span>{t('Please enable "Production Process Simulation" first')}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 2b: 工单关联模式 ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-semibold text-slate-300">{t('Work Order Linking Mode')}</span>
        </div>
        <div
          className={cn(
            'border rounded-xl p-3.5 transition-all',
            ignoreWo ? 'border-amber-500/20 bg-amber-600/5' : 'border-[var(--c-142235)] bg-[var(--c-07111e)]',
          )}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => onToggleIgnoreWo(!ignoreWo)}
              className={cn(
                'relative inline-flex h-5 w-9 items-center rounded-full transition-all flex-shrink-0',
                ignoreWo ? 'bg-amber-600' : 'bg-slate-700',
              )}
            >
              <span className={cn('inline-block w-3.5 h-3.5 transform rounded-full bg-white transition-all', ignoreWo ? 'translate-x-4' : 'translate-x-0.5')} />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-300">{t('Ignore Work Order Linking (Independent Line Mode)')}</span>
                {ignoreWo && <span className="text-[10px] text-amber-300 bg-amber-600/15 border border-amber-500/25 px-1.5 py-0.5 rounded">{t('Enabled')}</span>}
              </div>
              <p className="text-[11px] text-slate-600 mt-0.5">
                {t('By default, cross-stage linkage follows the work order (WO) chain; when enabled, each line runs independently per its own tasks, and downstream lines are treated as having their own incoming material.')}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 3: 软约束开关 ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-300">{t('Soft Constraint Switches')}</span>
            <span className="text-[10px] text-slate-600">{t('{{count}} / {{total}} enabled', { count: enabledCount, total: CONSTRAINTS_DATA.length })}</span>
          </div>
          <button
            onClick={() => onOpenVersionManager(getEnabled, loadEnabled)}
            className="text-[10px] text-blue-400 hover:text-blue-300 bg-blue-600/10 border border-blue-500/20 px-2 py-0.5 rounded transition-colors"
          >
            {t('Version Management')}
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">{t('Controls the modeling depth of the simulation engine. When all are off, it runs in ideal capacity mode.')}</p>

        <div className="space-y-2">
          {CONSTRAINTS_DATA.map(c => {
            const depBlocked = !!c.depId && !enabled[c.depId];
            const isOn = enabled[c.id] && !depBlocked;
            return (
              <div
                key={c.id}
                className={cn(
                  'border rounded-xl p-4 transition-all',
                  depBlocked ? 'opacity-50 border-[var(--c-142235)] bg-[var(--c-07111e)]' :
                  isOn        ? 'bg-blue-600/5 border-blue-500/20' :
                                'border-[var(--c-142235)] bg-[var(--c-07111e)]',
                )}
              >
                <div className="flex items-center gap-3">
                  <button
                    disabled={depBlocked}
                    onClick={() => toggle(c.id)}
                    className={cn(
                      'relative inline-flex h-5 w-9 items-center rounded-full transition-all flex-shrink-0',
                      isOn ? 'bg-blue-600' : 'bg-slate-700',
                      depBlocked && 'cursor-not-allowed',
                    )}
                  >
                    <span className={cn('inline-block w-3.5 h-3.5 transform rounded-full bg-white transition-all', isOn ? 'translate-x-4' : 'translate-x-0.5')} />
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-300">{t(c.label)}</span>
                      {isOn && <span className="text-[10px] text-blue-400 bg-blue-600/10 px-1.5 py-0.5 rounded">{t('Enabled')}</span>}
                    </div>
                    <p className="text-[11px] text-slate-600 mt-0.5">{t(c.desc)}</p>
                    {depBlocked && c.depNote && (
                      <div className="mt-2 flex items-start gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg px-2.5 py-2">
                        <AlertCircle size={10} className="text-amber-400 flex-shrink-0 mt-0.5" />
                        <span className="text-[10px] text-amber-300">{t(c.depNote)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {enabledCount === 0 && (
          <div className="mt-4 bg-slate-500/10 border border-slate-500/20 rounded-xl px-4 py-3 flex items-start gap-2">
            <Info size={13} className="text-slate-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-400">{t('Currently in ideal capacity simulation mode (no constraints), suitable for quickly assessing the capacity ceiling.')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function PlanConfigPage() {
  const { t } = useTranslation();
  const { planId } = useParams();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<PlanOut | null>(null);
  // 5 级真层级资产树（factory → stage → line → operation → equipment），由 buildAssetTree 构造
  const [assetTreeV2, setAssetTreeV2] = useState<TreeNodeV2[]>([]);
  const [viewportLines, setViewportLines] = useState(VIEWPORT_LINES);
  void viewportLines;   // 2D mock 数据迁移后暂无读处；setter 仍被结果回填使用

  // Creator 项目 + 就绪度（新顶部栏）
  const [creatorProjects, setCreatorProjects] = useState<CreatorProjectOut[]>([]);
  const [readiness, setReadiness] = useState<ReadinessOut | null>(null);
  // 方案关联的 Creator 工厂项目对应的 USD 地址（FactoryViewport 据此让 Kit 开 USD）
  const [viewportUsdUrl, setViewportUsdUrl] = useState<string | null>(null);


  // 数据导入弹窗
  const [importingSection, setImportingSection] = useState<ImportSectionDef | null>(null);

  // 方案级新增弹窗（点 stage/operation 旁边的「+」按钮触发）
  const [addingUnderNode, setAddingUnderNode] = useState<TreeNodeV2 | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [reloadTrigger, setReloadTrigger] = useState(0);
  // 参数变更版本号：每次 override 修改或 plan-scoped 增删都 +1，
  // 触发 AssetSidebar 重拉 effective-params 重算瓶颈高亮
  const [paramsVersion, setParamsVersion] = useState(0);

  // BOP_PROCESS 级 overrides 缓存：bop_process_id → param_key → param_value
  // BOP_PROCESS = per (line × product × operation)，每条 BoP 上的一道工序唯一一份覆盖。
  const [overridesByBopProcess, setOverridesByBopProcess] = useState<Map<string, Map<string, string>>>(new Map());
  void overridesByBopProcess;   // 参数面板改走 effective-params 后暂无读处；加载 effect 仍写入

  // 当前 plan 的 task 列表 → 推导出 line × product 的实际投产组合（树和参数面板都依赖）
  const [planTasks, setPlanTasks] = useState<TaskOut[]>([]);
  // line_id → 该线在本 plan 中分配到的 product_code 列表
  const lineProductsByLine = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const t of planTasks) {
      if (!t.line_id || !t.product_code) continue;
      const arr = m.get(t.line_id) ?? [];
      if (!arr.includes(t.product_code)) arr.push(t.product_code);
      m.set(t.line_id, arr);
    }
    return m;
  }, [planTasks]);
  // 用户在每条线上选中要查看/编辑哪个产品的 BoP（默认 = lineProductsByLine 第一个）
  const [selectedProductByLine, setSelectedProductByLine] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    setSelectedProductByLine(prev => {
      const next = new Map(prev);
      for (const [lineId, products] of lineProductsByLine) {
        if (!next.has(lineId) && products.length > 0) {
          next.set(lineId, products[0]);
        }
      }
      // 清理已不在 plan 里的 line
      for (const lineId of Array.from(next.keys())) {
        if (!lineProductsByLine.has(lineId)) next.delete(lineId);
      }
      return next;
    });
  }, [lineProductsByLine]);

  useEffect(() => {
    if (!planId) return;
    planApi.overrides(planId).then((rows: OverrideOut[]) => {
      const m = new Map<string, Map<string, string>>();
      for (const o of rows) {
        if (o.scope_type === 'BOP_PROCESS' && o.scope_id) {
          if (!m.has(o.scope_id)) m.set(o.scope_id, new Map());
          m.get(o.scope_id)!.set(o.param_key, o.param_value);
        }
      }
      setOverridesByBopProcess(m);
    }).catch(() => {});
  }, [planId]);

  // Load plan + tasks
  useEffect(() => {
    if (!planId) return;
    planApi.get(planId).then(p => {
      setPlan(p);
      setPlanStatus(p.status === 'READY' ? 'READY' : p.status === 'COMPLETED' ? 'COMPLETED' : 'DRAFT');
    }).catch(() => {});
    planApi.tasks(planId).then(setPlanTasks).catch(() => setPlanTasks([]));
  }, [planId]);

  // Build 5-level asset tree using buildAssetTree helper（factory → stage → line → operation → equipment）
  useEffect(() => {
    if (!planId || !plan?.factory_id) return;
    let cancelled = false;
    const factoryId = plan.factory_id;
    // 工厂名仅用于树根节点显示：在 master 工厂列表里按 id 找；快照过的方案
    // factory_id 是 scoped 副本（不在 master 列表）→ 用方案名兜底，不影响数据。
    masterApi.factories().then(async (factories) => {
      if (cancelled) return;
      const factoryName =
        factories.find((f) => f.factory_id === factoryId)?.factory_name
        ?? plan?.plan_name ?? 'Plant';
      const result = await buildAssetTree({
        factoryId,
        factoryName,
        lineProductsByLine,
        selectedProductByLine,
        planId,  // 缺它 → 树拉全局主数据(global eq_id)，而 effective-params 是 plan-scoped(副本 eq_id)，
                 // 两套 id 不相交 → ParamTable.filteredItems 全空 → 参数详情空白
      });
      if (cancelled) return;
      setAssetTreeV2(result.tree);
      // viewport 形状兼容
      setViewportLines(result.viewport as typeof VIEWPORT_LINES);
      // 默认展开
      setExpandedIds((prev) => Array.from(new Set([...prev, ...result.defaultExpandIds])));
    }).catch(err => console.error('Failed to load asset tree', err));
    return () => { cancelled = true; };
  }, [planId, plan?.factory_id, selectedProductByLine, lineProductsByLine, reloadTrigger]);

  // 方案级删除：删 plan-scoped line / equipment 行
  const handleDeletePlanScopedNode = useCallback(async (node: TreeNodeV2) => {
    if (!planId) return;
    if (!confirm(
      node.type === 'line'
        ? t('Confirm deletion of plan-level line "{{label}}"?', { label: node.label })
        : t('Confirm deletion of plan-level equipment "{{label}}"?', { label: node.label })
    )) return;
    try {
      if (node.type === 'line') await planMdApi.deleteLine(planId, node.id);
      else if (node.type === 'equipment') await planMdApi.deleteEquipment(planId, node.id);
      setReloadTrigger((x) => x + 1);
      setParamsVersion((v) => v + 1);  // 新增/删除设备影响全厂 maxCT，需要重算瓶颈
    } catch (err) {
      alert(t('Deletion failed: {{error}}', { error: String(err) }));
    }
  }, [planId, t]);

  // Load Creator projects + plan readiness（与 planId 解耦的全局参考；按 factoryId 过滤）
  useEffect(() => {
    masterApi.creatorProjects('PUBLISHED', plan?.factory_id).then(setCreatorProjects).catch(() => {});
  }, [plan?.factory_id]);

  // 方案关联项目变化时，解析其 USD 地址供 viewport 打开（不限 PUBLISHED）
  useEffect(() => {
    resolveCreatorUrl(plan).then(setViewportUsdUrl).catch(() => setViewportUsdUrl(null));
  }, [plan?.creator_project_id, plan?.factory_id]);

  useEffect(() => {
    if (!planId) return;
    planApi.readiness(planId).then(setReadiness).catch(() => {});
  }, [planId, planTasks]);  // tasks 变化时重新算 input_pct

  // 默认落在参数配置页签：进入方案即看到串流 3D 场景
  const [ribbonTab, setRibbonTab]       = useState<RibbonTab>('params');
  // 参数配置视口：3D（Kit 场景）/ 2D（BoP 拓扑俯视）。原顶层「BoP 2D 俯视」tab 并入此处。
  const [paramView, setParamView]       = useState<'2d' | '3d'>('3d');
  // 视口全屏：requestFullscreen 作用在视口容器上（资产树/参数面板/切换钮都是它的
  // absolute 子元素 → 全屏后左侧资产结构等 UI 保留）。Esc 或再点按钮退出。
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [viewportFs, setViewportFs] = useState(false);
  useEffect(() => {
    const onFsChange = () => setViewportFs(document.fullscreenElement === viewportRef.current && !!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);
  const toggleViewportFs = () => {
    const el = viewportRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void el.requestFullscreen().catch(() => {});
  };
  const [selectedId, setSelectedId]     = useState<string | null>('factory');
  const [expandedIds, setExpandedIds]   = useState<string[]>(['factory', 'lines']);
  const [planStatus, setPlanStatus]     = useState<'DRAFT' | 'READY' | 'COMPLETED'>('DRAFT');
  const [readyError, setReadyError]     = useState<ReadyValidationError | null>(null);
  const [readyBusy, setReadyBusy]       = useState(false);

  const isReady = planStatus === 'READY';
  const isCompleted = planStatus === 'COMPLETED';

  // Version manager modal
  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const versionGetterRef = useState<(() => Record<string, boolean>) | null>(null);
  const versionLoaderRef = useState<((c: Record<string, boolean>) => void) | null>(null);

  const handleOpenVersionManager = (
    getter: () => Record<string, boolean>,
    loader: (c: Record<string, boolean>) => void,
  ) => {
    versionGetterRef[1](() => getter);
    versionLoaderRef[1](() => loader);
    setVersionModalOpen(true);
  };

  // Ribbon version manager (constraints tab not active — open modal with no-op fallback)
  const handleRibbonVersionManager = () => setVersionModalOpen(true);

  const toggleExpand = (id: string) =>
    setExpandedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // 视角交互：单击仅高亮（不动相机），双击进透视聚焦。无独立"回俯视"按钮 ——
  // 想回整厂概览就双击根 factory 节点（与双击产线/工序等价，走 focus-perspective-many
  // 合并整厂全部设备 BBox 计算）。这样消除"俯视相机太高/工厂占画面太小"的体感问题，
  // 也不必维护单独的 view-top-down 配置。
  const handleSelect = (id: string) => {
    setSelectedId(prev => prev === id ? null : id);
    const node = findNodeV2(assetTreeV2, id);
    if (!node) return;
    if (node.type === 'equipment') {
      if (node.prim_path) {
        kitSelectPrim(node.prim_path).catch((err: unknown) => console.warn('[Kit] select prim failed', err));
      }
    } else if (node.type === 'operation' || node.type === 'line' || node.type === 'factory') {
      // factory 节点取整厂所有设备 prim 一并高亮
      const paths = collectEquipmentPrimPaths(node);
      if (paths.length > 0) {
        kitSelectMany(paths).catch((err: unknown) => console.warn('[Kit] select-many failed', err));
      }
    }
  };

  const handleDoubleSelect = (id: string) => {
    setSelectedId(id);
    const node = findNodeV2(assetTreeV2, id);
    if (!node) return;
    // 设备：单 prim 聚焦；产线/工序/工厂：合并子设备 BBox 聚焦（factory 即整厂概览）
    if (node.type === 'equipment' && node.prim_path) {
      kitFocusPerspective(node.prim_path).catch((err: unknown) => console.warn('[Kit] focus-perspective failed', err));
    } else if (node.type === 'operation' || node.type === 'line' || node.type === 'factory') {
      const paths = collectEquipmentPrimPaths(node);
      if (paths.length === 0) return;
      kitFocusPerspectiveMany(paths).catch((err: unknown) => console.warn('[Kit] focus-perspective-many failed', err));
    }
  };

  // 3D 视口里点选设备（SSE 回推 prim_path）→ 反向同步资产树选中，进而联动 2D 高亮/单线过滤。
  useEffect(() => {
    const unsub = subscribeKitSelection((primPath) => {
      const findByPrim = (nodes: TreeNodeV2[]): TreeNodeV2 | null => {
        for (const n of nodes) {
          if (n.type === 'equipment' && n.prim_path === primPath) return n;
          if (n.children) {
            const hit = findByPrim(n.children);
            if (hit) return hit;
          }
        }
        return null;
      };
      const hit = findByPrim(assetTreeV2);
      if (hit) setSelectedId(hit.id);
    });
    return () => unsub();
  }, [assetTreeV2]);

  // 选中节点（给 ParamTable 用）— 当前选中是 equipment 时，传它对应的 line 节点作为聚合上下文
  const selectedNode = selectedId ? findNodeV2(assetTreeV2, selectedId) : null;
  // 该 selectedNode 所在线的当前产品（用于 effective-params 的 product_code 过滤）
  const selectedProductCode: string | undefined = (() => {
    const lineId = selectedNode?.line_id;
    if (!lineId) return undefined;
    return selectedProductByLine.get(lineId);
  })();

  const handleSaveReady = async () => {
    if (!planId || readyBusy) return;
    setReadyBusy(true);
    try {
      const updated = await planApi.ready(planId);
      setPlan(updated);
      setPlanStatus('READY');
      setReadyError(null);
      planApi.readiness(planId).then(setReadiness).catch(() => {});
    } catch (e) {
      const v = parseReadyError(e);
      if (v) setReadyError(v);
      else window.alert(t('Failed to save and mark ready:\n{{error}}', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setReadyBusy(false);
    }
  };
  // 显式标记 autoStart=true：RunningPage 入口看 location.state 区分"主动启动"vs"刷新/直接进入"，
  // 刷新会丢 state → 不会重跑模拟（之前 RunningPage 见 404 就自动 run）。
  const handleLaunch = () => navigate(`/simulation/plan/${planId}/running`, { state: { autoStart: true } });
  // COMPLETED → DRAFT：重新配置（重跑前需再过"保存并就绪"门；旧模拟结果保留，重跑覆盖）
  const handleReconfigure = async () => {
    if (!planId || readyBusy) return;
    if (!window.confirm(t('Reconfiguring will revert the plan to Draft; you must "Save and mark ready" again before running another simulation.\nThe last simulation result is retained and will be overwritten after a rerun. Continue?'))) return;
    setReadyBusy(true);
    try {
      const updated = await planApi.reconfigure(planId);
      setPlan(updated);
      setPlanStatus('DRAFT');
      setReadyError(null);
      planApi.readiness(planId).then(setReadiness).catch(() => {});
    } catch (e) {
      window.alert(t('Reconfiguration failed:\n{{error}}', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setReadyBusy(false);
    }
  };

  const [resyncing, setResyncing] = useState(false);
  const handleGlobalResync = useCallback(async () => {
    if (!planId || resyncing) return;
    if (!window.confirm(
      t('"Full Sync" will overwrite this plan\'s master data snapshot for the entire plant with the current content of the Master Data Platform.\n\n⚠️ Lines, equipment, CT, etc. manually added/modified within the plan will all be discarded;\nBusiness data such as work orders/tasks is retained, and their references will be automatically re-pointed to the new snapshot by code.\n\nContinue?'),
    )) return;
    setResyncing(true);
    try {
      const r = await planMdApi.resyncMasterData(planId);
      window.alert(
        t('Sync complete: refreshed {{totalRows}} rows of master data, re-pointed {{bizRefs}} business references.\nSnapshot version: {{version}}', {
          totalRows: r.total_rows,
          bizRefs: r.biz_refs_rewritten,
          version: r.base_data_version ?? '—',
        }),
      );
      setReloadTrigger((x) => x + 1);
    } catch (e) {
      window.alert(t('Sync failed:\n{{error}}', { error: e instanceof Error ? e.message : String(e) }));
    } finally {
      setResyncing(false);
    }
  }, [planId, resyncing, t]);

  const showViewport = ribbonTab === 'params';
  const handleTabChange = (t: RibbonTab) => setRibbonTab(t);

  return (
    <div className="flex flex-col h-full bg-[var(--c-07111e)]">
      {/* ── 单行顶栏（沉浸式：给全窗口串流腾出纵向空间）──
          原页头 + Creator 栏 + Ribbon 三条压成一条玻璃条（z-30 浮在 fixed 串流上）：
          返回/方案名 · 页签 · 页签工具 · Creator 项目 · 完整度 · 唯一主按钮 · 主题/语言/头像。
          应用级顶栏在本页由 SimulationLayout 按路由隐藏（主题/语言/头像已并入此栏）。 */}
      <div className="relative z-30 flex items-center gap-2.5 px-3 h-12 border-b border-[var(--c-142235)]/70 flex-shrink-0 bg-[var(--c-07111e)]/70 backdrop-blur-md shadow-md overflow-x-auto overflow-y-hidden">
        <button
          onClick={() => navigate('/simulation')}
          className="text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-shrink">
          <span className="text-sm font-semibold text-slate-200 truncate max-w-44" title={`${plan?.plan_name ?? ''} · ${planId}`}>
            {plan?.plan_name ?? planId}
          </span>
          <span className={cn(
            'text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0',
            isCompleted
              ? 'bg-sky-500/20 text-sky-400 border-sky-500/30'
              : isReady
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-700/50 text-slate-400 border-slate-600',
          )}>
            {isCompleted ? t('Completed') : isReady ? t('Ready') : t('Draft')}
          </span>
        </div>

        {/* 页签（分段控件） */}
        <div className="flex rounded-lg border border-[var(--c-1e3a55)]/70 overflow-hidden flex-shrink-0">
          {([
            { id: 'input',       label: 'Input Data' },
            { id: 'params',      label: 'Parameter Configuration' },
            { id: 'constraints', label: 'Constraint Settings' },
          ] as Array<{ id: RibbonTab; label: string }>).map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={cn(
                'px-3 py-1.5 text-[11px] font-semibold transition-colors whitespace-nowrap',
                ribbonTab === tab.id ? 'bg-blue-600/80 text-white' : 'text-slate-400 hover:text-slate-200',
              )}
            >
              {t(tab.label)}
            </button>
          ))}
        </div>

        {/* 页签工具（紧凑内联，原 Ribbon 按钮行） */}
        {ribbonTab === 'input' && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleGlobalResync}
              disabled={resyncing}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-slate-400 hover:text-slate-200 hover:bg-[var(--c-0d2035)]/60 border border-[var(--c-1e3a55)]/50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw size={11} className={cn(resyncing && 'animate-spin')} />
              {resyncing ? t('Syncing…') : t('Full Sync')}
            </button>
            <button className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-slate-400 hover:text-slate-200 hover:bg-[var(--c-0d2035)]/60 border border-[var(--c-1e3a55)]/50 transition-colors">
              <CheckCircle2 size={11} />{t('Integrity Check')}
            </button>
          </div>
        )}
        {ribbonTab === 'constraints' && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleRibbonVersionManager}
              className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] text-slate-400 hover:text-slate-200 hover:bg-[var(--c-0d2035)]/60 border border-[var(--c-1e3a55)]/50 transition-colors"
            >
              <BookOpen size={11} />{t('Version Management')}
            </button>
          </div>
        )}

        {/* Creator 项目（仅 DRAFT 可编辑） */}
        <div className="flex items-center gap-1.5 min-w-0 flex-shrink" title={t('Linked Creator Plant Project')}>
          <Building2 size={13} className="text-slate-400 shrink-0" />
          {plan?.status === 'DRAFT' ? (
            <Select
              className="w-56"
              value={plan?.creator_project_id ?? ''}
              onChange={(e) => {
                const next = e.target.value || null;
                if (!planId) return;
                planApi.update(planId, { creator_project_id: next }).then(setPlan).catch(() => {});
              }}
            >
              <option value="">{t('Not selected (optional)')}</option>
              {creatorProjects.length === 0 ? (
                <option value="" disabled>{t('No published plant projects')}</option>
              ) : (
                creatorProjects.map((p) => (
                  <option key={p.creator_project_id} value={p.creator_project_id}>
                    {p.project_name} ({p.project_version ?? '—'})
                  </option>
                ))
              )}
            </Select>
          ) : (
            <span className={cn('text-[11px] truncate max-w-48', plan?.creator_project_id ? 'text-slate-300' : 'text-slate-500')}>
              {creatorProjects.find((p) => p.creator_project_id === plan?.creator_project_id)?.project_name ?? (plan?.creator_project_id ? t('Linked (project not in list)') : t('Not linked'))}
            </span>
          )}
          {plan?.creator_project_id && !creatorProjects.find((p) => p.creator_project_id === plan?.creator_project_id) && (
            <span className="text-amber-500 flex-shrink-0" title={t('The linked plant project is no longer available or not in PUBLISHED status')}>
              <AlertCircle size={12} />
            </span>
          )}
        </div>

        <div className="flex-1" />

        {/* 完整度：数据输入 / 参数设置 — backed by GET /plans/{id}/readiness */}
        <div className="flex items-center gap-3 text-[10px] text-slate-500 flex-shrink-0">
          {[
            { label: 'Input', pct: readiness?.input_pct ?? 0 },
            { label: 'Parameters', pct: readiness?.params_pct ?? 0 },
          ].map(({ label, pct }) => (
            <div key={label} className="flex items-center gap-1.5" title={readiness?.sections.filter(s => s.section_id.startsWith(label === 'Parameters' ? 'params' : 'input')).map(s => `${s.label}: ${s.pct}%`).join(' · ') ?? ''}>
              <span>{t(label)}</span>
              <div className="w-14 h-1 bg-[var(--c-0a1929)] rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full', pct === 100 ? 'bg-emerald-500' : pct > 0 ? 'bg-blue-500' : 'bg-slate-700')} style={{ width: `${pct}%` }} />
              </div>
              <span className={pct === 100 ? 'text-emerald-500' : ''}>{pct}%</span>
            </div>
          ))}
        </div>

        {/* 唯一主按钮（原独立「保存」按钮已合并掉） */}
        {isCompleted ? (
          <Button variant="primary" size="sm" onClick={handleReconfigure} disabled={readyBusy}>
            <RefreshCw size={12} />{readyBusy ? t('Processing…') : t('Reconfigure')}
          </Button>
        ) : !isReady ? (
          <Button variant="primary" size="sm" onClick={handleSaveReady} disabled={readyBusy}>
            <CheckCircle2 size={12} />{readyBusy ? t('Validating…') : t('Save and Mark Ready')}
          </Button>
        ) : (
          <Button variant="primary" size="sm" onClick={handleLaunch}>
            <Play size={12} />{t('Run Simulation')}
          </Button>
        )}

        <ThemeToggle variant="bare" />
        <LanguageToggle variant="bare" />
        <div className="w-7 h-7 rounded-full bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] flex items-center justify-center text-xs text-slate-400 font-medium cursor-pointer hover:border-blue-500/40 transition-colors flex-shrink-0">
          L
        </div>
      </div>

      {/* ── Main area ──
          串流常驻：FactoryViewport（含 fixed 全窗口 KitViewport）从进入方案页起一直挂载，
          切页签/切 2D 只是盖浮层，WebRTC 不断流、USD 不重开。 */}
      <div className="flex flex-1 overflow-hidden">
        <div ref={viewportRef} className="flex-1 overflow-hidden relative bg-[var(--c-07111e)]">
          {/* 遮罩仅在参数页签 + 3D 视图显示：masks 是 fixed z-20，会盖住 z-10 的 2D BoP/输入/约束浮层 */}
          <FactoryViewport selectedId={selectedId} onSelect={handleSelect} creatorUrl={viewportUsdUrl} showMasks={showViewport && paramView === '3d'} />

          {/* ── Params tab: 2D BoP 视图浮层（盖在串流上，串流保持连接）── */}
          {showViewport && paramView === '2d' && (
              <div className="absolute inset-0 z-10 flex flex-col" style={{ background: 'var(--c-070f1a)' }}>
                <BopSchematicView
                  planId={planId}
                  factoryId={plan?.factory_id}
                  embedded
                  lineFilter={selectedNode?.line_id ?? null}
                  selectedOpId={
                    selectedNode?.type === 'operation'
                      ? selectedNode.id
                      : selectedNode?.type === 'equipment' && selectedNode.line_id && selectedNode.operation_id
                        ? `${selectedNode.line_id}::${selectedNode.operation_id}`
                        : null
                  }
                  // 2D↔3D 关联：单击=资产树选中 + Kit 选中高亮（走 handleSelect 同一条链路）；
                  // 双击=切 3D 视图 + 运镜聚焦该工序设备的合并 BBox（Kit HTTP 与串流独立，
                  // 切换期间指令照常生效，串流重连后即为定位好的视角）。
                  onSelectOp={(op, line) => handleSelect(`${line.line_id}::${op.operation_id}`)}
                  onDoubleSelectOp={(op, line) => {
                    setParamView('3d');
                    handleDoubleSelect(`${line.line_id}::${op.operation_id}`);
                  }}
                />
              </div>
            )}

          {/* ── Params tab: 2D/3D 切换 + 资产树浮层 ── */}
          {showViewport && (<>
            {/* 2D/3D 视口切换（顶部居中；左资产树 z-20、右参数面板 z-20，此处 z-30 保持可点） */}
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex rounded-lg border border-[var(--c-1e3a55)]/70 bg-[var(--c-07111e)]/75 backdrop-blur-md overflow-hidden shadow-lg">
              {(['2d', '3d'] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setParamView(v)}
                  title={v === '2d' ? t('BoP 2D topology') : t('3D scene')}
                  className={`px-3 py-1 text-[11px] font-semibold transition-colors ${
                    paramView === v
                      ? 'bg-blue-600/80 text-white'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {v.toUpperCase()}
                </button>
              ))}
              <button
                onClick={toggleViewportFs}
                title={viewportFs ? t('Exit fullscreen') : t('Fullscreen')}
                className="px-2 py-1 text-slate-400 hover:text-slate-200 border-l border-[var(--c-1e3a55)] transition-colors"
              >
                {viewportFs ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
              </button>
            </div>
            <AssetSidebar
              tree={assetTreeV2}
              selectedId={selectedId}
              selectedNode={selectedNode}
              expandedIds={new Set(expandedIds)}
              onSelect={handleSelect}
              onDoubleSelect={handleDoubleSelect}
              onToggle={toggleExpand}
              onClearSelection={() => setSelectedId(null)}
              loading={assetTreeV2.length === 0}
              editable={plan?.status === 'DRAFT' || plan?.status === 'READY'}
              onAddChild={(parent) => setAddingUnderNode(parent)}
              onDeleteNode={(node) => handleDeletePlanScopedNode(node)}
              planId={planId}
              productCode={selectedProductCode}
              paramsVersion={paramsVersion}
              onParamsChange={() => {
                // ParamTable 改了参数 → 触发瓶颈重算 + readiness 刷新
                setParamsVersion((v) => v + 1);
                if (planId) planApi.readiness(planId).then(setReadiness).catch(() => {});
              }}
            />
          </>)}

          {/* ── Input / Constraints tab：玻璃浮层盖在常驻串流上（串流透出一点，保持沉浸）── */}
          {ribbonTab === 'input' && (
            <div className="absolute inset-0 z-10 flex flex-col bg-[var(--c-07111e)]/90 backdrop-blur-md">
              <DataTablePanel
                planId={planId}
                factoryId={plan?.factory_id}
                reloadKey={reloadTrigger}
                onImportClick={(section) => setImportingSection(section)}
              />
            </div>
          )}

          {ribbonTab === 'constraints' && (
            <div className="absolute inset-0 z-10 flex flex-col bg-[var(--c-07111e)]/90 backdrop-blur-md">
              <ConstraintsPanel plan={plan} planId={planId} onOpenVersionManager={handleOpenVersionManager} />
            </div>
          )}
        </div>
      </div>

      {/* ── Constraint Version Manager Modal ── */}
      {versionModalOpen && (
        <ConstraintVersionModal
          current={versionGetterRef[0] ? versionGetterRef[0]() : {}}
          onLoad={(cfg) => { versionLoaderRef[0]?.(cfg); }}
          onSave={() => {}}
          onClose={() => setVersionModalOpen(false)}
        />
      )}

      {/* ── Data Import Modal ── */}
      {importingSection && planId && (
        <ImportDataModal
          section={importingSection}
          planId={planId}
          onClose={() => setImportingSection(null)}
          onDone={() => {
            // 导入成功 → 刷新 readiness + plan tasks + DataTablePanel 各 section 表
            if (planId) {
              planApi.readiness(planId).then(setReadiness).catch(() => {});
              planApi.tasks(planId).then(setPlanTasks).catch(() => {});
            }
            setReloadTrigger((x) => x + 1);
          }}
        />
      )}

      {/* ── 保存并就绪 校验失败弹窗 ── */}
      {readyError && (
        <ReadyValidationModal error={readyError} onClose={() => setReadyError(null)} />
      )}

      {/* ── 方案级新增 Line / Equipment Modal ── */}
      {addingUnderNode && planId && (
        <AddPlanScopedNodeModal
          parent={addingUnderNode}
          planId={planId}
          busy={addBusy}
          onClose={() => setAddingUnderNode(null)}
          onSubmit={async (body) => {
            setAddBusy(true);
            try {
              if (addingUnderNode.type === 'stage') {
                await planMdApi.createLine(planId, {
                  stage_id: addingUnderNode.id,
                  line_code: body.code,
                  line_name: body.name,
                });
              } else if (addingUnderNode.type === 'operation') {
                if (!addingUnderNode.line_id) throw new Error(t('Current operation is missing line_id'));
                if (!addingUnderNode.operation_id) throw new Error(t('Current operation is missing operation_id'));
                await planMdApi.createEquipment(planId, {
                  // 工序节点 node.id 已为 "line_id::op_id" 复合，真正 op_id 在 .operation_id
                  operation_id: addingUnderNode.operation_id,
                  line_id: addingUnderNode.line_id,
                  equipment_code: body.code,
                  equipment_name: body.name,
                  equipment_type: body.equipment_type ?? 'ROBOT',
                  standard_ct: body.standard_ct,
                  standard_yield_rate: body.standard_yield_rate,
                  standard_worker_count: body.standard_worker_count,
                });
              }
              setReloadTrigger((x) => x + 1);
              setParamsVersion((v) => v + 1);  // 新增设备影响全厂 maxCT
              setAddingUnderNode(null);
            } catch (err) {
              alert(t('Add failed: {{error}}', { error: String(err) }));
            } finally {
              setAddBusy(false);
            }
          }}
        />
      )}

    </div>
  );
}

interface AddNodeBody {
  code: string;
  name: string;
  equipment_type?: string;
  standard_ct?: number | null;
  standard_yield_rate?: number | null;
  standard_worker_count?: number | null;
}

function AddPlanScopedNodeModal({
  parent, planId, busy, onClose, onSubmit,
}: {
  parent: TreeNodeV2;
  planId: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (b: AddNodeBody) => void;
}) {
  const { t } = useTranslation();
  void planId;
  const isLine = parent.type === 'stage';
  const isEquipment = parent.type === 'operation';
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [eqType, setEqType] = useState('ROBOT');
  const [ct, setCt] = useState('');
  const [yieldRate, setYieldRate] = useState('');
  const [workers, setWorkers] = useState('');

  const submit = () => {
    if (!code.trim() || !name.trim()) {
      alert(t('Code / Name are required'));
      return;
    }
    const body: AddNodeBody = { code: code.trim(), name: name.trim() };
    if (isEquipment) {
      body.equipment_type = eqType;
      if (ct.trim()) body.standard_ct = parseFloat(ct);
      if (yieldRate.trim()) body.standard_yield_rate = parseFloat(yieldRate) / 100;
      if (workers.trim()) body.standard_worker_count = parseInt(workers, 10);
    }
    onSubmit(body);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-2xl w-[440px] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-142235)]">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">
              {isLine ? t('Add Line Within Plan') : t('Add Equipment Within Plan')}
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {t('Parent node: {{label}} ({{sublabel}}) · Visible only within this plan, does not affect master data', { label: parent.label, sublabel: parent.sublabel ?? '' })}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300" disabled={busy}>
            <X size={14} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-400">{isLine ? t('Line Code') : t('Equipment Code')} *</label>
            <input
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={isLine ? 'L_HYPO_01' : 'EQ_HYPO_01'}
              className="bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded-lg px-3 py-2 text-sm font-mono text-slate-200 outline-none focus:border-blue-500/60"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-slate-400">{isLine ? t('Line Name') : t('Equipment Name')} *</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={isLine ? t('Hypothetical Line 01') : t('Hypothetical Equipment 01')}
              className="bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/60"
            />
          </div>
          {isEquipment && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-slate-400">{t('Equipment Type')}</label>
                <select
                  value={eqType}
                  onChange={(e) => setEqType(e.target.value)}
                  className="bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500/60"
                >
                  <option>ROBOT</option>
                  <option>WORKSTATION</option>
                  <option>CONVEYOR</option>
                  <option>OTHER</option>
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400">{t('CT (s)')}</label>
                  <input type="number" value={ct} onChange={(e) => setCt(e.target.value)} placeholder="30"
                    className="bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded px-2 py-1.5 text-[12px] font-mono text-slate-200 outline-none" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400">{t('Yield Rate (%)')}</label>
                  <input type="number" value={yieldRate} onChange={(e) => setYieldRate(e.target.value)} placeholder="99.5"
                    className="bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded px-2 py-1.5 text-[12px] font-mono text-slate-200 outline-none" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-slate-400">{t('Headcount')}</label>
                  <input type="number" value={workers} onChange={(e) => setWorkers(e.target.value)} placeholder="1"
                    className="bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded px-2 py-1.5 text-[12px] font-mono text-slate-200 outline-none" />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 pb-5 border-t border-[var(--c-142235)] pt-4 flex justify-end gap-2">
          <button onClick={onClose} disabled={busy}
            className="text-[11px] px-3 py-1.5 rounded border border-[var(--c-1e3a55)] text-slate-400 hover:border-slate-500 hover:text-slate-300 disabled:opacity-50">
            {t('Cancel')}
          </button>
          <button onClick={submit} disabled={busy}
            className={cn(
              'text-[11px] px-3 py-1.5 rounded',
              busy ? 'bg-[var(--c-0d2035)] text-slate-600 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-500',
            )}>
            {busy ? t('Saving…') : t('Confirm Add')}
          </button>
        </div>
      </div>
    </div>
  );
}
