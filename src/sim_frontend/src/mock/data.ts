export type PlanStatus = 'DRAFT' | 'READY' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ARCHIVED';

export type SimulatorId = 'des' | 'line-balance' | 'agv';

export interface SimPlan {
  id: string;
  name: string;
  simulators?: SimulatorId[];
  status: PlanStatus;
  timeRange: string;
  creator: string;
  creatorId: string;
  lastRunTime: string | null;
  createdAt: string;
  description?: string;
  tags?: string[];
}

export const SIMULATOR_LABELS: Record<string, { label: string; cls: string }> = {
  des:           { label: 'Production Process Simulation', cls: 'bg-blue-500/15 text-blue-400' },
  'line-balance':{ label: 'Line Balancing Simulation',     cls: 'bg-cyan-500/15 text-cyan-400' },
  agv:           { label: 'AGV Routing Simulation',        cls: 'bg-violet-500/15 text-violet-400' },
};

export const mockPlans: SimPlan[] = [
  {
    id: 'P001',
    name: 'SMT Line A - NPI Capacity Assessment',
    simulators: ['des', 'line-balance'],
    status: 'COMPLETED',
    timeRange: '2026-04-08 ~ 2026-04-08',
    creator: 'Li Ming',
    creatorId: 'IE001',
    lastRunTime: '2026-04-10 09:23',
    createdAt: '2026-04-08',
    description: 'Assess the capacity feasibility of new product A32X on SMT Lines 1 and 2',
    tags: ['NPI', 'SMT', 'Line A'],
  },
  {
    id: 'P002',
    name: 'Yantai Plant Q2 Scheduling Plan Validation',
    status: 'ARCHIVED',
    timeRange: '2026-04-01 ~ 2026-06-30',
    creator: 'Wang Fang',
    creatorId: 'IE002',
    lastRunTime: '2026-04-09 14:55',
    createdAt: '2026-04-01',
    tags: ['Q2 Scheduling', 'Quarterly Assessment'],
  },
  {
    id: 'P003',
    name: 'Changeover Optimization - Line L03',
    simulators: ['des'],
    status: 'READY',
    timeRange: '2026-04-10 ~ 2026-04-11',
    creator: 'Zhang San',
    creatorId: 'IE003',
    lastRunTime: null,
    createdAt: '2026-04-10',
  },
  {
    id: 'P004',
    name: 'Material Supply Disruption Risk Analysis',
    status: 'DRAFT',
    timeRange: '2026-04-10 ~ 2026-04-12',
    creator: 'Li Ming',
    creatorId: 'IE001',
    lastRunTime: null,
    createdAt: '2026-04-10',
  },
  {
    id: 'P005',
    name: 'Two-Shift Capacity Expansion Plan - Line B',
    status: 'RUNNING',
    timeRange: '2026-04-10 ~ 2026-04-10',
    creator: 'Wang Fang',
    creatorId: 'IE002',
    lastRunTime: '2026-04-10 10:05',
    createdAt: '2026-04-10',
  },
  {
    id: 'P006',
    name: 'AGV Routing Optimization Simulation',
    status: 'ARCHIVED',
    timeRange: '2026-03-20 ~ 2026-03-21',
    creator: 'Zhang San',
    creatorId: 'IE003',
    lastRunTime: '2026-03-22 11:30',
    createdAt: '2026-03-20',
    tags: ['AGV', 'Logistics Optimization'],
  },
];

export const STATUS_CONFIG: Record<PlanStatus, { label: string; cls: string; dot: string }> = {
  DRAFT:     { label: 'Draft',     cls: 'bg-slate-700/50 text-slate-400 border-slate-600',   dot: 'bg-slate-500' },
  READY:     { label: 'Ready',     cls: 'bg-blue-500/20 text-blue-400 border-blue-500/40',    dot: 'bg-blue-400' },
  RUNNING:   { label: 'Running',   cls: 'bg-amber-500/20 text-amber-400 border-amber-500/40', dot: 'bg-amber-400' },
  COMPLETED: { label: 'Completed', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40', dot: 'bg-emerald-400' },
  FAILED:    { label: 'Failed',    cls: 'bg-rose-500/20 text-rose-400 border-rose-500/40',    dot: 'bg-rose-400' },
  ARCHIVED:  { label: 'Archived',  cls: 'bg-purple-500/20 text-purple-400 border-purple-500/40', dot: 'bg-purple-400' },
};


// Mock result data for charts
export const lbrTimeSeriesData = Array.from({ length: 24 }, (_, i) => ({
  time: `${String(i).padStart(2, '0')}:00`,
  lbr: 72 + Math.sin(i * 0.5) * 12 + Math.random() * 5,
  bottleneck: 45 + Math.random() * 8,
}));

export const deviceUtilizationData = [
  { name: 'SPI-L01', util: 91, status: 'overload' },
  { name: 'SMT-L01-01', util: 88, status: 'overload' },
  { name: 'SMT-L01-02', util: 85, status: 'normal' },
  { name: 'AOI-L01', util: 79, status: 'normal' },
  { name: 'REFLOW-L01', util: 76, status: 'normal' },
  { name: 'WAVE-L01', util: 55, status: 'idle' },
  { name: 'SPI-L02', util: 82, status: 'normal' },
  { name: 'SMT-L02-01', util: 90, status: 'overload' },
  { name: 'AOI-L02', util: 68, status: 'normal' },
];

export const productionOutputData = Array.from({ length: 8 }, (_, i) => ({
  hour: `${8 + i}:00`,
  actual: 280 + Math.round(Math.random() * 60),
  plan: 320,
  defect: Math.round(Math.random() * 15),
}));

export const materialStockData = Array.from({ length: 24 }, (_, i) => ({
  time: `${String(i).padStart(2, '0')}:00`,
  'Main IC': Math.max(0, 1200 - i * 45 + Math.random() * 30),
  'Capacitor 0402': Math.max(0, 8000 - i * 300 + Math.random() * 200),
  Connector: Math.max(0, 500 - i * 18 + Math.random() * 10),
}));

export const operationLoadData = [
  { name: 'Solder Paste Printing', ct: 32, takt: 42, util: 76, workers: 1, lbr: 72 },
  { name: 'SMT (Front)', ct: 48, takt: 42, util: 114, workers: 2, lbr: 100 },
  { name: 'SMT (Back)', ct: 45, takt: 42, util: 107, workers: 2, lbr: 100 },
  { name: 'Reflow Soldering', ct: 38, takt: 42, util: 90, workers: 1, lbr: 85 },
  { name: 'AOI Inspection', ct: 28, takt: 42, util: 67, workers: 1, lbr: 63 },
  { name: 'Selective Soldering', ct: 55, takt: 42, util: 131, workers: 1, lbr: 100 },
  { name: 'ICT Test', ct: 22, takt: 42, util: 52, workers: 1, lbr: 52 },
];

export const eventLogData = [
  { time: '08:00:05', type: 'Work Order Started', level: 'INFO', obj: 'WO-20260410-001', detail: 'Work order WO-20260410-001 started, product A32X, planned quantity 500pcs' },
  { time: '08:23:14', type: 'Material Shortage', level: 'WARN', obj: 'IC-12345', detail: 'Material Main IC stock below safety level (200pcs remaining, safety stock 500pcs)' },
  { time: '09:15:33', type: 'Equipment Failure', level: 'WARN', obj: 'SMT-L01-02', detail: 'Equipment SMT-L01-02 failed, estimated repair time 45 min' },
  { time: '10:00:33', type: 'Equipment Recovery', level: 'INFO', obj: 'SMT-L01-02', detail: 'Equipment SMT-L01-02 fault cleared, back to normal operation' },
  { time: '10:45:02', type: 'Changeover Started', level: 'INFO', obj: 'L02', detail: 'Line L02 changeover started, switching product A32X → B15Y, estimated changeover time 25 min' },
  { time: '11:10:18', type: 'Changeover Completed', level: 'INFO', obj: 'L02', detail: 'Line L02 changeover completed, started producing B15Y' },
  { time: '12:02:38', type: 'AGV Anomaly', level: 'ERROR', obj: 'AGV-003', detail: 'AGV path planning timed out, using default transfer time 5 min instead' },
  { time: '13:30:00', type: 'Work Order Completed', level: 'INFO', obj: 'WO-20260410-001', detail: 'Work order WO-20260410-001 completed, actual output 487pcs, yield 97.4%' },
  { time: '14:15:22', type: 'Material Replenishment', level: 'INFO', obj: 'IC-12345', detail: 'Material Main IC replenished, 2000pcs received into stock' },
  { time: '15:00:00', type: 'Work Order Started', level: 'INFO', obj: 'WO-20260410-003', detail: 'Work order WO-20260410-003 started, product C08Z, planned quantity 300pcs' },
];

export const masterDataStats = {
  factories: 1,
  productionLines: 8,
  equipments: 64,
  bops: 23,
  lastSync: '2026-04-10 08:30:00',
  status: 'normal' as const,
};

export const paramTemplates = [
  { id: 'T001', name: 'Standard SMT 3-Shift Template', desc: 'Includes normal failure rates and changeover times', creator: 'Li Ming', updatedAt: '2026-04-08', usageCount: 12 },
  { id: 'T002', name: 'High-Yield Capacity Assessment Template', desc: 'Yield set to 99%, suitable for NPI assessment', creator: 'Wang Fang', updatedAt: '2026-04-05', usageCount: 5 },
  { id: 'T003', name: 'Equipment-Failure Reliability Template', desc: 'MTBF/MTTR from historical data, realistic scenario simulation', creator: 'Zhang San', updatedAt: '2026-03-28', usageCount: 8 },
];
