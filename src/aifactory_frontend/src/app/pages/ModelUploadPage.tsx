import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router';
import {
  Upload, X, FileBox, CheckCircle2, AlertTriangle,
  Package, Tag, Building2, Hash, ChevronRight,
  Layers3, RotateCcw, ZoomIn, ZoomOut,
  Image, FileText, Info,
} from 'lucide-react';
import { NavSidebar, PageHeader } from '../components/NavSidebar';

const PROCESS_OPTIONS = ['SMT', 'PTH', 'ASSY', 'TEST', 'PACKING'];
const TYPE_OPTIONS = ['产线', '设备', '工装治具', '公辅机房', '仓储设备', '检测仪器'];
const CATEGORY_OPTIONS = [
  { id: 'production-lines', label: '生产线体', icon: '▣' },
  { id: 'machines',         label: '生产设备', icon: '⚙' },
  { id: 'inspection',       label: '检测设备', icon: '◉' },
  { id: 'transport',        label: '物流搬运', icon: '▷' },
];

interface FileEntry {
  name: string;
  size: number;
  type: 'model' | 'texture' | 'doc';
  status: 'ready' | 'uploading' | 'done' | 'error';
  progress: number;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileIcon({ type }: { type: FileEntry['type'] }) {
  if (type === 'model') return <FileBox size={14} className="text-blue-400" />;
  if (type === 'texture') return <Image size={14} className="text-violet-400" />;
  return <FileText size={14} className="text-slate-400" />;
}

// ── Mock 3D Preview Viewport ──────────────────────────────────────────────────
function Preview3D({ hasFile }: { hasFile: boolean }) {
  return (
    <div className="relative flex-1 bg-[#030810] rounded-lg overflow-hidden flex flex-col">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'linear-gradient(#1e3a55 1px, transparent 1px), linear-gradient(90deg, #1e3a55 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {hasFile ? (
        <>
          {/* Mock 3D object placeholder */}
          <div className="flex-1 flex items-center justify-center relative">
            <div className="relative">
              {/* Simplified isometric box wireframe */}
              <svg width="180" height="160" viewBox="0 0 180 160" fill="none">
                <g opacity="0.7">
                  {/* Top face */}
                  <polygon points="90,20 160,55 90,90 20,55" stroke="#3b82f6" strokeWidth="1.5" fill="#3b82f6" fillOpacity="0.08" />
                  {/* Left face */}
                  <polygon points="20,55 90,90 90,140 20,105" stroke="#2563eb" strokeWidth="1.5" fill="#1d4ed8" fillOpacity="0.12" />
                  {/* Right face */}
                  <polygon points="160,55 90,90 90,140 160,105" stroke="#1d4ed8" strokeWidth="1.5" fill="#1e40af" fillOpacity="0.15" />
                  {/* Highlight edges */}
                  <line x1="90" y1="20" x2="90" y2="90" stroke="#60a5fa" strokeWidth="0.5" strokeDasharray="4 3" opacity="0.5" />
                  <line x1="20" y1="55" x2="20" y2="105" stroke="#60a5fa" strokeWidth="0.5" strokeDasharray="4 3" opacity="0.5" />
                  <line x1="160" y1="55" x2="160" y2="105" stroke="#60a5fa" strokeWidth="0.5" strokeDasharray="4 3" opacity="0.5" />
                </g>
              </svg>
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] text-slate-600">SMT贴片机模型预览</div>
            </div>
          </div>
          {/* Model info overlay */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
            <div className="bg-[#040d18]/80 backdrop-blur rounded px-2.5 py-1.5 text-[10px] text-slate-400 space-y-0.5">
              <div>顶点: <span className="text-slate-200">12,847</span></div>
              <div>面数: <span className="text-slate-200">8,432</span></div>
              <div>材质: <span className="text-slate-200">4</span></div>
            </div>
            <div className="flex flex-col gap-1.5">
              <button className="w-7 h-7 bg-[#040d18]/80 backdrop-blur rounded flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors">
                <ZoomIn size={13} />
              </button>
              <button className="w-7 h-7 bg-[#040d18]/80 backdrop-blur rounded flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors">
                <ZoomOut size={13} />
              </button>
              <button className="w-7 h-7 bg-[#040d18]/80 backdrop-blur rounded flex items-center justify-center text-slate-400 hover:text-slate-200 transition-colors">
                <RotateCcw size={13} />
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <Layers3 size={36} className="text-slate-700 mb-3" />
          <div className="text-[12px] text-slate-500">上传模型文件后预览</div>
          <div className="text-[10px] text-slate-700 mt-1">支持 USD、FBX、OBJ、GLTF 格式</div>
        </div>
      )}
    </div>
  );
}

// ── Upload Drop Zone ──────────────────────────────────────────────────────────
function DropZone({
  files,
  onAdd,
  onRemove,
}: {
  files: FileEntry[];
  onAdd: (f: FileEntry) => void;
  onRemove: (name: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    Array.from(e.dataTransfer.files).forEach((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      const type: FileEntry['type'] = ['usd', 'usda', 'usdz', 'fbx', 'obj', 'gltf', 'glb'].includes(ext)
        ? 'model'
        : ['png', 'jpg', 'jpeg', 'webp'].includes(ext)
        ? 'texture'
        : 'doc';
      onAdd({ name: file.name, size: file.size, type, status: 'ready', progress: 0 });
    });
  }

  const STATUS_ICON: Record<FileEntry['status'], React.ReactNode> = {
    ready:     <span className="w-4 h-4 rounded-full border border-slate-600 flex-shrink-0" />,
    uploading: <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin flex-shrink-0" />,
    done:      <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />,
    error:     <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />,
  };

  return (
    <div className="space-y-2">
      <div
        onDragEnter={() => setDragging(true)}
        onDragLeave={() => setDragging(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 cursor-pointer transition-colors ${
          dragging
            ? 'border-blue-500 bg-blue-600/10'
            : 'border-[#1e3a55] hover:border-[#2a4a6a] hover:bg-[#0e243a]/50'
        }`}
      >
        <input ref={inputRef} type="file" multiple className="hidden" accept=".usd,.usda,.usdz,.fbx,.obj,.gltf,.glb,.png,.jpg,.jpeg" />
        <Upload size={22} className={dragging ? 'text-blue-400' : 'text-slate-600'} />
        <div className="text-[11px] text-slate-400 text-center">
          拖拽文件到此处，或 <span className="text-blue-400">点击选择</span>
        </div>
        <div className="text-[10px] text-slate-600">USD · FBX · OBJ · GLTF · GLB — 单文件最大 500MB</div>
      </div>

      {files.length > 0 && (
        <div className="space-y-1.5 max-h-36 overflow-y-auto">
          {files.map((f) => (
            <div key={f.name} className="bg-[#071526] border border-[#142235] rounded px-3 py-2 flex items-center gap-2.5">
              {STATUS_ICON[f.status]}
              <FileIcon type={f.type} />
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-slate-300 truncate">{f.name}</div>
                <div className="text-[10px] text-slate-600">{formatSize(f.size)}</div>
                {f.status === 'uploading' && (
                  <div className="mt-1 h-0.5 bg-[#142235] rounded overflow-hidden">
                    <div className="h-full bg-blue-500 rounded transition-all" style={{ width: `${f.progress}%` }} />
                  </div>
                )}
              </div>
              <button onClick={() => onRemove(f.name)} className="text-slate-600 hover:text-red-400 transition-colors">
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export function ModelUploadPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [process, setProcess] = useState<string[]>([]);
  const [type, setType] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [tags, setTags] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const hasModel = files.some((f) => f.type === 'model');
  const canSubmit = name.trim() && category && hasModel;

  function toggleProcess(p: string) {
    setProcess((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    setSubmitted(true);
    setTimeout(() => navigate('/asset-library'), 1500);
  }

  return (
    <div className="flex h-screen bg-[#07111e] text-slate-100 overflow-hidden">
      <NavSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <PageHeader
          crumbs={[
            { label: 'Asset Library', path: '/asset-library' },
            { label: 'Upload Model' },
          ]}
          actions={
            <button
              onClick={() => navigate('/asset-library')}
              className="text-xs text-slate-400 border border-[#1e3a55] px-3 py-1.5 rounded-md hover:border-[#2a4a6a] transition-colors"
            >
              取消
            </button>
          }
        />

        {submitted ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
              <CheckCircle2 size={28} className="text-emerald-400" />
            </div>
            <div className="text-base font-semibold text-slate-100">上传成功！</div>
            <div className="text-[12px] text-slate-500">模型已加入资产库，正在跳转...</div>
          </div>
        ) : (
          <div className="flex flex-1 overflow-hidden">

            {/* ── Left: Form ── */}
            <div className="w-96 border-r border-[#142235] flex flex-col overflow-y-auto">
              <div className="p-6 space-y-5">
                {/* File upload */}
                <section>
                  <SectionLabel icon={<Upload size={12} />} label="模型文件" required />
                  <DropZone
                    files={files}
                    onAdd={(f) => setFiles((prev) => [...prev, f])}
                    onRemove={(name) => setFiles((prev) => prev.filter((f) => f.name !== name))}
                  />
                </section>

                {/* Basic info */}
                <section className="space-y-3">
                  <SectionLabel icon={<Info size={12} />} label="基本信息" required />

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1.5">资产名称 <span className="text-red-400">*</span></label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. JUKI 高速贴片机 KE-3020"
                      className="w-full bg-[#071526] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1.5">资产分类 <span className="text-red-400">*</span></label>
                    <div className="grid grid-cols-2 gap-2">
                      {CATEGORY_OPTIONS.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setCategory(c.id)}
                          className={`border rounded p-2 text-left text-[11px] transition-colors ${
                            category === c.id ? 'border-blue-500/60 bg-blue-600/10 text-blue-300' : 'border-[#1e3a55] text-slate-400 hover:border-[#2a4a6a]'
                          }`}
                        >
                          <span className="mr-1.5">{c.icon}</span>{c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>

                {/* Process & Type */}
                <section className="space-y-3">
                  <SectionLabel icon={<Tag size={12} />} label="工艺 & 类型" />

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1.5">适用制程</label>
                    <div className="flex flex-wrap gap-1.5">
                      {PROCESS_OPTIONS.map((p) => (
                        <button
                          key={p}
                          onClick={() => toggleProcess(p)}
                          className={`text-[10px] px-2.5 py-1 rounded border transition-colors ${
                            process.includes(p)
                              ? 'border-blue-500/60 bg-blue-600/20 text-blue-300'
                              : 'border-[#1e3a55] text-slate-500 hover:border-[#2a4a6a]'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1.5">设备类型</label>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="w-full bg-[#071526] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500 transition-colors"
                    >
                      <option value="">请选择</option>
                      {TYPE_OPTIONS.map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </section>

                {/* Equipment info */}
                <section className="space-y-3">
                  <SectionLabel icon={<Building2 size={12} />} label="设备信息" />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1.5">制造商</label>
                      <input
                        value={manufacturer}
                        onChange={(e) => setManufacturer(e.target.value)}
                        placeholder="e.g. JUKI"
                        className="w-full bg-[#071526] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1.5">型号</label>
                      <input
                        value={model}
                        onChange={(e) => setModel(e.target.value)}
                        placeholder="e.g. KE-3020"
                        className="w-full bg-[#071526] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1.5">
                      <Hash size={10} className="inline mr-1" />标签
                    </label>
                    <input
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder="多个标签用逗号分隔，e.g. 贴片, 高速, 8轴"
                      className="w-full bg-[#071526] border border-[#1e3a55] rounded px-3 py-1.5 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                    />
                  </div>
                </section>
              </div>

              {/* Submit */}
              <div className="p-6 pt-0 mt-auto">
                {!canSubmit && (
                  <div className="text-[10px] text-slate-600 mb-2 text-center">
                    {!hasModel ? '请先上传模型文件' : !name.trim() ? '请填写资产名称' : '请选择资产分类'}
                  </div>
                )}
                <button
                  disabled={!canSubmit}
                  onClick={handleSubmit}
                  className="w-full text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white py-2.5 rounded-md font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  <Package size={13} /> 上传并入库
                </button>
              </div>
            </div>

            {/* ── Right: Preview ── */}
            <div className="flex-1 flex flex-col p-6 gap-4 overflow-hidden">
              <div className="flex items-center justify-between flex-shrink-0">
                <div className="text-[11px] text-slate-500">3D 模型预览</div>
                {hasModel && (
                  <div className="text-[10px] text-slate-600 flex items-center gap-1">
                    <Info size={10} /> 拖拽旋转 · 滚轮缩放
                  </div>
                )}
              </div>
              <Preview3D hasFile={hasModel} />

              {/* Metadata preview */}
              {name && (
                <div className="flex-shrink-0 bg-[#0b1d30] border border-[#142235] rounded-lg p-4 space-y-2">
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">入库预览</div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    <MetaRow label="名称" value={name || '—'} />
                    <MetaRow label="分类" value={CATEGORY_OPTIONS.find((c) => c.id === category)?.label ?? '—'} />
                    <MetaRow label="制程" value={process.length ? process.join(', ') : '—'} />
                    <MetaRow label="类型" value={type || '—'} />
                    <MetaRow label="制造商" value={manufacturer || '—'} />
                    <MetaRow label="型号" value={model || '—'} />
                  </div>
                  {tags && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {tags.split(',').map((t) => t.trim()).filter(Boolean).map((t) => (
                        <span key={t} className="text-[9px] px-2 py-0.5 rounded bg-blue-600/15 border border-blue-500/30 text-blue-300">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ icon, label, required }: { icon: React.ReactNode; label: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-300 mb-2">
      <span className="text-slate-500">{icon}</span>
      {label}
      {required && <span className="text-red-400 text-[10px]">*</span>}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-slate-500">{label}</span>
      <span className="text-[10px] text-slate-300">{value}</span>
    </div>
  );
}
