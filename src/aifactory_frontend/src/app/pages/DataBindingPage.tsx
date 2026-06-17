import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ChevronRight, ChevronDown, Link2, AlertTriangle,
  CheckCircle2, RefreshCw, XCircle, Settings2, Plus,
  Trash2, Edit2, ArrowRight, Database, Zap, GitMerge,
  Activity, Clock, Layers3, GitBranch, ClipboardList,
} from 'lucide-react';
import {
  mockFactoryProjects,
  mockBindingRules,
  mockDataSources,
  type BindingRule,
  type BindingType,
} from '../data/mockData';
import { NavSidebar, PageHeader } from '../components/NavSidebar';
import { useLocalized, t } from '../utils/i18n';

// ── Mock factory node tree ────────────────────────────────────────────────────
interface FactoryNode {
  id: string;
  label: string;
  type: 'zone' | 'line' | 'station' | 'equipment';
  children?: FactoryNode[];
}

const FACTORY_TREE: FactoryNode[] = [
  {
    id: 'zone-smt', label: 'SMT 区域', type: 'zone',
    children: [
      {
        id: 'line-smt1', label: 'SMT产线-01', type: 'line',
        children: [
          { id: 'st-smt1-1', label: '锡膏印刷站', type: 'station', children: [
            { id: 'eq-spi', label: 'SPI检测仪 #1', type: 'equipment' },
            { id: 'eq-printer', label: '全自动印刷机 #1', type: 'equipment' },
          ]},
          { id: 'st-smt1-2', label: '贴片站', type: 'station', children: [
            { id: 'eq-mounter1', label: '高速贴片机 JUKI-01', type: 'equipment' },
            { id: 'eq-mounter2', label: '多功能贴片机 FUJI-01', type: 'equipment' },
          ]},
          { id: 'st-smt1-3', label: '回流焊站', type: 'station', children: [
            { id: 'eq-reflow', label: '回流焊炉 #1', type: 'equipment' },
          ]},
        ],
      },
      {
        id: 'line-smt2', label: 'SMT产线-02', type: 'line',
        children: [
          { id: 'st-smt2-1', label: '锡膏印刷站', type: 'station' },
          { id: 'st-smt2-2', label: '贴片站', type: 'station' },
        ],
      },
    ],
  },
  {
    id: 'zone-assy', label: 'ASSY 区域', type: 'zone',
    children: [
      {
        id: 'line-assy1', label: 'ASSY产线-01', type: 'line',
        children: [
          { id: 'st-assy-1', label: '插件站', type: 'station' },
          { id: 'st-assy-2', label: '波峰焊站', type: 'station' },
          { id: 'st-assy-3', label: 'AOI检测站', type: 'station' },
        ],
      },
    ],
  },
  {
    id: 'zone-test', label: 'TEST 区域', type: 'zone',
    children: [
      {
        id: 'line-test1', label: 'TEST产线-01', type: 'line',
        children: [
          { id: 'st-test-1', label: '功能测试站', type: 'station' },
          { id: 'st-test-2', label: '老化测试站', type: 'station' },
        ],
      },
    ],
  },
];

const NODE_TYPE_COLORS: Record<FactoryNode['type'], string> = {
  zone: 'text-violet-400',
  line: 'text-blue-400',
  station: 'text-emerald-400',
  equipment: 'text-amber-400',
};

const BINDING_TYPE_CONFIG: Record<BindingType, { icon: React.ReactNode; color: string }> = {
  override: { icon: <ArrowRight size={11} />, color: 'text-blue-400' },
  mapping:  { icon: <GitMerge size={11} />, color: 'text-violet-400' },
  merge:    { icon: <Zap size={11} />, color: 'text-emerald-400' },
};

const BINDING_TYPE_LABEL: Record<BindingType, string> = {
  override: 'binding.type.override',
  mapping:  'binding.type.mapping',
  merge:    'binding.type.merge',
};

const STATUS_CONFIG = {
  bound:    { cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
  pending:  { cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
  error:    { cls: 'text-red-400 bg-red-500/10 border-red-500/30' },
  conflict: { cls: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
};

const STATUS_LABEL: Record<string, string> = {
  bound:    'binding.ruleStatus.bound',
  pending:  'binding.ruleStatus.pending',
  error:    'binding.ruleStatus.error',
  conflict: 'binding.ruleStatus.conflict',
};

// ── Tree node component ───────────────────────────────────────────────────────
function TreeNode({
  node,
  depth,
  selectedId,
  onSelect,
  ruleCountMap,
}: {
  node: FactoryNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  ruleCountMap: Record<string, number>;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const count = ruleCountMap[node.id] ?? 0;

  return (
    <div>
      <div
        onClick={() => { onSelect(node.id); }}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded cursor-pointer select-none group transition-colors ${
          selectedId === node.id
            ? 'bg-blue-600/20 text-blue-300'
            : 'hover:bg-[#0e243a] text-slate-400 hover:text-slate-200'
        }`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
      >
        <span className="w-3 flex-shrink-0">
          {hasChildren ? (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
              className="text-slate-500 hover:text-slate-300 p-0 bg-transparent border-none cursor-pointer focus:outline-none"
            >
              {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            </button>
          ) : (
            <span className="w-3" />
          )}
        </span>
        <span className={`text-[10px] flex-shrink-0 ${NODE_TYPE_COLORS[node.type]}`}>
          {node.type === 'zone' ? '◈' : node.type === 'line' ? '▣' : node.type === 'station' ? '▷' : '◉'}
        </span>
        <span className="text-[11px] flex-1 min-w-0 truncate">{node.label}</span>
        {count > 0 && (
          <span className="text-[9px] bg-blue-600/30 text-blue-300 rounded px-1">{count}</span>
        )}
      </div>
      {open && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              ruleCountMap={ruleCountMap}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function findNode(nodes: FactoryNode[], id: string): FactoryNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

// ── Sync log mock ─────────────────────────────────────────────────────────────
const SYNC_LOGS = [
  { time: '14:32:01', status: 'success', msg: '数据同步完成 — ERP → MES 128条记录' },
  { time: '14:28:44', status: 'error',   msg: '连接超时 — WMS 服务无响应' },
  { time: '14:15:22', status: 'success', msg: '绑定规则更新 — line-smt1 覆盖绑定已生效' },
  { time: '13:50:09', status: 'warn',    msg: '字段映射冲突 — ProductCode vs ProductNo (3处)' },
  { time: '13:30:00', status: 'success', msg: '全量同步完成 — 基础数据平台 4,521条' },
];

// ── Binding Rule Row ──────────────────────────────────────────────────────────
function RuleRow({ rule }: { rule: BindingRule }) {
  const bt = BINDING_TYPE_CONFIG[rule.bindingType];
  const st = STATUS_CONFIG[rule.status];
  const statusLabelKey = STATUS_LABEL[rule.status];
  return (
    <tr className="border-b border-[#142235] hover:bg-[#0e243a]/50 group transition-colors">
      <td className="px-4 py-2.5">
        <div className="text-[11px] font-medium text-slate-200">{rule.targetField}</div>
        <div className="text-[10px] text-slate-600 font-mono mt-0.5">{rule.nodeName}</div>
      </td>
      <td className="px-3 py-2.5">
        <div className={`flex items-center gap-1 text-[10px] ${bt.color}`}>
          {bt.icon} {t(BINDING_TYPE_LABEL[rule.bindingType])}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <div className="text-[11px] text-slate-400 font-mono">{rule.sourceField}</div>
        {rule.sourceValue && (
          <div className="text-[9px] text-slate-600 mt-0.5">{rule.sourceValue}</div>
        )}
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-[10px] px-2 py-0.5 rounded border ${st.cls}`}>{statusLabelKey ? t(statusLabelKey) : ''}</span>
      </td>
      <td className="px-3 py-2.5 text-[10px] text-slate-600">{rule.lastSynced ?? '—'}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="text-slate-500 hover:text-blue-400 transition-colors" title={t("common.edit")}>
            <Edit2 size={12} />
          </button>
          <button className="text-slate-500 hover:text-red-400 transition-colors" title={t("common.delete")}>
            <Trash2 size={12} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Add Rule Modal ────────────────────────────────────────────────────────────
function AddRuleModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState<BindingType>('override');
  const [field, setField] = useState('');
  const [source, setSource] = useState('');

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0b1d30] border border-[#1e3a55] rounded-xl w-[480px] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#142235]">
          <span className="text-sm font-semibold text-slate-100">{t("binding.newRule")}</span>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <XCircle size={15} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] text-slate-400 mb-2">{t("binding.bindingType")}</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(BINDING_TYPE_CONFIG) as [BindingType, typeof BINDING_TYPE_CONFIG[BindingType]][]).map(([id, cfg]) => (
                <button
                  key={id}
                  onClick={() => setType(id)}
                  className={`border rounded-md p-2.5 text-left transition-colors ${
                    type === id ? 'border-blue-500/60 bg-blue-600/10' : 'border-[#1e3a55] hover:border-[#2a4a6a]'
                  }`}
                >
                  <div className={`flex items-center gap-1 text-xs font-semibold mb-0.5 ${cfg.color}`}>
                    {cfg.icon} {t(BINDING_TYPE_LABEL[id])}
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1.5">{t("binding.targetField")}</label>
              <input
                value={field}
                onChange={(e) => setField(e.target.value)}
                placeholder={t("binding.placeholder.targetField")}
                className="w-full bg-[#071526] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1.5">{t("binding.dataSource")}</label>
              <select className="w-full bg-[#071526] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors">
                <option>{t("home.integration.platform")}</option>
                <option>{t("home.integration.erp")}</option>
                <option>{t("home.integration.mes")}</option>
                <option>{t("home.integration.wms")}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1.5">{t("binding.sourceFieldPath")}</label>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder={t("binding.placeholder.sourceFieldPath")}
              className="w-full bg-[#071526] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-xs text-slate-400 border border-[#1e3a55] rounded hover:border-[#2a4a6a] transition-colors">{t("common.cancel")}</button>
          <button
            disabled={!field.trim()}
            onClick={onClose}
            className="px-5 py-2 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded font-medium transition-colors"
          >
            {t("binding.saveRule")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function DataBindingPage() {
  useLocalized();
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const project = mockFactoryProjects.find((p) => p.id === projectId);
  const projectName = project?.name ?? 'Factory Project';

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>('line-smt1');
  const [activeTab, setActiveTab] = useState<BindingType>('override');
  const [showAddModal, setShowAddModal] = useState(false);

  const selectedNode = selectedNodeId ? findNode(FACTORY_TREE, selectedNodeId) : null;

  // Filter rules for selected node + active tab (show all rules for demo when no node match)
  const filteredRules = mockBindingRules.filter(
    (r) => r.bindingType === activeTab,
  );

  // Build rule count map for tree badges — use sample counts for demo
  const ruleCountMap: Record<string, number> = {
    'line-smt1': 4,
    'eq-spi': 2,
    'eq-printer': 2,
    'eq-mounter1': 2,
    'eq-reflow': 1,
  };

  // Stats for right panel
  const totalRules = mockBindingRules.length;
  const activeRules = mockBindingRules.filter((r) => r.status === 'bound').length;
  const errorRules = mockBindingRules.filter((r) => r.status === 'error').length;
  const conflicts = mockBindingRules.filter((r) => r.status === 'conflict').length;

  return (
    <div className="flex h-screen bg-[#07111e] text-slate-100 overflow-hidden">
      <NavSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader
          crumbs={[
            { label: t("project.title"), path: '/factory/houston-p9' },
            { label: projectName, path: `/factory/${projectId}` },
            { label: t("binding.title") },
          ]}
        />

        {/* ── Project Sub Navigation ── */}
        <div className="h-8 bg-[#050f1a] border-b border-[#142235] flex items-end px-4 flex-shrink-0">
          {([
            { id: 'editor',   labelKey: 'editor.3dEditor',   icon: <Layers3 size={10} />,   path: `/factory/${projectId}` },
            { id: 'binding',  labelKey: 'binding.title',      icon: <Link2 size={10} />,     path: `/factory/${projectId}/data-binding` },
            { id: 'versions', labelKey: 'home.logs',          icon: <ClipboardList size={10} />, path: `/factory/${projectId}/versions` },
          ] as { id: string; labelKey: string; icon: React.ReactNode; path: string }[]).map((tab) => (
            <button
              key={tab.id}
              onClick={() => navigate(tab.path)}
              className={`h-full flex items-center gap-1.5 px-4 text-[11px] border-b-2 transition-colors ${
                tab.id === 'binding'
                  ? 'border-blue-500 text-blue-300'
                  : 'border-transparent text-slate-500 hover:text-slate-300 hover:border-slate-600'
              }`}
            >
              {tab.icon}
              {t(tab.labelKey)}
            </button>
          ))}
        </div>

        <div className="flex flex-1 overflow-hidden">

          {/* ── Left: Factory tree ── */}
          <aside className="w-56 bg-[#040d18] border-r border-[#142235] flex flex-col overflow-hidden flex-shrink-0">
            <div className="px-3 py-3 border-b border-[#142235]">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{t("binding.factoryNodeTree")}</div>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {FACTORY_TREE.map((node) => (
                <TreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selectedNodeId}
                  onSelect={setSelectedNodeId}
                  ruleCountMap={ruleCountMap}
                />
              ))}
            </div>
          </aside>

          {/* ── Center: Binding rules ── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Center header */}
            <div className="h-11 border-b border-[#142235] flex items-center px-5 gap-4 flex-shrink-0 bg-[#071526]">
              {selectedNode ? (
                <>
                  <span className={`text-[11px] font-medium ${NODE_TYPE_COLORS[selectedNode.type]}`}>
                    {selectedNode.label}
                  </span>
                  <span className="text-slate-700">·</span>
                  <span className="text-[11px] text-slate-500">{t("binding.dataBindingRules")}</span>
                </>
              ) : (
                <span className="text-[11px] text-slate-500">{t("binding.pleaseSelectNode")}</span>
              )}
              <div className="ml-auto">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded transition-colors"
                >
                  <Plus size={11} /> {t("binding.addRule")}
                </button>
              </div>
            </div>

            {/* Binding type tabs */}
            <div className="flex gap-0 border-b border-[#142235] bg-[#071526] px-5 flex-shrink-0">
              {(Object.entries(BINDING_TYPE_CONFIG) as [BindingType, typeof BINDING_TYPE_CONFIG[BindingType]][]).map(([id, cfg]) => {
                const count = mockBindingRules.filter((r) => r.bindingType === id).length;
                return (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`flex items-center gap-1.5 text-[11px] px-4 py-2.5 border-b-2 transition-colors ${
                      activeTab === id
                        ? 'border-blue-500 text-blue-300'
                        : 'border-transparent text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    <span className={cfg.color}>{cfg.icon}</span>
                    {t(BINDING_TYPE_LABEL[id])}
                    {count > 0 && (
                      <span className="text-[9px] bg-[#142235] text-slate-500 rounded px-1">{count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              {filteredRules.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Database size={28} className="text-slate-700 mb-3" />
                  <div className="text-[12px] text-slate-500">{t("binding.noRules", { type: t(BINDING_TYPE_LABEL[activeTab]) })}</div>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="mt-3 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors"
                  >
                    <Plus size={11} /> {t("binding.addRule")}
                  </button>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="sticky top-0 bg-[#071526] z-10">
                    <tr className="text-left border-b border-[#142235]">
                      <th className="px-4 py-2.5 text-[10px] font-medium text-slate-500 uppercase tracking-wider">{t("binding.targetField")}</th>
                      <th className="px-3 py-2.5 text-[10px] font-medium text-slate-500 uppercase tracking-wider">{t("binding.bindingMethod")}</th>
                      <th className="px-3 py-2.5 text-[10px] font-medium text-slate-500 uppercase tracking-wider">{t("binding.sourceField")}</th>
                      <th className="px-3 py-2.5 text-[10px] font-medium text-slate-500 uppercase tracking-wider">{t("common.status")}</th>
                      <th className="px-3 py-2.5 text-[10px] font-medium text-slate-500 uppercase tracking-wider">{t("binding.lastSync")}</th>
                      <th className="px-3 py-2.5 w-16" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRules.map((rule) => (
                      <RuleRow key={rule.id} rule={rule} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* ── Right: Status panel ── */}
          <aside className="w-60 bg-[#071526] border-l border-[#142235] flex flex-col overflow-hidden flex-shrink-0">
            {/* Summary cards */}
            <div className="p-4 border-b border-[#142235] space-y-2">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">{t("binding.bindingOverview")}</div>
              <StatCard label={t("binding.totalRules")} value={totalRules} icon={<Link2 size={12} />} color="text-blue-400" />
              <StatCard label={t("binding.activeRules")} value={activeRules} icon={<CheckCircle2 size={12} />} color="text-emerald-400" />
              <StatCard label={t("binding.errorRules")} value={errorRules} icon={<XCircle size={12} />} color="text-red-400" />
              <StatCard label={t("binding.fieldConflicts")} value={conflicts} icon={<AlertTriangle size={12} />} color="text-amber-400" />
            </div>

            {/* Conflict list */}
            {conflicts > 0 && (
              <div className="p-4 border-b border-[#142235]">
                <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">{t("binding.conflictList")}</div>
                <div className="space-y-2">
                  {mockBindingRules.filter((r) => r.status === 'conflict').map((r) => (
                    <div key={r.id} className="bg-amber-500/5 border border-amber-500/20 rounded p-2">
                      <div className="text-[10px] text-amber-300 font-medium">{r.targetField}</div>
                      <div className="text-[9px] text-amber-500/80 mt-0.5">
                        {t("binding.source")} {r.sourceValue} / {t("binding.local")} {r.targetValue}
                      </div>
                      <button className="mt-1 text-[9px] text-blue-400 hover:text-blue-300 flex items-center gap-0.5 transition-colors">
                        <Settings2 size={9} /> {t("binding.resolveConflict")}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Sync action */}
            <div className="p-4 border-b border-[#142235]">
              <button className="w-full flex items-center justify-center gap-1.5 text-xs bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-400 px-3 py-2 rounded transition-colors">
                <RefreshCw size={11} /> {t("binding.syncNow")}
              </button>
            </div>

            {/* Sync logs */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Activity size={10} /> {t("binding.syncLogs")}
              </div>
              <div className="space-y-2">
                {SYNC_LOGS.map((log, i) => (
                  <div key={i} className="border-l-2 pl-2.5 py-0.5 border-[#1e3a55]">
                    <div className={`text-[10px] leading-tight ${
                      log.status === 'error' ? 'text-red-400' :
                      log.status === 'warn' ? 'text-amber-400' : 'text-slate-400'
                    }`}>
                      {log.msg}
                    </div>
                    <div className="text-[9px] text-slate-600 mt-0.5 flex items-center gap-1">
                      <Clock size={8} /> {log.time}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {showAddModal && <AddRuleModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className={`flex items-center gap-1.5 text-[10px] ${color}`}>{icon} {label}</div>
      <span className="text-[13px] font-bold text-slate-200">{value}</span>
    </div>
  );
}
