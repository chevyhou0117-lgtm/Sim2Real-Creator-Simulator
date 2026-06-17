/** 参数继承表 + 节点聚合摘要 + 批量操作栏。
 *
 * 数据源：planApi.effectiveParams(planId, productCode) 返回 per equipment × 6 个 param_key 的
 * value+source 列表。本组件按选中节点过滤、按 (line, operation) 分组、就地编辑写回 batch
 * upsert。 */

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronDown, ChevronRight, Loader2, Sliders, X } from 'lucide-react';

import { planApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { EffectiveParam, OverrideParamKey, OverrideScope, OverrideUpsert } from '@/types/api';

import {
  PARAM_COLUMNS,
  PARAM_KEY_TO_COL,
  inheritanceStatus,
  sourceLabel,
  type ParamColumn,
  type TreeNode,
} from './types';
import { collectEquipmentIds, filterEffectiveByNode, findNode } from './asset-tree-builder';

// ── helpers ────────────────────────────────────────────────────────────────

function displayValue(p: EffectiveParam | undefined, col: ParamColumn): string {
  if (!p || p.value == null) return '—';
  const v = col.storeToUi ? col.storeToUi(Number(p.value)) : Number(p.value);
  return v.toFixed(col.digits ?? 1);
}

function parseUserInput(raw: string, col: ParamColumn): number | null {
  const n = parseFloat(raw.trim());
  if (!Number.isFinite(n)) return null;
  return col.uiToStore ? col.uiToStore(n) : n;
}

// ── NodeSummaryBar ─────────────────────────────────────────────────────────

interface SummaryStats {
  maxCt: number;
  avgYield: number | null;
  totalWorkers: number;
  lineCount: number;
  eqCount: number;
  lbr: number | null;
}

function computeStats(items: EffectiveParam[], scope: 'factory' | 'stage' | 'line' | 'operation' | 'equipment'): SummaryStats {
  // 把 items 按 equipment 分组
  const byEq = new Map<string, Map<OverrideParamKey, number | null>>();
  for (const it of items) {
    if (!byEq.has(it.equipment_id)) byEq.set(it.equipment_id, new Map());
    byEq.get(it.equipment_id)!.set(it.param_key, it.value != null ? Number(it.value) : null);
  }
  const cts: number[] = [];
  const yields: number[] = [];
  let totalWorkers = 0;
  const lineIds = new Set<string>();
  const sumCt = { v: 0 };
  for (const it of items) {
    if (it.param_key === 'ct' && it.value != null) {
      cts.push(Number(it.value));
      sumCt.v += Number(it.value);
    }
    if (it.param_key === 'yield_rate' && it.value != null) yields.push(Number(it.value));
    if (it.param_key === 'worker_count' && it.value != null) totalWorkers += Number(it.value);
    lineIds.add(it.line_id);
  }
  const maxCt = cts.length ? Math.max(...cts) : 0;
  const avgYield = yields.length ? yields.reduce((a, b) => a + b, 0) / yields.length : null;
  const eqCount = byEq.size;
  const lbr = maxCt > 0 && totalWorkers > 0 ? (sumCt.v / (maxCt * totalWorkers)) * 100 : null;
  void scope;
  return { maxCt, avgYield, totalWorkers, lineCount: lineIds.size, eqCount, lbr };
}

function NodeSummaryBar({ node, items }: { node: TreeNode; items: EffectiveParam[] }) {
  const { t } = useTranslation();
  const scope = node.type as 'factory' | 'stage' | 'line' | 'operation' | 'equipment';
  const stats = useMemo(() => computeStats(items, scope), [items, scope]);
  if (items.length === 0) {
    return (
      <div className="px-3 py-2 border-b border-[#142235] flex-shrink-0">
        <span className="text-[10px] text-slate-500">{t('No equipment parameters under this node')}</span>
      </div>
    );
  }
  type Chip = { label: string; value: string; color?: string };
  const chips: Chip[] = [];
  const cb = (v: number | null) => (v != null ? v.toFixed(1) : '—');
  if (scope === 'factory' || scope === 'stage') {
    chips.push(
      { label: scope === 'factory' ? t('Total Equipment') : t('Stage Equipment'), value: t('{{count}} units', { count: stats.eqCount }) },
      { label: t('Lines'), value: `${stats.lineCount}` },
      ...(stats.avgYield != null ? [{ label: t('Avg Yield Rate'), value: `${(stats.avgYield * 100).toFixed(1)}%`, color: 'text-emerald-400' } as Chip] : []),
      { label: t('Max CT'), value: stats.maxCt > 0 ? `${stats.maxCt.toFixed(1)}s` : '—', color: 'text-blue-300' },
    );
  } else if (scope === 'line') {
    chips.push(
      { label: t('Line CT'), value: stats.maxCt > 0 ? `${stats.maxCt.toFixed(1)}s` : '—', color: 'text-blue-300' },
      ...(stats.lbr != null ? [{
        label: 'LBR',
        value: `${stats.lbr.toFixed(1)}%`,
        color: stats.lbr >= 85 ? 'text-emerald-400' : stats.lbr >= 70 ? 'text-amber-400' : 'text-red-400',
      } as Chip] : []),
      { label: t('Equipment'), value: t('{{count}} units', { count: stats.eqCount }) },
      { label: t('Headcount'), value: t('{{count}} people', { count: stats.totalWorkers }) },
    );
  } else if (scope === 'operation') {
    chips.push(
      { label: t('Operation CT'), value: stats.maxCt > 0 ? `${stats.maxCt.toFixed(1)}s` : '—', color: 'text-blue-300' },
      { label: t('Equipment'), value: t('{{count}} units', { count: stats.eqCount }) },
    );
  } else {
    // equipment
    const byKey = new Map<OverrideParamKey, EffectiveParam>();
    for (const it of items) byKey.set(it.param_key, it);
    chips.push(
      { label: 'CT',    value: displayValue(byKey.get('ct'), PARAM_KEY_TO_COL.ct) + 's', color: 'text-blue-300' },
      { label: t('Yield Rate'),  value: displayValue(byKey.get('yield_rate'), PARAM_KEY_TO_COL.yield_rate) + '%', color: 'text-emerald-400' },
      { label: 'MTBF',  value: displayValue(byKey.get('mtbf'), PARAM_KEY_TO_COL.mtbf) + 'h' },
      { label: 'MTTR',  value: displayValue(byKey.get('mttr'), PARAM_KEY_TO_COL.mttr) + 'min' },
    );
    void cb;
  }
  return (
    <div className="px-3 py-2 border-b border-[#142235] flex-shrink-0 bg-[#040d16]/60">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {chips.map((c) => (
          <div key={c.label} className="flex items-center gap-1">
            <span className="text-[10px] text-slate-500">{c.label}</span>
            <span className={cn('text-[11px] font-mono font-semibold', c.color ?? 'text-slate-300')}>{c.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── ParamTable ─────────────────────────────────────────────────────────────

interface ParamTableProps {
  planId: string;
  productCode?: string | null;
  tree: TreeNode[];
  selectedNode: TreeNode | null;
  onParamsChange?: () => void;
}

interface EquipmentRow {
  equipment_id: string;
  equipment_label: string;
  operation_id: string;
  operation_label: string;
  line_id: string;
  line_label: string;
  byKey: Map<OverrideParamKey, EffectiveParam>;
}

export function ParamTable({ planId, productCode, tree, selectedNode, onParamsChange }: ParamTableProps) {
  const { t } = useTranslation();
  const [allItems, setAllItems] = useState<EffectiveParam[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingCell, setEditingCell] = useState<{ eqId: string; key: OverrideParamKey } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [selectedEqIds, setSelectedEqIds] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const res = await planApi.effectiveParams(planId, productCode ?? undefined);
      setAllItems(res.items);
    } catch (err) {
      console.error('load effective params failed', err);
    } finally {
      setLoading(false);
    }
  }, [planId, productCode]);

  useEffect(() => { reload(); }, [reload]);

  // 按选中节点过滤
  const filteredItems = useMemo(() => {
    if (!selectedNode) return allItems;
    const eqIds = new Set(collectEquipmentIds(selectedNode));
    if (eqIds.size === 0) return [];
    return allItems.filter((it) => eqIds.has(it.equipment_id));
  }, [allItems, selectedNode]);

  // 把过滤后的 items 整理为 EquipmentRow，按 line → operation 分组排序
  const rows = useMemo<EquipmentRow[]>(() => {
    const byEq = new Map<string, EquipmentRow>();
    for (const it of filteredItems) {
      let row = byEq.get(it.equipment_id);
      if (!row) {
        // 通过 tree 反查 label
        const eqNode = findNode(tree, it.equipment_id);
        // 工序节点 id 已改为 "line_id::operation_id" 复合 → 按真实 op_id 找不到，要重建复合 id
        const opCompositeId = eqNode?.line_id && eqNode?.operation_id
          ? `${eqNode.line_id}::${eqNode.operation_id}` : null;
        const opNode = opCompositeId ? findNode(tree, opCompositeId) : null;
        const lineNode = eqNode?.line_id ? findNode(tree, eqNode.line_id) : null;
        row = {
          equipment_id: it.equipment_id,
          equipment_label: eqNode?.label ?? it.equipment_id.slice(0, 8),
          operation_id: it.operation_id,
          operation_label: opNode?.label ?? '—',
          line_id: it.line_id,
          line_label: lineNode?.label ?? '—',
          byKey: new Map(),
        };
        byEq.set(it.equipment_id, row);
      }
      row.byKey.set(it.param_key, it);
    }
    return [...byEq.values()].sort((a, b) => {
      if (a.line_label !== b.line_label) return a.line_label.localeCompare(b.line_label);
      if (a.operation_label !== b.operation_label) return a.operation_label.localeCompare(b.operation_label);
      return a.equipment_label.localeCompare(b.equipment_label);
    });
  }, [filteredItems, tree]);

  useEffect(() => {
    if (editingCell) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editingCell]);

  const startEdit = (eqId: string, key: OverrideParamKey) => {
    const row = rows.find((r) => r.equipment_id === eqId);
    const p = row?.byKey.get(key);
    const col = PARAM_KEY_TO_COL[key];
    if (p && p.value != null) {
      const v = col.storeToUi ? col.storeToUi(Number(p.value)) : Number(p.value);
      setEditValue(v.toFixed(col.digits ?? 1));
    } else {
      setEditValue('');
    }
    setEditingCell({ eqId, key });
  };

  const commitEdit = async (clearMode = false) => {
    if (!editingCell) return;
    const { eqId, key } = editingCell;
    setEditingCell(null);
    const col = PARAM_KEY_TO_COL[key];
    let paramValue: string;
    if (clearMode || editValue.trim() === '') {
      // 空 → 删除 override，恢复基线
      paramValue = '';
    } else {
      const n = parseUserInput(editValue, col);
      if (n === null) return;
      paramValue = String(n);
    }
    setSaving(true);
    try {
      await planApi.batchUpsertOverrides(planId, {
        items: [{ scope_type: 'EQUIPMENT' as OverrideScope, scope_id: eqId, param_key: key, param_value: paramValue }],
      });
      await reload();
      onParamsChange?.();
    } catch (err) {
      console.error('upsert override failed', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleSelect = (eqId: string) => {
    setSelectedEqIds((prev) => {
      const next = new Set(prev);
      if (next.has(eqId)) next.delete(eqId); else next.add(eqId);
      return next;
    });
  };

  const applyToSelected = async (
    key: OverrideParamKey,
    valueStore: number,
    timeRange?: { start: number | null; end: number | null },
  ) => {
    if (selectedEqIds.size === 0) return;
    setSaving(true);
    try {
      const items: OverrideUpsert[] = [...selectedEqIds].map((id) => ({
        scope_type: 'EQUIPMENT' as OverrideScope,
        scope_id: id,
        param_key: key,
        param_value: String(valueStore),
        time_range_start: timeRange?.start ?? null,
        time_range_end: timeRange?.end ?? null,
      }));
      await planApi.batchUpsertOverrides(planId, { items });
      await reload();
      onParamsChange?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {selectedNode && <NodeSummaryBar node={selectedNode} items={filteredItems} />}
      <div className="flex-1 overflow-auto min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-[11px] text-slate-500">
            <Loader2 size={12} className="animate-spin mr-1" /> {t('Loading parameters…')}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex items-center justify-center py-6 text-[11px] text-slate-500">{t('No equipment in this scope')}</div>
        ) : (
          <table className="w-full text-[11px]">
            <thead className="sticky top-0 bg-[#07111e] z-10">
              <tr className="border-b border-[#1e3a55]">
                <th className="px-2 py-2 text-left w-6">
                  <input
                    type="checkbox"
                    checked={rows.length > 0 && rows.every((r) => selectedEqIds.has(r.equipment_id))}
                    onChange={() => {
                      const all = rows.every((r) => selectedEqIds.has(r.equipment_id));
                      setSelectedEqIds(all ? new Set() : new Set(rows.map((r) => r.equipment_id)));
                    }}
                    className="w-3 h-3 accent-blue-500"
                  />
                </th>
                <th className="px-2 py-2 text-left text-slate-400 font-medium whitespace-nowrap">{t('Equipment')}</th>
                <th className="px-2 py-2 text-left text-slate-400 font-medium whitespace-nowrap">{t('Operation')}</th>
                <th className="px-2 py-2 text-left text-slate-400 font-medium whitespace-nowrap">{t('Line')}</th>
                {PARAM_COLUMNS.map((c) => (
                  <th key={c.key} className="px-2 py-2 text-right text-slate-400 font-medium whitespace-nowrap">
                    {t(c.label)}<span className="text-[9px] text-slate-500 ml-0.5">{t(c.unit)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const sel = selectedEqIds.has(r.equipment_id);
                return (
                  <tr
                    key={r.equipment_id}
                    className={cn(
                      'border-b border-[#0f1e30] transition-colors',
                      sel ? 'bg-blue-600/10 border-l-2 border-l-blue-500' : 'hover:bg-[#0d2035]/40',
                    )}
                  >
                    <td className="px-2 py-1.5 w-6" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={sel}
                        onChange={() => toggleSelect(r.equipment_id)}
                        className="w-3 h-3 accent-blue-500"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-slate-200 truncate max-w-[150px]" title={r.equipment_label}>{r.equipment_label}</td>
                    <td className="px-2 py-1.5 text-slate-400 truncate max-w-[120px]" title={r.operation_label}>{r.operation_label}</td>
                    <td className="px-2 py-1.5 text-slate-400 truncate max-w-[120px]" title={r.line_label}>{r.line_label}</td>
                    {PARAM_COLUMNS.map((c) => {
                      const p = r.byKey.get(c.key);
                      const editing = editingCell?.eqId === r.equipment_id && editingCell?.key === c.key;
                      const inh = p ? inheritanceStatus(p.source) : 'inherited';
                      return (
                        <td key={c.key} className="px-2 py-1.5 text-right min-w-[80px]">
                          {editing ? (
                            <input
                              ref={inputRef}
                              type="number"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => commitEdit()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitEdit();
                                if (e.key === 'Escape') setEditingCell(null);
                                if (e.key === 'Delete' && editValue === '') commitEdit(true);
                              }}
                              className="w-20 bg-[#07111e] border border-blue-500/60 rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-200 outline-none text-right"
                            />
                          ) : (
                            <div
                              onClick={() => startEdit(r.equipment_id, c.key)}
                              className={cn(
                                'cursor-pointer hover:bg-[#0d2035]/40 rounded px-1.5 py-1 transition-colors group inline-flex items-center justify-end gap-1',
                                inh === 'inherited' ? 'text-slate-400' : 'text-blue-400',
                              )}
                              title={p ? t(sourceLabel(p.source)) : ''}
                            >
                              {inh === 'overridden' && (
                                <span className="text-[8px] font-medium text-blue-500 opacity-70 whitespace-nowrap">{t('Override')}</span>
                              )}
                              <span className="font-mono">{displayValue(p, c)}</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <BatchActionBar
        selectedCount={selectedEqIds.size}
        saving={saving}
        onApply={applyToSelected}
        onClearSelection={() => setSelectedEqIds(new Set())}
      />
    </div>
  );
}

// ── BatchActionBar ─────────────────────────────────────────────────────────

function BatchActionBar({
  selectedCount, saving, onApply, onClearSelection,
}: {
  selectedCount: number;
  saving: boolean;
  onApply: (key: OverrideParamKey, valueStore: number, timeRange?: { start: number | null; end: number | null }) => void;
  onClearSelection: () => void;
}) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [picker, setPicker] = useState<{ key: OverrideParamKey } | null>(null);
  const [val, setVal] = useState('');
  // 时间区间覆盖：start/end 单位为「模拟时长内的小时数」（与后端 time_range_start/end 对齐）
  const [trEnabled, setTrEnabled] = useState(false);
  const [trStart, setTrStart] = useState('');
  const [trEnd, setTrEnd] = useState('');

  const submit = () => {
    if (!picker) return;
    const col = PARAM_KEY_TO_COL[picker.key];
    const n = parseUserInput(val, col);
    if (n === null) return;
    const timeRange = trEnabled
      ? {
          start: trStart.trim() ? Number(trStart) : null,
          end: trEnd.trim() ? Number(trEnd) : null,
        }
      : undefined;
    onApply(picker.key, n, timeRange);
    setPicker(null);
    setVal('');
    setTrEnabled(false);
    setTrStart('');
    setTrEnd('');
    setMenuOpen(false);
  };

  return (
    <div className="flex items-center gap-1.5 px-2 py-2 border-t border-[#142235] bg-[#040d16] flex-shrink-0 flex-wrap">
      <span className="text-[10px] text-slate-500 mr-1">{t('{{count}} selected', { count: selectedCount })}</span>
      <button
        disabled={selectedCount === 0 || saving}
        onClick={() => setMenuOpen((v) => !v)}
        className={cn(
          'text-[10px] px-2 py-1 rounded border transition-colors relative',
          selectedCount > 0 && !saving
            ? 'border-[#1e3a55] text-slate-300 hover:border-blue-500/40 hover:text-blue-300'
            : 'border-[#0f1e30] text-slate-600 cursor-not-allowed',
        )}
      >
        {t('Batch Apply')} ▼
      </button>
      {menuOpen && selectedCount > 0 && (
        <div className="absolute bottom-12 left-2 z-30 bg-[#07111e] border border-[#1e3a55] rounded-lg shadow-xl overflow-hidden min-w-[160px]">
          {PARAM_COLUMNS.map((c) => (
            <button
              key={c.key}
              onClick={() => { setPicker({ key: c.key }); setVal(''); }}
              className="block w-full text-left text-[10px] px-3 py-1.5 text-slate-400 hover:bg-[#0d2035] hover:text-slate-200 transition-colors whitespace-nowrap"
            >
              {t('Apply {{label}} ({{unit}})', { label: t(c.label), unit: t(c.unit) })}
            </button>
          ))}
        </div>
      )}
      {picker && (
        <div className="flex flex-col gap-1 ml-2 bg-[#0a1929] border border-[#1e3a55] rounded px-2 py-1.5">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-slate-400">{t(PARAM_KEY_TO_COL[picker.key].label)}</span>
            <input
              autoFocus
              type="number"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') setPicker(null); }}
              className="w-16 bg-[#07111e] border border-[#1e3a55] rounded px-1.5 py-0.5 text-[10px] font-mono text-slate-200 outline-none text-right"
              placeholder={t(PARAM_KEY_TO_COL[picker.key].unit)}
            />
            <button onClick={submit} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600/50">{t('Apply')}</button>
            <button onClick={() => setPicker(null)} className="text-slate-500 hover:text-slate-300"><X size={10} /></button>
          </div>
          <label className="flex items-center gap-1 text-[10px] text-slate-500">
            <input
              type="checkbox"
              checked={trEnabled}
              onChange={(e) => setTrEnabled(e.target.checked)}
              className="w-3 h-3 accent-blue-500"
            />
            {t('+ Time-range override')}
          </label>
          {trEnabled && (
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <span>T+</span>
              <input
                type="number"
                value={trStart}
                onChange={(e) => setTrStart(e.target.value)}
                placeholder={t('From')}
                className="w-12 bg-[#07111e] border border-[#1e3a55] rounded px-1 py-0.5 text-[10px] font-mono text-slate-200 outline-none text-right"
              />
              <span>h →</span>
              <span>T+</span>
              <input
                type="number"
                value={trEnd}
                onChange={(e) => setTrEnd(e.target.value)}
                placeholder={t('To')}
                className="w-12 bg-[#07111e] border border-[#1e3a55] rounded px-1 py-0.5 text-[10px] font-mono text-slate-200 outline-none text-right"
              />
              <span>h</span>
            </div>
          )}
        </div>
      )}
      {selectedCount > 0 && (
        <button onClick={onClearSelection} className="text-[10px] text-slate-500 hover:text-slate-300 ml-auto">
          {t('Clear Selection')}
        </button>
      )}
      {saving && (
        <span className="text-[10px] text-blue-400 flex items-center gap-1">
          <Loader2 size={10} className="animate-spin" /> {t('Saving')}
        </span>
      )}
    </div>
  );
}

// ── 顶层包装：浮动面板（右侧），含折叠/标题/可关闭 ─────────────────────────

export function FloatingParamTablePanel({
  planId, productCode, tree, selectedNode, onClose, onParamsChange,
}: {
  planId: string;
  productCode?: string | null;
  tree: TreeNode[];
  selectedNode: TreeNode | null;
  onClose: () => void;
  onParamsChange?: () => void;
}) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const title = selectedNode
    ? (selectedNode.type === 'equipment'
        ? t('{{name}} · Parameter Details', { name: selectedNode.label })
        : t('{{name}} · Equipment Parameters', { name: selectedNode.label }))
    : t('All Equipment Parameters');

  return (
    <div
      className="absolute top-3 right-3 z-20 flex flex-col rounded-xl border border-[#1e3a55] bg-[#07111e]/95 backdrop-blur shadow-2xl transition-all overflow-hidden"
      style={{ width: collapsed ? 36 : 720, maxHeight: 'calc(100% - 24px)', height: 'calc(100% - 24px)' }}
    >
      <div className="flex items-center gap-2 px-2.5 py-2 border-b border-[#142235] flex-shrink-0">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="text-slate-500 hover:text-slate-200 transition-colors flex-shrink-0"
        >
          <Sliders size={13} />
        </button>
        {!collapsed && (
          <>
            <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex-1 truncate">{title}</span>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors" title={t('Clear selection')}>
              <X size={11} />
            </button>
          </>
        )}
      </div>
      {!collapsed && (
        <div className="flex-1 overflow-hidden">
          <ParamTable
            planId={planId}
            productCode={productCode}
            tree={tree}
            selectedNode={selectedNode}
            onParamsChange={onParamsChange}
          />
        </div>
      )}
    </div>
  );
}

// 防 lint 报错 — 引入但当前未直接使用的 icon
void AlertCircle; void ChevronDown; void ChevronRight; void filterEffectiveByNode;
