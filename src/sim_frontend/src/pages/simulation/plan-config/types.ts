/** PlanConfigPage 共享类型与常量。
 *
 * 资产树是 5 级真层级：factory → stage → line → operation → equipment。
 * 参数继承表的 source 二值化：'inherited' (BASELINE_*) / 'overridden' (OVERRIDE_*)。 */

import type { EffectiveParam, EffectiveParamSource, OverrideParamKey } from '@/types/api';

export type NodeType = 'factory' | 'stage' | 'line' | 'operation' | 'equipment' | 'group' | 'agv' | 'material';
export type NodeStatus = 'normal' | 'warning' | 'bottleneck' | 'idle';

export interface TreeNode {
  id: string;
  label: string;
  sublabel?: string;
  type: NodeType;
  status?: NodeStatus;
  children?: TreeNode[];

  // Equipment / Operation 节点专用（用于 Kit 视角与 BoP 查询）
  prim_path?: string;
  operation_id?: string;
  line_id?: string;
  stage_id?: string;
  factory_id?: string;
  // BoP 工序 id（per line × product × operation）；equipment 节点继承自所属 operation
  bop_process_id?: string;

  // 方案快照机制 PRD §2.1.x：
  //   null/undefined = 主数据（canonical，所有方案共享）
  //   plan_id      = 方案专属副本/新增（用户在本方案内增删改后的状态）
  plan_scope?: string | null;
}

export interface ParamColumn {
  key: OverrideParamKey;
  label: string;
  unit: string;
  // 数值显示精度
  digits?: number;
  // 输入 → 存储变换（如 "%" → 0-1）
  uiToStore?: (n: number) => number;
  // 存储 → 显示变换（如 0-1 → "%"）
  storeToUi?: (n: number) => number;
}

/** 6 个参数列定义。
 * yield_rate / efficiency 在后端以 0-1 小数存储；UI 显示为百分比。 */
export const PARAM_COLUMNS: ParamColumn[] = [
  { key: 'ct',           label: 'CT',         unit: 's',      digits: 1 },
  { key: 'yield_rate',   label: 'Yield Rate', unit: '%',      digits: 1,
    uiToStore: (n) => n / 100, storeToUi: (n) => n * 100 },
  { key: 'efficiency',   label: 'Efficiency', unit: '%',      digits: 1,
    uiToStore: (n) => n / 100, storeToUi: (n) => n * 100 },
  { key: 'mtbf',         label: 'MTBF',       unit: 'h',      digits: 0 },
  { key: 'mttr',         label: 'MTTR',       unit: 'min',    digits: 0 },
  { key: 'worker_count', label: 'Headcount',  unit: 'people', digits: 0 },
];

export const PARAM_KEY_TO_COL: Record<OverrideParamKey, ParamColumn> =
  Object.fromEntries(PARAM_COLUMNS.map((c) => [c.key, c])) as Record<OverrideParamKey, ParamColumn>;

/** 把 EffectiveParam.source 二值化用于 UI 显示。 */
export function inheritanceStatus(src: EffectiveParamSource): 'inherited' | 'overridden' {
  return src.startsWith('OVERRIDE_') ? 'overridden' : 'inherited';
}

/** 把 source 翻成中文标签，hover 显示。 */
export function sourceLabel(src: EffectiveParamSource): string {
  switch (src) {
    case 'OVERRIDE_EQUIPMENT':   return 'Override (Equipment)';
    case 'OVERRIDE_OPERATION':   return 'Override (Operation)';
    case 'OVERRIDE_BOP_PROCESS': return 'Override (BoP Process)';
    case 'OVERRIDE_LINE':        return 'Override (Line)';
    case 'OVERRIDE_STAGE':       return 'Override (Stage)';
    case 'OVERRIDE_GLOBAL':      return 'Override (Global)';
    case 'BASELINE_EQUIPMENT':   return 'Inherited (Equipment Baseline)';
    case 'BASELINE_BOP_PROCESS': return 'Inherited (BoP Process)';
    case 'BASELINE_FAILURE_PARAM': return 'Inherited (Equipment Failure Params)';
    case 'BASELINE_DEFAULT':     return 'Inherited (Default)';
    default:                      return src;
  }
}

/** 给定一组 EffectiveParam（per equipment × 6 个 key），按 equipment_id 索引。 */
export type EffectiveParamMap = Map<string, Map<OverrideParamKey, EffectiveParam>>;

export function indexEffectiveParams(items: EffectiveParam[]): EffectiveParamMap {
  const m: EffectiveParamMap = new Map();
  for (const it of items) {
    if (!m.has(it.equipment_id)) m.set(it.equipment_id, new Map());
    m.get(it.equipment_id)!.set(it.param_key, it);
  }
  return m;
}

/** 视口产线渲染（简化版，2D mock 时用）。 */
export interface ViewportMachine {
  id: string;
  label: string;
  ct: string;
  status: NodeStatus;
}

export interface ViewportLine {
  id: string;
  label: string;
  machines: ViewportMachine[];
}
