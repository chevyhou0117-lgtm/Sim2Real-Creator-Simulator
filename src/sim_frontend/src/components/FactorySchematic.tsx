/*
 * 工厂 2D 俯视图 —— 基于 React Flow（@xyflow/react）的灵活画布（draw.io 式：平移/缩放/小地图/网格/拖拽）。
 * 数据驱动：工序=自定义节点（可拖动、回放时按状态着色）；线边仓容量/水位标在边上；跨线接续=虚线动效边。
 * 复用于 ① 配置页静态展示 BoP（mode='config'）；② 回放页按快照着色（mode='playback'）。
 * 保持与旧版同一 props 契约，故两个 wrapper（BopSchematicView/Playback2DView）无需改动。
 */
import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  Handle,
  Position,
  MarkerType,
  useNodesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export interface SchematicOp {
  operation_id: string;
  code: string;
  name?: string;
  ct?: number | null;
  seq: number;
  yieldRate?: number | null;
  workers?: number | null;
  materialUsage?: Record<string, number> | null; // 投料 {物料编码: 件用量}，含原料+上游半成品(SF-*)
}
export interface SchematicBuffer {
  wip_id: string;
  pre_operation_id: string | null;
  post_operation_id: string | null;
  capacity_qty: number | null;
}
export interface SchematicLine {
  line_id: string;
  line_code: string;
  line_name: string;
  stage_id: string;
  stage_seq: number;
  ops: SchematicOp[];
  buffers: SchematicBuffer[];
}
export interface StageEdge {
  from_stage_id: string;
  to_stage_id: string;
  connection_type: string;
  connection_time: number;
}
export interface OpState {
  status: string;
  ctElapsed?: number | null; // 在制产品已跑秒数（毫秒级，前端按 tMs 插值）
  ctTotal?: number | null; // 当前工序/设备 CT
  product?: string | null; // 在制产品编码
  done?: number | null; // 该工序已完工件数（任务进度）
  plan?: number | null; // 该线计划总量
}
export interface BufState {
  quantity: number;
  capacity: number | null;
  fill_rate: number | null;
  material_code?: string | null;
}

export interface MaterialState {
  quantity: number;
  material_type?: string | null;
}

interface Props {
  lines: SchematicLine[];
  stageTransitions?: StageEdge[];
  mode?: "config" | "playback";
  opStates?: Record<string, OpState>;
  bufStates?: Record<string, BufState>;
  materialStates?: Record<string, MaterialState>; // 回放：当前时刻各原料库存（warehouse_states）
  selectedOpId?: string | null;
  onSelectOp?: (op: SchematicOp, line: SchematicLine) => void;
}

// 半成品物料编码（SF-{product}-{op}）→ 去掉前缀只留工序段，便于在小角标里显示
const isSemiFinished = (code: string) => code.startsWith("SF-");
const shortMatLabel = (code: string) => (isSemiFinished(code) ? code.replace(/^SF-[^-]+-/, "") : code);

const OP_W = 172;
const OP_H = 64;
const GAP = 58;
const LABEL_W = 150;
const LANE_H = 128;
const MAT_H = 30;

// 节点 id = 复合键（线::工序）—— 同 stage 多条线共享同一批 operation_id，必须按线区分，否则节点撞 id。
const nid = (lineId: string, opId: string) => `${lineId}::${opId}`;

const STATE_STYLE: Record<string, { fill: string; stroke: string; text: string; mini: string }> = {
  IDLE: { fill: "#11263e", stroke: "#2c4a68", text: "#8aa1bd", mini: "#2c4a68" },
  BUSY: { fill: "#0e3566", stroke: "#3b82f6", text: "#bfdbfe", mini: "#3b82f6" },
  BLOCKED: { fill: "#3f1622", stroke: "#ef4444", text: "#fecaca", mini: "#ef4444" },
  STARVED: { fill: "#3e2c10", stroke: "#f59e0b", text: "#fde68a", mini: "#f59e0b" },
  SHORTAGE: { fill: "#2e1065", stroke: "#a855f7", text: "#e9d5ff", mini: "#a855f7" }, // 缺料停工
  FAILURE: { fill: "#3f1013", stroke: "#dc2626", text: "#fca5a5", mini: "#dc2626" },
  DEFAULT: { fill: "#0e2138", stroke: "#2f4a67", text: "#cdd9e8", mini: "#2f4a67" },
};
const STATE_KEYS = ["BUSY", "BLOCKED", "STARVED", "SHORTAGE", "FAILURE", "IDLE"] as const;

type OpData = {
  operation_id: string;
  line_id: string;
  code: string;
  ct?: number | null;
  name?: string;
  yieldRate?: number | null;
  workers?: number | null;
  materialUsage?: Record<string, number> | null;
  status?: string;
  ctElapsed?: number | null;
  ctTotal?: number | null;
  product?: string | null;
  done?: number | null;
  plan?: number | null;
  mode: string;
};

// ── 自定义节点：工序 ──────────────────────────────────────────────────────────
function OperationNode({ data, selected }: NodeProps) {
  const { t } = useTranslation();
  const d = data as unknown as OpData;
  const st = d.mode === "playback" ? STATE_STYLE[d.status || "IDLE"] || STATE_STYLE.DEFAULT : STATE_STYLE.DEFAULT;
  const hasProgress = d.mode === "playback" && d.plan != null && d.plan > 0;
  const pct = hasProgress ? Math.min(100, ((d.done ?? 0) / (d.plan as number)) * 100) : 0;
  const tip = [
    d.name || d.code,
    d.ct != null ? `CT ${Number(d.ct).toFixed(1)}s` : "",
    d.yieldRate != null ? `${t("Yield Rate")} ${(Number(d.yieldRate) * 100).toFixed(1)}%` : "",
    d.workers != null ? `${d.workers} ${t("people")}` : "",
    hasProgress ? `${t("Progress")} ${d.done ?? 0}/${d.plan} (${pct.toFixed(0)}%)` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div
      title={tip}
      style={{
        position: "relative",
        width: OP_W,
        height: OP_H,
        background: st.fill,
        border: `1.5px solid ${selected ? "#e2e8f0" : st.stroke}`,
        borderRadius: 10,
        boxShadow: "0 1px 4px rgba(0,0,0,0.45)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 8px",
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <Handle type="target" position={Position.Left} id="in" style={{ background: "#475569", width: 6, height: 6, border: "none" }} />
      <Handle type="target" position={Position.Top} id="mat-in" style={{ background: "#b45309", width: 7, height: 7, border: "none" }} />
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: st.text,
          lineHeight: 1.18,
          textAlign: "center",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          maxWidth: "100%",
        }}
      >
        {d.name || d.code}
      </div>
      {d.mode === "playback" && d.status === "BUSY" && d.ctTotal != null ? (
        <div style={{ fontSize: 9.5, fontWeight: 600, color: "#bfe0ff", marginTop: 2, whiteSpace: "nowrap" }}>
          ▶ {Number(d.ctElapsed ?? 0).toFixed(1)}/{Number(d.ctTotal).toFixed(1)}s
          {d.product ? ` · ${d.product}` : ""}
        </div>
      ) : (
        <div style={{ fontSize: 9, color: "#6f8aa8", marginTop: 2, whiteSpace: "nowrap" }}>
          {d.code}
          {d.ct != null ? ` · ${Number(d.ct).toFixed(1)}s` : ""}
        </div>
      )}
      <Handle type="source" position={Position.Right} id="out" style={{ background: "#475569", width: 6, height: 6, border: "none" }} />
      {hasProgress && (
        <>
          <div style={{ position: "absolute", top: 2, right: 4, fontSize: 8.5, color: "#86a0bd" }}>{pct.toFixed(0)}%</div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 4, background: "#0a1626" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "#34d399", transition: "width 0.2s linear" }} />
          </div>
        </>
      )}
    </div>
  );
}

// ── 自定义节点：泳道标签 ──────────────────────────────────────────────────────
function LaneNode({ data }: NodeProps) {
  const d = data as unknown as { label: string; code: string };
  return (
    <div style={{ width: LABEL_W - 18, textAlign: "right", paddingRight: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#d6e0ef" }}>{d.label}</div>
      <div style={{ fontSize: 9, color: "#5b7a99" }}>{d.code}</div>
    </div>
  );
}

// ── 自定义节点：投料（入料）框 ── 只画原料；上游半成品入料是默认的、不画。可拖动，箭头指向工序。
function MaterialNode({ data }: NodeProps) {
  const d = data as unknown as { materials: [string, number][] };
  return (
    <div
      style={{
        width: OP_W, minHeight: MAT_H, boxSizing: "border-box",
        background: "#241a06", border: "1.5px solid #b45309", borderRadius: 8,
        padding: "3px 6px", display: "flex", flexWrap: "wrap", gap: 5,
        alignItems: "center", justifyContent: "center",
        boxShadow: "0 1px 3px rgba(0,0,0,0.45)",
      }}
    >
      {d.materials.map(([code, qty]) => (
        <span key={code} title={`${code} × ${qty}`} style={{ fontSize: 9.5, fontWeight: 600, color: "#fcd34d", whiteSpace: "nowrap" }}>
          ● {shortMatLabel(code)}×{qty}
        </span>
      ))}
      <Handle type="source" position={Position.Bottom} id="mat-out" style={{ background: "#b45309", width: 7, height: 7, border: "none" }} />
    </div>
  );
}

const nodeTypes = { operation: OperationNode, lane: LaneNode, material: MaterialNode };

function buildNodes(lines: SchematicLine[], mode: string): Node[] {
  const out: Node[] = [];
  [...lines]
    .sort((a, b) => a.stage_seq - b.stage_seq)
    .forEach((ln, li) => {
      const y = li * LANE_H + 24;
      out.push({
        id: `lane-${ln.line_id}`,
        type: "lane",
        position: { x: 0, y: y + OP_H / 2 - 14 },
        data: { label: ln.line_name || ln.line_code, code: ln.line_code },
        draggable: false,
        selectable: false,
      });
      [...ln.ops]
        .sort((a, b) => a.seq - b.seq)
        .forEach((op, i) => {
          out.push({
            id: nid(ln.line_id, op.operation_id),
            type: "operation",
            position: { x: LABEL_W + i * (OP_W + GAP), y },
            data: { operation_id: op.operation_id, line_id: ln.line_id, code: op.code, ct: op.ct, name: op.name, yieldRate: op.yieldRate, workers: op.workers, status: undefined, mode },
          });
          // 投料框：只画原料（非半成品）；半成品入料默认不画。两模式都画、可拖动。
          const rawMats = op.materialUsage
            ? (Object.entries(op.materialUsage).filter(([c]) => !isSemiFinished(c)) as [string, number][])
            : [];
          if (rawMats.length) {
            out.push({
              id: `mat-${nid(ln.line_id, op.operation_id)}`,
              type: "material",
              position: { x: LABEL_W + i * (OP_W + GAP), y: y - (MAT_H + 14) },
              data: { materials: rawMats },
            });
          }
        });
    });
  return out;
}

function buildEdges(lines: SchematicLine[], stageTransitions: StageEdge[], bufStates: Record<string, BufState> | undefined, mode: string): Edge[] {
  const out: Edge[] = [];
  // 工序间（线内）：线边仓容量/水位标在边上
  for (const ln of lines) {
    const ops = [...ln.ops].sort((a, b) => a.seq - b.seq);
    for (let i = 0; i < ops.length - 1; i++) {
      const a = ops[i];
      const b = ops[i + 1];
      const buf = ln.buffers.find((x) => x.pre_operation_id === a.operation_id && x.post_operation_id === b.operation_id);
      let label: string | undefined;
      let stroke = "#39597b";
      let labelColor = "#a78bda";
      if (buf) {
        const bs = mode === "playback" && bufStates ? bufStates[buf.wip_id] : undefined;
        const cap = bs?.capacity ?? buf.capacity_qty;
        const full = bs?.fill_rate != null && bs.fill_rate >= 1;
        // 回放：显示当前实际 WIP 数量（无限容量也显示数量，不显示 ∞）；配置：显示容量上限
        label = mode === "playback" && bs
          ? cap == null
            ? `${bs.quantity}`
            : `${bs.quantity}/${cap}`
          : cap == null
            ? "∞"
            : `≤${cap}`;
        if (full) {
          stroke = "#ef4444";
          labelColor = "#fca5a5";
        }
      }
      out.push({
        id: `e-${ln.line_id}-${a.operation_id}-${b.operation_id}`,
        source: nid(ln.line_id, a.operation_id),
        target: nid(ln.line_id, b.operation_id),
        sourceHandle: "out",
        targetHandle: "in",
        type: "default",
        label,
        labelStyle: { fill: labelColor, fontSize: 10, fontWeight: 600 },
        labelBgStyle: { fill: "#0b1626", fillOpacity: 0.85 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 3,
        style: { stroke, strokeWidth: 1.6 },
        markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
      });
    }
  }
  // 跨线（制程间）接续：虚线动效边。每个 stage 收集其【所有线】的首/末节点 ——
  // 同 stage 多条线（如 SMT01/SMT02）都要各自连到下游 stage。
  const stageLines = new Map<string, Array<{ first: string; last: string }>>();
  for (const ln of [...lines].sort((a, b) => a.stage_seq - b.stage_seq)) {
    const ops = [...ln.ops].sort((a, b) => a.seq - b.seq);
    if (!ops.length) continue;
    const arr = stageLines.get(ln.stage_id) ?? [];
    arr.push({ first: nid(ln.line_id, ops[0].operation_id), last: nid(ln.line_id, ops[ops.length - 1].operation_id) });
    stageLines.set(ln.stage_id, arr);
  }
  stageTransitions.forEach((e, idx) => {
    const froms = stageLines.get(e.from_stage_id);
    const tos = stageLines.get(e.to_stage_id);
    if (!froms || !tos || !tos.length) return;
    const toFirst = tos[0].first; // 下游 stage 第一条线的首工序
    const secs = e.connection_time >= 60 ? `${Math.round(e.connection_time / 60)}min` : `${e.connection_time}s`;
    froms.forEach((f, fi) => {
      out.push({
        id: `st-${idx}-${fi}`,
        source: f.last,
        target: toFirst,
        sourceHandle: "out",
        targetHandle: "in",
        type: "default",
        animated: true,
        label: fi === 0 ? `${e.connection_type} · ${secs}` : undefined, // 只在第一条标，避免重叠
        labelStyle: { fill: "#5eead4", fontSize: 10 },
        labelBgStyle: { fill: "#0b1626", fillOpacity: 0.85 },
        labelBgPadding: [4, 2],
        labelBgBorderRadius: 3,
        style: { stroke: "#2f9e8f", strokeWidth: 1.4, strokeDasharray: "6,4" },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#2f9e8f" },
      });
    });
  });
  // 投料框 → 工序 的箭头（从投料框底部指向工序顶部入料口 mat-in）
  for (const ln of lines) {
    for (const op of ln.ops) {
      const raw = op.materialUsage ? Object.entries(op.materialUsage).filter(([c]) => !isSemiFinished(c)) : [];
      if (!raw.length) continue;
      const opNode = nid(ln.line_id, op.operation_id);
      out.push({
        id: `mat-e-${opNode}`,
        source: `mat-${opNode}`,
        target: opNode,
        sourceHandle: "mat-out",
        targetHandle: "mat-in",
        type: "default",
        style: { stroke: "#b45309", strokeWidth: 1.6 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#b45309" },
      });
    }
  }
  return out;
}

export default function FactorySchematic({ lines, stageTransitions = [], mode = "config", opStates, bufStates, materialStates, onSelectOp }: Props) {
  const { t } = useTranslation();
  const stateLabel = (s: string) =>
    ({ IDLE: t("Idle"), BUSY: t("Running"), BLOCKED: t("Backpressure"), STARVED: t("Starved"), SHORTAGE: t("Material shortage"), FAILURE: t("Failure") } as Record<string, string>)[s] || s;

  const opLine = useMemo(() => {
    const m = new Map<string, { op: SchematicOp; line: SchematicLine }>();
    lines.forEach((ln) => ln.ops.forEach((op) => m.set(nid(ln.line_id, op.operation_id), { op, line: ln })));
    return m;
  }, [lines]);

  const baseNodes = useMemo(() => buildNodes(lines, mode), [lines, mode]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  useEffect(() => {
    setNodes(baseNodes);
  }, [baseNodes, setNodes]);

  // 回放：增量更新 data（状态 + 在制 CT），保留拖动后的位置。只有真正变化的节点才生成新对象，
  // 未变的返回原引用 → React Flow 跳过其重渲染（CT 每 tMs 插值，仅 BUSY 节点会变）。
  useEffect(() => {
    if (mode !== "playback") return;
    setNodes((nds) =>
      nds.map((n) => {
        if (n.type !== "operation") return n;
        const s = opStates?.[n.id];
        const d = n.data as OpData;
        if (d.status === s?.status && d.ctElapsed === s?.ctElapsed && d.ctTotal === s?.ctTotal && d.product === s?.product && d.done === s?.done && d.plan === s?.plan) return n;
        return { ...n, data: { ...n.data, status: s?.status, ctElapsed: s?.ctElapsed, ctTotal: s?.ctTotal, product: s?.product, done: s?.done, plan: s?.plan } };
      }),
    );
  }, [opStates, mode, setNodes]);

  const edges = useMemo(() => buildEdges(lines, stageTransitions, bufStates, mode), [lines, stageTransitions, bufStates, mode]);

  const onNodeClick = useCallback(
    (_: unknown, node: Node) => {
      if (node.type !== "operation") return;
      const hit = opLine.get(node.id);
      if (hit) onSelectOp?.(hit.op, hit.line);
    },
    [opLine, onSelectOp],
  );

  return (
    <div className="w-full h-full" style={{ background: "#070f1a" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        fitView
        minZoom={0.08}
        maxZoom={2}
        nodesConnectable={false}
        elevateNodesOnSelect
        proOptions={{ hideAttribution: false }}
      >
        <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#1b2c40" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          style={{ background: "#0b1626", border: "1px solid #16263a" }}
          maskColor="rgba(2,8,18,0.6)"
          nodeColor={(n) => {
            if (n.type !== "operation") return "#16263a";
            const s = (n.data as unknown as OpData)?.status;
            return mode === "playback" ? (STATE_STYLE[s || "IDLE"] || STATE_STYLE.DEFAULT).mini : STATE_STYLE.DEFAULT.mini;
          }}
        />
        <Panel position="top-left">
          {/* 图例 + 物料库存面板纵向堆叠在左上，避开右侧"产线进度"覆盖层 */}
          <div className="flex flex-col gap-1.5 items-start">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-[#16263a] bg-[#0a1626]/90 px-2.5 py-1.5 text-[11px] text-slate-400 backdrop-blur">
              {mode === "playback" ? (
                STATE_KEYS.map((s) => (
                  <span key={s} className="inline-flex items-center gap-1.5">
                    <span className="inline-block w-3 h-3 rounded" style={{ background: STATE_STYLE[s].fill, border: `1.5px solid ${STATE_STYLE[s].stroke}` }} />
                    {stateLabel(s)}
                  </span>
                ))
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded" style={{ background: STATE_STYLE.DEFAULT.fill, border: `1.5px solid ${STATE_STYLE.DEFAULT.stroke}` }} />
                  {t("Operation")}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5" style={{ color: "#fcd34d" }}>
                ● {t("Feed materials")}
              </span>
              <span className="inline-flex items-center gap-1.5" style={{ color: "#a78bda" }}>
                ▸ {t("Buffer")}
              </span>
              <span className="inline-flex items-center gap-1.5" style={{ color: "#5eead4" }}>
                ┄ {t("Stage continuity")}
              </span>
            </div>
            {mode === "playback" && materialStates && Object.keys(materialStates).length > 0 && (
              <div className="rounded-md border border-[#16263a] bg-[#0a1626]/90 px-2.5 py-1.5 text-[11px] backdrop-blur min-w-[150px]">
                <div className="text-slate-300 font-semibold mb-1">{t("Material inventory")}</div>
                {Object.entries(materialStates)
                  .sort((a, b) => a[0].localeCompare(b[0]))
                  .map(([code, st]) => {
                    const out = (st?.quantity ?? 0) <= 0;
                    return (
                      <div key={code} className="flex items-center justify-between gap-3" style={{ color: out ? "#fca5a5" : "#cdd9e8" }}>
                        <span>{code}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {Math.round(st?.quantity ?? 0)}{out ? ` ⚠${t("Out of stock")}` : ""}
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
