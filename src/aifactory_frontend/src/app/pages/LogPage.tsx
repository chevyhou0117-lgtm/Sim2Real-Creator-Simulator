import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ChevronLeft, ClipboardList, Clock, User, Search,
  Download, Filter, Eye, AlertTriangle, X,
} from 'lucide-react';
import {
  mockFactoryProjects,
  mockAuditLogs,
  type AuditLog,
} from '../data/mockData';
import { NavSidebar, PageHeader } from '../components/NavSidebar';

export function LogPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const project = mockFactoryProjects.find((p) => p.id === projectId);

  // Filter audit logs by project (simple target matching for now)
  const logs = mockAuditLogs.filter((log) =>
    log.target.toLowerCase().includes(project?.name?.toLowerCase() ?? '')
  );

  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [resultFilter, setResultFilter] = useState('all');

  const modules = ['all', ...Array.from(new Set(logs.map((l) => l.module)))];
  const results = ['all', 'success', 'failure'];

  const filteredLogs = logs.filter((log) => {
    const matchSearch = log.user.toLowerCase().includes(search.toLowerCase()) ||
      (log.detail ?? '').toLowerCase().includes(search.toLowerCase()) ||
      log.target.toLowerCase().includes(search.toLowerCase());
    const matchModule = moduleFilter === 'all' || log.module === moduleFilter;
    const matchResult = resultFilter === 'all' || log.result === resultFilter;
    return matchSearch && matchModule && matchResult;
  });

  const projectName = project?.name ?? 'Factory Project';

  const RESULT_CLS = {
    success: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    failure: 'text-red-400 bg-red-500/10 border-red-500/30',
  };

  return (
    <div className="flex h-screen bg-[var(--c-07111e)] text-slate-100 overflow-hidden">
      <NavSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader
          crumbs={[
            { label: 'Factory Projects', path: '/factory/houston-p9' },
            { label: projectName, path: `/factory/${projectId}` },
            { label: '操作日志' },
          ]}
          actions={
            <>
              <button
                className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md transition-colors"
              >
                <Download size={12} /> 导出 CSV
              </button>
            </>
          }
        />

        <div className="flex flex-1 overflow-hidden">
          {/* Log Table */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Filters */}
            <div className="mb-6 bg-[var(--c-0b1d30)] border border-[var(--c-142235)] rounded-lg p-4 space-y-4">
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
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value)}
                  className="bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
                >
                  {modules.map((m) => <option key={m} value={m}>{m === 'all' ? '全部模块' : m}</option>)}
                </select>
                <select
                  value={resultFilter}
                  onChange={(e) => setResultFilter(e.target.value)}
                  className="bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
                >
                  {results.map((r) => <option key={r} value={r}>{r === 'all' ? '全部结果' : (r === 'success' ? '成功' : '失败')}</option>)}
                </select>
                <button className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 border border-[var(--c-1e3a55)] px-3 py-1.5 rounded transition-colors">
                  <Filter size={12} /> 更多筛选
                </button>
              </div>
              <div className="text-[10px] text-slate-600">
                共 {filteredLogs.length} 条日志记录
              </div>
            </div>

            {/* Table */}
            <div className="border border-[var(--c-142235)] rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-[var(--c-071526)]">
                  <tr className="border-b border-[var(--c-142235)]">
                    <th className="px-4 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">时间</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">用户</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">模块</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">操作 / 对象</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">结果</th>
                    <th className="px-3 py-2.5 text-left text-[10px] font-medium text-slate-500 uppercase tracking-wider">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((log) => (
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
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded border ${RESULT_CLS[log.result]}`}>
                          {log.result === 'success' ? '成功' : '失败'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {log.detail ? (
                          <button
                            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors"
                            onClick={() => alert(log.detail)}
                          >
                            查看详情
                          </button>
                        ) : (
                          <span className="text-[10px] text-slate-600">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredLogs.length === 0 && (
              <div className="text-center py-12 text-slate-600 text-sm">
                暂无日志记录
              </div>
            )}
          </div>

          {/* Right Info Panel */}
          <aside className="w-64 bg-[var(--c-071526)] border-l border-[var(--c-142235)] flex flex-col overflow-hidden flex-shrink-0 p-5 space-y-5">
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">项目信息</div>
              <div className="space-y-2">
                <InfoRow label="项目名称" value={projectName} />
                <InfoRow label="日志总数" value={String(logs.length)} />
                <InfoRow label="成功操作" value={String(logs.filter(l => l.result === 'success').length)} />
                <InfoRow label="失败操作" value={String(logs.filter(l => l.result === 'failure').length)} />
              </div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">日志说明</div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                操作日志记录所有用户对当前工厂项目的变更操作。<br />
                包括创建、修改、删除、保存版本等关键操作。<br />
                日志保留180天，支持导出CSV。
              </p>
            </div>
            <div className="mt-auto">
              <button
                onClick={() => navigate(`/factory/${projectId}`)}
                className="w-full text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md transition-colors flex items-center justify-center gap-1.5"
              >
                <ClipboardList size={11} /> 返回编辑器
              </button>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="text-[10px] text-slate-300">{value}</span>
    </div>
  );
}