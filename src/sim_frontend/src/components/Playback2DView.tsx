/*
 * 回放页「2D 俯视回放」：复用 <FactorySchematic>，按当前播放时刻 tMs 用快照着色 + 缓冲水位。
 * - 工序盒着色：snapshots.equipment_states（按设备）经 equipment-map 聚合到工序（取最严重状态）。
 * - 线边仓水位：snapshots.wip_states（按 wip_id）直接喂给缓冲。
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { masterApi, planApi } from "@/lib/api";
import FactorySchematic from "./FactorySchematic";
import type { SchematicLine, OpState, BufState } from "./FactorySchematic";

type Snap = {
  sim_timestamp_sec: number;
  equipment_states: Record<string, { status: string }>;
  wip_states: Record<string, { quantity: number; capacity: number | null; fill_rate: number | null; material_code?: string | null }> | null;
};

// 工序盒取设备里"最严重"的状态
const SEVERITY: Record<string, number> = { IDLE: 0, BUSY: 1, STARVED: 2, BLOCKED: 3, FAILURE: 4 };

export default function Playback2DView({ planId, tMs }: { planId?: string; tMs: number }) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<SchematicLine[]>([]);
  const [eqToOp, setEqToOp] = useState<Record<string, string>>({});
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!planId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const plan = await planApi.get(planId);
        const factoryId = plan.factory_id;
        const [stages, buffers, em, sn] = await Promise.all([
          masterApi.stages(factoryId, planId),
          planApi.wipBuffers(planId),
          planApi.equipmentMap(planId),
          planApi.snapshots(planId, 0, 5000),
        ]);
        const bufByLine = new Map<string, typeof buffers>();
        for (const b of buffers) {
          const a = bufByLine.get(b.line_id) ?? [];
          a.push(b);
          bufByLine.set(b.line_id, a);
        }
        const out: SchematicLine[] = [];
        for (const stage of [...stages].sort((a, b) => a.sequence - b.sequence)) {
          const lns = await masterApi.lines(stage.stage_id, planId);
          for (const ln of lns) {
            const bop = await masterApi.bop(ln.line_id, undefined, planId);
            const procs = (bop?.processes ?? []).slice().sort((a, b) => a.sequence - b.sequence);
            if (!procs.length) continue;
            const ops = await masterApi.operations(ln.line_id, planId);
            const opById = new Map(ops.map((o) => [o.operation_id, o]));
            out.push({
              line_id: ln.line_id,
              line_code: ln.line_code,
              line_name: ln.line_name,
              ops: procs.map((p) => {
                const o = opById.get(p.operation_id);
                return {
                  operation_id: p.operation_id,
                  code: o?.operation_code ?? p.operation_id.slice(0, 6),
                  name: o?.operation_name_cn || o?.operation_name,
                  ct: Number(p.standard_ct),
                  seq: p.sequence,
                };
              }),
              buffers: (bufByLine.get(ln.line_id) ?? []).map((b) => ({
                wip_id: b.wip_id,
                pre_operation_id: b.pre_operation_id,
                post_operation_id: b.post_operation_id,
                capacity_qty: b.capacity_qty,
              })),
            });
          }
        }
        if (!cancelled) {
          setLines(out);
          setEqToOp(em);
          setSnaps([...sn].sort((a, b) => a.sim_timestamp_sec - b.sim_timestamp_sec));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  // 当前时刻（≤ tMs 的最后一帧快照）
  const curSnap = useMemo(() => {
    if (!snaps.length) return null;
    const tSec = tMs / 1000;
    let lo = 0;
    let hi = snaps.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (snaps[mid].sim_timestamp_sec <= tSec) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans >= 0 ? snaps[ans] : null;
  }, [snaps, tMs]);

  const opStates = useMemo(() => {
    const out: Record<string, OpState> = {};
    if (!curSnap) return out;
    for (const [eqId, st] of Object.entries(curSnap.equipment_states)) {
      const opId = eqToOp[eqId];
      if (!opId) continue;
      const sev = SEVERITY[st.status] ?? 0;
      const prevSev = out[opId] ? SEVERITY[out[opId].status] ?? 0 : -1;
      if (sev > prevSev) out[opId] = { status: st.status };
    }
    return out;
  }, [curSnap, eqToOp]);

  const bufStates = useMemo(() => {
    const out: Record<string, BufState> = {};
    if (!curSnap?.wip_states) return out;
    for (const [wid, v] of Object.entries(curSnap.wip_states)) {
      out[wid] = { quantity: v.quantity, capacity: v.capacity, fill_rate: v.fill_rate, material_code: v.material_code };
    }
    return out;
  }, [curSnap]);

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">{t("Loading…")}</div>;
  }
  if (!lines.length) {
    return <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">{t("No visualization data")}</div>;
  }
  return (
    <div className="w-full h-full overflow-auto bg-[#081523] p-2">
      <FactorySchematic lines={lines} opStates={opStates} bufStates={bufStates} legend />
    </div>
  );
}
