/*
 * 工厂 2D 俯视示意图（schematic，非真实坐标 —— 系统没有平面坐标数据）。
 * 复用于两处：① 参数配置页静态展示当前 BoP + 线边仓；② 仿真回放页按时刻快照着色 + 缓冲水位。
 *
 * 布局：每条产线 = 一条横向泳道；泳道内工序(operation)按 sequence 从左到右排成盒子，盒子间画
 * 箭头 + 虚拟线边仓（容量数字 / ∞）。传入 opStates/bufStates 时，盒子按状态着色、缓冲按水位填充。
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export interface SchematicOp {
  operation_id: string;
  code: string;
  name?: string;
  ct?: number | null;
  seq: number;
}
export interface SchematicBuffer {
  wip_id: string;
  pre_operation_id: string | null;
  post_operation_id: string | null;
  capacity_qty: number | null; // null = 无限
}
export interface SchematicLine {
  line_id: string;
  line_code: string;
  line_name: string;
  ops: SchematicOp[];
  buffers: SchematicBuffer[];
}
export interface OpState {
  status: string; // IDLE / BUSY / BLOCKED / STARVED / FAILURE
}
export interface BufState {
  quantity: number;
  capacity: number | null;
  fill_rate: number | null;
  material_code?: string | null;
}

interface Props {
  lines: SchematicLine[];
  opStates?: Record<string, OpState>; // 键=operation_id（回放时由 equipment_states 聚合而来）
  bufStates?: Record<string, BufState>; // 键=wip_id
  selectedOpId?: string | null;
  onSelectOp?: (op: SchematicOp, line: SchematicLine) => void;
  legend?: boolean;
}

// 布局常量
const OP_W = 78;
const OP_H = 54;
const GAP = 50; // 工序盒之间的间隔（放箭头 + 缓冲）
const LABEL_W = 104;
const LANE_TOP_PAD = 26;
const LANE_H = OP_H + 56;
const BUF_W = 28;
const BUF_H = 34;

// 状态 → 配色（贴合深色主题）
const STATE_STYLE: Record<string, { fill: string; stroke: string; text: string; label: string }> = {
  IDLE: { fill: "#10243b", stroke: "#27425f", text: "#64748b", label: "空闲" },
  BUSY: { fill: "#0f2f57", stroke: "#3b82f6", text: "#93c5fd", label: "运行" },
  BLOCKED: { fill: "#3a1320", stroke: "#ef4444", text: "#fca5a5", label: "背压(堵)" },
  STARVED: { fill: "#3a2a0f", stroke: "#f59e0b", text: "#fcd34d", label: "饥饿(饿)" },
  FAILURE: { fill: "#3a0f12", stroke: "#b91c1c", text: "#f87171", label: "故障" },
  DEFAULT: { fill: "#0d2035", stroke: "#1e3a55", text: "#9fb4cc", label: "未运行" },
};

function styleFor(status?: string) {
  if (!status) return STATE_STYLE.DEFAULT;
  return STATE_STYLE[status] || STATE_STYLE.DEFAULT;
}

export default function FactorySchematic({
  lines,
  opStates,
  bufStates,
  selectedOpId,
  onSelectOp,
  legend = false,
}: Props) {
  const { t } = useTranslation();

  // 每条线工序按 seq 排序 + 计算 x 位置（operation_id -> x 中心）
  const laid = useMemo(() => {
    return lines.map((ln) => {
      const ops = [...ln.ops].sort((a, b) => a.seq - b.seq);
      const xById: Record<string, number> = {};
      ops.forEach((op, i) => {
        xById[op.operation_id] = LABEL_W + i * (OP_W + GAP) + OP_W / 2;
      });
      return { ln, ops, xById };
    });
  }, [lines]);

  const maxOps = Math.max(1, ...laid.map((l) => l.ops.length));
  const width = LABEL_W + maxOps * (OP_W + GAP) + 20;
  const height = laid.length * LANE_H + 12;

  return (
    <div className="w-full overflow-auto rounded-lg border border-[#142235] bg-[#081523]">
      {legend && (
        <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-[#142235] text-[11px] text-slate-400">
          {["BUSY", "BLOCKED", "STARVED", "FAILURE", "IDLE"].map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ background: STATE_STYLE[s].fill, border: `1.5px solid ${STATE_STYLE[s].stroke}` }}
              />
              {STATE_STYLE[s].label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-sm border border-[#8b5cf6]" style={{ background: "#1a1330" }} />
            {t("Line-side Warehouse")}
          </span>
        </div>
      )}
      <svg width={width} height={height} style={{ display: "block", minWidth: "100%" }}>
        {laid.map(({ ln, ops, xById }, li) => {
          const top = li * LANE_H;
          const cy = top + LANE_TOP_PAD + OP_H / 2;
          return (
            <g key={ln.line_id}>
              {/* 泳道标签 */}
              <text x={10} y={cy - 4} fill="#cbd5e1" fontSize={12} fontWeight={600}>
                {ln.line_name || ln.line_code}
              </text>
              <text x={10} y={cy + 12} fill="#5b7a99" fontSize={9}>
                {ln.line_code}
              </text>
              <line x1={0} y1={top + LANE_H - 1} x2={width} y2={top + LANE_H - 1} stroke="#0e1f33" strokeWidth={1} />

              {/* 工序间连线 + 缓冲 */}
              {ops.slice(0, -1).map((op, i) => {
                const next = ops[i + 1];
                const x1 = xById[op.operation_id] + OP_W / 2;
                const x2 = xById[next.operation_id] - OP_W / 2;
                return (
                  <g key={`lnk-${op.operation_id}`}>
                    <line x1={x1} y1={cy} x2={x2} y2={cy} stroke="#243b54" strokeWidth={1.5} />
                    <polygon
                      points={`${x2},${cy} ${x2 - 6},${cy - 3.5} ${x2 - 6},${cy + 3.5}`}
                      fill="#3a5876"
                    />
                  </g>
                );
              })}

              {/* 线边仓（在 pre/post 工序之间） */}
              {ln.buffers.map((b) => {
                const xa = b.pre_operation_id ? xById[b.pre_operation_id] : undefined;
                const xb = b.post_operation_id ? xById[b.post_operation_id] : undefined;
                if (xa == null || xb == null) return null;
                const mid = (xa + xb) / 2;
                const st = bufStates?.[b.wip_id];
                const cap = st?.capacity ?? b.capacity_qty;
                const qty = st?.quantity ?? 0;
                const fr = st?.fill_rate ?? (cap ? qty / cap : null);
                const full = fr != null && fr >= 1;
                const bx = mid - BUF_W / 2;
                const byTop = cy - BUF_H / 2;
                // 填充高度（无限/无状态 → 不填）
                const fillH = fr != null ? Math.max(0, Math.min(1, fr)) * (BUF_H - 4) : 0;
                return (
                  <g key={`buf-${b.wip_id}`}>
                    <rect
                      x={bx}
                      y={byTop}
                      width={BUF_W}
                      height={BUF_H}
                      rx={3}
                      fill="#150f28"
                      stroke={full ? "#ef4444" : "#8b5cf6"}
                      strokeWidth={1.4}
                    />
                    {fillH > 0 && (
                      <rect
                        x={bx + 2}
                        y={byTop + BUF_H - 2 - fillH}
                        width={BUF_W - 4}
                        height={fillH}
                        rx={2}
                        fill={full ? "#ef4444" : "#8b5cf6"}
                        opacity={0.55}
                      />
                    )}
                    <text x={mid} y={byTop + BUF_H + 12} textAnchor="middle" fontSize={9} fill="#a78bda">
                      {cap == null ? "∞" : bufStates ? `${qty}/${cap}` : `≤${cap}`}
                    </text>
                  </g>
                );
              })}

              {/* 工序盒 */}
              {ops.map((op) => {
                const cx = xById[op.operation_id];
                const x = cx - OP_W / 2;
                const y = top + LANE_TOP_PAD;
                const stt = styleFor(opStates?.[op.operation_id]?.status);
                const selected = selectedOpId === op.operation_id;
                return (
                  <g
                    key={op.operation_id}
                    onClick={() => onSelectOp?.(op, ln)}
                    style={{ cursor: onSelectOp ? "pointer" : "default" }}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={OP_W}
                      height={OP_H}
                      rx={6}
                      fill={stt.fill}
                      stroke={selected ? "#e2e8f0" : stt.stroke}
                      strokeWidth={selected ? 2.2 : 1.5}
                    />
                    <text x={cx} y={y + 20} textAnchor="middle" fontSize={11} fontWeight={600} fill={stt.text}>
                      {op.code.length > 11 ? op.code.slice(0, 10) + "…" : op.code}
                    </text>
                    <text x={cx} y={y + 36} textAnchor="middle" fontSize={9} fill="#5d7a99">
                      {op.ct != null ? `${Number(op.ct).toFixed(1)}s` : ""}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
