/** 视口浮动面板：拆分成左右两块独立浮动面板。
 *
 * 布局：
 *   - 左：资产结构面板（常驻，~280px），header 含折叠 + 刷新
 *   - 右：设备参数面板（选中节点时才出现，~720px），header 含 X 关闭
 *
 * 交互：
 *   - 单击 factory/line/operation/equipment → 250ms 去歧义后 onSelect（仅高亮）
 *   - 双击 factory/line/operation/equipment → onDoubleSelect（运镜聚焦到目标 / 目标合并 BBox）
 *     双击 factory = 整厂概览（取代之前的"回俯视"按钮）
 *   - 折叠按钮（左上 Layers）→ 左侧面板收成 36px 图标；右侧参数面板独立显隐
 *
 * PRD §2.1.x 方案快照机制：
 *   - 「方案」tag 和 hover 「+ 新增」按钮已暂时下架；新增设备/产线的 modal 逻辑
 *     （PlanConfigPage 里 AddPlanScopedNodeModal + planMdApi.createEquipment/Line）仍保留
 *   - hover plan-scoped 节点仍显示「删除」按钮（删快照行） */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle,
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Factory as FactoryIcon,
  Layers,
  Sliders,
  Trash2,
  X,
} from 'lucide-react';

import { planApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { EffectiveParam } from '@/types/api';

import { ParamTable } from './ParamTable';
import { OperationParamTable, OperationParamForm } from './OperationParamPanel';
import type { TreeNode, NodeStatus, NodeType } from './types';

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  bottleneckIds: Set<string>;
  onSelect: (id: string) => void;
  onDoubleSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onAddChild?: (parent: TreeNode) => void;
  onDeleteNode?: (node: TreeNode) => void;
  /** hover 节点上的「配置参数」齿轮：选中该节点 + 显示右侧参数面板。 */
  onOpenConfig: (id: string) => void;
  editable?: boolean;
}

function TreeItem({
  node, depth, selectedId, expandedIds, bottleneckIds,
  onSelect, onDoubleSelect, onToggle,
  onAddChild, onDeleteNode, onOpenConfig, editable,
}: TreeItemProps) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(false);
  const hasKids = !!(node.children && node.children.length > 0);
  const expanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const isPlanScoped = !!node.plan_scope;
  // 动态瓶颈标记：基于 effective-params 算出的 maxCT 链
  // bottleneckIds 里存的是真 operation_id（来自 effective-params）；工序节点 .id 已复合
  // 化，要用 .operation_id 匹配。其他节点保持 .id 比较。
  const matchId = node.type === 'operation' ? (node.operation_id ?? node.id) : node.id;
  const status: NodeStatus = bottleneckIds.has(matchId) ? 'bottleneck' : (node.status ?? 'normal');

  // 单击 / 双击区分（250ms）—— factory / equipment / operation / line 都参与
  // （都可以运镜聚焦；factory 双击 = 整厂概览）
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusableType =
    node.type === 'factory' ||
    node.type === 'equipment' ||
    node.type === 'operation' ||
    node.type === 'line';
  const handleClick = () => {
    // 不可聚焦节点（stage / group 等）直接当成单击：toggle + select 立即执行
    if (!focusableType) {
      if (hasKids) onToggle(node.id);
      onSelect(node.id);
      return;
    }
    // 可聚焦节点：toggle 也延迟到 250ms timer 里 —— 否则双击时会 toggle 两次
    // 视觉上展开状态闪一下（收起再打开 / 打开再收起）。timer 被双击取消时 toggle
    // 也跟着不触发，双击只跑 onDoubleSelect 一件事。
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
      onDoubleSelect(node.id);
    } else {
      clickTimer.current = setTimeout(() => {
        clickTimer.current = null;
        if (hasKids) onToggle(node.id);
        onSelect(node.id);
      }, 250);
    }
  };

  const typeIcon: Record<NodeType, React.ReactNode> = {
    factory:   <FactoryIcon size={12} className="text-cyan-400 flex-shrink-0" />,
    stage:     <Layers     size={11} className="text-indigo-300 flex-shrink-0" />,
    line:      <Building2  size={11} className="text-blue-400 flex-shrink-0" />,
    operation: <Cpu        size={11} className={cn('flex-shrink-0', status === 'bottleneck' ? 'text-red-400' : 'text-emerald-400')} />,
    equipment: <Cpu        size={10} className={cn('flex-shrink-0', status === 'bottleneck' ? 'text-red-400' : 'text-slate-400')} />,
    group:     <Layers     size={11} className="text-slate-500 flex-shrink-0" />,
    agv:       <Cpu        size={11} className="text-violet-400 flex-shrink-0" />,
    material:  <Cpu        size={11} className="text-amber-400 flex-shrink-0" />,
  };

  const sizeCls: Record<NodeType, string> = {
    factory:   'text-[13px] text-cyan-200 font-semibold',
    stage:     'text-[12px] text-indigo-300 font-medium mt-1',
    line:      'text-[12px] text-slate-200',
    operation: 'text-[11px] text-slate-300',
    equipment: 'text-[11px] text-slate-400 ml-1',
    group:     'text-[10px] text-slate-500 font-semibold uppercase',
    agv:       'text-[12px] text-slate-300',
    material:  'text-[12px] text-slate-300',
  };

  // 「+ 新增」按钮暂时下架；onAddChild 仍由 props 传入，待回调按钮上线时复用。
  void onAddChild;
  // 删除按钮仅对方案副本「设备」节点显示（之前产线也能删，但实际几乎不用且容易误点 → 去掉）
  const canDelete = editable && onDeleteNode && isPlanScoped && node.type === 'equipment';
  // hover 配置齿轮：产线/工序/设备节点上显示，点击 = 选中 + 打开右侧参数面板
  // 仅 editable 时显示——回放页面 (editable=false) 不允许改参数，齿轮按钮无意义
  const canConfig = editable && (node.type === 'line' || node.type === 'operation' || node.type === 'equipment');

  return (
    <div>
      <div
        onClick={handleClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ paddingLeft: depth * 14 + 6 }}
        className={cn(
          'flex items-center gap-1.5 py-[5px] pr-2 rounded-md cursor-pointer transition-colors select-none group',
          isSelected && 'bg-blue-600/15 ring-1 ring-blue-500/40',
          !isSelected && 'hover:bg-[#0d2035]/50',
          sizeCls[node.type],
        )}
      >
        <span className="w-3 flex-shrink-0 flex items-center justify-center text-slate-500">
          {hasKids ? (expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />) : ''}
        </span>
        {typeIcon[node.type]}
        <span className="flex-1 truncate">{node.label}</span>
        {status === 'bottleneck' && <AlertCircle size={9} className="text-red-400 flex-shrink-0" />}
        {status === 'warning' && <AlertCircle size={9} className="text-amber-400 flex-shrink-0" />}
        {hover && (canConfig || canDelete) && (
          <span className="flex items-center gap-0.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            {canConfig && (
              <button
                onClick={() => onOpenConfig(node.id)}
                className="text-slate-400 hover:text-blue-300 p-0.5 rounded hover:bg-blue-500/15"
                title={t('Configure Parameters')}
              >
                <Sliders size={10} />
              </button>
            )}
            {canDelete && (
              <button
                onClick={() => onDeleteNode?.(node)}
                className="text-red-400 hover:text-red-300 p-0.5 rounded hover:bg-red-500/15"
                title={t('Delete Plan Copy (restore Master Data)')}
              >
                <Trash2 size={10} />
              </button>
            )}
          </span>
        )}
      </div>
      {expanded && hasKids && node.children!.map((child) => (
        <TreeItem
          key={child.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          expandedIds={expandedIds}
          bottleneckIds={bottleneckIds}
          onSelect={onSelect}
          onDoubleSelect={onDoubleSelect}
          onToggle={onToggle}
          onAddChild={onAddChild}
          onDeleteNode={onDeleteNode}
          onOpenConfig={onOpenConfig}
          editable={editable}
        />
      ))}
    </div>
  );
}

interface AssetSidebarProps {
  tree: TreeNode[];
  selectedId: string | null;
  selectedNode: TreeNode | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onDoubleSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onClearSelection: () => void;
  loading?: boolean;
  editable?: boolean;
  onAddChild?: (parent: TreeNode) => void;
  onDeleteNode?: (node: TreeNode) => void;
  // 参数表所需上下文
  planId?: string;
  productCode?: string | null;
  /** 参数变动版本号（递增表示需要重拉 effective-params 重算瓶颈）。 */
  paramsVersion?: number;
  onParamsChange?: () => void;
}

const TREE_PANEL_WIDTH = 280;
// 横向参数表（line 齿轮）540；竖向工序表单（operation 齿轮）窄一些 360；设备 mock 同 540
// 之前 720 太宽遮挡 viewport 串流画面，缩到 540 仍能放下「工序名 + 5 列参数」
const PARAMS_PANEL_WIDTH_WIDE = 540;
const PARAMS_PANEL_WIDTH_NARROW = 360;

export function AssetSidebar({
  tree, selectedId, selectedNode, expandedIds,
  onSelect, onDoubleSelect, onToggle, onClearSelection,
  loading = false, editable, onAddChild, onDeleteNode,
  planId, productCode, paramsVersion = 0, onParamsChange,
}: AssetSidebarProps) {
  const { t } = useTranslation();
  // onClearSelection 现在只用于"俯视/重置"流程中由父组件触发；
  // 右侧参数面板的开/关由本地 paramsPanelOpen 控制（点击节点不再自动开）
  void onClearSelection;
  const [collapsed, setCollapsed] = useState(false);
  // 参数面板是否展开：仅靠左面板的「配置参数」按钮显式打开，X 关闭。
  // 单击/双击节点都不会自动打开它（避免每次选节点就右侧弹一块）。
  const [paramsPanelOpen, setParamsPanelOpen] = useState(false);

  // 选中被清空（俯视按钮等流程把 selectedId 置 null）→ 顺手把参数面板也关掉，
  // 否则下次再随便点节点时面板会因 paramsPanelOpen=true 自动复现，违反"显式开"语义
  useEffect(() => {
    if (!selectedNode) setParamsPanelOpen(false);
  }, [selectedNode]);

  // 树节点 hover 出的「配置参数」齿轮：选中该节点 + 强制打开右侧参数面板。
  // 如果同节点已选中，onSelect 会 toggle off 反而清掉 selection，所以仅在
  // selectedId !== id 时才调（节点未选中或选中的是别的节点都走这里）。
  const handleOpenConfig = (id: string) => {
    if (selectedId !== id) onSelect(id);
    setParamsPanelOpen(true);
  };

  const hasParams = paramsPanelOpen && !!selectedNode && !!planId;

  // ── 动态瓶颈：拉 effective-params，找全厂 CT 最大的设备链 ─────────────────
  // 改参数 → 主组件 paramsVersion++ → 本地重拉 → bottleneckIds 重算 → TreeItem 重渲
  const [effectiveCts, setEffectiveCts] = useState<EffectiveParam[]>([]);
  useEffect(() => {
    if (!planId) return;
    let cancelled = false;
    planApi.effectiveParams(planId, productCode ?? undefined)
      .then((res) => {
        if (cancelled) return;
        setEffectiveCts(res.items.filter((p) => p.param_key === 'ct' && p.value != null));
      })
      .catch(() => { /* 静默忽略：树仍可用，仅瓶颈不显示 */ });
    return () => { cancelled = true; };
  }, [planId, productCode, paramsVersion]);

  const bottleneckIds = useMemo(() => {
    const ids = new Set<string>();
    if (!effectiveCts.length) return ids;
    // 全厂最大 effective CT；按 product_code 过滤范围内（同一份 ct 表已经是按该产品视图）
    let maxCt = 0;
    for (const p of effectiveCts) {
      const v = Number(p.value);
      if (Number.isFinite(v) && v > maxCt) maxCt = v;
    }
    if (maxCt <= 0) return ids;
    const eps = 1e-6;
    for (const p of effectiveCts) {
      const v = Number(p.value);
      if (Math.abs(v - maxCt) < eps) {
        ids.add(p.equipment_id);
        ids.add(p.operation_id);
        ids.add(p.line_id);
        ids.add(p.stage_id);
      }
    }
    return ids;
  }, [effectiveCts]);

  // 标题：选中节点时跟随节点名；无选中时是固定"资产结构"
  const paramsTitleMap: Record<string, string> = {
    factory:   t('Factory-Wide Equipment Parameters'),
    stage:     t('{{name}} · Equipment Parameters', { name: selectedNode?.label ?? '' }),
    line:      t('{{name}} · Equipment Parameters', { name: selectedNode?.label ?? '' }),
    operation: t('{{name}} · Equipment Parameters', { name: selectedNode?.label ?? '' }),
    equipment: t('{{name}} · Parameter Details', { name: selectedNode?.label ?? '' }),
    agv:       t('AGV Equipment Parameters'),
    material:  t('Material Parameters'),
    group:     '',
  };
  const paramsTitle = selectedNode ? (paramsTitleMap[selectedNode.type] ?? t('Equipment Parameters')) : t('Equipment Parameters');

  return (
    <>
      {/* ─── Left floating panel: 资产结构 ─────────────────────────────────── */}
      <div
        className="absolute top-3 left-3 z-20 flex flex-col rounded-xl border border-[#1e3a55] bg-[#07111e]/90 backdrop-blur shadow-2xl transition-all overflow-hidden"
        style={{
          width: collapsed ? 36 : TREE_PANEL_WIDTH,
          height: collapsed ? 36 : 'calc(100% - 24px)',
          maxHeight: collapsed ? 36 : 'calc(100% - 24px)',
        }}
      >
        <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[#142235] flex-shrink-0">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="text-slate-400 hover:text-slate-200 transition-colors flex-shrink-0"
            title={collapsed ? t('Expand') : t('Collapse')}
          >
            <Layers size={13} />
          </button>
          {!collapsed && (
            <>
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex-1">{t('Asset Tree')}</span>
              <button
                onClick={() => setCollapsed(true)}
                className="text-slate-400 hover:text-slate-300 transition-colors"
                title={t('Collapse')}
              >
                <ChevronLeft size={12} />
              </button>
            </>
          )}
        </div>

        {!collapsed && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="px-2 py-2 flex-shrink-0">
              <input
                placeholder={t('Search assets...')}
                className="w-full bg-[#040d16] border border-[#142235] rounded-md px-2.5 py-1 text-[11px] text-slate-300 outline-none focus:border-blue-500/40 placeholder:text-slate-600"
              />
            </div>
            <div className="flex-1 overflow-y-auto py-1 px-1 min-h-0">
              {loading ? (
                <div className="px-3 py-4 text-[11px] text-slate-500">{t('Loading…')}</div>
              ) : tree.length === 0 ? (
                <div className="px-3 py-4 text-[11px] text-slate-500">{t('No assets')}</div>
              ) : (
                tree.map((node) => (
                  <TreeItem
                    key={node.id}
                    node={node}
                    depth={0}
                    selectedId={selectedId}
                    expandedIds={expandedIds}
                    bottleneckIds={bottleneckIds}
                    onSelect={onSelect}
                    onDoubleSelect={onDoubleSelect}
                    onToggle={onToggle}
                    onAddChild={onAddChild}
                    onDeleteNode={onDeleteNode}
                    onOpenConfig={handleOpenConfig}
                    editable={editable}
                  />
                ))
              )}
            </div>
            <div className="border-t border-[#142235] px-3 py-1.5 flex-shrink-0 text-[9px] text-slate-600 leading-tight">
              {t('Click to highlight')} · <span className="text-slate-500">{t('Double-click to fly camera')}</span> {t('to the selected node · hover row end')} <Sliders size={9} className="inline -mt-0.5" /> {t('to open parameters')}
            </div>
          </div>
        )}
      </div>

      {/* ─── Right floating panel: 按节点类型分流面板 ─────────────────────── */}
      {/* line → 横向 OperationParamTable（宽）；operation → 竖向 OperationParamForm（窄）；equipment → mock */}
      {hasParams && planId && selectedNode && (() => {
        const panelWidth = selectedNode.type === 'operation'
          ? PARAMS_PANEL_WIDTH_NARROW
          : PARAMS_PANEL_WIDTH_WIDE;
        return (
          <div
            className="absolute top-3 right-3 z-20 flex flex-col rounded-xl border border-[#1e3a55] bg-[#07111e]/90 backdrop-blur shadow-2xl transition-all overflow-hidden"
            style={{ width: panelWidth, height: 'calc(100% - 24px)', maxHeight: 'calc(100% - 24px)' }}
          >
            <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[#142235] flex-shrink-0">
              <Sliders size={13} className="text-slate-400 flex-shrink-0" />
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex-1 truncate">
                {paramsTitle}
              </span>
              <button
                onClick={() => setParamsPanelOpen(false)}
                className="text-slate-400 hover:text-slate-300 transition-colors"
                title={t('Close parameter panel (selection retained)')}
              >
                <X size={11} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {selectedNode.type === 'equipment' ? (
                <EquipmentTechParamsMock node={selectedNode} />
              ) : selectedNode.type === 'line' ? (
                <OperationParamTable
                  planId={planId}
                  lineNode={selectedNode}
                  tree={tree}
                  defaultProductCode={productCode}
                  onParamsChange={onParamsChange}
                />
              ) : selectedNode.type === 'operation' ? (
                <OperationParamForm
                  planId={planId}
                  operationNode={selectedNode}
                  tree={tree}
                  defaultProductCode={productCode}
                  onParamsChange={onParamsChange}
                />
              ) : (
                // factory / stage / group 等暂时仍走旧 ParamTable（按设备聚合）
                <ParamTable
                  planId={planId}
                  productCode={productCode}
                  tree={tree}
                  selectedNode={selectedNode}
                  onParamsChange={onParamsChange}
                />
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
}


// ─── 设备工艺参数 mock ────────────────────────────────────────────────────────
// 单台设备的具体工艺参数（电流/温度/气压/转速 …）后端尚未建表，先用纯前端 mock
// 展示形态；用户对接真实数据时把 input 接到 API 即可。值改了不持久化、刷新即丢。
function EquipmentTechParamsMock({ node }: { node: TreeNode }) {
  const { t } = useTranslation();
  const fields: Array<{ key: string; label: string; unit: string; default: string; hint?: string }> = [
    { key: 'voltage',       label: 'Operating Voltage',  unit: 'V',   default: '220',  hint: 'Equipment main circuit input voltage' },
    { key: 'current',       label: 'Rated Current',      unit: 'A',   default: '12.5' },
    { key: 'temperature',   label: 'Operating Temperature', unit: '℃', default: '85', hint: 'Process table target temperature (PID closed loop)' },
    { key: 'pressure',      label: 'Air Pressure',       unit: 'kPa', default: '450' },
    { key: 'rotation_rpm',  label: 'Spindle Speed',      unit: 'rpm', default: '1800' },
    { key: 'precision_um',  label: 'Positioning Accuracy', unit: 'μm', default: '±5' },
    { key: 'feed_rate',     label: 'Feed Rate',          unit: 'mm/s', default: '120' },
    { key: 'cycle_time_ms', label: 'Equipment Cycle Time', unit: 'ms', default: '850', hint: 'Physical processing cycle time per workpiece (excluding load/unload)' },
  ];

  return (
    <div className="h-full overflow-y-auto px-4 py-3">
      <div className="text-[10px] text-amber-400/80 mb-3 px-2 py-1 rounded bg-amber-500/10 border border-amber-500/20">
        ⚠ {t('Mock data: equipment-level process parameters are not yet modeled on the backend; this is display-only and edits will not be saved')}
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {fields.map((f) => (
          <div key={f.key} className="flex flex-col gap-1">
            <label className="text-[10px] text-slate-400 flex items-baseline gap-1.5">
              {t(f.label)}
              <span className="text-[9px] text-slate-600 font-mono">{f.unit}</span>
            </label>
            <input
              type="text"
              defaultValue={f.default}
              className="bg-[#040d16] border border-[#142235] rounded px-2 py-1 text-[12px] font-mono text-slate-200 focus:outline-none focus:border-blue-500/40"
            />
            {f.hint && <span className="text-[9px] text-slate-600 leading-tight">{t(f.hint)}</span>}
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-[#142235] text-[10px] text-slate-500 leading-relaxed">
        <div className="font-semibold text-slate-400 mb-1">{t('Equipment Path')}</div>
        <div className="font-mono text-slate-600 break-all">{node.prim_path ?? '—'}</div>
      </div>
    </div>
  );
}
