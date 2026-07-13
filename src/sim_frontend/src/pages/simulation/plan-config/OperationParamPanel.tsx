/** 工序级参数面板（取代旧 ParamTable 按设备聚合）。
 *
 * 两个外部组件：
 *   - OperationParamTable —— 产线齿轮触发：横向表格，行 = line 下的每个工序，列 = 5 个参数
 *   - OperationParamForm  —— 工序齿轮触发：单工序，5 个参数竖向排列，面板更窄
 *
 * 产品选择：
 *   - 顶部 dropdown：「全部」+ 当前线在 plan 中投产的产品列表
 *   - 选「全部」 → effective-params 不传 product_code（每条线默认第一个激活 BoP）→ override 写
 *     OPERATION scope（对所有产品生效）
 *   - 选具体产品 → effective-params 传该 product_code → override 写 BOP_PROCESS scope（仅该产品生效），
 *     scope_id = EffectiveParam.bop_process_id
 *
 * 编辑写入用 batchUpsertOverrides；空值 = 删除 override 恢复基线。 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

import { planApi, masterApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { EffectiveParam, OverrideParamKey, OverrideScope } from '@/types/api';

import { PARAM_KEY_TO_COL, sourceLabel, inheritanceStatus, type ParamColumn, type TreeNode } from './types';
import { findNode } from './asset-tree-builder';

// 工序参数面板：线体/工序级只展示 CT，其余（yield_rate/efficiency/mtbf/mttr）暂不显示
const OP_PARAM_KEYS: OverrideParamKey[] = ['ct'];
const OP_PARAM_COLUMNS: ParamColumn[] = OP_PARAM_KEYS.map((k) => PARAM_KEY_TO_COL[k]).filter(Boolean);

const ALL_PRODUCTS = '__ALL__';

interface OperationAggregate {
  operation_id: string;
  operation_label: string;
  /** 该工序所有设备的 effective param（取代表值：所有设备同 BoP_PROCESS 下值一致；
   *  若被 EQUIPMENT 级 override 个性化，仍取第一台并在 UI 上标记） */
  byKey: Map<OverrideParamKey, EffectiveParam>;
  /** 该工序下的 bop_process_id（来自 effective-params；产品=ALL 时也可能拿到 first BoP 的 id） */
  bop_process_id: string | null;
}

/** 共用数据 hook：拉 effective-params + 过滤 + 按 operation 聚合 + 提供写入。 */
function useOperationParams(
  planId: string,
  lineId: string | undefined,
  productCode: string,            // ALL_PRODUCTS or 具体 product_code
  operationIds: string[],         // 关心的 operation_id 集合（line 视图=所有；operation 视图=单个）
  tree: TreeNode[],
  onParamsChange?: () => void,
) {
  const [items, setItems] = useState<EffectiveParam[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!planId) return;
    setLoading(true);
    try {
      const res = await planApi.effectiveParams(
        planId,
        productCode === ALL_PRODUCTS ? undefined : productCode,
      );
      setItems(res.items);
    } catch (err) {
      console.error('[OperationParams] load failed', err);
    } finally {
      setLoading(false);
    }
  }, [planId, productCode]);

  useEffect(() => { reload(); }, [reload]);

  const aggregates = useMemo<OperationAggregate[]>(() => {
    const opIdSet = new Set(operationIds);
    // 过滤：只保留关心的 (line, operation) 子集
    const filtered = items.filter((it) =>
      (lineId ? it.line_id === lineId : true) && opIdSet.has(it.operation_id),
    );
    // 按 operation_id group；取每组第一台设备的 EffectiveParam 作代表
    const byOp = new Map<string, OperationAggregate>();
    for (const it of filtered) {
      let agg = byOp.get(it.operation_id);
      if (!agg) {
        // 工序节点 id 是 "line_id::operation_id" 复合，按真 op_id 找不到 → 重建复合 id
        const opCompositeId = `${it.line_id}::${it.operation_id}`;
        const node = findNode(tree, opCompositeId);
        agg = {
          operation_id: it.operation_id,
          operation_label: node?.label ?? it.operation_id.slice(0, 8),
          byKey: new Map(),
          bop_process_id: it.bop_process_id,
        };
        byOp.set(it.operation_id, agg);
      }
      // 同一 (op, param_key) 多台设备只取第一条；BoP_PROCESS 级值对全设备一致
      if (!agg.byKey.has(it.param_key)) agg.byKey.set(it.param_key, it);
    }
    // 按 tree 中工序顺序排序（树已按 sequence 排）
    const order = new Map<string, number>();
    operationIds.forEach((id, i) => order.set(id, i));
    return [...byOp.values()].sort(
      (a, b) => (order.get(a.operation_id) ?? 0) - (order.get(b.operation_id) ?? 0),
    );
  }, [items, lineId, operationIds, tree]);

  /** 写一个参数值。空 paramValue 表示删 override 恢复基线。 */
  const writeParam = useCallback(async (
    opAgg: OperationAggregate,
    key: OverrideParamKey,
    rawValue: string,
  ) => {
    const col = PARAM_KEY_TO_COL[key];
    let paramValue = '';
    if (rawValue.trim() !== '') {
      const n = parseFloat(rawValue.trim());
      if (!Number.isFinite(n)) return;
      const stored = col.uiToStore ? col.uiToStore(n) : n;
      paramValue = String(stored);
    }
    // 选「全部」走 OPERATION scope；选具体产品走 BOP_PROCESS（需有 bop_process_id）
    let scope: OverrideScope;
    let scopeId: string;
    if (productCode === ALL_PRODUCTS) {
      scope = 'OPERATION';
      scopeId = opAgg.operation_id;
    } else {
      if (!opAgg.bop_process_id) {
        console.warn('[OperationParams] 选中产品但拿不到 bop_process_id，无法写 BOP_PROCESS scope');
        return;
      }
      scope = 'BOP_PROCESS';
      scopeId = opAgg.bop_process_id;
    }
    setSaving(true);
    try {
      await planApi.batchUpsertOverrides(planId, {
        items: [{
          scope_type: scope,
          scope_id: scopeId,
          param_key: key,
          param_value: paramValue,
        }],
      });
      await reload();
      onParamsChange?.();
    } catch (err) {
      console.error('[OperationParams] write failed', err);
    } finally {
      setSaving(false);
    }
  }, [planId, productCode, reload, onParamsChange]);

  return { aggregates, loading, saving, writeParam };
}

/** 拉某 line 当前激活 BoP 涉及的全部 product_code（不依赖 plan_tasks）。 */
function useLineProducts(lineId: string | undefined, planId: string): string[] {
  const [products, setProducts] = useState<string[]>([]);
  useEffect(() => {
    if (!lineId) { setProducts([]); return; }
    let alive = true;
    masterApi.lineProducts(lineId, planId)
      .then((arr) => { if (alive) setProducts(arr); })
      .catch(() => { if (alive) setProducts([]); });
    return () => { alive = false; };
  }, [lineId, planId]);
  return products;
}

// ── 产品 dropdown ─────────────────────────────────────────────────────────────

function ProductSelect({
  productCodes, value, onChange,
}: {
  productCodes: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-[var(--c-040d16)] border border-[var(--c-142235)] rounded text-[11px] text-slate-200 px-2 py-1 focus:outline-none focus:border-blue-500/40"
      title={t("Select 'All' to write an OPERATION-level override (applies to all products); select a specific product to write a BOP_PROCESS-level override (that product only)")}
    >
      <option value={ALL_PRODUCTS}>{t('All (OPERATION level)')}</option>
      {productCodes.map((p) => (
        <option key={p} value={p}>{p}</option>
      ))}
    </select>
  );
}

// ── 单元格（共用） ───────────────────────────────────────────────────────────

function ParamCell({
  param, col, onCommit, disabled,
}: {
  param: EffectiveParam | undefined;
  col: ParamColumn;
  onCommit: (raw: string) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const valueDisplay = (() => {
    if (!param || param.value == null) return '—';
    const v = col.storeToUi ? col.storeToUi(Number(param.value)) : Number(param.value);
    return v.toFixed(col.digits ?? 1);
  })();
  const overridden = param ? inheritanceStatus(param.source) === 'overridden' : false;

  const start = () => {
    if (disabled) return;
    if (param && param.value != null) {
      const v = col.storeToUi ? col.storeToUi(Number(param.value)) : Number(param.value);
      setDraft(v.toFixed(col.digits ?? 1));
    } else {
      setDraft('');
    }
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    onCommit(draft);
  };
  const cancel = () => setEditing(false);

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
        }}
        className="w-full bg-[var(--c-020a12)] border border-blue-500/60 rounded px-1.5 py-0.5 text-[11px] font-mono text-slate-100 text-right focus:outline-none"
      />
    );
  }
  return (
    <button
      onClick={start}
      disabled={disabled}
      title={param ? t(sourceLabel(param.source)) : '—'}
      className={cn(
        'w-full text-right font-mono text-[11px] px-1.5 py-0.5 rounded transition-colors',
        overridden ? 'text-blue-300 hover:bg-blue-500/10' : 'text-slate-300 hover:bg-[var(--c-0d2035)]/60',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {valueDisplay}
      <span className="text-[9px] text-slate-600 ml-0.5">{t(col.unit)}</span>
    </button>
  );
}

// ── OperationParamTable: 产线齿轮用，横向表格 ────────────────────────────────

interface CommonProps {
  planId: string;
  tree: TreeNode[];
  defaultProductCode?: string | null;       // 父级默认偏好（首次进入用）
  onParamsChange?: () => void;
}

export function OperationParamTable({
  planId, lineNode, tree, defaultProductCode, onParamsChange,
}: CommonProps & { lineNode: TreeNode }) {
  const { t } = useTranslation();
  const [productCode, setProductCode] = useState<string>(defaultProductCode ?? ALL_PRODUCTS);
  // 拉 BoP 表里该 line 关联的全部产品（不靠 plan_tasks，避免 DRAFT 阶段下拉为空）
  const productCodes = useLineProducts(lineNode.line_id, planId);

  // 收集该 line 下所有 operation_id（按树的 children 顺序）
  // 注意：工序节点 node.id 是 "line_id::op_id" 复合，真正的 op_id 在 node.operation_id 字段
  const operationIds = useMemo(() => {
    const ids: string[] = [];
    const visit = (n: TreeNode) => {
      if (n.type === 'operation' && n.operation_id) ids.push(n.operation_id);
      n.children?.forEach(visit);
    };
    visit(lineNode);
    return ids;
  }, [lineNode]);

  const { aggregates, loading, saving, writeParam } = useOperationParams(
    planId, lineNode.line_id, productCode, operationIds, tree, onParamsChange,
  );

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--c-142235)] flex-shrink-0">
        <span className="text-[10px] text-slate-500">{t('Product')}</span>
        <ProductSelect productCodes={productCodes} value={productCode} onChange={setProductCode} />
        {saving && <Loader2 size={11} className="text-blue-400 animate-spin" />}
        <span className="flex-1" />
        <span className="text-[10px] text-slate-500">{t('{{count}} operations', { count: aggregates.length })}</span>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-500 text-[11px] gap-2">
            <Loader2 size={12} className="animate-spin" /> {t('Loading…')}
          </div>
        ) : aggregates.length === 0 ? (
          <div className="px-3 py-6 text-center text-[11px] text-slate-500">
            {t('No available BoP operations for this line under the selected product')}
          </div>
        ) : (
          <table className="w-full text-[11px] table-fixed">
            <thead className="sticky top-0 z-10 bg-[var(--c-07111e)]/85 backdrop-blur">
              <tr className="border-b border-[var(--c-142235)] text-slate-500 text-[10px]">
                <th className="text-left px-3 py-1.5 w-[40%]">{t('Operation')}</th>
                {OP_PARAM_COLUMNS.map((c) => (
                  <th key={c.key} className="text-right px-2 py-1.5">{t(c.label)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {aggregates.map((agg, i) => (
                <tr key={agg.operation_id} className={cn('border-b border-[var(--c-0e1e2e)]/60', i % 2 === 1 && 'bg-[var(--c-0a1929)]/30')}>
                  <td className="px-3 py-1 truncate text-slate-300" title={agg.operation_label}>{agg.operation_label}</td>
                  {OP_PARAM_COLUMNS.map((col) => (
                    <td key={col.key} className="px-1 py-0.5">
                      <ParamCell
                        param={agg.byKey.get(col.key)}
                        col={col}
                        disabled={saving}
                        onCommit={(raw) => writeParam(agg, col.key, raw)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── OperationParamForm: 工序齿轮用，竖向单工序 ───────────────────────────────

export function OperationParamForm({
  planId, operationNode, tree, defaultProductCode, onParamsChange,
}: CommonProps & { operationNode: TreeNode }) {
  const { t } = useTranslation();
  const [productCode, setProductCode] = useState<string>(defaultProductCode ?? ALL_PRODUCTS);
  const productCodes = useLineProducts(operationNode.line_id, planId);
  // operationNode.id 是 "line_id::op_id" 复合 id；真正 op_id 在 .operation_id 字段
  const operationIds = useMemo(
    () => [operationNode.operation_id ?? operationNode.id],
    [operationNode.operation_id, operationNode.id],
  );
  const lineId = operationNode.line_id;
  const { aggregates, loading, saving, writeParam } = useOperationParams(
    planId, lineId, productCode, operationIds, tree, onParamsChange,
  );
  const agg = aggregates[0];

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--c-142235)] flex-shrink-0">
        <span className="text-[10px] text-slate-500">{t('Product')}</span>
        <ProductSelect productCodes={productCodes} value={productCode} onChange={setProductCode} />
        {saving && <Loader2 size={11} className="text-blue-400 animate-spin" />}
      </div>
      <div className="flex-1 overflow-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-500 text-[11px] gap-2">
            <Loader2 size={12} className="animate-spin" /> {t('Loading…')}
          </div>
        ) : !agg ? (
          <div className="text-[11px] text-slate-500">{t('No available BoP for this operation under the selected product')}</div>
        ) : (
          <div className="flex flex-col gap-3 max-w-[260px]">
            <div className="text-[10px] text-slate-400 truncate" title={agg.operation_label}>
              <span className="text-slate-600">{t('Operation')}</span> · {agg.operation_label}
            </div>
            {OP_PARAM_COLUMNS.map((col) => (
              <div key={col.key} className="flex items-center gap-2">
                <label className="text-[11px] text-slate-400 w-16 shrink-0">
                  {t(col.label)} <span className="text-[9px] text-slate-600">{t(col.unit)}</span>
                </label>
                <div className="flex-1">
                  <ParamCell
                    param={agg.byKey.get(col.key)}
                    col={col}
                    disabled={saving}
                    onCommit={(raw) => writeParam(agg, col.key, raw)}
                  />
                </div>
              </div>
            ))}
            <div className="text-[9px] text-slate-600 mt-2 leading-tight">
              {t('Click a cell to edit; leave empty and press Enter = remove the override and restore the baseline value')}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
