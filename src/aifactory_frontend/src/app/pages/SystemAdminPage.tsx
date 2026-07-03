import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router';
import {
  Users, Shield, ClipboardList, Settings, Activity,
  Plus, Trash2, Edit2, Search, Filter, ChevronDown,
  CheckCircle2, XCircle, AlertTriangle, Clock, Download,
  RefreshCw, Server, HardDrive,
  Cpu, MemoryStick, Globe,
} from 'lucide-react';
import {
  mockUsers,
  mockAuditLogs,
  mockSysConfig,
  ROLE_LABELS,
  type AppUser,
  type UserRole,
} from '../data/mockData';
import { NavSidebar, PageHeader } from '../components/NavSidebar';

// ── Types ─────────────────────────────────────────────────────────────────────
type AdminTab = 'users' | 'roles' | 'audit' | 'config' | 'monitor';

// ── Permission matrix ─────────────────────────────────────────────────────────
const PERMISSIONS = [
  { id: 'view_assets',    label: '查看资产库' },
  { id: 'edit_assets',    label: '编辑资产' },
  { id: 'upload_assets',  label: '上传模型' },
  { id: 'view_projects',  label: '查看工厂项目' },
  { id: 'edit_projects',  label: '编辑工厂项目' },
  { id: 'publish',        label: '发布项目' },
  { id: 'data_binding',   label: '数据绑定管理' },
  { id: 'integration',    label: '集成配置管理' },
  { id: 'user_manage',    label: '用户管理' },
  { id: 'system_config',  label: '系统配置' },
  { id: 'audit_logs',     label: '审计日志' },
];

const ROLES: UserRole[] = ['admin', 'ie_engineer', 'planner', 'model_engineer', 'viewer'];

const ROLE_PERMS: Record<UserRole, string[]> = {
  admin:          PERMISSIONS.map((p) => p.id),
  ie_engineer:    ['view_assets','edit_assets','upload_assets','view_projects','edit_projects','data_binding'],
  planner:        ['view_assets','view_projects','edit_projects','publish'],
  model_engineer: ['view_assets','edit_assets','upload_assets','view_projects'],
  viewer:         ['view_assets','view_projects'],
};

// ── Users Tab ─────────────────────────────────────────────────────────────────
function UsersTab() {
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  const filtered = mockUsers.filter((u) => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  const STATUS_CONFIG = {
    active:   { cls: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', label: '活跃' },
    inactive: { cls: 'text-slate-500 bg-slate-500/10 border-slate-600/30',       label: '停用' },
    locked:   { cls: 'text-red-400 bg-red-500/10 border-red-500/30',             label: '锁定' },
  };

  const ROLE_CLS: Record<UserRole, string> = {
    admin:          'text-violet-400 bg-violet-500/10 border-violet-500/30',
    ie_engineer:    'text-blue-400 bg-blue-500/10 border-blue-500/30',
    planner:        'text-amber-400 bg-amber-500/10 border-amber-500/30',
    model_engineer: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    viewer:         'text-slate-400 bg-slate-500/10 border-slate-600/30',
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索用户..."
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
          className="bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
        >
          <option value="all">全部角色</option>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
        </select>
        <div className="ml-auto">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded transition-colors"
          >
            <Plus size={11} /> 邀请用户
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="border border-[var(--c-142235)] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-[var(--c-071526)]">
            <tr className="border-b border-[var(--c-142235)]">
              <th className="px-4 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">用户</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">角色</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">状态</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">最后登录</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">创建时间</th>
              <th className="px-3 py-2.5 w-20" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((u) => {
              const sc = STATUS_CONFIG[u.status];
              return (
                <tr key={u.id} className="border-b border-[var(--c-142235)] hover:bg-[var(--c-0e243a)]/40 group transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0">
                        {u.name.slice(0, 2)}
                      </div>
                      <div>
                        <div className="text-[12px] font-medium text-slate-200">{u.name}</div>
                        <div className="text-[10px] text-slate-500">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${ROLE_CLS[u.role]}`}>
                      {ROLE_LABELS[u.role]}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${sc.cls}`}>{sc.label}</span>
                  </td>
                  <td className="px-3 py-3 text-[11px] text-slate-500">{u.lastLogin ?? '—'}</td>
                  <td className="px-3 py-3 text-[11px] text-slate-500">{u.createdAt}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="text-slate-500 hover:text-blue-400 transition-colors" title="编辑">
                        <Edit2 size={12} />
                      </button>
                      <button className="text-slate-500 hover:text-red-400 transition-colors" title="删除">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-xl w-[440px] shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-142235)]">
              <span className="text-sm font-semibold text-slate-100">邀请新用户</span>
              <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-slate-200 transition-colors">
                <XCircle size={15} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5">邮箱地址 *</label>
                <input placeholder="user@example.com" className="w-full bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5">姓名</label>
                <input placeholder="用户姓名" className="w-full bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors" />
              </div>
              <div>
                <label className="block text-[11px] text-slate-400 mb-1.5">分配角色</label>
                <select className="w-full bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors">
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 pb-5">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-xs text-slate-400 border border-[var(--c-1e3a55)] rounded hover:border-[var(--c-2a4a6a)] transition-colors">取消</button>
              <button onClick={() => setShowAddModal(false)} className="px-5 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors">发送邀请</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Roles Tab ─────────────────────────────────────────────────────────────────
function RolesTab() {
  const [selectedRole, setSelectedRole] = useState<UserRole>('engineer');

  return (
    <div className="grid grid-cols-[220px_1fr] gap-6">
      {/* Role list */}
      <div className="space-y-2">
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">角色列表</div>
        {ROLES.map((r) => {
          const userCount = mockUsers.filter((u) => u.role === r).length;
          return (
            <button
              key={r}
              onClick={() => setSelectedRole(r)}
              className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                selectedRole === r ? 'border-blue-500/60 bg-blue-600/15' : 'border-[var(--c-1e3a55)] hover:border-[var(--c-2a4a6a)] bg-[var(--c-071526)]'
              }`}
            >
              <div className="text-[12px] font-medium text-slate-200">{ROLE_LABELS[r]}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{userCount} 名用户</div>
            </button>
          );
        })}
      </div>

      {/* Permission matrix */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
            {ROLE_LABELS[selectedRole]} — 权限配置
          </div>
          {selectedRole !== 'admin' && (
            <button className="text-xs text-blue-400 hover:text-blue-300 transition-colors">保存修改</button>
          )}
        </div>
        <div className="space-y-1">
          {PERMISSIONS.map((perm) => {
            const hasAccess = ROLE_PERMS[selectedRole].includes(perm.id);
            const isLocked = selectedRole === 'admin';
            return (
              <div key={perm.id} className="flex items-center justify-between py-2 px-3 rounded hover:bg-[var(--c-0e243a)]/40 transition-colors">
                <div className="text-[12px] text-slate-300">{perm.label}</div>
                <div className={`w-8 h-4 rounded-full relative cursor-pointer transition-colors ${
                  isLocked ? 'cursor-not-allowed' : ''
                } ${hasAccess ? 'bg-blue-600' : 'bg-[var(--c-1e3a55)]'}`}>
                  <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${hasAccess ? 'left-4' : 'left-0.5'}`} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Audit Logs Tab ────────────────────────────────────────────────────────────
function AuditTab() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const types = ['all', ...Array.from(new Set(mockAuditLogs.map((l) => l.action)))];
  const filtered = mockAuditLogs.filter((l) => {
    const matchSearch = l.user.toLowerCase().includes(search.toLowerCase()) ||
      (l.detail ?? '').toLowerCase().includes(search.toLowerCase());
    const matchType = typeFilter === 'all' || l.action === typeFilter;
    return matchSearch && matchType;
  });

  const RESULT_CLS = {
    success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    failure: 'text-red-400 bg-red-500/10 border-red-500/30',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索日志..."
            className="w-full pl-8 pr-3 py-1.5 bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
        >
          <option value="all">全部操作</option>
          {types.slice(1).map((t) => <option key={t}>{t}</option>)}
        </select>
        <button className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 border border-[var(--c-1e3a55)] px-3 py-1.5 rounded transition-colors">
          <Download size={11} /> 导出 CSV
        </button>
      </div>

      <div className="border border-[var(--c-142235)] rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-[var(--c-071526)]">
            <tr className="border-b border-[var(--c-142235)]">
              <th className="px-4 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">时间</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">用户</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">模块</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">操作 / 对象</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">结果</th>
              <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">IP</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((log) => (
              <tr key={log.id} className="border-b border-[var(--c-142235)] hover:bg-[var(--c-0e243a)]/40 transition-colors">
                <td className="px-4 py-2.5 text-[10px] text-slate-500 whitespace-nowrap font-mono">{log.timestamp}</td>
                <td className="px-3 py-2.5">
                  <div className="text-[11px] text-slate-300">{log.user}</div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="text-[10px] text-slate-500">{log.module}</span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="text-[11px] text-slate-300">{log.action}</div>
                  <div className="text-[10px] text-slate-600 truncate max-w-[200px]">{log.target}</div>
                  {log.detail && <div className="text-[10px] text-amber-500/80 mt-0.5 truncate max-w-[200px]">{log.detail}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`text-[10px] px-2 py-0.5 rounded border ${RESULT_CLS[log.result]}`}>
                    {log.result === 'success' ? '成功' : '失败'}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-[10px] text-slate-600 font-mono">{log.ip}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Config Tab ────────────────────────────────────────────────────────────────
function ConfigTab() {
  const grouped = mockSysConfig.reduce<Record<string, typeof mockSysConfig>>((acc, item) => {
    const g = item.group ?? 'General';
    (acc[g] = acc[g] ?? []).push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-2xl">
      {Object.entries(grouped).map(([group, items]) => (
        <div key={group}>
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <div className="flex-1 border-t border-[var(--c-142235)]" />
            {group}
            <div className="flex-1 border-t border-[var(--c-142235)]" />
          </div>
          <div className="space-y-3">
            {items.map((cfg) => (
              <div key={cfg.id} className="flex items-center gap-4">
                <div className="w-52 flex-shrink-0">
                  <div className="text-[12px] text-slate-300">{cfg.label}</div>
                  {cfg.description && <div className="text-[10px] text-slate-600 mt-0.5">{cfg.description}</div>}
                </div>
                <div className="flex-1">
                  {cfg.type === 'boolean' ? (
                    <div className={`w-9 h-5 rounded-full relative cursor-pointer transition-colors ${cfg.value === 'true' ? 'bg-blue-600' : 'bg-[var(--c-1e3a55)]'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${cfg.value === 'true' ? 'left-4' : 'left-0.5'}`} />
                    </div>
                  ) : cfg.type === 'select' ? (
                    <select defaultValue={cfg.value} className="bg-[var(--c-040d18)] border border-[var(--c-1e3a55)] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors">
                      {cfg.options?.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  ) : (
                    <input
                      defaultValue={cfg.value}
                      className="w-full bg-[var(--c-040d18)] border border-[var(--c-1e3a55)] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end gap-3 pt-2">
        <button className="text-xs text-slate-400 border border-[var(--c-1e3a55)] px-4 py-1.5 rounded hover:border-[var(--c-2a4a6a)] transition-colors">恢复默认</button>
        <button className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded font-medium transition-colors">保存配置</button>
      </div>
    </div>
  );
}

// ── Monitor Tab ───────────────────────────────────────────────────────────────
function MonitorTab() {
  const METRICS = [
    { label: 'CPU 使用率', value: 34, unit: '%', icon: <Cpu size={14} />, color: 'text-blue-400', bar: 'bg-blue-500' },
    { label: '内存使用',   value: 62, unit: '%', icon: <MemoryStick size={14} />, color: 'text-violet-400', bar: 'bg-violet-500' },
    { label: '磁盘使用',   value: 48, unit: '%', icon: <HardDrive size={14} />, color: 'text-emerald-400', bar: 'bg-emerald-500' },
    { label: '网络 I/O',  value: 12, unit: 'MB/s', icon: <Globe size={14} />, color: 'text-amber-400', bar: 'bg-amber-500' },
  ];

  const SERVICES = [
    { name: '前端服务',      status: 'running', uptime: '12d 4h', port: '3000' },
    { name: 'API Gateway',   status: 'running', uptime: '12d 4h', port: '8080' },
    { name: '数据同步服务',  status: 'running', uptime: '3d 2h',  port: '8081' },
    { name: '渲染引擎',      status: 'running', uptime: '12d 4h', port: '8082' },
    { name: 'WebSocket 服务', status: 'warning', uptime: '1h 23m', port: '8083' },
    { name: '任务队列',      status: 'running', uptime: '5d 7h',  port: '—' },
  ];

  return (
    <div className="space-y-6">
      {/* Metrics */}
      <div>
        <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">系统资源</div>
        <div className="grid grid-cols-4 gap-4">
          {METRICS.map((m) => (
            <div key={m.label} className="bg-[var(--c-071526)] border border-[var(--c-142235)] rounded-lg p-4">
              <div className={`flex items-center gap-2 mb-2 ${m.color}`}>
                {m.icon}
                <span className="text-[10px] text-slate-400">{m.label}</span>
              </div>
              <div className="text-2xl font-bold text-slate-100">{m.value}<span className="text-sm text-slate-500 ml-1">{m.unit}</span></div>
              <div className="mt-2 h-1.5 bg-[var(--c-142235)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${m.bar}`}
                  style={{ width: `${m.unit === '%' ? m.value : Math.min(m.value * 5, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Services */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">服务状态</div>
          <button className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
            <RefreshCw size={10} /> 刷新
          </button>
        </div>
        <div className="border border-[var(--c-142235)] rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-[var(--c-071526)] border-b border-[var(--c-142235)]">
              <tr>
                <th className="px-4 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase">服务名称</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase">状态</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase">运行时长</th>
                <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase">端口</th>
                <th className="px-3 py-2.5 w-16" />
              </tr>
            </thead>
            <tbody>
              {SERVICES.map((svc, i) => (
                <tr key={i} className="border-b border-[var(--c-142235)] last:border-b-0 hover:bg-[var(--c-0e243a)]/40 transition-colors">
                  <td className="px-4 py-3 text-[12px] text-slate-200 flex items-center gap-2">
                    <Server size={12} className="text-slate-500" /> {svc.name}
                  </td>
                  <td className="px-3 py-3">
                    <span className={`flex items-center gap-1 text-[10px] ${svc.status === 'running' ? 'text-emerald-400' : 'text-amber-400'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${svc.status === 'running' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                      {svc.status === 'running' ? '运行中' : '警告'}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[11px] text-slate-500 font-mono">{svc.uptime}</td>
                  <td className="px-3 py-3 text-[11px] text-slate-600 font-mono">{svc.port}</td>
                  <td className="px-3 py-3">
                    <button className="text-[10px] text-slate-500 hover:text-amber-400 border border-[var(--c-1e3a55)] rounded px-2 py-0.5 transition-colors">重启</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function SystemAdminPage() {
  const { tab } = useParams<{ tab?: string }>();
  const navigate = useNavigate();

  const activeTab: AdminTab = (tab as AdminTab) ?? 'users';

  const TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'users',   label: '用户管理',  icon: <Users size={14} /> },
    { id: 'roles',   label: '角色权限',  icon: <Shield size={14} /> },
    { id: 'audit',   label: '审计日志',  icon: <ClipboardList size={14} /> },
    { id: 'config',  label: '系统配置',  icon: <Settings size={14} /> },
    { id: 'monitor', label: '服务监控',  icon: <Activity size={14} /> },
  ];

  const COUNTS: Partial<Record<AdminTab, number>> = {
    users: mockUsers.length,
    audit: mockAuditLogs.length,
  };

  return (
    <div className="flex h-screen bg-[var(--c-07111e)] text-slate-100 overflow-hidden">
      <NavSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader crumbs={[{ label: 'System Admin' }]} />

        <div className="flex flex-1 overflow-hidden">

          {/* ── Left sidebar tabs ── */}
          <aside className="w-44 bg-[var(--c-040d18)] border-r border-[var(--c-142235)] flex flex-col overflow-hidden flex-shrink-0">
            <div className="px-3 py-3 border-b border-[var(--c-142235)]">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">系统管理</div>
            </div>
            <nav className="flex-1 py-2">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => navigate(`/admin/${t.id}`)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] transition-colors ${
                    activeTab === t.id
                      ? 'bg-blue-600/20 text-blue-300 border-r-2 border-r-blue-500'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[var(--c-0e243a)]'
                  }`}
                >
                  <span className={activeTab === t.id ? 'text-blue-400' : 'text-slate-600'}>{t.icon}</span>
                  {t.label}
                  {COUNTS[t.id] !== undefined && (
                    <span className="ml-auto text-[10px] text-slate-600">{COUNTS[t.id]}</span>
                  )}
                </button>
              ))}
            </nav>
          </aside>

          {/* ── Content area ── */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-5">
              <h1 className="text-sm font-semibold text-slate-100">
                {TABS.find((t) => t.id === activeTab)?.label}
              </h1>
            </div>

            {activeTab === 'users'   && <UsersTab />}
            {activeTab === 'roles'   && <RolesTab />}
            {activeTab === 'audit'   && <AuditTab />}
            {activeTab === 'config'  && <ConfigTab />}
            {activeTab === 'monitor' && <MonitorTab />}
          </div>
        </div>
      </div>
    </div>
  );
}
