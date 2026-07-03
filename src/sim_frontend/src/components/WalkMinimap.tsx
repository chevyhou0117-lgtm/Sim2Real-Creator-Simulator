// 漫游俯视小地图：工厂整体范围 + 产线包围矩形 + 玩家位置/朝向箭头（含视野扇形）。
// 坐标：Kit /ov/walk/map 的地面平面 (u, v)（Z-up=世界xy / Y-up=世界xz），这里线性
// 映射到像素并翻转 v 轴（SVG y 向下）。heading_deg 0°=+u 逆时针 → SVG 里取负角。
// 点击地图任意点 = 传送到该点（指针锁定时点不到这里，天然只在"松开鼠标"状态可用）。
// 颜色走 currentColor + text-* 类（禁写字面 hex，主题切换自动适配）。
import { useMemo } from 'react';
import type { WalkMapData, WalkMapLine, WalkPose2D } from '@/lib/kit';

// 地图最大像素尺寸；实际宽高按工厂长宽比等比缩放
const MAX_W = 248;
const MAX_H = 190;
// 边距（世界矩形贴边不好看，四周留几像素）
const PAD = 8;

interface Props {
  map: WalkMapData | null;
  pose: WalkPose2D | null;
  /** 产线显示名（tooltip 用）。 */
  nameOf: (line: WalkMapLine) => string;
  onTeleport: (u: number, v: number) => void;
}

export function WalkMinimap({ map, pose, nameOf, onTeleport }: Props) {
  const geom = useMemo(() => {
    if (!map) return null;
    const du = Math.max(1e-6, map.u_max - map.u_min);
    const dv = Math.max(1e-6, map.v_max - map.v_min);
    const k = Math.min((MAX_W - PAD * 2) / du, (MAX_H - PAD * 2) / dv);
    return { k, w: du * k + PAD * 2, h: dv * k + PAD * 2 };
  }, [map]);

  if (!map || !geom) return null;
  const { k, w, h } = geom;
  const X = (u: number) => PAD + (u - map.u_min) * k;
  const Y = (v: number) => PAD + (map.v_max - v) * k;

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    onTeleport(map.u_min + (px - PAD) / k, map.v_max - (py - PAD) / k);
  };

  return (
    <div
      className="bg-[var(--c-0b1d30)]/85 border border-[var(--c-1e3a55)] rounded-xl shadow-2xl backdrop-blur-sm p-1.5 pointer-events-auto"
      // 点击小地图不抢焦点（焦点留在 video，WASD 转发不断）
      onMouseDown={(e) => e.preventDefault()}
    >
      <svg
        width={w}
        height={h}
        onClick={handleClick}
        className="block cursor-crosshair select-none"
        role="img"
      >
        {/* 工厂整体范围 */}
        <rect
          x={X(map.u_min)} y={Y(map.v_max)}
          width={(map.u_max - map.u_min) * k} height={(map.v_max - map.v_min) * k}
          rx={3}
          fill="currentColor" fillOpacity={0.06}
          stroke="currentColor" strokeOpacity={0.35}
          className="text-slate-400"
        />
        {/* 墙体（Kit 按躯干高度带扫出的墙段 AABB；细段强制最少 1px 可见） */}
        {(map.walls ?? []).map((wall, i) => (
          <rect
            key={`wall-${i}`}
            x={X(wall.u_min)} y={Y(wall.v_max)}
            width={Math.max(1, (wall.u_max - wall.u_min) * k)}
            height={Math.max(1, (wall.v_max - wall.v_min) * k)}
            fill="currentColor" fillOpacity={0.6}
            className="text-slate-400"
          />
        ))}
        {/* 产线矩形 */}
        {map.lines.map((line) => (
          <rect
            key={line.prim_path}
            x={X(line.u_min)} y={Y(line.v_max)}
            width={Math.max(2, (line.u_max - line.u_min) * k)}
            height={Math.max(2, (line.v_max - line.v_min) * k)}
            rx={1.5}
            fill="currentColor" fillOpacity={0.22}
            stroke="currentColor" strokeOpacity={0.65}
            className="text-blue-400 hover:fill-blue-300"
          >
            <title>{nameOf(line)}</title>
          </rect>
        ))}
        {/* 玩家：视野扇形 + 朝向箭头（heading 逆时针为正 → SVG y 翻转取负角） */}
        {pose && (
          <g transform={`translate(${X(pose.u)}, ${Y(pose.v)}) rotate(${-pose.heading_deg})`}>
            <path
              d="M0,0 L26,-13 A29,29 0 0 1 26,13 Z"
              fill="currentColor" fillOpacity={0.13}
              className="text-amber-300"
            />
            <path
              d="M7,0 L-4.5,4.5 L-2,0 L-4.5,-4.5 Z"
              fill="currentColor"
              stroke="currentColor" strokeOpacity={0.5}
              className="text-amber-300"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
