/** Backend API response types — mirrors sim_backend/app/schemas/*.py */

// --- Master Data ---

export interface FactoryOut {
  factory_id: string;
  factory_code: string;
  factory_name: string;
  location: string | null;
  timezone: string;
  status: string;
  plan_id: string | null;
}

export interface StageOut {
  stage_id: string;
  factory_id: string;
  stage_code: string;
  stage_name: string;
  sequence: number;
  stage_type: string;
  status: string;
  creator_binding_id: string | null;
  plan_id: string | null;
}

export interface LineOut {
  line_id: string;
  stage_id: string;
  line_code: string;
  line_name: string;
  smt_pph: number | null;
  operation_count: number | null;
  status: string;
  creator_binding_id: string | null;
  plan_id: string | null;
}

export interface OperationOut {
  operation_id: string;
  line_id: string;
  operation_code: string;
  operation_name: string;
  /** 中文展示名；NULL 时 buildAssetTree label fallback 用 operation_name */
  operation_name_cn?: string | null;
  sequence: number;
  operation_type: string | null;
  is_key_operation: boolean;
  status: string;
  creator_binding_id: string | null;
  plan_id: string | null;
}

export interface EquipmentOut {
  equipment_id: string;
  operation_id: string;
  line_id: string;
  equipment_code: string;
  equipment_name: string;
  equipment_type: string;
  manufacturer: string | null;
  model_no: string | null;
  standard_ct: number | null;
  standard_yield_rate: number | null;
  standard_work_efficiency: number | null;
  standard_worker_count: number | null;
  status: string;
  creator_binding_id: string | null;
  plan_id: string | null;
}

export interface BopProcessOut {
  bop_process_id: string;
  bop_id: string;
  operation_id: string;
  sequence: number;
  standard_ct: number;
  panel_qty: number | null;
  ct_per_panel: number | null;
  yield_rate: number;
  standard_worker_count: number;
  min_worker_count: number | null;
  plan_id: string | null;
}

export interface BopOut {
  bop_id: string;
  product_id: string;
  line_id: string;
  bop_version: string;
  is_active: boolean;
  processes: BopProcessOut[];
  plan_id: string | null;
}

export interface ProductOut {
  product_id: string;
  product_code: string;
  product_name: string;
  product_category: string | null;
  unit: string;
  status: string;
  plan_id: string | null;
}

// --- Work Calendar + Shift ---

export interface ShiftItem {
  shift_id: string;
  shift_name: string;
  start_time: string;       // HH:MM
  end_time: string;
  work_hours: number;
  break_minutes: number | null;
  shift_order: number;
}

export interface WorkCalendarOut {
  factory_id: string;
  date_start: string | null;     // YYYY-MM-DD
  date_end: string | null;
  total_days: number;
  working_days: number;
  line_count: number;
  shifts: ShiftItem[];
}

// --- Simulation Plan ---

export interface PlanCreate {
  plan_name: string;
  factory_id: string;
  enabled_simulators: string[];
  simulation_duration_hours: number;
  plan_description?: string;
  created_by: string;
  ignore_wo?: boolean;
  creator_project_id?: string | null;
}

export interface PlanUpdate {
  plan_name?: string;
  plan_description?: string;
  enabled_simulators?: string[];
  simulation_duration_hours?: number;
  ignore_wo?: boolean;
  creator_project_id?: string | null;
}

export interface PlanOut {
  plan_id: string;
  plan_name: string;
  plan_description: string | null;
  factory_id: string;
  status: string;
  enabled_simulators: string[];
  ignore_wo: boolean;
  simulation_duration_hours: number;
  creator_project_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ConstraintOut {
  constraint_id: string;
  plan_id: string;
  constraint_type: string;
  is_enabled: boolean;
}

export interface OverrideOut {
  override_id: string;
  plan_id: string;
  scope_type: string;
  scope_id: string | null;
  param_key: string;
  param_value: string;
  time_range_start: number | null;
  time_range_end: number | null;
}

export type OverrideScope = 'EQUIPMENT' | 'BOP_PROCESS' | 'OPERATION' | 'LINE' | 'STAGE' | 'GLOBAL';
export type OverrideParamKey = 'ct' | 'efficiency' | 'yield_rate' | 'mtbf' | 'mttr' | 'worker_count';

export interface OverrideUpsert {
  scope_type: OverrideScope;
  scope_id: string | null;
  param_key: OverrideParamKey;
  param_value: string;             // 空字符串 = 删除（恢复主数据基线）
  time_range_start?: number | null;
  time_range_end?: number | null;
}

export interface OverrideBatchUpsert {
  items: OverrideUpsert[];
}

export interface TaskOut {
  task_id: string;
  plan_id: string;
  wo_id: string | null;
  stage_id: string;
  line_id: string;
  product_code: string;
  plan_quantity: number;
  completed_qty: number | null;
  production_sequence: number;
  // 联表附带字段（list 端点填充；create/replace 响应可能为 null）
  line_code: string | null;
  line_name: string | null;
  wo_no: string | null;
}

export interface OperationTransitionOut {
  transition_id: string;
  bop_id: string;
  from_operation_id: string;
  to_operation_id: string;
  transfer_time: number;
  mandatory_wait_time: number;
  transfer_mode: string | null;
  wait_reason: string | null;
}

export interface EquipmentFailureParamOut {
  param_id: string;
  equipment_id: string;
  mtbf_hours: number;
  mttr_minutes: number;
  failure_distribution: string | null;
  data_source: string | null;
}

export interface LineEquipmentConfigItem {
  equipment_id: string;
  equipment_code: string;
  equipment_name: string;
  equipment_type: string;
  manufacturer: string | null;
  model_no: string | null;
  standard_ct: number | null;
  standard_yield_rate: number | null;
  standard_work_efficiency: number | null;
  standard_worker_count: number | null;
  operation_id: string;
  operation_code: string;
  operation_name: string;
  operation_sequence: number;
  line_id: string;
  line_code: string;
  line_name: string;
  stage_id: string;
  stage_name: string;
}

export interface LineEquipmentConfigOut {
  factory_id: string;
  line_count: number;
  operation_count: number;
  equipment_count: number;
  last_updated: string | null;
  items: LineEquipmentConfigItem[];
}

export interface MaterialSupplyOut {
  supply_id: string;
  plan_id: string;
  material_code: string;
  material_name: string | null;
  supply_quantity: number;
  arrival_sim_hour: number;
  target_warehouse_id: string;
  data_source: string;
}

export interface InventorySnapshotOut {
  snapshot_id: string;
  plan_id: string;
  warehouse_id: string;
  material_code: string;
  total_quantity: number;
  available_quantity: number;
  snapshot_time: string;
  data_source: string;
}

export interface WIPBufferSnapshotOut {
  wip_snapshot_id: string;
  plan_id: string;
  wip_id: string;
  material_code: string;
  current_quantity: number;
  current_volume: number;
  snapshot_time: string;
  data_source: string;
}

// --- Simulation Results ---

export interface RunStatus {
  plan_id: string;
  computation_status: string;
  // COMPUTING 期间的子阶段：'SIMULATING' / 'AGGREGATING' / 'PERSISTING'；非 COMPUTING 为 null
  computation_phase: string | null;
  // 各阶段实际耗时（秒）：{ des, linebalance, persist }，随阶段推进逐步补全
  phase_timings: { des?: number; linebalance?: number; persist?: number } | null;
  progress_pct: number | null;
  elapsed_sec: number | null;
}

export interface SimResultOut {
  result_id: string;
  plan_id: string;
  computation_status: string;
  computation_start: string | null;
  computation_end: string | null;
  total_output: number | null;
  output_per_hour: number | null;
  overall_lbr: number | null;
  bottleneck_equipment_id: string | null;
  bottleneck_utilization: number | null;
  material_shortage_count: number | null;
  equipment_failure_count: number | null;
  result_summary: Record<string, unknown> | null;
}

export interface OperationLoadDetail {
  operation_name: string;
  sequence: number;
  design_ct: number;
  effective_ct: number;
  equipment_count: number;
  worker_count: number;
  utilization: number;
  takt_deviation: number;
  is_bottleneck: boolean;
  is_idle: boolean;
}

export interface LineBalanceOut {
  lb_result_id: string;
  result_id: string;
  line_id: string;
  takt_time: number;
  lbr: number;
  balance_loss_rate: number;
  bottleneck_operation_id: string | null;
  bottleneck_ct: number | null;
  idle_operation_id: string | null;
  operation_load_detail: Record<string, OperationLoadDetail> | null;
  workshop_load_rate: number | null;
  factory_load_rate: number | null;
}

export interface SimEventOut {
  timestamp_ms: number;
  equipment_id: string;
  prim_path: string | null;
  event_type: string;
  product_id: string | null;
  metadata: Record<string, unknown> | null;
}

export interface SimEventsOut {
  plan_id: string;
  total_events: number;
  duration_ms: number;
  events: SimEventOut[];
}

// --- Effective parameters (inheritance-resolved) ---

export type EffectiveParamSource =
  | 'OVERRIDE_EQUIPMENT'
  | 'OVERRIDE_OPERATION'
  | 'OVERRIDE_BOP_PROCESS'
  | 'OVERRIDE_LINE'
  | 'OVERRIDE_STAGE'
  | 'OVERRIDE_GLOBAL'
  | 'BASELINE_EQUIPMENT'
  | 'BASELINE_BOP_PROCESS'
  | 'BASELINE_FAILURE_PARAM'
  | 'BASELINE_DEFAULT';

export interface EffectiveParam {
  equipment_id: string;
  operation_id: string;
  line_id: string;
  stage_id: string;
  factory_id: string;
  /** 该 (line, operation) 在当前 BoP 视图下的 BOPProcess.id；前端写 BOP_PROCESS scope override 时用 */
  bop_process_id: string | null;
  param_key: OverrideParamKey;
  value: number | null;
  source: EffectiveParamSource;
  override_scope_id: string | null;
  override_id: string | null;
  baseline_value: number | null;
}

export interface EffectiveParamsOut {
  plan_id: string;
  factory_id: string;
  used_product_by_line: Record<string, string | null>;
  items: EffectiveParam[];
}

// --- Readiness ---

export interface ReadinessSection {
  section_id: string;
  label: string;
  pct: number;
  status: 'ok' | 'warning' | 'missing';
  detail: string;
}

export interface ReadinessOut {
  plan_id: string;
  input_pct: number;
  params_pct: number;
  constraints_pct: number;
  overall_pct: number;
  sections: ReadinessSection[];
}

// --- 保存并就绪 校验门 ---

export interface ReadyRuleReport {
  rule_id: string;
  dimension: string;            // input / params / constraints
  label: string;
  passed: boolean;
  blocking: boolean;
  issues: ImportIssue[];
}

export interface ReadyValidationError {
  plan_id: string;
  ok: boolean;                  // 始终 false
  failed_rules: ReadyRuleReport[];
  warnings: ReadyRuleReport[];
}

// --- Creator Project ---

export interface CreatorProjectOut {
  creator_project_id: string;
  project_name: string;
  project_version: string | null;
  project_status: string;       // PUBLISHED / DRAFT / DEPRECATED
  factory_id: string | null;
  description: string | null;
  creator_url: string | null;
  published_at: string | null;
}

// --- Data Import (Excel/CSV) ---

export interface ImportIssue {
  row: number;
  field: string;
  message: string;
}

export interface ImportValidationResult {
  section_id: string;
  valid: boolean;
  total_rows: number;
  valid_rows: number;
  errors: ImportIssue[];
  warnings: ImportIssue[];
  columns: string[];
  preview_rows: string[][];
}

export interface ImportCommitResult {
  section_id: string;
  inserted: number;
  skipped: number;
  plan_id: string | null;
  message: string;
}
