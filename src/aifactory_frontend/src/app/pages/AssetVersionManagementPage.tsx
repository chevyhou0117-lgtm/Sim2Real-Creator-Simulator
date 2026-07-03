import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  ChevronLeft, GitBranch, Clock, User, RotateCcw,
  Download, Plus, CheckCircle2, Archive, Eye,
  ChevronDown, ChevronRight, AlertTriangle, X,
  Package, Tag, FileText, GitCommit, Diff,
  ArrowRight, History, Layers3,
} from 'lucide-react';
import { NavSidebar, PageHeader } from '../components/NavSidebar';
import { useLocalized } from '../utils/i18n';

// ── Mock data ───────────────────────────────────────────────────────────────
interface AssetVersion {
  id: string;
  version: string;
  status: 'current' | 'archived';
  createdAt: string;
  createdBy: string;
  comment: string;
  changeCount: number;
  fileSize: string;
  polyCount: string;
  lodLevels: number;
  changeSummary: string[];
  tags: string[];
}

const MOCK_ASSET_VERSIONS: AssetVersion[] = [
  {
    id: 'v4',
    version: 'v4.2.0',
    status: 'current',
    createdAt: '2026-04-05 14:32',
    createdBy: 'Grace Liu',
    comment: '更新机械臂末端执行器几何体，优化LOD2精度，修复材质贴图UV错误',
    changeCount: 7,
    fileSize: '18.4 MB',
    polyCount: '24,500',
    lodLevels: 3,
    changeSummary: [
      '更新末端执行器 USD 几何体（grip_head.usda）',
      '修复 LOD2 层级多边形穿模问题',
      '重新烘焙 PBR 材质贴图（metallic roughness）',
      '更新碰撞体积 Convex Hull',
      '同步更新模型属性：抓取精度 ±0.02mm',
      '添加 SMT 制程标签',
      '调整关节约束参数（旋转范围 ±180°）',
    ],
    tags: ['SMT', 'Robotics', 'Verified'],
  },
  {
    id: 'v3',
    version: 'v4.1.0',
    status: 'archived',
    createdAt: '2026-03-18 10:15',
    createdBy: 'Tom Chen',
    comment: '新增关节运动仿真支持，增加 IoT 数据点配置',
    changeCount: 5,
    fileSize: '16.1 MB',
    polyCount: '22,300',
    lodLevels: 3,
    changeSummary: [
      '添加关节运动层级 USD Skeleton',
      '新增 6 个 IoT 数据采集点',
      '优化 LOD1/LOD2 多边形面数',
      '修正基座安装孔位尺寸',
      '更新制造商信息（ABB 2024款）',
    ],
    tags: ['SMT', 'IoT'],
  },
  {
    id: 'v2',
    version: 'v4.0.1',
    status: 'archived',
    createdAt: '2026-02-28 16:45',
    createdBy: 'Grace Liu',
    comment: '修复导入工厂场景时坐标系偏移问题',
    changeCount: 2,
    fileSize: '15.8 MB',
    polyCount: '21,800',
    lodLevels: 2,
    changeSummary: [
      '修复 Y轴旋转偏移 90° 问题',
      '调整模型原点至安装法兰中心',
    ],
    tags: ['Bugfix'],
  },
  {
    id: 'v1',
    version: 'v4.0.0',
    status: 'archived',
    createdAt: '2026-01-10 09:00',
    createdBy: 'Tom Chen',
    comment: '初始版本上传：6轴工业机械臂 ABB IRB 4600',
    changeCount: 0,
    fileSize: '15.8 MB',
    polyCount: '21,800',
    lodLevels: 2,
    changeSummary: [],
    tags: ['Initial'],
  },
];

const MOCK_ASSET = {
  id: 'irb-4600',
  name: 'ABB IRB 4600 Robot Arm',
  type: 'Equipment',
  category: 'SMT',
  manufacturer: 'ABB',
  model: 'IRB 4600-20/2.50',
  status: 'active' as const,
};

// ── Sub-components ──────────────────────────────────────────────────────────
function VersionBadge({ status }: { status: AssetVersion['status'] }) {
  return status === 'current' ? (
    <span className="text-[9px] px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/40 font-medium flex items-center gap-1">
      <CheckCircle2 size={9} /> Current
    </span>
  ) : (
    <span className="text-[9px] px-2 py-0.5 rounded border bg-slate-500/10 text-slate-500 border-slate-600/40 flex items-center gap-1">
      <Archive size={9} /> Archived
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[10px] text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-[10px] text-slate-300 text-right">{value}</span>
    </div>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export function AssetVersionManagementPage() {
  const { assetId } = useParams<{ assetId: string }>();
  const navigate = useNavigate();

  const [expandedId, setExpandedId] = useState<string | null>('v4');
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState<string | null>(null);
  const [showNewVersionModal, setShowNewVersionModal] = useState(false);
  const [showDiffModal, setShowDiffModal] = useState(false);
  const L = useLocalized();

  const asset = MOCK_ASSET;
  const versions = MOCK_ASSET_VERSIONS;

  function handleCompareToggle(version: string) {
    if (compareA === version) { setCompareA(null); return; }
    if (compareB === version) { setCompareB(null); return; }
    if (!compareA) { setCompareA(version); return; }
    if (!compareB) { setCompareB(version); return; }
  }

  return (
    <div className="flex h-screen bg-[var(--c-07111e)] text-slate-100 overflow-hidden">
      <NavSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader
          crumbs={[
            { label: 'Asset Library', path: '/asset-library' },
            { label: L(asset, 'name', 'nameEn'), path: `/asset-library` },
            { label: 'Version Management' },
          ]}
          actions={
            <>
              <button
                onClick={() => navigate('/asset-library/lifecycle')}
                className="flex items-center gap-1.5 text-xs border border-[var(--c-1e3a55)] text-slate-400 hover:text-slate-200 hover:border-[var(--c-2a4a6a)] px-3 py-1.5 rounded-md transition-colors"
              >
                <History size={12} /> Lifecycle
              </button>
              <button
                onClick={() => setShowNewVersionModal(true)}
                className="flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md transition-colors"
              >
                <Plus size={12} /> Publish New Version
              </button>
            </>
          }
        />

        <div className="flex flex-1 overflow-hidden">
          {/* Main Version List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">

            {/* Asset summary bar */}
            <div className="bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-lg px-5 py-3 flex items-center gap-4">
              <div className="w-9 h-9 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                <Package size={16} className="text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-100">{L(asset, 'name', 'nameEn')}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">{asset.manufacturer} · {asset.model} · Category: {asset.category}</div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-[9px] px-2 py-0.5 rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/40">Active</span>
                <span className="text-[10px] text-slate-500">{versions.length} versions</span>
              </div>
            </div>

            {/* Compare Bar */}
            {(compareA || compareB) && (
              <div className="bg-[var(--c-0b1d30)] border border-blue-500/40 rounded-lg px-4 py-3 flex items-center gap-4">
                <GitCommit size={13} className="text-blue-400 flex-shrink-0" />
                <span className="text-[11px] text-slate-400">Compare:</span>
                <span className="text-[11px] text-blue-300 font-medium bg-blue-600/15 px-2 py-0.5 rounded border border-blue-500/30">
                  {compareA ?? '— select version A —'}
                </span>
                <ArrowRight size={11} className="text-slate-600" />
                <span className="text-[11px] text-blue-300 font-medium bg-blue-600/15 px-2 py-0.5 rounded border border-blue-500/30">
                  {compareB ?? '— select version B —'}
                </span>
                {compareA && compareB && (
                  <button
                    onClick={() => setShowDiffModal(true)}
                    className="ml-2 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded transition-colors flex items-center gap-1"
                  >
                    <Diff size={11} /> View Diff
                  </button>
                )}
                <button
                  onClick={() => { setCompareA(null); setCompareB(null); }}
                  className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
                >
                  <X size={13} />
                </button>
                {!(compareA && compareB) && (
                  <span className="text-[10px] text-slate-600">
                    Select {compareA ? 'second' : 'first'} version to compare
                  </span>
                )}
              </div>
            )}

            {/* Version Cards */}
            <div className="space-y-3">
              {versions.map((v, idx) => {
                const isExpanded = expandedId === v.id;
                const isCheckedA = compareA === v.version;
                const isCheckedB = compareB === v.version;

                return (
                  <div
                    key={v.id}
                    className={`bg-[var(--c-0b1d30)] border rounded-lg transition-all ${
                      v.status === 'current' ? 'border-emerald-500/30' : 'border-[var(--c-142235)]'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex items-center gap-3 px-5 py-4">
                      {/* Timeline dot */}
                      <div className="flex flex-col items-center flex-shrink-0">
                        <div className={`w-3 h-3 rounded-full border-2 ${v.status === 'current' ? 'border-emerald-400 bg-emerald-400/30' : 'border-slate-600 bg-slate-700'}`} />
                        {idx < versions.length - 1 && <div className="w-px h-6 bg-[var(--c-142235)] mt-1" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="text-sm font-semibold text-slate-100">{v.version}</span>
                          <VersionBadge status={v.status} />
                          {v.tags.map(tag => (
                            <span key={tag} className="text-[9px] px-1.5 py-0.5 rounded bg-blue-600/10 text-blue-400 border border-blue-500/20">
                              {tag}
                            </span>
                          ))}
                          <span className="text-[10px] text-slate-600 flex items-center gap-1">
                            <Clock size={9} /> {v.createdAt}
                          </span>
                          <span className="text-[10px] text-slate-600 flex items-center gap-1">
                            <User size={9} /> {v.createdBy}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">{v.comment}</p>
                        <div className="flex items-center gap-3 text-[10px] text-slate-600 mt-1">
                          <span>{v.changeCount > 0 ? `${v.changeCount} changes` : 'Initial upload'}</span>
                          <span>·</span>
                          <span>{v.fileSize}</span>
                          <span>·</span>
                          <span>{v.polyCount} polys</span>
                          <span>·</span>
                          <span>LOD ×{v.lodLevels}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          onClick={() => handleCompareToggle(v.version)}
                          className={`text-[10px] px-2 py-1 rounded border transition-colors ${
                            isCheckedA
                              ? 'border-blue-500/60 bg-blue-600/15 text-blue-400'
                              : isCheckedB
                              ? 'border-purple-500/60 bg-purple-600/15 text-purple-400'
                              : 'border-[var(--c-1e3a55)] text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {isCheckedA ? 'A' : isCheckedB ? 'B' : 'Compare'}
                        </button>
                        <button
                          className="text-[10px] px-2 py-1 rounded border border-[var(--c-1e3a55)] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
                        >
                          <Eye size={10} /> Preview
                        </button>
                        <button
                          className="text-[10px] px-2 py-1 rounded border border-[var(--c-1e3a55)] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1"
                        >
                          <Download size={10} /> Export
                        </button>
                        {v.status !== 'current' && (
                          <button
                            onClick={() => setShowRestoreConfirm(v.id)}
                            className="text-[10px] px-2 py-1 rounded border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors flex items-center gap-1"
                          >
                            <RotateCcw size={10} /> Restore
                          </button>
                        )}
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : v.id)}
                          className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                        >
                          {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded: change summary */}
                    {isExpanded && (
                      <div className="px-5 pb-4 border-t border-[var(--c-142235)] pt-3 ml-6">
                        {v.changeSummary.length > 0 ? (
                          <>
                            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Change Summary</div>
                            <ul className="space-y-1">
                              {v.changeSummary.map((change, i) => (
                                <li key={i} className="flex items-start gap-2 text-[11px] text-slate-400">
                                  <span className="text-blue-500 mt-0.5">•</span>
                                  {change}
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : (
                          <div className="text-[11px] text-slate-600 italic">No change log for initial version.</div>
                        )}

                        {/* File metadata */}
                        <div className="mt-3 pt-3 border-t border-[var(--c-142235)] grid grid-cols-4 gap-4">
                          {[
                            { label: 'File Size', value: v.fileSize },
                            { label: 'Poly Count', value: v.polyCount },
                            { label: 'LOD Levels', value: `${v.lodLevels}` },
                            { label: 'Format', value: 'USD / USDA' },
                          ].map(item => (
                            <div key={item.label}>
                              <div className="text-[9px] text-slate-600 uppercase tracking-wider">{item.label}</div>
                              <div className="text-[11px] text-slate-300 mt-0.5">{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Info Panel */}
          <aside className="w-64 bg-[var(--c-071526)] border-l border-[var(--c-142235)] flex flex-col overflow-hidden flex-shrink-0 p-5 space-y-5">
            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Asset Info</div>
              <div className="space-y-2">
                <InfoRow label="Name" value={L(asset, 'name', 'nameEn')} />
                <InfoRow label="Manufacturer" value={asset.manufacturer} />
                <InfoRow label="Model No." value={asset.model} />
                <InfoRow label="Category" value={asset.category} />
                <InfoRow label="Total Versions" value={String(versions.length)} />
                <InfoRow label="Current" value={versions.find(v => v.status === 'current')?.version ?? '—'} />
                <InfoRow label="Last Updated" value={versions[0]?.createdAt ?? '—'} />
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Version Policy</div>
              <div className="space-y-2 text-[11px] text-slate-500 leading-relaxed">
                <p>每次上传新文件自动生成新版本，版本号遵循语义化规范（Major.Minor.Patch）。</p>
                <p>旧版本恢复后当前版本自动归档，历史版本永久保留。</p>
                <p>只有"Current"版本可被工厂项目引用。</p>
              </div>
            </div>

            <div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Version Statistics</div>
              <div className="space-y-2">
                {[
                  { label: 'Current', count: 1, color: 'bg-emerald-400' },
                  { label: 'Archived', count: versions.length - 1, color: 'bg-slate-600' },
                  { label: 'Referenced by Projects', count: 3, color: 'bg-blue-500' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-1.5 h-1.5 rounded-full ${item.color}`} />
                      <span className="text-[10px] text-slate-500">{item.label}</span>
                    </div>
                    <span className="text-[10px] text-slate-300 font-medium">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-auto space-y-2">
              <button
                onClick={() => navigate('/asset-library')}
                className="w-full text-xs text-slate-400 border border-[var(--c-1e3a55)] hover:border-[var(--c-2a4a6a)] px-3 py-2 rounded-md transition-colors flex items-center justify-center gap-1.5"
              >
                <Package size={11} /> Back to Library
              </button>
              <button
                onClick={() => navigate('/asset-library/lifecycle')}
                className="w-full text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-md transition-colors flex items-center justify-center gap-1.5"
              >
                <GitBranch size={11} /> Lifecycle Management
              </button>
            </div>
          </aside>
        </div>
      </div>

      {/* Restore Confirm Modal */}
      {showRestoreConfirm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-xl w-[400px] shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <AlertTriangle size={18} className="text-amber-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-100">Restore Version?</div>
                <div className="text-[11px] text-slate-400 mt-0.5">当前版本将被归档，选定版本将成为 Current</div>
              </div>
            </div>
            <p className="text-[11px] text-slate-500">
              所有引用该资产的工厂项目将在下次同步时切换到恢复后的版本。此操作可通过再次 Restore 撤销。
            </p>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowRestoreConfirm(null)} className="flex-1 text-xs text-slate-400 border border-[var(--c-1e3a55)] rounded-md py-2 hover:border-[var(--c-2a4a6a)] transition-colors">
                Cancel
              </button>
              <button onClick={() => setShowRestoreConfirm(null)} className="flex-1 text-xs bg-amber-600 hover:bg-amber-700 text-white rounded-md py-2 transition-colors">
                Confirm Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Diff Modal */}
      {showDiffModal && compareA && compareB && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-xl w-[720px] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-142235)]">
              <div className="flex items-center gap-2">
                <Diff size={14} className="text-blue-400" />
                <span className="text-sm font-semibold text-slate-100">Version Diff</span>
                <span className="text-[11px] text-slate-500 ml-2">
                  {compareA} <ArrowRight size={10} className="inline" /> {compareB}
                </span>
              </div>
              <button onClick={() => setShowDiffModal(false)} className="text-slate-500 hover:text-slate-200 transition-colors">
                <X size={15} />
              </button>
            </div>
            <div className="p-5">
              {/* Diff summary */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: 'Added', count: 4, color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
                  { label: 'Modified', count: 2, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
                  { label: 'Removed', count: 1, color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' },
                ].map(item => (
                  <div key={item.label} className={`rounded-lg border px-4 py-3 ${item.bg} text-center`}>
                    <div className={`text-xl font-bold ${item.color}`}>{item.count}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{item.label}</div>
                  </div>
                ))}
              </div>

              {/* Diff entries */}
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {[
                  { type: 'add', path: 'grip_head.usda', desc: '末端执行器几何体更新' },
                  { type: 'add', path: 'materials/metallic_v2.usda', desc: '新版 PBR 材质贴图' },
                  { type: 'add', path: 'physics/convex_hull_v2.usda', desc: '碰撞体积重新计算' },
                  { type: 'add', path: 'tags/SMT', desc: '添加 SMT 制程标签' },
                  { type: 'mod', path: 'skeleton/joint_limits.usda', desc: '旋转约束：±120° → ±180°' },
                  { type: 'mod', path: 'lod/lod2.usda', desc: 'LOD2 面数：15,200 → 18,100' },
                  { type: 'del', path: 'materials/metallic_v1.usda', desc: '旧版材质贴图已废弃' },
                ].map((entry, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 rounded bg-[var(--c-071526)] border border-[var(--c-142235)]">
                    <span className={`text-[10px] font-mono font-bold w-8 text-center flex-shrink-0 ${
                      entry.type === 'add' ? 'text-emerald-400' :
                      entry.type === 'mod' ? 'text-amber-400' : 'text-red-400'
                    }`}>
                      {entry.type === 'add' ? '+' : entry.type === 'mod' ? '~' : '−'}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 flex-1">{entry.path}</span>
                    <span className="text-[10px] text-slate-600">{entry.desc}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="px-5 py-4 border-t border-[var(--c-142235)] flex justify-end">
              <button
                onClick={() => setShowDiffModal(false)}
                className="text-xs text-slate-400 border border-[var(--c-1e3a55)] rounded-md px-4 py-2 hover:border-[var(--c-2a4a6a)] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Version Modal */}
      {showNewVersionModal && (
        <NewVersionModal onClose={() => setShowNewVersionModal(false)} />
      )}
    </div>
  );
}

// ── New Version Modal ───────────────────────────────────────────────────────
function NewVersionModal({ onClose }: { onClose: () => void }) {
  const [comment, setComment] = useState('');
  const [bump, setBump] = useState<'patch' | 'minor' | 'major'>('patch');
  const [tags, setTags] = useState('');

  const bumpOpts: { id: typeof bump; label: string; desc: string; example: string }[] = [
    { id: 'patch', label: 'Patch', desc: '小修改、bug修复、材质调整', example: 'v4.2.0 → v4.2.1' },
    { id: 'minor', label: 'Minor', desc: '新增功能、LOD/属性变更', example: 'v4.2.0 → v4.3.0' },
    { id: 'major', label: 'Major', desc: '重大重构、几何体完全替换', example: 'v4.2.0 → v5.0.0' },
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded-xl w-[500px] shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--c-142235)]">
          <div className="flex items-center gap-2">
            <Plus size={14} className="text-blue-400" />
            <span className="text-sm font-semibold text-slate-100">Publish New Version</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors"><X size={15} /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Upload area */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-2">Upload USD File</label>
            <div className="border-2 border-dashed border-[var(--c-1e3a55)] rounded-lg py-6 flex flex-col items-center gap-2 hover:border-blue-500/40 transition-colors cursor-pointer">
              <FileText size={20} className="text-slate-600" />
              <span className="text-[11px] text-slate-500">Drop .usd / .usda / .usdc file here</span>
              <span className="text-[10px] text-slate-700">or click to browse</span>
            </div>
          </div>

          {/* Bump type */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-2">Version Bump</label>
            <div className="grid grid-cols-3 gap-2">
              {bumpOpts.map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setBump(opt.id)}
                  className={`text-left p-3 rounded-lg border transition-all ${
                    bump === opt.id
                      ? 'border-blue-500/60 bg-blue-600/10'
                      : 'border-[var(--c-1e3a55)] hover:border-[var(--c-2a4a6a)]'
                  }`}
                >
                  <div className={`text-[11px] font-semibold mb-0.5 ${bump === opt.id ? 'text-blue-300' : 'text-slate-300'}`}>{opt.label}</div>
                  <div className="text-[9px] text-slate-600 leading-tight">{opt.desc}</div>
                  <div className="text-[9px] text-slate-700 mt-1 font-mono">{opt.example}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Change comment */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-2">Change Description</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="描述本次版本的主要变更..."
              rows={3}
              className="w-full bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded-md px-3 py-2 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/60 transition-colors resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-[11px] text-slate-400 mb-2">Tags (comma separated)</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. SMT, Verified, Q2-2026"
              className="w-full bg-[var(--c-071526)] border border-[var(--c-1e3a55)] rounded-md px-3 py-2 text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-[var(--c-142235)] flex gap-3">
          <button onClick={onClose} className="flex-1 text-xs text-slate-400 border border-[var(--c-1e3a55)] rounded-md py-2 hover:border-[var(--c-2a4a6a)] transition-colors">
            Cancel
          </button>
          <button onClick={onClose} className="flex-1 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-md py-2 transition-colors">
            Publish Version
          </button>
        </div>
      </div>
    </div>
  );
}
