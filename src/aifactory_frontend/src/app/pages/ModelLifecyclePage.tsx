import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Package, ChevronRight, GitBranch, History,
  CheckCircle2, Archive, AlertCircle, Clock,
  User, Tag, ArrowRight, MoreHorizontal,
  Plus, Search, SlidersHorizontal, X,
  TrendingUp, Layers3, Edit2, Trash2,
  RefreshCw, ShieldCheck, Eye, Download,
} from 'lucide-react';
import { NavSidebar, PageHeader } from '../components/NavSidebar';

// ── Types & Mock Data ───────────────────────────────────────────────────────
type LifecycleStage = 'draft' | 'review' | 'active' | 'deprecated' | 'archived';

interface ModelRecord {
  id: string;
  name: string;
  code: string;
  category: string;
  type: string;
  stage: LifecycleStage;
  version: string;
  owner: string;
  updatedAt: string;
  referencedBy: number;
  tags: string[];
  thumbnail?: string;
  pendingReviewNote?: string;
}

const MOCK_MODELS: ModelRecord[] = [
  // Draft
  {
    id: 'm001', name: 'JUKI FX-3R Chip Mounter', code: 'EQ-SMT-CM-001',
    category: 'SMT', type: 'Equipment', stage: 'draft', version: 'v1.0.0',
    owner: 'Tom Chen', updatedAt: '2026-04-06', referencedBy: 0,
    tags: ['SMT', 'New'],
    pendingReviewNote: '等待3D工程师完成 LOD2 制作',
  },
  {
    id: 'm002', name: 'AGV Pallet Carrier 1000kg', code: 'EQ-LOG-AGV-003',
    category: 'Logistics', type: 'Equipment', stage: 'draft', version: 'v0.9.0',
    owner: 'Grace Liu', updatedAt: '2026-04-05', referencedBy: 0,
    tags: ['Logistics'],
    pendingReviewNote: '碰撞体积待审核',
  },

  // Review
  {
    id: 'm003', name: 'Reflow Oven HZ-2600', code: 'EQ-SMT-RO-004',
    category: 'SMT', type: 'Equipment', stage: 'review', version: 'v2.1.0',
    owner: 'Grace Liu', updatedAt: '2026-04-04', referencedBy: 0,
    tags: ['SMT', 'Verified'],
    pendingReviewNote: '材质贴图审核中，预计明日完成',
  },
  {
    id: 'm004', name: 'SMT Assembly Line Template', code: 'LN-SMT-ASSY-001',
    category: 'SMT', type: 'Line', stage: 'review', version: 'v3.0.0',
    owner: 'Tom Chen', updatedAt: '2026-04-03', referencedBy: 2,
    tags: ['SMT', 'Template'],
    pendingReviewNote: '产线布局验证中',
  },

  // Active
  {
    id: 'm005', name: 'ABB IRB 4600 Robot Arm', code: 'EQ-SMT-RA-002',
    category: 'SMT', type: 'Equipment', stage: 'active', version: 'v4.2.0',
    owner: 'Grace Liu', updatedAt: '2026-04-05', referencedBy: 8,
    tags: ['SMT', 'Robotics', 'IoT'],
  },
  {
    id: 'm006', name: 'Stencil Printer DEK Horizon', code: 'EQ-SMT-SP-001',
    category: 'SMT', type: 'Equipment', stage: 'active', version: 'v2.3.1',
    owner: 'Tom Chen', updatedAt: '2026-03-20', referencedBy: 5,
    tags: ['SMT'],
  },
  {
    id: 'm007', name: 'Conveyor Belt 600mm', code: 'EQ-FAC-CB-012',
    category: 'Facility', type: 'Equipment', stage: 'active', version: 'v1.4.0',
    owner: 'Grace Liu', updatedAt: '2026-03-18', referencedBy: 14,
    tags: ['Facility', 'Standard'],
  },
  {
    id: 'm008', name: 'PTH Assembly Line', code: 'LN-PTH-ASSY-001',
    category: 'PTH', type: 'Line', stage: 'active', version: 'v2.0.0',
    owner: 'Tom Chen', updatedAt: '2026-03-10', referencedBy: 3,
    tags: ['PTH'],
  },

  // Deprecated
  {
    id: 'm009', name: 'Chip Mounter Fuji NXT II', code: 'EQ-SMT-CM-002',
    category: 'SMT', type: 'Equipment', stage: 'deprecated', version: 'v1.8.0',
    owner: 'Tom Chen', updatedAt: '2026-02-15', referencedBy: 2,
    tags: ['SMT', 'Legacy'],
  },
  {
    id: 'm010', name: 'Manual Inspection Station', code: 'EQ-QA-MI-003',
    category: 'QA', type: 'Equipment', stage: 'deprecated', version: 'v1.0.2',
    owner: 'Grace Liu', updatedAt: '2026-01-20', referencedBy: 0,
    tags: ['QA', 'Legacy'],
  },

  // Archived
  {
    id: 'm011', name: 'Wave Soldering Machine WS-100', code: 'EQ-PTH-WS-001',
    category: 'PTH', type: 'Equipment', stage: 'archived', version: 'v2.2.0',
    owner: 'Tom Chen', updatedAt: '2025-11-30', referencedBy: 0,
    tags: ['PTH', 'Archive'],
  },
];

// ── Stage Config ─────────────────────────────────────────────────────────────
const STAGE_CONFIG: Record<LifecycleStage, {
  label: string;
  labelCN: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
  icon: React.ReactNode;
  transitions: LifecycleStage[];
  description: string;
}> = {
  draft: {
    label: 'Draft', labelCN: '草稿',
    color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-600/40',
    dot: 'bg-slate-500',
    icon: <Edit2 size={10} />,
    transitions: ['review'],
    description: '未发布，仅创建人可见，不可被项目引用',
  },
  review: {
    label: 'In Review', labelCN: '审核中',
    color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/40',
    dot: 'bg-amber-400',
    icon: <ShieldCheck size={10} />,
    transitions: ['active', 'draft'],
    description: '审核阶段，等待3D工程师或管理员批准',
  },
  active: {
    label: 'Active', labelCN: '激活',
    color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40',
    dot: 'bg-emerald-400',
    icon: <CheckCircle2 size={10} />,
    transitions: ['deprecated'],
    description: '正式发布，可被工厂项目引用',
  },
  deprecated: {
    label: 'Deprecated', labelCN: '停用',
    color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/40',
    dot: 'bg-orange-400',
    icon: <AlertCircle size={10} />,
    transitions: ['active', 'archived'],
    description: '已停用，现有引用保留但不推荐新建引用',
  },
  archived: {
    label: 'Archived', labelCN: '归档',
    color: 'text-slate-500', bg: 'bg-slate-700/20', border: 'border-slate-700/40',
    dot: 'bg-slate-600',
    icon: <Archive size={10} />,
    transitions: [],
    description: '历史存档，完全只读，不可引用',
  },
};

const STAGE_ORDER: LifecycleStage[] = ['draft', 'review', 'active', 'deprecated', 'archived'];

// ── Stage Badge ──────────────────────────────────────────────────────────────
function StageBadge({ stage }: { stage: LifecycleStage }) {
  const cfg = STAGE_CONFIG[stage];
  return (
    <span className={`text-[9px] px-2 py-0.5 rounded border font-medium flex items-center gap-1 ${cfg.color} ${cfg.bg} ${cfg.border}`}>
      {cfg.icon} {cfg.labelCN}
    </span>
  );
}

// ── Model Card (Kanban) ───────────────────────────────────────────────────────
function ModelCard({
  model,
  onTransition,
  onSelect,
}: {
  model: ModelRecord;
  onTransition: (model: ModelRecord, to: LifecycleStage) => void;
  onSelect: (model: ModelRecord) => void;
}) {
  const cfg = STAGE_CONFIG[model.stage];
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      className={`bg-[#0b1d30] border rounded-lg p-3 cursor-pointer hover:border-[#2a4a6a] transition-all group`}
      style={{ borderColor: showMenu ? '#2a4a6a' : '#142235' }}
      onClick={() => onSelect(model)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded bg-blue-600/20 flex items-center justify-center flex-shrink-0">
            <Package size={11} className="text-blue-400" />
          </div>
          <span className="text-[11px] font-medium text-slate-200 truncate">{model.name}</span>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          className="text-slate-600 hover:text-slate-300 transition-colors flex-shrink-0 relative"
        >
          <MoreHorizontal size={13} />
          {showMenu && (
            <div className="absolute right-0 top-5 w-36 bg-[#0f2136] border border-[#1e3a55] rounded-lg shadow-xl z-20 py-1">
              {cfg.transitions.map(to => (
                <button
                  key={to}
                  onClick={(e) => { e.stopPropagation(); onTransition(model, to); setShowMenu(false); }}
                  className="w-full text-left px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-[#142235] flex items-center gap-2 transition-colors"
                >
                  <ArrowRight size={9} />
                  移至 {STAGE_CONFIG[to].labelCN}
                </button>
              ))}
              <div className="border-t border-[#142235] my-1" />
              <button className="w-full text-left px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-[#142235] flex items-center gap-2 transition-colors">
                <Eye size={9} /> 查看详情
              </button>
            </div>
          )}
        </button>
      </div>

      <div className="mt-2 space-y-1">
        <div className="text-[9px] text-slate-600 font-mono">{model.code}</div>
        <div className="flex items-center gap-2 text-[9px] text-slate-600">
          <span>{model.version}</span>
          <span>·</span>
          <span>{model.category}</span>
          {model.referencedBy > 0 && (
            <>
              <span>·</span>
              <span className="text-blue-500">{model.referencedBy} refs</span>
            </>
          )}
        </div>
        {model.pendingReviewNote && (
          <div className="text-[9px] text-amber-500/80 bg-amber-500/5 border border-amber-500/20 rounded px-2 py-1">
            {model.pendingReviewNote}
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
        {model.tags.slice(0, 3).map(tag => (
          <span key={tag} className="text-[8px] px-1.5 py-0.5 rounded bg-blue-600/10 text-blue-500 border border-blue-500/20">
            {tag}
          </span>
        ))}
      </div>

      <div className="mt-2 flex items-center gap-2 text-[9px] text-slate-700">
        <User size={8} /> {model.owner}
        <Clock size={8} /> {model.updatedAt}
      </div>
    </div>
  );
}

// ── Detail Drawer ─────────────────────────────────────────────────────────────
function ModelDetailDrawer({
  model,
  onClose,
  onTransition,
}: {
  model: ModelRecord;
  onClose: () => void;
  onTransition: (model: ModelRecord, to: LifecycleStage) => void;
}) {
  const cfg = STAGE_CONFIG[model.stage];

  return (
    <div className="fixed inset-0 z-40" onClick={onClose}>
      <div
        className="absolute right-0 top-0 h-full w-[380px] bg-[#071526] border-l border-[#1e3a55] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#142235] flex-shrink-0">
          <div className="flex items-center gap-2">
            <Package size={14} className="text-blue-400" />
            <span className="text-sm font-semibold text-slate-100 truncate max-w-[260px]">{model.name}</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Stage & transitions */}
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">当前阶段</div>
            <div className="flex items-center gap-3 mb-3">
              <StageBadge stage={model.stage} />
              <span className="text-[10px] text-slate-500">{cfg.description}</span>
            </div>

            {/* Lifecycle flow */}
            <div className="flex items-center gap-1 flex-wrap">
              {STAGE_ORDER.map((s, i) => (
                <React.Fragment key={s}>
                  <div className={`text-[9px] px-2 py-1 rounded border font-medium ${
                    s === model.stage
                      ? `${STAGE_CONFIG[s].color} ${STAGE_CONFIG[s].bg} ${STAGE_CONFIG[s].border}`
                      : STAGE_ORDER.indexOf(s) < STAGE_ORDER.indexOf(model.stage)
                      ? 'text-slate-600 bg-slate-700/20 border-slate-700/30 line-through'
                      : 'text-slate-700 bg-transparent border-[#142235]'
                  }`}>
                    {STAGE_CONFIG[s].labelCN}
                  </div>
                  {i < STAGE_ORDER.length - 1 && <ArrowRight size={8} className="text-slate-700" />}
                </React.Fragment>
              ))}
            </div>
          </div>

          {/* Basic info */}
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">基本信息</div>
            <div className="space-y-2">
              {[
                { label: '资产编码', value: model.code },
                { label: '分类', value: model.category },
                { label: '类型', value: model.type },
                { label: '当前版本', value: model.version },
                { label: '负责人', value: model.owner },
                { label: '最后更新', value: model.updatedAt },
                { label: '项目引用数', value: model.referencedBy > 0 ? `${model.referencedBy} 个项目` : '未被引用' },
              ].map(row => (
                <div key={row.label} className="flex items-center justify-between gap-4">
                  <span className="text-[10px] text-slate-500 flex-shrink-0">{row.label}</span>
                  <span className={`text-[10px] text-right ${row.label === '项目引用数' && model.referencedBy > 0 ? 'text-blue-400' : 'text-slate-300'}`}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">标签</div>
            <div className="flex flex-wrap gap-1.5">
              {model.tags.map(tag => (
                <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-blue-600/10 text-blue-400 border border-blue-500/20">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          {/* Review note */}
          {model.pendingReviewNote && (
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">审核备注</div>
              <div className="text-[11px] text-amber-400/80 bg-amber-500/5 border border-amber-500/20 rounded px-3 py-2">
                {model.pendingReviewNote}
              </div>
            </div>
          )}

          {/* Transition actions */}
          {cfg.transitions.length > 0 && (
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">状态变更</div>
              <div className="space-y-2">
                {cfg.transitions.map(to => {
                  const toCfg = STAGE_CONFIG[to];
                  const isForward = STAGE_ORDER.indexOf(to) > STAGE_ORDER.indexOf(model.stage);
                  return (
                    <button
                      key={to}
                      onClick={() => { onTransition(model, to); onClose(); }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors ${
                        isForward
                          ? `${toCfg.bg} ${toCfg.border} ${toCfg.color} hover:opacity-80`
                          : 'bg-slate-700/20 border-slate-600/40 text-slate-400 hover:border-slate-500/60'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-[11px] font-medium">
                        <ArrowRight size={11} />
                        移至「{toCfg.labelCN}」
                      </div>
                      <span className="text-[9px] opacity-70">{toCfg.description}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Actions footer */}
        <div className="px-5 py-4 border-t border-[#142235] flex gap-2 flex-shrink-0">
          <button className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-[#1e3a55] text-slate-400 hover:text-slate-200 hover:border-[#2a4a6a] py-2 rounded-md transition-colors">
            <History size={11} /> 版本历史
          </button>
          <button className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-[#1e3a55] text-slate-400 hover:text-slate-200 hover:border-[#2a4a6a] py-2 rounded-md transition-colors">
            <Download size={11} /> 导出
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function ModelLifecyclePage() {
  const navigate = useNavigate();
  const [models, setModels] = useState<ModelRecord[]>(MOCK_MODELS);
  const [selectedModel, setSelectedModel] = useState<ModelRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [transitionToast, setTransitionToast] = useState<string | null>(null);

  const categories = ['all', ...Array.from(new Set(MOCK_MODELS.map(m => m.category)))];

  const filtered = models.filter(m => {
    const matchSearch = !searchQuery ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.code.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCat = filterCategory === 'all' || m.category === filterCategory;
    return matchSearch && matchCat;
  });

  function handleTransition(model: ModelRecord, to: LifecycleStage) {
    setModels(prev => prev.map(m => m.id === model.id ? { ...m, stage: to } : m));
    setSelectedModel(prev => prev?.id === model.id ? { ...prev, stage: to } : prev);
    setTransitionToast(`「${model.name}」已移至 ${STAGE_CONFIG[to].labelCN}`);
    setTimeout(() => setTransitionToast(null), 3000);
  }

  // Stats
  const stats = STAGE_ORDER.map(stage => ({
    stage,
    count: filtered.filter(m => m.stage === stage).length,
  }));

  return (
    <div className="flex h-screen bg-[#07111e] text-slate-100 overflow-hidden">
      <NavSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader
          crumbs={[
            { label: 'Asset Library', path: '/asset-library' },
            { label: 'Model Lifecycle Management' },
          ]}
          actions={
            <>
              <button
                onClick={() => navigate('/asset-library/asset-versions/irb-4600')}
                className="flex items-center gap-1.5 text-xs border border-[#1e3a55] text-slate-400 hover:text-slate-200 hover:border-[#2a4a6a] px-3 py-1.5 rounded-md transition-colors"
              >
                <GitBranch size={12} /> Version Mgmt
              </button>
              <button
                onClick={() => navigate('/asset-library')}
                className="flex items-center gap-1.5 text-xs border border-[#1e3a55] text-slate-400 hover:text-slate-200 hover:border-[#2a4a6a] px-3 py-1.5 rounded-md transition-colors"
              >
                <Package size={12} /> Asset Library
              </button>
            </>
          }
        />

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Toolbar */}
          <div className="h-12 bg-[#07111e] border-b border-[#142235] flex items-center px-5 gap-3 flex-shrink-0">
            {/* Search */}
            <div className="relative w-56">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search models..."
                className="w-full bg-[#071526] border border-[#1e3a55] rounded-md pl-7 pr-8 py-1.5 text-[11px] text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  <X size={11} />
                </button>
              )}
            </div>

            {/* Category filter */}
            <div className="flex items-center gap-1.5">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`text-[10px] px-2.5 py-1 rounded border transition-colors ${
                    filterCategory === cat
                      ? 'border-blue-500/60 bg-blue-600/15 text-blue-300'
                      : 'border-[#1e3a55] text-slate-500 hover:text-slate-300 hover:border-[#2a4a6a]'
                  }`}
                >
                  {cat === 'all' ? 'All Categories' : cat}
                </button>
              ))}
            </div>

            {/* Stats summary */}
            <div className="ml-auto flex items-center gap-4">
              {stats.map(({ stage, count }) => (
                <div key={stage} className="flex items-center gap-1.5 text-[10px]">
                  <div className={`w-1.5 h-1.5 rounded-full ${STAGE_CONFIG[stage].dot}`} />
                  <span className="text-slate-500">{STAGE_CONFIG[stage].labelCN}</span>
                  <span className={`font-semibold ${STAGE_CONFIG[stage].color}`}>{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Lifecycle flow banner */}
          <div className="px-5 py-2.5 bg-[#050f1a] border-b border-[#142235] flex items-center gap-2 flex-shrink-0">
            <span className="text-[9px] font-semibold text-slate-600 uppercase tracking-wider mr-1">Lifecycle Flow</span>
            {STAGE_ORDER.map((s, i) => (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-1.5 text-[9px] px-2.5 py-1 rounded border font-medium ${STAGE_CONFIG[s].color} ${STAGE_CONFIG[s].bg} ${STAGE_CONFIG[s].border}`}>
                  {STAGE_CONFIG[s].icon}
                  {STAGE_CONFIG[s].labelCN}
                </div>
                {i < STAGE_ORDER.length - 1 && <ArrowRight size={10} className="text-slate-700" />}
              </React.Fragment>
            ))}
            <span className="ml-4 text-[9px] text-slate-700">点击模型卡片查看详情并变更阶段</span>
          </div>

          {/* Kanban columns */}
          <div className="flex-1 overflow-x-auto">
            <div className="flex h-full min-w-[1100px]">
              {STAGE_ORDER.map(stage => {
                const cfg = STAGE_CONFIG[stage];
                const stageModels = filtered.filter(m => m.stage === stage);

                return (
                  <div key={stage} className="flex-1 flex flex-col border-r border-[#142235] last:border-r-0 min-w-0">
                    {/* Column header */}
                    <div className={`px-3 py-2.5 border-b border-[#142235] flex items-center justify-between flex-shrink-0 ${cfg.bg}`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                        <span className={`text-[11px] font-semibold ${cfg.color}`}>{cfg.labelCN}</span>
                        <span className="text-[10px] text-slate-600">/ {cfg.label}</span>
                      </div>
                      <span className={`text-[11px] font-bold ${cfg.color}`}>{stageModels.length}</span>
                    </div>

                    {/* Column description */}
                    <div className="px-3 py-1.5 bg-[#050f1a] border-b border-[#142235] flex-shrink-0">
                      <p className="text-[9px] text-slate-700 leading-relaxed">{cfg.description}</p>
                    </div>

                    {/* Cards */}
                    <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                      {stageModels.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-center">
                          <Package size={20} className="text-slate-700 mb-2" />
                          <span className="text-[10px] text-slate-700">暂无模型</span>
                        </div>
                      ) : (
                        stageModels.map(model => (
                          <ModelCard
                            key={model.id}
                            model={model}
                            onTransition={handleTransition}
                            onSelect={setSelectedModel}
                          />
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      {selectedModel && (
        <ModelDetailDrawer
          model={selectedModel}
          onClose={() => setSelectedModel(null)}
          onTransition={handleTransition}
        />
      )}

      {/* Transition toast */}
      {transitionToast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-[#0b1d30] border border-emerald-500/40 text-emerald-400 text-[11px] px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 z-50">
          <CheckCircle2 size={13} />
          {transitionToast}
        </div>
      )}
    </div>
  );
}
