/*
 * 配置页「BoP 2D 俯视」：拉取本方案 factory 的 stage→line→BoP(工序+CT)→线边仓，
 * 组装成 SchematicLine[] 交给 <FactorySchematic> 静态展示（无回放状态）。
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { masterApi, planApi } from "@/lib/api";
import FactorySchematic from "./FactorySchematic";
// rolldown(Vite 8) 对类型用 import type，否则报 MISSING_EXPORT（同 AppStream.tsx）。
import type { SchematicLine } from "./FactorySchematic";

export default function BopSchematicView({
  planId,
  factoryId,
}: {
  planId?: string;
  factoryId?: string;
}) {
  const { t } = useTranslation();
  const [lines, setLines] = useState<SchematicLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!planId || !factoryId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const [stages, buffers] = await Promise.all([
          masterApi.stages(factoryId, planId),
          planApi.wipBuffers(planId),
        ]);
        const bufByLine = new Map<string, typeof buffers>();
        for (const b of buffers) {
          const arr = bufByLine.get(b.line_id) ?? [];
          arr.push(b);
          bufByLine.set(b.line_id, arr);
        }
        const out: SchematicLine[] = [];
        for (const stage of [...stages].sort((a, b) => a.sequence - b.sequence)) {
          const lns = await masterApi.lines(stage.stage_id, planId);
          for (const ln of lns) {
            const bop = await masterApi.bop(ln.line_id, undefined, planId);
            const procs = (bop?.processes ?? []).slice().sort((a, b) => a.sequence - b.sequence);
            if (procs.length === 0) continue;
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
        if (!cancelled) setLines(out);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, factoryId]);

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-200">{t("BoP 2D Overhead View")}</h3>
        <p className="text-[11px] text-slate-500 mt-0.5">
          {t("Process chain per line with line-side buffers (∞ = unbounded, number = capacity).")}
        </p>
      </div>
      {loading && <div className="text-xs text-slate-500 py-10 text-center">{t("Loading…")}</div>}
      {err && <div className="text-xs text-red-400 py-10 text-center">{err}</div>}
      {!loading && !err && lines.length === 0 && (
        <div className="text-xs text-slate-500 py-10 text-center">{t("No BoP configured.")}</div>
      )}
      {!loading && lines.length > 0 && <FactorySchematic lines={lines} legend />}
    </div>
  );
}
