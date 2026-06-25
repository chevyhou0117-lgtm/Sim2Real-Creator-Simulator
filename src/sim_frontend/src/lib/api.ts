import type {
  BopOut,
  ConstraintOut,
  CreatorProjectOut,
  EffectiveParamsOut,
  EquipmentFailureParamOut,
  EquipmentOut,
  FactoryOut,
  ImportCommitResult,
  ImportValidationResult,
  InventorySnapshotOut,
  LineBalanceOut,
  LineEquipmentConfigOut,
  LineOut,
  MaterialSupplyOut,
  OperationOut,
  OperationTransitionOut,
  OverrideBatchUpsert,
  OverrideOut,
  OverrideUpsert,
  PlanCreate,
  PlanOut,
  PlanUpdate,
  ProductOut,
  ReadinessOut,
  ReadyValidationError,
  RunStatus,
  SimEventsOut,
  SimResultOut,
  StageOut,
  TaskOut,
  WIPBufferOut,
  WIPBufferSnapshotOut,
  WorkCalendarOut,
} from '@/types/api';

const BASE = '/api/v1';

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** 从 api() 抛出的 `Error("API 422: <json>")` 里解析「保存并就绪」校验失败体。
 *  非 422 / 解析失败 → null（调用方退回通用 alert）。 */
export function parseReadyError(e: unknown): ReadyValidationError | null {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/^API 422:\s*([\s\S]*)$/);
  if (!m) return null;
  try {
    const body = JSON.parse(m[1]);
    const detail = body?.detail ?? body;
    if (detail && Array.isArray(detail.failed_rules)) return detail as ReadyValidationError;
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Simulator ID mapping: backend ↔ frontend
// ---------------------------------------------------------------------------
const SIM_BE_TO_FE: Record<string, string> = {
  PRODUCTION: 'des',
  LINE_BALANCE: 'line-balance',
  AGV: 'agv',
};
const SIM_FE_TO_BE: Record<string, string> = Object.fromEntries(
  Object.entries(SIM_BE_TO_FE).map(([k, v]) => [v, k]),
);

export function simulatorsToFrontend(backend: string[]): string[] {
  return backend.map(s => SIM_BE_TO_FE[s] ?? s);
}
export function simulatorsToBackend(frontend: string[]): string[] {
  return frontend.map(s => SIM_FE_TO_BE[s] ?? s);
}

// ---------------------------------------------------------------------------
// Plan API
// ---------------------------------------------------------------------------
export const planApi = {
  list: (status?: string) =>
    api<PlanOut[]>(`/plans${status ? `?status=${status}` : ''}`),

  get: (id: string) => api<PlanOut>(`/plans/${id}`),

  create: (body: PlanCreate) =>
    api<PlanOut>('/plans', { method: 'POST', body: JSON.stringify(body) }),

  update: (id: string, body: Partial<PlanUpdate>) =>
    api<PlanOut>(`/plans/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  delete: (id: string) =>
    api<void>(`/plans/${id}`, { method: 'DELETE' }),

  // Simulation execution
  run: (id: string) =>
    api<RunStatus>(`/plans/${id}/run`, { method: 'POST' }),

  runStatus: (id: string) =>
    api<RunStatus>(`/plans/${id}/run/status`),

  // Results
  result: (id: string) =>
    api<SimResultOut>(`/plans/${id}/result`),

  lineBalance: (id: string) =>
    api<LineBalanceOut[]>(`/plans/${id}/result/line-balance`),

  snapshots: (id: string, offset = 0, limit = 500) =>
    api<Array<{
      sim_timestamp_sec: number;
      equipment_states: Record<string, { status: string }>;
      wip_states: Record<string, { quantity: number; capacity: number | null; fill_rate: number | null; material_code?: string | null }> | null;
    }>>(
      `/plans/${id}/result/snapshots?offset=${offset}&limit=${limit}`,
    ),

  events: (id: string, filters?: { event_type?: string; prim_path?: string; equipment_id?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (filters?.event_type) params.set('event_type', filters.event_type);
    if (filters?.prim_path) params.set('prim_path', filters.prim_path);
    if (filters?.equipment_id) params.set('equipment_id', filters.equipment_id);
    if (filters?.limit != null) params.set('limit', String(filters.limit));
    const qs = params.toString();
    return api<SimEventsOut>(`/plans/${id}/result/events${qs ? `?${qs}` : ''}`);
  },

  // Business snapshots (read-only)
  materialSupplies: (id: string) => api<MaterialSupplyOut[]>(`/plans/${id}/material-supplies`),
  inventorySnapshots: (id: string) => api<InventorySnapshotOut[]>(`/plans/${id}/inventory-snapshots`),
  wipSnapshots: (id: string) => api<WIPBufferSnapshotOut[]>(`/plans/${id}/wip-snapshots`),
  wipBuffers: (id: string) => api<WIPBufferOut[]>(`/plans/${id}/wip-buffers`),
  equipmentMap: (id: string) => api<Record<string, string>>(`/plans/${id}/equipment-map`),

  // Sub-resources
  tasks: (id: string) => api<TaskOut[]>(`/plans/${id}/tasks`),
  createTask: (id: string, body: Record<string, unknown>) =>
    api<TaskOut>(`/plans/${id}/tasks`, { method: 'POST', body: JSON.stringify(body) }),
  deleteTask: (id: string, taskId: string) =>
    api<void>(`/plans/${id}/tasks/${taskId}`, { method: 'DELETE' }),

  constraints: (id: string) => api<ConstraintOut[]>(`/plans/${id}/constraints`),
  setConstraint: (id: string, body: { constraint_type: string; is_enabled: boolean }) =>
    api<ConstraintOut>(`/plans/${id}/constraints`, { method: 'POST', body: JSON.stringify(body) }),

  overrides: (id: string) => api<OverrideOut[]>(`/plans/${id}/overrides`),
  createOverride: (id: string, body: Record<string, unknown>) =>
    api<OverrideOut>(`/plans/${id}/overrides`, { method: 'POST', body: JSON.stringify(body) }),
  deleteOverride: (id: string, overrideId: string) =>
    api<void>(`/plans/${id}/overrides/${overrideId}`, { method: 'DELETE' }),
  // Upsert by (scope_type, scope_id, param_key) — 空 param_value 视为删除（恢复主数据基线）
  upsertOverride: (id: string, body: OverrideUpsert) =>
    api<OverrideOut | null>(`/plans/${id}/overrides`, { method: 'PUT', body: JSON.stringify(body) }),
  batchUpsertOverrides: (id: string, body: OverrideBatchUpsert) =>
    api<Array<OverrideOut | null>>(
      `/plans/${id}/overrides:batch`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  // Effective params (per equipment × param_key with inheritance chain)
  effectiveParams: (id: string, productCode?: string) =>
    api<EffectiveParamsOut>(
      `/plans/${id}/effective-params${productCode ? `?product_code=${encodeURIComponent(productCode)}` : ''}`,
    ),

  // Plan readiness (3 维度 + overall)
  readiness: (id: string) => api<ReadinessOut>(`/plans/${id}/readiness`),

  // 保存并就绪：校验通过 → 200 PlanOut(status=READY)；阻塞错 → 抛 Error("API 422: <json>")
  ready: (id: string) => api<PlanOut>(`/plans/${id}/ready`, { method: 'POST' }),

  // Anomalies
  anomalies: (id: string) => api<unknown[]>(`/plans/${id}/anomalies`),
  createAnomaly: (id: string, body: Record<string, unknown>) =>
    api<unknown>(`/plans/${id}/anomalies`, { method: 'POST', body: JSON.stringify(body) }),
  updateAnomaly: (id: string, anomalyId: string, body: Record<string, unknown>) =>
    api<unknown>(`/plans/${id}/anomalies/${anomalyId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteAnomaly: (id: string, anomalyId: string) =>
    api<void>(`/plans/${id}/anomalies/${anomalyId}`, { method: 'DELETE' }),

  // Lifecycle
  archive: (id: string) =>
    api<PlanOut>(`/plans/${id}/archive`, { method: 'POST' }),
  copy: (id: string) =>
    api<PlanOut>(`/plans/${id}/copy`, { method: 'POST' }),
  cancel: (id: string) =>
    api<PlanOut>(`/plans/${id}/cancel`, { method: 'POST' }),

  // COMPLETED → DRAFT：重新配置（重跑前需再过"保存并就绪"门，模拟结果保留）
  reconfigure: (id: string) =>
    api<PlanOut>(`/plans/${id}/reconfigure`, { method: 'POST' }),

  // Batch
  batchArchive: (ids: string[]) =>
    api<{ archived: number }>('/plans/batch-archive', { method: 'POST', body: JSON.stringify({ plan_ids: ids }) }),
  batchDelete: (ids: string[]) =>
    api<{ deleted: number }>('/plans/batch-delete', { method: 'POST', body: JSON.stringify({ plan_ids: ids }) }),

  // Versions
  versions: (id: string) => api<unknown[]>(`/plans/${id}/versions`),
  createVersion: (id: string, body: { version_name: string; notes?: string }) =>
    api<unknown>(`/plans/${id}/versions`, { method: 'POST', body: JSON.stringify(body) }),

  // Export
  exportReport: (id: string, body: { modules: string[]; format?: string; title?: string }) =>
    api<unknown>(`/plans/${id}/export`, { method: 'POST', body: JSON.stringify(body) }),

  // Apply template
  applyTemplate: (planId: string, templateId: string) =>
    api<unknown>(`/plans/${planId}/apply-template/${templateId}`, { method: 'POST' }),
};

// ---------------------------------------------------------------------------
// Template API
// ---------------------------------------------------------------------------
export const templateApi = {
  list: () => api<unknown[]>('/templates'),
  create: (body: Record<string, unknown>) =>
    api<unknown>('/templates', { method: 'POST', body: JSON.stringify(body) }),
  delete: (id: string) =>
    api<void>(`/templates/${id}`, { method: 'DELETE' }),
  copy: (id: string) =>
    api<unknown>(`/templates/${id}/copy`, { method: 'POST' }),
};

// ---------------------------------------------------------------------------
// Master Data API
// ---------------------------------------------------------------------------
export const masterApi = {
  factories: () => api<FactoryOut[]>('/factories'),
  // stages/lines/operations/bop 都接受 plan_id：快照方案的 md 是 scoped，
  // 不传 plan_id 时端点按 canonical 过滤 → 快照方案整棵资产树空。带 planId
  // 后：快照方案取 scoped，非快照为 overlay(plan ∪ canonical)，均正确。
  stages: (factoryId: string, planId?: string) =>
    api<StageOut[]>(`/factories/${factoryId}/stages${planId ? `?plan_id=${planId}` : ''}`),
  lines: (stageId: string, planId?: string) =>
    api<LineOut[]>(`/factories/stages/${stageId}/lines${planId ? `?plan_id=${planId}` : ''}`),
  operations: (lineId: string, planId?: string) =>
    api<OperationOut[]>(`/factories/lines/${lineId}/operations${planId ? `?plan_id=${planId}` : ''}`),
  lineProducts: (lineId: string, planId?: string) =>
    api<string[]>(`/factories/lines/${lineId}/products${planId ? `?plan_id=${planId}` : ''}`),
  bop: (lineId: string, productCode?: string, planId?: string) => {
    const qs = new URLSearchParams();
    if (productCode) qs.set('product_code', productCode);
    if (planId) qs.set('plan_id', planId);
    const s = qs.toString();
    return api<BopOut>(`/factories/lines/${lineId}/bop${s ? `?${s}` : ''}`);
  },
  equipment: (opId: string, lineId?: string, planId?: string) => {
    const qs = new URLSearchParams();
    if (lineId) qs.set('line_id', lineId);
    // 传 plan_id：快照方案的 op/line 是 scoped，端点 scoped() 需 plan_id 才返回
    // scoped 设备；非快照方案为 overlay（plan ∪ canonical），同样安全。
    if (planId) qs.set('plan_id', planId);
    const s = qs.toString();
    return api<EquipmentOut[]>(`/factories/operations/${opId}/equipment${s ? `?${s}` : ''}`);
  },
  transitions: (lineId: string) => api<OperationTransitionOut[]>(`/factories/lines/${lineId}/transitions`),
  equipmentFailureParams: (factoryId: string, planId?: string) =>
    api<EquipmentFailureParamOut[]>(`/factories/${factoryId}/equipment-failure-params${planId ? `?plan_id=${planId}` : ''}`),
  equipmentConfig: (factoryId: string, planId?: string) =>
    api<LineEquipmentConfigOut>(`/factories/${factoryId}/equipment-config${planId ? `?plan_id=${planId}` : ''}`),
  workCalendar: (factoryId: string, planId?: string) =>
    api<WorkCalendarOut>(`/factories/${factoryId}/work-calendar${planId ? `?plan_id=${planId}` : ''}`),
  products: () => api<ProductOut[]>('/products'),
  creatorProjects: (status?: string, factoryId?: string) => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (factoryId) qs.set('factory_id', factoryId);
    const s = qs.toString();
    return api<CreatorProjectOut[]>(`/creator-projects${s ? `?${s}` : ''}`);
  },
};

/** 解析某方案关联的 Creator 工厂项目的 USD 地址（creator_url）。
 *  不限状态（含 DEPRECATED）：按方案工厂取项目列表，再按 creator_project_id 匹配，
 *  避免只取 PUBLISHED 时关联到非发布项目就拿不到 URL。
 *  无关联 / 取不到 / creator_url 为空 一律返回 null（fail-soft，
 *  调用方据此决定要不要让 Kit 打开 USD）。 */
export async function resolveCreatorUrl(
  plan: PlanOut | null | undefined,
): Promise<string | null> {
  if (!plan?.creator_project_id) return null;
  const list = await masterApi
    .creatorProjects(undefined, plan.factory_id)
    .catch(() => [] as CreatorProjectOut[]);
  const cp = list.find((p) => p.creator_project_id === plan.creator_project_id);
  const url = cp?.creator_url?.trim();
  return url ? url : null;
}

// ---------------------------------------------------------------------------
// Data Import API (Excel/CSV 上传 → 校验 → 落库)
// ---------------------------------------------------------------------------
async function uploadFile<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: form });
  if (!res.ok) {
    let detail: unknown = null;
    try { detail = await res.json(); } catch { detail = await res.text().catch(() => ''); }
    const err = new Error(`API ${res.status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    (err as Error & { detail?: unknown }).detail = detail;
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Plan-scoped Master Data API (PRD §2.1.x —— 方案内新增/修改/删除产线、设备)
// ---------------------------------------------------------------------------
export interface PlanLineCreate {
  stage_id: string;
  line_code: string;
  line_name: string;
  smt_pph?: number | null;
  operation_count?: number | null;
  sort_order?: number | null;
  creator_binding_id?: string | null;
  status?: string;
}

export interface PlanLineUpdate {
  stage_id?: string;
  line_code?: string;
  line_name?: string;
  smt_pph?: number | null;
  operation_count?: number | null;
  sort_order?: number | null;
  creator_binding_id?: string | null;
  status?: string;
}

export interface PlanEquipmentCreate {
  operation_id: string;
  line_id: string;
  equipment_code: string;
  equipment_name: string;
  equipment_type: string;
  manufacturer?: string | null;
  model_no?: string | null;
  creator_binding_id?: string | null;
  status?: string;
  sort_order?: number | null;
  standard_ct?: number | null;
  standard_yield_rate?: number | null;
  standard_work_efficiency?: number | null;
  standard_worker_count?: number | null;
}

export interface PlanEquipmentUpdate {
  operation_id?: string;
  line_id?: string;
  equipment_code?: string;
  equipment_name?: string;
  equipment_type?: string;
  manufacturer?: string | null;
  model_no?: string | null;
  creator_binding_id?: string | null;
  status?: string;
  sort_order?: number | null;
}

export const planMdApi = {
  createLine: (planId: string, body: PlanLineCreate) =>
    api<LineOut>(`/plans/${planId}/master-data/lines`, { method: 'POST', body: JSON.stringify(body) }),
  updateLine: (planId: string, lineId: string, body: PlanLineUpdate) =>
    api<LineOut>(`/plans/${planId}/master-data/lines/${lineId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteLine: (planId: string, lineId: string) =>
    api<void>(`/plans/${planId}/master-data/lines/${lineId}`, { method: 'DELETE' }),

  createEquipment: (planId: string, body: PlanEquipmentCreate) =>
    api<EquipmentOut>(`/plans/${planId}/master-data/equipment`, { method: 'POST', body: JSON.stringify(body) }),
  updateEquipment: (planId: string, equipmentId: string, body: PlanEquipmentUpdate) =>
    api<EquipmentOut>(`/plans/${planId}/master-data/equipment/${equipmentId}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteEquipment: (planId: string, equipmentId: string) =>
    api<void>(`/plans/${planId}/master-data/equipment/${equipmentId}`, { method: 'DELETE' }),

  // 全局同步：从当前主数据重新整厂快照本方案（硬覆盖方案内手改的产线/设备；
  // biz 引用按编码自动重指。后端在会产生悬空引用时返回 422 + orphans 列表）。
  resyncMasterData: (planId: string) =>
    api<{
      plan_id: string;
      base_data_version: string | null;
      rows_by_table: Record<string, number>;
      total_rows: number;
      biz_refs_rewritten: number;
    }>(`/plans/${planId}/master-data:resync`, { method: 'POST' }),
};

export const importApi = {
  validate: (sectionId: string, planId: string, file: File) => {
    const fd = new FormData();
    fd.append('plan_id', planId);
    fd.append('file', file);
    return uploadFile<ImportValidationResult>(`/imports/${sectionId}:validate`, fd);
  },
  commit: (sectionId: string, planId: string, file: File, ignoreWarnings = true) => {
    const fd = new FormData();
    fd.append('plan_id', planId);
    fd.append('file', file);
    fd.append('ignore_warnings', String(ignoreWarnings));
    return uploadFile<ImportCommitResult>(`/imports/${sectionId}:commit`, fd);
  },
};

// ---------------------------------------------------------------------------
// Admin API —— 让 sim_backend 当 Kit 看门人：当 Kit 主线程卡死时 pkill+spawn
// ---------------------------------------------------------------------------
export interface KitRestartResponse {
  ok: boolean;
  killed_pids: number[];
  new_pid: number | null;
  launch_script: string;
  spawn_log?: string;
  message: string;
}
export interface KitStatusResponse {
  running: boolean;
  pids: number[];
  process_match: string;
}
export const adminApi = {
  restartKit: () => api<KitRestartResponse>('/admin/kit/restart', { method: 'POST' }),
  kitStatus: () => api<KitStatusResponse>('/admin/kit/status'),
};
