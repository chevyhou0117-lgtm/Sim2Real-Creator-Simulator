/*
 * 回放页「2D 俯视回放」：复用 <FactorySchematic>。
 * - 工序着色 + 在制产品 CT：毫秒级。按当前 tMs 轮询后端 state-at（每台设备 <=tMs 最后一条事件定状态），
 *   两次轮询之间前端用 (tMs - start_ms) 对 CT 做插值 → CT 平滑跳秒，不再是 60s 一跳。
 * - 线边仓水位：仍取 60s 快照 wip_states（WIP_LEVEL 不入主事件表）。
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { masterApi, planApi } from "@/lib/api";
import { mdName } from "@/lib/mdName";
import FactorySchematic from "./FactorySchematic";
import type { SchematicLine, OpState, BufState, StageEdge } from "./FactorySchematic";

type Seg = { status: string; product_code?: string | null; ct?: number | null; ct_base?: number | null; start_ms?: number | null; done?: number; plan?: number };

export default function Playback2DView({ planId, tMs }: { planId?: string; tMs: number }) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<SchematicLine[]>([]);
  const [edges, setEdges] = useState<StageEdge[]>([]);
  const [segs, setSegs] = useState<Record<string, Seg>>({}); // 键=line::op
  const [bufLevels, setBufLevels] = useState<Record<string, number>>({}); // 键=wip_id
  const [loading, setLoading] = useState(true);

  // 一次性：拉 schematic 骨架（产线/工序/缓冲/接续）
  useEffect(() => {
    if (!planId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const plan = await planApi.get(planId);
        const factoryId = plan.factory_id;
        const [stages, buffers, st] = await Promise.all([
          masterApi.stages(factoryId, planId),
          planApi.wipBuffers(planId),
          planApi.stageTransitions(planId),
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
              line_name: mdName(ln.line_name, ln.line_name_cn),
              stage_id: stage.stage_id,
              stage_seq: stage.sequence,
              ops: procs.map((p) => {
                const o = opById.get(p.operation_id);
                return {
                  operation_id: p.operation_id,
                  code: o?.operation_code ?? p.operation_id.slice(0, 6),
                  name: mdName(o?.operation_name, o?.operation_name_cn),
                  ct: Number(p.standard_ct),
                  seq: p.sequence,
                  yieldRate: p.yield_rate != null ? Number(p.yield_rate) : null,
                  workers: p.standard_worker_count ?? null,
                  materialUsage: p.material_usage ?? null,
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
          setEdges(st.map((e) => ({
            from_stage_id: e.from_stage_id,
            to_stage_id: e.to_stage_id,
            connection_type: e.connection_type,
            connection_time: Number(e.connection_time),
          })));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  // 毫秒级：随 tMs 轮询 state-at（节流 ~200ms，单次在飞行中不重入）
  const fetchRef = useRef({ last: 0, inflight: false });
  useEffect(() => {
    if (!planId) return;
    const f = fetchRef.current;
    const now = Date.now();
    if (f.inflight || now - f.last < 200) return;
    f.inflight = true;
    f.last = now;
    let cancelled = false;
    planApi
      .stateAt(planId, Math.round(tMs))
      .then((res) => {
        if (!cancelled) {
          setSegs(res.ops);
          setBufLevels(res.buffers);
        }
      })
      .catch(() => {})
      .finally(() => {
        f.inflight = false;
      });
    return () => {
      cancelled = true;
    };
  }, [tMs, planId]);

  // 本地平滑时钟：Kit 每 ~500ms 才回报一次 t_ms；用 rAF 在两次回报间按观测速率外推，让 CT 平滑跳秒。
  const [clock, setClock] = useState(tMs);
  const anchorRef = useRef({ sim: tMs, wall: typeof performance !== "undefined" ? performance.now() : 0, rate: 1 });
  useEffect(() => {
    const a = anchorRef.current;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const dWall = now - a.wall;
    if (dWall > 0) {
      const r = (tMs - a.sim) / dWall; // sim-ms / wall-ms（≈播放倍速）
      a.rate = r >= 0 && r < 1000 ? r : a.rate; // 排除 seek 跳变
    }
    a.sim = tMs;
    a.wall = now;
    setClock(tMs);
  }, [tMs]);
  useEffect(() => {
    let raf = 0;
    let lastSet = 0;
    const tick = () => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (now - lastSet >= 50) {
        // ~20fps，足够顺滑且不过度刷新
        lastSet = now;
        const a = anchorRef.current;
        const dt = Math.min(now - a.wall, 550); // 限制外推：暂停(无新 t_ms)时 CT 最多过冲 ~0.5s 即冻结，不会一直跑
        setClock(a.sim + dt * a.rate);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // 工序状态 + 在制 CT（用平滑时钟对 BUSY 段插值；ctElapsed 取一位小数限制刷新）
  const opStates = useMemo(() => {
    const out: Record<string, OpState> = {};
    for (const [key, s] of Object.entries(segs)) {
      if (s.status === "BUSY" && s.start_ms != null && s.ct != null) {
        // 工序级已跑 = 前序设备累计(ct_base) + 当前设备已跑；总 = 工序级 CT（簇内合计）
        const elapsed = Math.max(0, Math.min(Number(s.ct), (s.ct_base ?? 0) + (clock - s.start_ms) / 1000));
        out[key] = { status: "BUSY", ctElapsed: Math.round(elapsed * 10) / 10, ctTotal: Number(s.ct), product: s.product_code ?? null, done: s.done, plan: s.plan };
      } else {
        out[key] = { status: s.status, done: s.done, plan: s.plan };
      }
    }
    return out;
  }, [segs, clock]);

  // 线边仓容量映射（wip_id -> capacity_qty）
  const capMap = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const ln of lines) for (const b of ln.buffers) m.set(b.wip_id, b.capacity_qty);
    return m;
  }, [lines]);

  // 线边仓当前 WIP（事件计数，毫秒级；与 ops 同一轮询）
  const bufStates = useMemo(() => {
    const out: Record<string, BufState> = {};
    for (const [wid, qty] of Object.entries(bufLevels)) {
      const cap = capMap.get(wid) ?? null;
      out[wid] = { quantity: qty, capacity: cap, fill_rate: cap ? qty / cap : null };
    }
    return out;
  }, [bufLevels, capMap]);

  if (loading) {
    return <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">{t("Loading…")}</div>;
  }
  if (!lines.length) {
    return <div className="w-full h-full flex items-center justify-center text-xs text-slate-500">{t("No visualization data")}</div>;
  }
  return (
    <div className="w-full h-full bg-[var(--c-081523)] p-1.5">
      <FactorySchematic lines={lines} stageTransitions={edges} mode="playback" opStates={opStates} bufStates={bufStates} />
    </div>
  );
}
