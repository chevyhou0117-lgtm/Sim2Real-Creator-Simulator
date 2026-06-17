import React, { useState } from 'react';
import {
  Database, CheckCircle2, AlertTriangle, XCircle,
  RefreshCw, Settings, Plus, Trash2,
  ArrowRight, Activity, Clock,
  Zap, GitMerge, Download, Filter,
} from 'lucide-react';
import {
  mockDataSources,
  type DataSource,
  type SourceStatus,
} from '../data/mockData';
import { NavSidebar, PageHeader } from '../components/NavSidebar';

// ── Types ─────────────────────────────────────────────────────────────────────
type SyncTab = 'config' | 'mapping' | 'logs' | 'strategy';

const SOURCE_STATUS: Record<SourceStatus, { dot: string; label: string; cls: string; icon: React.ReactNode }> = {
  connected:    { dot: 'bg-emerald-400', label: '已连接', cls: 'text-emerald-400', icon: <CheckCircle2 size={12} /> },
  disconnected: { dot: 'bg-slate-500',   label: '未连接', cls: 'text-slate-500',   icon: <XCircle size={12} /> },
  error:        { dot: 'bg-red-400',     label: '异常',   cls: 'text-red-400',     icon: <AlertTriangle size={12} /> },
  syncing:      { dot: 'bg-blue-400',    label: '同步中', cls: 'text-blue-400',    icon: <RefreshCw size={12} className="animate-spin" /> },
};

const TYPE_LABEL: Record<string, string> = {
  platform: '数据平台',
  erp: 'ERP',
  mes: 'MES',
  wms: 'WMS',
  custom: '自定义',
};

// ── Mock field mapping data ───────────────────────────────────────────────────
const FIELD_MAPPINGS: Array<{ src: string; dst: string; transform: string; enabled: boolean }> = [
  { src: 'ProductCode',    dst: 'assetId',       transform: '直传',       enabled: true  },
  { src: 'ProductName',   dst: 'displayName',   transform: '直传',       enabled: true  },
  { src: 'ProductionQty', dst: 'quantity',      transform: '数值转换',   enabled: true  },
  { src: 'LineCode',      dst: 'lineId',        transform: '字典映射',   enabled: true  },
  { src: 'StationCode',   dst: 'stationId',     transform: '字典映射',   enabled: true  },
  { src: 'EquipStatus',   dst: 'status',        transform: '枚举转换',   enabled: true  },
  { src: 'Temperature',   dst: 'temp_celsius',  transform: '单位换算',   enabled: false },
  { src: 'CreatedTime',   dst: 'timestamp',     transform: '时区转换',   enabled: true  },
];

// ── Mock sync logs ────────────────────────────────────────────────────────────
const SYNC_LOGS: Array<{ time: string; level: 'info' | 'warn' | 'error'; source: string; msg: string; count?: number }> = [
  { time: '2024-01-15 14:32:01', level: 'info',  source: '基础数据平台', msg: '全量同步完成',            count: 4521 },
  { time: '2024-01-15 14:28:44', level: 'error', source: 'WMS系统',       msg: '连接超时，请检查网络配置'             },
  { time: '2024-01-15 14:15:22', level: 'info',  source: 'MES系统',       msg: '增量同步完成',            count: 128  },
  { time: '2024-01-15 13:50:09', level: 'warn',  source: 'ERP系统',       msg: '字段映射冲突：ProductCode vs ProductNo (3处)' },
  { time: '2024-01-15 13:30:00', level: 'info',  source: '基础数据平台', msg: '心跳检测正常'                         },
  { time: '2024-01-15 13:00:00', level: 'info',  source: 'MES系统',       msg: '增量同步完成',            count: 56   },
  { time: '2024-01-15 12:45:11', level: 'error', source: 'WMS系统',       msg: '认证失败：Token已过期'               },
  { time: '2024-01-15 12:30:00', level: 'info',  source: 'ERP系统',       msg: '增量同步完成',            count: 201  },
];

// ── Add Source Modal ──────────────────────────────────────────────────────────
function AddSourceModal({ onClose }: { onClose: () => void }) {
  const [protocol, setProtocol] = useState('REST API');

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[#0b1d30] border border-[#1e3a55] rounded-xl w-[520px] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#142235]">
          <span className="text-sm font-semibold text-slate-100">新增数据源</span>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <XCircle size={15} />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1.5">数据源名称 <span className="text-red-400">*</span></label>
              <input placeholder="e.g. SAP ERP" className="w-full bg-[#071526] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1.5">协议类型</label>
              <select value={protocol} onChange={(e) => setProtocol(e.target.value)} className="w-full bg-[#071526] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors">
                <option>REST API</option>
                <option>GraphQL</option>
                <option>MQTT</option>
                <option>OPC-UA</option>
                <option>数据库直连</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1.5">连接地址 <span className="text-red-400">*</span></label>
            <input placeholder="https://api.example.com/v1" className="w-full bg-[#071526] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:border-blue-500 transition-colors" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-slate-400 mb-1.5">认证方式</label>
              <select className="w-full bg-[#071526] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors">
                <option>API Key</option>
                <option>OAuth 2.0</option>
                <option>Basic Auth</option>
                <option>无需认证</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-slate-400 mb-1.5">API Key / Token</label>
              <input type="password" placeholder="••••••••••••" className="w-full bg-[#071526] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 px-5 pb-5 justify-between">
          <button className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors">
            <Zap size={11} /> 测试连接
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-xs text-slate-400 border border-[#1e3a55] rounded hover:border-[#2a4a6a] transition-colors">取消</button>
            <button onClick={onClose} className="px-5 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors">保存</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Config Panel ──────────────────────────────────────────────────────────────
function ConfigPanel({ source }: { source: DataSource }) {
  const st = SOURCE_STATUS[source.status];

  return (
    <div className="space-y-5">
      {/* Connection status card */}
      <div className={`flex items-center gap-3 p-4 rounded-lg border ${
        source.status === 'connected' ? 'border-emerald-500/30 bg-emerald-500/5' :
        source.status === 'error' ? 'border-red-500/30 bg-red-500/5' :
        'border-[#142235] bg-[#071526]'
      }`}>
        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${st.dot}`} />
        <div className="flex-1">
          <div className={`text-[12px] font-semibold ${st.cls}`}>{st.label}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {source.lastSync ? `最后同步: ${source.lastSync}` : '尚未同步'}
          </div>
        </div>
        <button className="text-xs bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-400 px-3 py-1.5 rounded flex items-center gap-1 transition-colors">
          <RefreshCw size={11} /> 测试连接
        </button>
      </div>

      {/* Connection config */}
      <div>
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">连接配置</div>
        <div className="space-y-3">
          <FormRow label="连接地址">
            <input defaultValue={source.endpoint} className="flex-1 bg-[#040d18] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none focus:border-blue-500 transition-colors" />
          </FormRow>
          <FormRow label="认证方式">
            <select className="flex-1 bg-[#040d18] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors">
              <option>API Key</option>
              <option>OAuth 2.0</option>
              <option>Basic Auth</option>
            </select>
          </FormRow>
          <FormRow label="API Key">
            <input type="password" defaultValue="••••••••••••••••" className="flex-1 bg-[#040d18] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors" />
          </FormRow>
          <FormRow label="超时时间">
            <div className="flex-1 flex items-center gap-2">
              <input type="number" defaultValue="30" className="w-20 bg-[#040d18] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors" />
              <span className="text-[11px] text-slate-500">秒</span>
            </div>
          </FormRow>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button className="text-xs text-slate-400 border border-[#1e3a55] px-4 py-1.5 rounded hover:border-[#2a4a6a] transition-colors">重置</button>
        <button className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded font-medium transition-colors">保存配置</button>
      </div>
    </div>
  );
}

// ── Mapping Panel ─────────────────────────────────────────────────────────────
function MappingPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">字段映射规则</div>
        <button className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors">
          <Plus size={11} /> 添加映射
        </button>
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-[#142235]">
            <th className="pb-2 text-left text-[10px] font-medium text-slate-500 uppercase">源字段</th>
            <th className="pb-2 text-center text-[10px] font-medium text-slate-500 uppercase"></th>
            <th className="pb-2 text-left text-[10px] font-medium text-slate-500 uppercase">目标字段</th>
            <th className="pb-2 text-left text-[10px] font-medium text-slate-500 uppercase">转换规则</th>
            <th className="pb-2 text-center text-[10px] font-medium text-slate-500 uppercase">启用</th>
            <th className="pb-2 w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[#142235]">
          {FIELD_MAPPINGS.map((m, i) => (
            <tr key={i} className="hover:bg-[#0e243a]/40 group transition-colors">
              <td className="py-2 pr-2">
                <span className="text-[11px] text-slate-300 font-mono">{m.src}</span>
              </td>
              <td className="py-2 text-center">
                <ArrowRight size={11} className="text-slate-600 mx-auto" />
              </td>
              <td className="py-2 px-2">
                <span className="text-[11px] text-blue-300 font-mono">{m.dst}</span>
              </td>
              <td className="py-2 px-2">
                <span className="text-[10px] text-slate-500 bg-[#071526] border border-[#142235] rounded px-1.5 py-0.5">{m.transform}</span>
              </td>
              <td className="py-2 text-center">
                <div className={`w-7 h-3.5 rounded-full flex-shrink-0 mx-auto relative cursor-pointer transition-colors ${m.enabled ? 'bg-blue-600' : 'bg-[#1e3a55]'}`}>
                  <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white transition-all ${m.enabled ? 'left-4' : 'left-0.5'}`} />
                </div>
              </td>
              <td className="py-2">
                <button className="text-slate-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 size={11} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Strategy Panel ────────────────────────────────────────────────────────────
function StrategyPanel() {
  const [mode, setMode] = useState<'scheduled' | 'realtime' | 'manual'>('scheduled');
  const [syncInterval, setSyncInterval] = useState('15');

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">同步策略</div>
        <div className="grid grid-cols-3 gap-2">
          {([
            { id: 'scheduled', label: '定时同步', desc: '按设定周期自动拉取', icon: <Clock size={14} /> },
            { id: 'realtime',  label: '实时同步', desc: 'Webhook/消息推送驱动', icon: <Zap size={14} /> },
            { id: 'manual',    label: '手动同步', desc: '需人工触发数据拉取', icon: <RefreshCw size={14} /> },
          ] as const).map((opt) => (
            <button
              key={opt.id}
              onClick={() => setMode(opt.id)}
              className={`border rounded-lg p-3 text-left transition-colors ${
                mode === opt.id ? 'border-blue-500/60 bg-blue-600/10' : 'border-[#1e3a55] hover:border-[#2a4a6a]'
              }`}
            >
              <div className={`mb-1 ${mode === opt.id ? 'text-blue-400' : 'text-slate-500'}`}>{opt.icon}</div>
              <div className="text-[11px] font-semibold text-slate-200">{opt.label}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {mode === 'scheduled' && (
        <div>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">调度配置</div>
          <div className="space-y-3">
            <FormRow label="同步间隔">
              <div className="flex items-center gap-2">
                <input type="number" value={syncInterval} onChange={(e) => setSyncInterval(e.target.value)} className="w-20 bg-[#040d18] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors" />
                <span className="text-[11px] text-slate-500">分钟</span>
              </div>
            </FormRow>
            <FormRow label="同步时段">
              <div className="flex items-center gap-2 flex-1">
                <input defaultValue="00:00" type="time" className="w-24 bg-[#040d18] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors" />
                <span className="text-[11px] text-slate-500">至</span>
                <input defaultValue="23:59" type="time" className="w-24 bg-[#040d18] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
            </FormRow>
            <FormRow label="重试次数">
              <div className="flex items-center gap-2">
                <input type="number" defaultValue="3" className="w-20 bg-[#040d18] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors" />
                <span className="text-[11px] text-slate-500">次 (失败后)</span>
              </div>
            </FormRow>
          </div>
        </div>
      )}

      <div>
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">冲突处理</div>
        <div className="space-y-2">
          {[
            { id: 'overwrite', label: '数据源优先', desc: '外部数据源的值将覆盖本地值' },
            { id: 'local',     label: '本地优先',   desc: '本地值不被外部数据覆盖' },
            { id: 'manual',    label: '人工审核',   desc: '冲突数据暂存，等待人工确认' },
          ].map((opt, i) => (
            <label key={opt.id} className="flex items-start gap-3 cursor-pointer group">
              <div className={`w-4 h-4 mt-0.5 rounded-full border-2 flex-shrink-0 ${i === 0 ? 'border-blue-400 bg-blue-400' : 'border-slate-600'}`} />
              <div>
                <div className="text-[11px] text-slate-200">{opt.label}</div>
                <div className="text-[10px] text-slate-500">{opt.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded font-medium transition-colors">保存策略</button>
      </div>
    </div>
  );
}

// ── Logs Panel ────────────────────────────────────────────────────────────────
function LogsPanel() {
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warn' | 'error'>('all');
  const filtered = levelFilter === 'all' ? SYNC_LOGS : SYNC_LOGS.filter((l) => l.level === levelFilter);

  const LOG_STYLE = {
    info:  { cls: 'text-slate-400', dot: 'bg-emerald-400', label: 'INFO' },
    warn:  { cls: 'text-amber-300', dot: 'bg-amber-400',   label: 'WARN' },
    error: { cls: 'text-red-300',   dot: 'bg-red-400',     label: 'ERROR' },
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Filter size={11} className="text-slate-500" />
        {(['all', 'info', 'warn', 'error'] as const).map((l) => (
          <button
            key={l}
            onClick={() => setLevelFilter(l)}
            className={`text-[10px] px-2.5 py-1 rounded border transition-colors ${
              levelFilter === l ? 'border-blue-500/60 bg-blue-600/15 text-blue-400' : 'border-[#1e3a55] text-slate-500 hover:border-[#2a4a6a]'
            }`}
          >
            {l === 'all' ? '全部' : l.toUpperCase()}
          </button>
        ))}
        <button className="ml-auto text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors">
          <Download size={10} /> 导出日志
        </button>
      </div>

      <div className="space-y-1 max-h-96 overflow-y-auto">
        {filtered.map((log, i) => {
          const s = LOG_STYLE[log.level];
          return (
            <div key={i} className="flex items-start gap-3 py-2 px-3 rounded hover:bg-[#0e243a]/40 transition-colors">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${s.dot}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-[10px] font-mono font-semibold ${
                    log.level === 'error' ? 'text-red-400' : log.level === 'warn' ? 'text-amber-400' : 'text-emerald-400'
                  }`}>{s.label}</span>
                  <span className="text-[10px] text-blue-300/60 border border-blue-500/20 bg-blue-600/5 rounded px-1">{log.source}</span>
                  <span className={`text-[11px] ${s.cls} flex-1`}>{log.msg}</span>
                  {log.count && <span className="text-[10px] text-slate-500">{log.count.toLocaleString()} 条</span>}
                </div>
                <div className="text-[10px] text-slate-600 mt-0.5 flex items-center gap-1">
                  <Clock size={8} /> {log.time}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function IntegrationPage() {
  const [selectedSourceId, setSelectedSourceId] = useState<string>(mockDataSources[0]?.id ?? '');
  const [activeTab, setActiveTab] = useState<SyncTab>('config');
  const [showAddModal, setShowAddModal] = useState(false);

  const selectedSource = selectedSourceId
    ? mockDataSources.find((s) => s.id === selectedSourceId) ?? null
    : null;

  const connectedCount = mockDataSources.filter((s) => s.status === 'connected').length;

  const TABS: { id: SyncTab; label: string; icon: React.ReactNode }[] = [
    { id: 'config',   label: '连接配置',  icon: <Settings size={11} /> },
    { id: 'mapping',  label: '字段映射',  icon: <GitMerge size={11} /> },
    { id: 'strategy', label: '同步策略',  icon: <Zap size={11} /> },
    { id: 'logs',     label: '同步日志',  icon: <Activity size={11} /> },
  ];

  return (
    <div className="flex h-screen bg-[#07111e] text-slate-100 overflow-hidden">
      <NavSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader crumbs={[{ label: '数据集成配置' }]} />

        <div className="flex flex-1 overflow-hidden">

          {/* ── Left: Data source list ── */}
          <aside className="w-64 bg-[#040d18] border-r border-[#142235] flex flex-col overflow-hidden flex-shrink-0">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-px bg-[#142235] border-b border-[#142235]">
              <div className="bg-[#040d18] px-3 py-2.5 text-center">
                <div className="text-sm font-bold text-slate-100">{mockDataSources.length}</div>
                <div className="text-[9px] text-slate-500">总数据源</div>
              </div>
              <div className="bg-[#040d18] px-3 py-2.5 text-center">
                <div className="text-sm font-bold text-emerald-400">{connectedCount}</div>
                <div className="text-[9px] text-slate-500">已连接</div>
              </div>
            </div>

            <div className="px-3 py-2 border-b border-[#142235]">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">数据源列表</div>
            </div>

            <div className="flex-1 overflow-y-auto py-1">
              {mockDataSources.map((source) => {
                const st = SOURCE_STATUS[source.status];
                const isSelected = source.id === selectedSourceId;
                return (
                  <button
                    key={source.id}
                    onClick={() => {
                      setSelectedSourceId(source.id);
                      setActiveTab('config');
                    }}
                    className={`w-full text-left px-4 py-3 border-b border-[#142235]/50 transition-colors ${
                      isSelected ? 'bg-blue-600/15 border-l-2 border-l-blue-500' : 'hover:bg-[#0e243a]'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${st.dot}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-slate-200 truncate">{source.name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[9px] px-1 py-0.5 rounded border border-[#1e3a55] text-slate-500 uppercase">{TYPE_LABEL[source.type] ?? source.type}</span>
                          <span className={`text-[10px] ${st.cls}`}>{st.label}</span>
                        </div>
                        {source.lastSync && (
                          <div className="text-[10px] text-slate-600 mt-0.5 flex items-center gap-1">
                            <Clock size={8} /> {source.lastSync.split(' ')[1] ?? source.lastSync}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="p-3 border-t border-[#142235]">
              <button
                onClick={() => setShowAddModal(true)}
                className="w-full flex items-center justify-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 border border-[#1e3a55] hover:border-blue-500/40 rounded py-2 transition-colors"
              >
                <Plus size={11} /> 新增数据源
              </button>
            </div>
          </aside>

          {/* ── Right: Source detail panel ── */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedSource ? (
              <>
                {/* Source header */}
                <div className="px-6 py-4 border-b border-[#142235] bg-[#071526] flex items-center gap-4 flex-shrink-0">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold text-slate-100">{selectedSource.name}</div>
                      <span className="text-[9px] px-1.5 py-0.5 rounded border border-[#1e3a55] text-slate-500 uppercase tracking-wider">
                        {TYPE_LABEL[selectedSource.type] ?? selectedSource.type}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono mt-0.5">{selectedSource.endpoint}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button className="flex items-center gap-1.5 text-xs bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded transition-colors">
                      <RefreshCw size={11} /> 立即同步
                    </button>
                    <button className="flex items-center gap-1.5 text-xs border border-red-500/30 text-red-400 hover:bg-red-500/10 px-3 py-1.5 rounded transition-colors">
                      <Trash2 size={11} /> 移除
                    </button>
                  </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-0 border-b border-[#142235] bg-[#071526] px-6 flex-shrink-0">
                  {TABS.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 text-[11px] px-4 py-2.5 border-b-2 transition-colors ${
                        activeTab === tab.id
                          ? 'border-blue-500 text-blue-300'
                          : 'border-transparent text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      <span className={activeTab === tab.id ? 'text-blue-400' : 'text-slate-600'}>{tab.icon}</span>
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-y-auto p-6">
                  {activeTab === 'config'   && <ConfigPanel source={selectedSource} />}
                  {activeTab === 'mapping'  && <MappingPanel />}
                  {activeTab === 'strategy' && <StrategyPanel />}
                  {activeTab === 'logs'     && <LogsPanel />}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center">
                <div>
                  <Database size={32} className="text-slate-700 mx-auto mb-3" />
                  <div className="text-[12px] text-slate-500">请从左侧选择一个数据源</div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddModal && <AddSourceModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-[11px] text-slate-500 w-20 flex-shrink-0">{label}</span>
      {children}
    </div>
  );
}
