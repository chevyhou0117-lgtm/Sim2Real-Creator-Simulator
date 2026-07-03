import React from 'react';
import { Plus, Edit2, Database, Activity, Radio, Link2 } from 'lucide-react';
import { FormCard, FormField } from './UiComponents';

export function LeaderInfoForm() {
  return (
    <FormCard title="2.1 Leader Information">
      <FormField label="Line Leader Name" placeholder="e.g. Zhang Wei" />
      <FormField label="Employee ID" placeholder="e.g. EMP-2024-001" />
      <FormField label="Contact Number" placeholder="e.g. +86 138 0000 1234" />
      <FormField label="Email" placeholder="e.g. zhang.wei@company.com" />
      <FormField label="Shift Schedule" type="select" options={['3-Shift Rotation', '2-Shift', 'Day Only']} />
      <div className="mt-4 pt-4 border-t border-[var(--c-1e3a55)]">
        <label className="block text-[11px] text-slate-400 mb-2">Team Members</label>
        {['Shift A', 'Shift B', 'Shift C'].map((shift) => (
          <div key={shift} className="mb-2">
            <label className="text-[10px] text-slate-500 mb-1 block">{shift} Leader</label>
            <input
              placeholder={`${shift} leader name`}
              className="w-full bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded px-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500"
            />
          </div>
        ))}
      </div>
    </FormCard>
  );
}

export function LotInfoForm() {
  return (
    <FormCard title="2.2 Lot Information">
      <FormField label="Lot Size (pcs)" placeholder="e.g. 500" type="number" />
      <FormField label="Lot ID Format" placeholder="e.g. LOT-YYYYMMDD-###" />
      <FormField label="WIP Limit (pcs)" placeholder="e.g. 200" type="number" />
      <FormField label="Traceability Level" type="select" options={['Unit Level', 'Lot Level', 'Batch Level']} />
      <FormField label="Barcode Format" type="select" options={['QR Code', 'DataMatrix', '1D Barcode']} />
    </FormCard>
  );
}

export function ErrorCodeForm() {
  return (
    <FormCard title="2.3 Error Code & Alarm Configuration">
      <p className="text-[11px] text-slate-400 mb-4">Define error codes, alarm categories, and escalation rules for this production line.</p>
      <div className="space-y-2">
        {[
          { code: 'E001', name: 'Equipment Offline', level: 'Critical' },
          { code: 'E002', name: 'Temperature Out of Range', level: 'Warning' },
          { code: 'E003', name: 'Low Material Supply', level: 'Warning' },
          { code: 'E004', name: 'Production Target Miss', level: 'Info' },
        ].map((err) => (
          <div key={err.code} className="bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded p-3 flex items-center gap-3">
            <span className="text-[10px] font-mono text-blue-400 w-12">{err.code}</span>
            <span className="text-[11px] text-slate-300 flex-1">{err.name}</span>
            <span className={`text-[9px] px-2 py-0.5 rounded ${
              err.level === 'Critical' ? 'bg-red-500/20 text-red-400'
              : err.level === 'Warning' ? 'bg-amber-500/20 text-amber-400'
              : 'bg-blue-500/20 text-blue-400'
            }`}>{err.level}</span>
            <button className="text-slate-500 hover:text-blue-400"><Edit2 size={11} /></button>
          </div>
        ))}
        <button className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-2">
          <Plus size={12} /> Add Error Code
        </button>
      </div>
    </FormCard>
  );
}

export function StatusMonitoringForm() {
  return (
    <FormCard title="2.4 Status Monitoring">
      <p className="text-[11px] text-slate-400 mb-4">Set production line status definitions and monitoring ranges.</p>
      {[
        { status: 'Running', color: 'emerald', condition: 'rcount increasing AND no active alarms' },
        { status: 'Idle', color: 'blue', condition: 'No production, no alarm, power ON' },
        { status: 'Alarm', color: 'red', condition: 'Any E001 or E002 active' },
        { status: 'Maintenance', color: 'amber', condition: 'Manual maintenance mode active' },
        { status: 'Offline', color: 'slate', condition: 'Device unreachable' },
      ].map((s) => (
        <div key={s.status} className="bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded p-2.5 mb-2">
          <div className="flex items-center gap-2 mb-1.5">
            <span className={`w-2 h-2 rounded-full bg-${s.color}-400`} />
            <span className="text-[11px] text-slate-200 font-medium">{s.status}</span>
          </div>
          <div className="text-[10px] text-slate-500">{s.condition}</div>
        </div>
      ))}
    </FormCard>
  );
}

export function AIModelForm() {
  return (
    <FormCard title="2.5 AI Model & Data Analysis">
      <p className="text-[11px] text-slate-400 mb-4">Configure AI analysis models and predictive analytics for this production line.</p>
      <div className="space-y-3">
        {[
          { name: 'Predictive Maintenance', status: 'Active', model: 'LSTM v2.1' },
          { name: 'Quality Anomaly Detection', status: 'Inactive', model: 'Isolation Forest' },
          { name: 'Throughput Forecasting', status: 'Active', model: 'Prophet + XGBoost' },
        ].map((ai) => (
          <div key={ai.name} className="bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] text-slate-200 font-medium">{ai.name}</span>
              <span className={`text-[9px] px-2 py-0.5 rounded ${
                ai.status === 'Active' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'
              }`}>{ai.status}</span>
            </div>
            <div className="text-[10px] text-slate-500">Model: {ai.model}</div>
          </div>
        ))}
      </div>
    </FormCard>
  );
}

export function DataPlatformForm() {
  return (
    <FormCard title="System & Data Integration">
      <p className="text-[11px] text-slate-400 mb-4">Configure data platform integrations and system connections.</p>
      <div className="space-y-3">
        {[
          { name: 'MES Integration', icon: <Database size={14} />, status: 'Connected', endpoint: 'https://mes.factory.local/api' },
          { name: 'SCADA Connection', icon: <Activity size={14} />, status: 'Connected', endpoint: '192.168.0.10:4840' },
          { name: 'Data Lake Export', icon: <Radio size={14} />, status: 'Pending', endpoint: 's3://factory-datalake/houston-p9' },
          { name: 'MOM System Sync', icon: <Link2 size={14} />, status: 'Configured', endpoint: 'https://mom.system.com/sync' },
        ].map((sys) => (
          <div key={sys.name} className="bg-[var(--c-07111e)] border border-[var(--c-1e3a55)] rounded p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-blue-400">{sys.icon}</span>
              <span className="text-[11px] text-slate-200 font-medium flex-1">{sys.name}</span>
              <span className={`text-[9px] px-2 py-0.5 rounded ${
                sys.status === 'Connected' ? 'bg-emerald-500/20 text-emerald-400'
                : sys.status === 'Configured' ? 'bg-blue-500/20 text-blue-400'
                : 'bg-amber-500/20 text-amber-400'
              }`}>{sys.status}</span>
            </div>
            <div className="text-[10px] text-slate-600 font-mono truncate">{sys.endpoint}</div>
          </div>
        ))}
      </div>
    </FormCard>
  );
}
