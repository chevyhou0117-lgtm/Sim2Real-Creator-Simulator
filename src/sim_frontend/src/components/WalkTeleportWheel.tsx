// 漫游传送轮盘（Tab 呼出，游戏武器轮盘式）：产线按钮沿圆周均匀排布，点击即传送
// 到该产线正面（Kit /ov/walk/teleport 站位 + 朝向都在 Kit 侧算）。
// 键盘（Tab 开关 / ESC 关闭）监听归 WalkMode 管；本组件纯渲染 + 点击回调。
// 父层 overlay 是 pointer-events-none，这里自己开 pointer-events-auto 接管鼠标。
import { useTranslation } from 'react-i18next';
import type { WalkMapLine } from '@/lib/kit';

interface Props {
  lines: WalkMapLine[];
  /** 产线显示名（master data 中文名优先，缺失回退 prim 名）。 */
  nameOf: (line: WalkMapLine) => string;
  onSelect: (line: WalkMapLine) => void;
  /** 点击轮盘外空白处关闭。 */
  onClose: () => void;
}

export function WalkTeleportWheel({ lines, nameOf, onSelect, onClose }: Props) {
  const { t } = useTranslation();
  const n = lines.length;
  // 半径随产线数微调：少时紧凑，多时撑开避免按钮重叠
  const radius = n <= 6 ? 150 : n <= 10 ? 195 : 240;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-[2px] pointer-events-auto"
      onClick={onClose}
      // mousedown 不 preventDefault 会把焦点从 video 抢走 → 串流库键盘转发断掉，
      // 传送落地后 WASD 失灵。整个轮盘层都不参与焦点。
      onMouseDown={(e) => e.preventDefault()}
    >
      <div
        className="relative"
        style={{ width: radius * 2 + 200, height: radius * 2 + 100 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 环形参考圈 */}
        {n > 0 && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[var(--c-1e3a55)]/70"
            style={{ width: radius * 2, height: radius * 2 }}
          />
        )}

        {/* 中心 hub */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-[var(--c-0b1d30)]/95 border border-[var(--c-1e3a55)] flex flex-col items-center justify-center text-center shadow-2xl px-3">
          {n > 0 ? (
            <>
              <div className="text-[11px] font-semibold text-slate-200">{t('Teleport to line')}</div>
              <div className="text-[9px] text-slate-500 mt-1">{t('Tab / ESC to close')}</div>
            </>
          ) : (
            <div className="text-[10px] text-slate-400 leading-relaxed">{t('No production lines found in this scene')}</div>
          )}
        </div>

        {/* 产线按钮：-90°（正上）起顺时针均匀分布 */}
        {lines.map((line, i) => {
          const angle = (-90 + (i * 360) / n) * (Math.PI / 180);
          const dx = Math.cos(angle) * radius;
          const dy = Math.sin(angle) * radius;
          return (
            <button
              key={line.prim_path}
              onClick={() => onSelect(line)}
              className="absolute left-1/2 top-1/2 max-w-40 truncate px-3 py-1.5 rounded-full text-[11px] font-medium bg-[var(--c-0b1d30)]/95 border border-[var(--c-1e3a55)] text-slate-200 hover:bg-blue-600/40 hover:border-blue-400 hover:text-white transition-colors shadow-lg"
              style={{ transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))` }}
              title={nameOf(line)}
            >
              {nameOf(line)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
