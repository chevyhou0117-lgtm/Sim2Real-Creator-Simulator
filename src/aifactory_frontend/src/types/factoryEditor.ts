import { updateNodeStatusIfChanged } from "../app/utils/statusCalculator";

export type NodeStatus = ProjectBindStatus;

export type ProjectStatus = "DRAFT" | "COMPLETE" | "PUBLISHED" | "ARCHIVED";
export type ProjectBindStatus =
  | "BOUND"
  | "UNBOUND"
  | "BIND_FAILED"
  | "PARTIALLY_BOUND";

export type ProjectType = "FACTORY" | "STAGE" | "LINE" | "EQUIPMENT";

interface FactoryNode {
  id: string;
  name: string;
  type: ProjectType;
  code?: string; // 编码（factory_code, stage_code, line_code, equipment_code）
  primPath?: string; // USD 场景中的 Prim 路径，用于 OV 高亮定位
  detail?: string; // 详情（制程用）
  factoryProjectsId?: string; // 工厂项目ID
  children?: FactoryNode[];
  parentId?: string; // 父节点ID
  bindStatus?: ProjectBindStatus;
  description?: string; // 描述
  thumbnailUrl?: string; // 缩略图URL
  createdAt?: string; // 创建时间
  updatedAt?: string; // 更新时间
  // i18n 翻译字段（后端通过 Accept-Language: en 注入）
  name_en?: string;
  description_en?: string;
}
// ── Types ──────────────────────────────────────────────────────────────────

export type RightTab = "base" | "iot" | "events" | "monitoring" | "metrics";
export type ViewMode = "floor" | "line" | "equipment";

export type USDFileFormat = "usd" | "usda" | "usdc" | "usdz" | "zip"; // | "folder"
export interface USDFile {
  id: string;
  name: string;
  size: number; // MB
  format: USDFileFormat;
  uploadedAt: string;
  status: "uploaded" | "linked";
  uploadStatus?: "uploading" | "completed" | "error";
  progress?: number; // 0-100, present while uploading
}

export type BindingType =
  | "BASIC_DATA"
  | "LEDGER"
  | "IOT"
  | "EVENTS"
  | "MONITOR"
  | "METRICS";

export type BindingRecord = {
  externalId: string;
  externalName: string;
  sourceSystem: string;
  lastSync: string;
  status: ProjectBindStatus;
  errorMessage?: string;
  missingFields?: string[];
};

export type PlatformRecord = {
  id: string;
  code: string;
  name: string;
  type: "LINE" | "EQUIPMENT";
  process?: string;
  parentLineId?: string;
  fields?: Record<string, { label: string; value: string }>;
};

export type ConflictField = {
  field: string;
  label: string;
  localValue: string;
  platformValue: string;
};

export type ConflictModalState = {
  nodeId: string;
  platformRecord: PlatformRecord;
  conflicts: ConflictField[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

export function findNode(tree: FactoryNode, id: string): FactoryNode | null {
  if (tree.id === id) return tree;
  for (const child of tree.children ?? []) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

/** Returns path from root to targetId (inclusive). Empty array if not found. */
export function getNodePath(
  root: FactoryNode,
  targetId: string,
): FactoryNode[] {
  if (root.id === targetId) return [root];
  for (const child of root.children ?? []) {
    const path = getNodePath(child, targetId);
    if (path.length > 0) return [root, ...path];
  }
  return [];
}

/** Returns the parent line node id for a given equipment node id, or null. */
export function findParentLine(
  tree: FactoryNode,
  equipmentId: string,
): string | null {
  for (const child of tree.children ?? []) {
    if (child.type === "LINE") {
      if ((child.children ?? []).some((eq) => eq.id === equipmentId))
        return child.id;
    } else {
      const found = findParentLine(child, equipmentId);
      if (found) return found;
    }
  }
  return null;
}

/** Returns a new tree with the target node's status replaced (deep clone). */
export function updateNodeStatus(
  tree: FactoryNode,
  nodeId: string,
  newStatus: FactoryNode["bindStatus"],
): FactoryNode {
  if (tree.id === nodeId) return { ...tree, bindStatus: newStatus };
  if (!tree.children) return tree;
  return {
    ...tree,
    children: tree.children.map((c) => updateNodeStatus(c, nodeId, newStatus)),
  };
}

/** Update node data and recalculate status. */
export function updateNodeData(
  tree: FactoryNode,
  nodeId: string,
  updates: Partial<FactoryNode>,
): FactoryNode {
  const updatedTree = updateNode(tree, nodeId, (node) => ({
    ...node,
    ...updates,
  }));
  return updateNodeStatusIfChanged(updatedTree, nodeId);
}

/** Helper to update a node with a transformation function. */
export function updateNode(
  tree: FactoryNode,
  nodeId: string,
  updater: (node: FactoryNode) => FactoryNode,
): FactoryNode {
  if (tree.id === nodeId) return updater(tree);
  if (!tree.children) return tree;
  return {
    ...tree,
    children: tree.children.map((c) => updateNode(c, nodeId, updater)),
  };
}

// ── Constants ──────────────────────────────────────────────────────────────

export const NODE_STATUS_TEXT: Record<string, string> = {
  BOUND: "已配置：节点所有必需属性已完整配置",
  UNBOUND: "未配置：节点尚未配置任何属性",
  BIND_FAILED: "配置错误：节点配置存在错误或验证失败，需要修复",
  PARTIALLY_BOUND: "部分配置：节点有部分属性未配置",
};

export const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  DRAFT: {
    label: "Draft",
    cls: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  },
  COMPLETE: {
    label: "Completed",
    cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  },
  PUBLISHED: {
    label: "Published",
    cls: "bg-blue-500/20 text-blue-400 border-blue-500/40",
  },
  ARCHIVED: {
    label: "Archived",
    cls: "bg-slate-500/20 text-slate-400 border-slate-500/40",
  },
};

export const PLATFORM_RECORDS: PlatformRecord[] = [
  // {
  //   id: "plt-l-001",
  //   code: "SMT-01-HOU",
  //   name: "SMT01号线",
  //   entityType: "line",
  //   process: "SMT制程",
  //   fields: {},
  // },
  // {
  //   id: "plt-l-002",
  //   code: "SMT-02-HOU",
  //   name: "SMT02号线",
  //   entityType: "line",
  //   process: "SMT制程",
  //   fields: {},
  // },
  // {
  //   id: "plt-l-003",
  //   code: "ASSY-01-HOU",
  //   name: "ASSY组装线01号",
  //   entityType: "line",
  //   process: "ASSY制程",
  //   fields: {},
  // },
  // {
  //   id: "plt-e-001",
  //   code: "DEK-NHZ-001",
  //   name: "DEK全自动印刷机#1",
  //   entityType: "equipment",
  //   parentLineId: "smt02-line",
  //   fields: {
  //     EQUIP_CODE: { label: "所属产线", value: "SMT01号线" },
  //     STATUS: { label: "设备状态", value: "运行中" },
  //     INSTALL_DATE: { label: "安装日期", value: "2025.12.20" },
  //   },
  // },
  // {
  //   id: "plt-e-002",
  //   code: "JUKI-FX-001",
  //   name: "JUKI高速贴片机#1",
  //   entityType: "equipment",
  //   parentLineId: "smt02-line",
  //   fields: {
  //     EQUIP_CODE: { label: "所属产线", value: "SMT01号线" },
  //     STATUS: { label: "设备状态", value: "运行中" },
  //     INSTALL_DATE: { label: "安装日期", value: "2025.11.15" },
  //   },
  // },
  // {
  //   id: "plt-e-003",
  //   code: "KE-RSF-001",
  //   name: "Kurtz Ersa回流焊炉#1",
  //   entityType: "equipment",
  //   parentLineId: "smt02-line",
  //   fields: {
  //     EQUIP_CODE: { label: "所属产线", value: "SMT01号线" },
  //     STATUS: { label: "设备状态", value: "维保中" },
  //     INSTALL_DATE: { label: "安装日期", value: "2025.12.20" },
  //   },
  // },
  // {
  //   id: "plt-e-004",
  //   code: "DEK-NHZ-002",
  //   name: "DEK全自动印刷机#2",
  //   entityType: "equipment",
  //   parentLineId: "smt01-line",
  //   fields: {
  //     EQUIP_CODE: { label: "所属产线", value: "SMT01号线" },
  //     STATUS: { label: "设备状态", value: "运行中" },
  //     INSTALL_DATE: { label: "安装日期", value: "2025.12.10" },
  //   },
  // },
  // {
  //   id: "plt-e-005",
  //   code: "DEK-NHZ-003",
  //   name: "DEK全自动印刷机#3",
  //   entityType: "equipment",
  //   parentLineId: "smt01-line",
  //   fields: {
  //     EQUIP_CODE: { label: "所属产线", value: "SMT01号线" },
  //     STATUS: { label: "设备状态", value: "运行中" },
  //     INSTALL_DATE: { label: "安装日期", value: "2025.12.12" },
  //   },
  // },
  // {
  //   id: "plt-e-006",
  //   code: "JUKI-FX-002",
  //   name: "JUKI高速贴片机#2",
  //   entityType: "equipment",
  //   parentLineId: "smt01-line",
  //   fields: {
  //     EQUIP_CODE: { label: "所属产线", value: "SMT01号线" },
  //     STATUS: { label: "设备状态", value: "运行中" },
  //     INSTALL_DATE: { label: "安装日期", value: "2025.11.10" },
  //   },
  // },
  // {
  //   id: "plt-e-007",
  //   code: "JUKI-FX-003",
  //   name: "JUKI高速贴片机#3",
  //   entityType: "equipment",
  //   parentLineId: "smt01-line",
  //   fields: {
  //     EQUIP_CODE: { label: "所属产线", value: "SMT01号线" },
  //     STATUS: { label: "设备状态", value: "运行中" },
  //     INSTALL_DATE: { label: "安装日期", value: "2025.11.12" },
  //   },
  // },
];

export const INITIAL_BINDING_MAP: Record<string, BindingRecord> = {};

export function detectConflicts(record: PlatformRecord): ConflictField[] {
  // if (record.id === "plt-l-001") {
  //   return [
  //     {
  //       field: "MAX_UPH",
  //       label: "最大 UPH",
  //       localValue: "1200 pcs/h",
  //       platformValue: "1350 pcs/h",
  //     },
  //   ];
  // }
  // if (record.id === "plt-e-003") {
  //   return [
  //     {
  //       field: "EQUIP_NAME",
  //       label: "设备名称",
  //       localValue: "Reflow Soldering Furnace",
  //       platformValue: "Kurtz Ersa HOTFLOW 3/20",
  //     },
  //   ];
  // }
  return [];
}
