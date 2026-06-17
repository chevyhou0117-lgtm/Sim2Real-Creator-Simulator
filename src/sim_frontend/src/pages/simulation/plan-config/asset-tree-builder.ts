/** 从后端 master_api 拉数据，构造 5 级资产树：
 * factory → stage → line → operation → equipment。
 *
 * BoP 是 per (line, product)，所以同一台 equipment 在不同产品视图下可能有不同的 bop_process_id；
 * 此处用 `selectedProductByLine` 决定每条线显示哪个产品的 BoP（默认每条线第一个激活 BoP）。 */

import { masterApi } from '@/lib/api';
import type {
  BopProcessOut,
  EquipmentOut,
  OperationOut,
  StageOut,
} from '@/types/api';

import type { NodeStatus, TreeNode, ViewportLine } from './types';

export interface AssetTreeResult {
  tree: TreeNode[];                                 // 单根 factory 节点
  viewport: ViewportLine[];                         // 2D 视口渲染数据
  defaultExpandIds: string[];                       // 默认展开节点（factory + 所有 stage + 第一条 line）
  /** line_id → 该线在 plan 中可投产的 product_code 列表（来自 tasks）。 */
  lineProductsByLine: Map<string, string[]>;
}

export async function buildAssetTree(opts: {
  factoryId: string;
  factoryName: string;
  /** plan 内各条产线分配的产品列表，用于决定 BoP 视图。 */
  lineProductsByLine: Map<string, string[]>;
  /** 每条线当前选中的产品（不指定时取 lineProductsByLine 第一个）。 */
  selectedProductByLine: Map<string, string>;
  /** 当前 planId（用于拉 plan-scoped 主数据视图：包含方案快照 + 主数据兜底）。 */
  planId?: string;
}): Promise<AssetTreeResult> {
  const { factoryId, factoryName, lineProductsByLine, selectedProductByLine, planId } = opts;

  const stages: StageOut[] = await masterApi.stages(factoryId, planId);
  stages.sort((a, b) => a.sequence - b.sequence);

  const stageNodes: TreeNode[] = [];
  const viewport: ViewportLine[] = [];
  const defaultExpandIds: string[] = ['factory', ...stages.map((s) => s.stage_id)];
  let firstLineId: string | null = null;

  for (const stage of stages) {
    const lines = await masterApi.lines(stage.stage_id, planId);
    lines.sort((a, b) => a.line_code.localeCompare(b.line_code));

    const lineNodes: TreeNode[] = [];
    for (const line of lines) {
      if (firstLineId === null) {
        firstLineId = line.line_id;
        defaultExpandIds.push(line.line_id);
      }
      // 拉 op + equipment（并行）
      const ops: OperationOut[] = await masterApi.operations(line.line_id, planId);
      ops.sort((a, b) => a.sequence - b.sequence);

      // 该线当前选中的产品 → BoP 工序映射（operation_id → BOPProcess）
      const productCode =
        selectedProductByLine.get(line.line_id) ?? lineProductsByLine.get(line.line_id)?.[0];
      let bopProcByOp = new Map<string, BopProcessOut>();
      if (productCode) {
        try {
          const bop = await masterApi.bop(line.line_id, productCode, planId);
          if (bop) {
            bopProcByOp = new Map(bop.processes.map((p) => [p.operation_id, p]));
          }
        } catch {
          /* 该线在该产品下无激活 BoP — 留空 map */
        }
      }

      // 并行拉每个 op 的设备（按 line 过滤）
      const eqLists = await Promise.all(
        ops.map((op) => masterApi.equipment(op.operation_id, line.line_id, planId).catch(() => [] as EquipmentOut[])),
      );

      const opNodes: TreeNode[] = [];
      const machinesForViewport: ViewportLine['machines'] = [];

      // 注意：节点的 status（含 bottleneck）不在这里计算，由 AssetSidebar 基于
      // effective-params 端点的运行时数据动态推导。资产树构造只负责拓扑 + ID 关系。
      for (let i = 0; i < ops.length; i++) {
        const op = ops[i];
        const proc = bopProcByOp.get(op.operation_id);
        const eqs = eqLists[i];

        const equipmentNodes: TreeNode[] = eqs.map((eq) => {
          machinesForViewport.push({
            id: eq.equipment_id,
            label: eq.equipment_name,
            ct: eq.standard_ct != null ? `${Number(eq.standard_ct)}s` : '—',
            status: 'normal',
          });
          return {
            id: eq.equipment_id,
            label: eq.equipment_name,
            sublabel: eq.equipment_code,
            type: 'equipment' as const,
            status: 'normal' as NodeStatus,
            prim_path: eq.creator_binding_id ?? undefined,
            operation_id: op.operation_id,
            line_id: line.line_id,
            stage_id: stage.stage_id,
            factory_id: factoryId,
            bop_process_id: proc?.bop_process_id,
            plan_scope: eq.plan_id,
          };
        });

        opNodes.push({
          // 同一 stage 下多条线共享同一个 operation_id（Operation 表挂在 stage），
          // 工序 node.id 若直接用 operation_id 会在 SMT1/SMT2 两线下重复 → findNode
          // 永远只返回第一份 → 点 SMT2 工序高亮的是 SMT1 设备。改复合 id 唯一化；
          // 真正的 operation_id 仍存在 .operation_id 字段（按 op 匹配的地方走它）。
          id: `${line.line_id}::${op.operation_id}`,
          // 优先用中文名；为空 / 后端未提供时 fallback 用 operation_name（多为英文）
          label: op.operation_name_cn || op.operation_name,
          sublabel: op.operation_code,
          type: 'operation' as const,
          status: 'normal' as NodeStatus,
          children: equipmentNodes,
          operation_id: op.operation_id,
          line_id: line.line_id,
          stage_id: stage.stage_id,
          factory_id: factoryId,
          bop_process_id: proc?.bop_process_id,
          plan_scope: op.plan_id,
        });
      }

      lineNodes.push({
        id: line.line_id,
        label: line.line_name,
        sublabel: line.line_code,
        type: 'line' as const,
        status: 'normal',
        children: opNodes,
        line_id: line.line_id,
        stage_id: stage.stage_id,
        factory_id: factoryId,
        plan_scope: line.plan_id,
      });

      viewport.push({
        id: line.line_id,
        label: line.line_name,
        machines: machinesForViewport.slice(0, 8),
      });
    }

    stageNodes.push({
      id: stage.stage_id,
      label: stage.stage_name,
      sublabel: stage.stage_code,
      type: 'stage' as const,
      status: 'normal',
      children: lineNodes,
      stage_id: stage.stage_id,
      factory_id: factoryId,
      plan_scope: stage.plan_id,
    });
  }

  const tree: TreeNode[] = [{
    id: 'factory',
    label: factoryName,
    type: 'factory' as const,
    status: 'normal',
    children: stageNodes,
    factory_id: factoryId,
  }];

  return { tree, viewport, defaultExpandIds, lineProductsByLine };
}

/** 在树里按 id 找节点（DFS）。 */
export function findNode(tree: TreeNode[], id: string): TreeNode | null {
  for (const n of tree) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

/** 把节点子树下所有 equipment_id 收集出来。 */
export function collectEquipmentIds(node: TreeNode): string[] {
  if (node.type === 'equipment') return [node.id];
  if (!node.children) return [];
  return node.children.flatMap(collectEquipmentIds);
}

/** 把节点子树下所有 equipment 的 USD prim_path 收集出来（去空）。
 *  点击产线/工序节点时用它拿到该层级下全部设备 prim，交给 Kit 批量高亮。 */
export function collectEquipmentPrimPaths(node: TreeNode): string[] {
  if (node.type === 'equipment') return node.prim_path ? [node.prim_path] : [];
  if (!node.children) return [];
  return node.children.flatMap(collectEquipmentPrimPaths);
}

/** 按节点类型返回 effective-params 过滤的 equipment 子集。 */
export function filterEffectiveByNode(
  eqIds: string[],
  selectedNode: TreeNode | null,
): string[] {
  if (!selectedNode) return eqIds;
  const targetSet = new Set(collectEquipmentIds(selectedNode));
  if (targetSet.size === 0) return [];
  return eqIds.filter((id) => targetSet.has(id));
}
