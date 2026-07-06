/*
 * 配置页「BoP 2D 俯视」：拉取本方案 factory 的 stage→line→BoP(工序+CT)→线边仓，
 * 组装成 SchematicLine[] 交给 <FactorySchematic> 静态展示。
 *
 * 多产品：一条线可有多个 active BoP（每产品一份），所以必须按【产品】消歧 —— 顶部产品下拉，
 * 选项来自本方案 task 涉及的产品（无 task 时回退全部产品）。选中产品后按 ?product_code= 拉各线 BoP；
 * 没有该产品 BoP 的线（404）跳过。
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { masterApi, planApi } from "@/lib/api";
import FactorySchematic from "./FactorySchematic";
// rolldown(Vite 8) 对类型用 import type，否则报 MISSING_EXPORT（同 AppStream.tsx）。
import type { SchematicLine, StageEdge } from "./FactorySchematic";

export default function BopSchematicView({
  planId,
  factoryId,
  lineFilter,
  selectedOpId,
  embedded,
}: {
  planId?: string;
  factoryId?: string;
  /** 只显示这条产线的 BoP 拓扑（资产树选中产线/工序/设备时联动）；空 = 全厂。 */
  lineFilter?: string | null;
  /** 高亮的工序（复合 id `${line_id}::${operation_id}`，与资产树工序节点 id 同构）。 */
  selectedOpId?: string | null;
  /** 嵌在参数配置视口时：左侧留出浮动资产树的空间，头部收紧。 */
  embedded?: boolean;
}) {
  const { t } = useTranslation();
  const [products, setProducts] = useState<string[]>([]);
  const [product, setProduct] = useState("");
  const [lines, setLines] = useState<SchematicLine[]>([]);
  const [edges, setEdges] = useState<StageEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  // 产品选项：本方案 task 涉及的产品（去重）；无 task 时回退全部产品
  useEffect(() => {
    if (!planId) return;
    let cancelled = false;
    (async () => {
      try {
        const tasks = await planApi.tasks(planId);
        let codes = Array.from(new Set(tasks.map((tk) => tk.product_code).filter(Boolean)));
        if (codes.length === 0) {
          // 去重：全局行 + 方案克隆副本 code 相同（多方案下曾出现 N 个重复 PG548）
          const prods = await masterApi.products();
          codes = Array.from(new Set(prods.map((p) => p.product_code)));
        }
        if (!cancelled) {
          setProducts(codes);
          setProduct((prev: string) => (prev && codes.includes(prev) ? prev : codes[0] ?? ""));
        }
      } catch {
        /* 产品拉取失败不阻断；下方按空产品提示 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  // 选中产品 → 拉该产品在各线的 BoP，组装 schematic
  useEffect(() => {
    if (!planId || !factoryId || !product) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const [stages, buffers, stageTrans] = await Promise.all([
          masterApi.stages(factoryId, planId),
          planApi.wipBuffers(planId),
          planApi.stageTransitions(planId),
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
            let bop;
            try {
              bop = await masterApi.bop(ln.line_id, product, planId); // 404=该线无此产品 BoP → 跳过
            } catch {
              continue;
            }
            const procs = (bop?.processes ?? []).slice().sort((a, b) => a.sequence - b.sequence);
            if (procs.length === 0) continue;
            const ops = await masterApi.operations(ln.line_id, planId);
            const opById = new Map(ops.map((o) => [o.operation_id, o]));
            out.push({
              line_id: ln.line_id,
              line_code: ln.line_code,
              line_name: ln.line_name,
              stage_id: stage.stage_id,
              stage_seq: stage.sequence,
              ops: procs.map((p) => {
                const o = opById.get(p.operation_id);
                return {
                  operation_id: p.operation_id,
                  code: o?.operation_code ?? p.operation_id.slice(0, 6),
                  name: o?.operation_name_cn || o?.operation_name,
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
          setEdges(stageTrans.map((e) => ({
            from_stage_id: e.from_stage_id,
            to_stage_id: e.to_stage_id,
            connection_type: e.connection_type,
            connection_time: Number(e.connection_time),
          })));
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, factoryId, product]);

  // 资产树联动：选中产线（或其下工序/设备）→ 只画该线；未选/选工厂·制程 → 全厂
  const visibleLines = lineFilter ? lines.filter((l) => l.line_id === lineFilter) : lines;
  // 单线视图不画跨制程接续（对端节点不在画布上，buildEdges 会自动跳过，这里显式清掉更干净）
  const visibleEdges = lineFilter ? [] : edges;

  return (
    <div className={`flex-1 min-h-0 flex flex-col gap-2 ${embedded ? "p-2" : "p-3"}`}
         style={embedded ? { paddingLeft: 304 } : undefined}>
      <div className="flex-shrink-0 flex items-start justify-between gap-3">
        <div>
          {!embedded && <h3 className="text-sm font-semibold text-slate-200">{t("BoP 2D Overhead View")}</h3>}
          <p className="text-[11px] text-slate-500 mt-0.5">
            {lineFilter && visibleLines.length
              ? t("Showing BoP of {{line}} only — clear tree selection to view the whole factory", { line: visibleLines[0].line_name || visibleLines[0].line_code })
              : t("Process chain per line with line-side buffers (∞ = unbounded, number = capacity).")}
          </p>
        </div>
        {products.length > 0 && (
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400 flex-shrink-0">
            {t("Product")}
            <select
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              className="bg-[var(--c-0b1d30)] border border-[var(--c-1e3a55)] rounded px-2 py-1 text-slate-200 text-[11px] focus:outline-none focus:border-blue-500"
            >
              {products.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {loading && <div className="text-xs text-slate-500 py-10 text-center">{t("Loading…")}</div>}
      {err && <div className="text-xs text-red-400 py-10 text-center">{err}</div>}
      {!loading && !err && visibleLines.length === 0 && (
        <div className="text-xs text-slate-500 py-10 text-center">{t("No BoP configured.")}</div>
      )}
      {!loading && visibleLines.length > 0 && (
        <div className="flex-1 min-h-0">
          {/* key 按过滤维度变化 → 重挂载让 fitView 重新对焦（React Flow fitView 仅初次生效） */}
          <FactorySchematic key={lineFilter ?? 'all'} lines={visibleLines} stageTransitions={visibleEdges} mode="config" selectedOpId={selectedOpId} />
        </div>
      )}
    </div>
  );
}
