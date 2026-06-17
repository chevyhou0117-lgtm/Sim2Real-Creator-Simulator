import React, { useState, useEffect } from "react";
import {
  ChevronRight,
  Cog,
  Navigation,
  MousePointer2,
  Move,
  ZoomIn,
  ZoomOut,
  Play,
  Pause,
  RotateCcw,
} from "lucide-react";
import type { FactoryNode } from "../../../types/factoryEditor";
import type { ViewMode } from "../../../types/factoryEditor";

import WebComposerView from "../../components/composer/WebComposerView";

// ── Viewport Toolbar ──────────────────────────────────────────────────────────
const VIEWPORT_TOOLS = [
  { id: "select", icon: MousePointer2, label: "Select (S)" },
  { id: "move", icon: Move, label: "Move (M)" },
  { id: "rotate", icon: RotateCcw, label: "Rotate (R) — Alt+鼠标左键" },
  { id: "zoomin", icon: ZoomIn, label: "Zoom In (+)" },
  { id: "zoomout", icon: ZoomOut, label: "Zoom Out (−)" },
] as const;

function ViewportToolbar() {
  const [activeTool, setActiveTool] = useState<string>("select");
  const [playing, setPlaying] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 2500);
    return () => clearTimeout(t);
  }, [hint]);

  return (
    <>
      {/* 快捷键提示浮层 — fixed定位，不影响布局 */}
      {hint && (
        <div className="fixed left-[4.5rem] top-1/2 -translate-y-1/2 ml-2 bg-[#0f2638] border border-blue-500/30 rounded-md px-3 py-1.5 text-xs text-blue-300 whitespace-nowrap shadow-lg z-[9999] pointer-events-none">
          {hint}
        </div>
      )}

      <div
        className="absolute left-3 top-1/2 -translate-y-1/2 flex flex-col gap-1 bg-[#071526]/90 border border-[#142235] rounded-lg p-1.5 backdrop-blur-sm z-10"
        onClick={(e) => {
          console.log("Toolbar container clicked", e.target);
          e.stopPropagation();
        }}
      >
        {VIEWPORT_TOOLS.map(({ id, icon: Icon, label }) => (
          <button
            type="button"
            key={id}
            title={label}
            onClick={() => {
              console.log("Toolbar button clicked:", id);
              setActiveTool(id);
              if (id === "rotate") setHint("快捷键: Alt + 鼠标左键");
              else setHint(null);
            }}
          className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
            activeTool === id
              ? "bg-blue-600/30 text-blue-400"
              : "text-slate-500 hover:text-slate-200 hover:bg-[#142235]"
          }`}
        >
          <Icon size={13} />
        </button>
      ))}

      {/* Divider */}
      <div className="my-0.5 border-t border-[#142235]" />

      {/* Play / Pause toggle */}
      <button
        type="button"
        title={playing ? "Pause simulation" : "Play simulation"}
        onClick={() => {
          console.log("Play/pause button clicked");
          setPlaying((v) => !v);
        }}
        className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
          playing
            ? "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
            : "text-slate-500 hover:text-slate-200 hover:bg-[#142235]"
        }`}
      >
        {playing ? <Pause size={13} /> : <Play size={13} />}
      </button>
    </div>
    </>
  );
}

// ── Floor / Overlay Nav Panel ─────────────────────────────────────────────────
const FLOORS = [
  { id: "2f", label: "2F" },
  { id: "1f", label: "1F" },
  { id: "b1", label: "B1" },
];

const OVERLAYS = [{ id: "agv", label: "AGV Paths", icon: Navigation }];

function FloorNavPanel() {
  // console.log("FloorNavPanel rendered");
  const [viewMode, setViewMode] = useState<"2d" | "3d">("3d");
  const [activeFloor, setActiveFloor] = useState("1f");
  const [floorsOpen, setFloorsOpen] = useState(true);
  const [overlaysOpen, setOverlaysOpen] = useState(true);
  const [activeOverlays, setActiveOverlays] = useState<Set<string>>(
    new Set(["agv"]),
  );

  function toggleOverlay(id: string) {
    setActiveOverlays((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div
      className="absolute right-3 top-3 flex flex-col gap-2 min-w-[100px]"
      onClick={(e) => {
        console.log("FloorNavPanel container clicked", e.target);
        e.stopPropagation();
      }}
    >
      {/* View mode toggle */}
      <div className="bg-[#071526]/90 border border-[#142235] rounded-lg p-1 backdrop-blur-sm flex">
        {(["3d", "2d"] as const).map((mode) => (
          <button
            type="button"
            key={mode}
            onClick={() => {
              console.log("View mode button clicked:", mode);
              setViewMode(mode);
            }}
            className={`flex-1 px-2 py-1 text-[9px] rounded transition-colors font-medium ${
              viewMode === mode
                ? "bg-blue-600/30 text-blue-400"
                : "text-slate-500 hover:text-slate-200"
            }`}
          >
            {mode.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Floors */}
      <div className="bg-[#071526]/90 border border-[#142235] rounded-lg backdrop-blur-sm overflow-hidden">
        <button
          type="button"
          onClick={() => {
            console.log("Floors toggle clicked");
            setFloorsOpen((v) => !v);
          }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 text-[9px] font-semibold text-slate-400 uppercase tracking-wider hover:bg-[#142235] transition-colors"
        >
          Floors
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className={`transition-transform ${floorsOpen ? "rotate-0" : "-rotate-90"}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {floorsOpen && (
          <div className="px-1.5 pb-1.5 space-y-0.5">
            {FLOORS.map((floor) => (
              <button
                type="button"
                key={floor.id}
                onClick={() => {
                  console.log("Floor button clicked:", floor.id);
                  setActiveFloor(floor.id);
                }}
                className={`w-full text-left px-2 py-1 text-[10px] rounded transition-colors ${
                  activeFloor === floor.id
                    ? "bg-blue-600/20 text-blue-300"
                    : "text-slate-500 hover:text-slate-300 hover:bg-[#142235]"
                }`}
              >
                {floor.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Overlays */}
      <div className="bg-[#071526]/90 border border-[#142235] rounded-lg backdrop-blur-sm overflow-hidden">
        <button
          type="button"
          onClick={() => {
            console.log("Overlays toggle clicked");
            setOverlaysOpen((v) => !v);
          }}
          className="w-full flex items-center justify-between px-2.5 py-1.5 text-[9px] font-semibold text-slate-400 uppercase tracking-wider hover:bg-[#142235] transition-colors"
        >
          Overlays
          <svg
            width="8"
            height="8"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            className={`transition-transform ${overlaysOpen ? "rotate-0" : "-rotate-90"}`}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {overlaysOpen && (
          <div className="px-1.5 pb-1.5 space-y-0.5">
            {OVERLAYS.map(({ id, label, icon: Icon }) => (
              <label
                key={id}
                className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer rounded hover:bg-[#142235] transition-colors"
              >
                <Icon size={10} />
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={activeOverlays.has(id)}
                  onChange={() => {
                    console.log("Overlay checkbox toggled:", id);
                    toggleOverlay(id);
                  }}
                  className="ml-auto accent-blue-600 w-2.5 h-2.5"
                />
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Viewport3D
// ══════════════════════════════════════════════════════════════════════════════
import { notifyOpenOvFactoryApi } from "../../api";
export function Viewport3D({
  selectedNode,
  viewMode,
  viewContextNode,
  breadcrumb,
  onBreadcrumbClick,
  onCanvasNodeClick,
  rootUsdPath,
  onDragNodeComplete,
}: {
  selectedNode: FactoryNode | null;
  viewMode: ViewMode;
  viewContextNode: FactoryNode | null;
  breadcrumb: FactoryNode[];
  onBreadcrumbClick: (id: string) => void;
  onCanvasNodeClick: (id: string) => void;
  rootUsdPath: string;
}) {
  console.log("breadcrumb:", breadcrumb);
  // ── Floor view: derive highlight type from selected node ──
  const highlightType =
    viewMode === "floor" ? (selectedNode?.type ?? null) : null;

  useEffect(() => {
    if (rootUsdPath) {
      openFactoryStage();
    }
  }, [rootUsdPath]);

  const openFactoryStage = () => {
    console.log("openFactoryStage, rootUsdPath:", rootUsdPath);
    notifyOpenOvFactoryApi({
      rootUsdPath: rootUsdPath || "",
    });
  };

  return (
    <div className="w-full h-full relative flex flex-col overflow-hidden bg-[#07111e]">
      {/* ── Breadcrumb bar ── */}
      {breadcrumb.length > 0 && (
        <div className="flex-shrink-0 flex items-center gap-1 px-3 py-1 bg-[#050f1a]/80 border-b border-[#142235]">
          {breadcrumb.map((crumb, i) => {
            const isLast = i === breadcrumb.length - 1;
            const viewLabel: Record<string, string> = {
              factory: "Floor View",
              process: "Floor View",
              line: "Line View",
              equipment: "Equipment View",
            };
            return (
              <React.Fragment key={crumb.id}>
                {i > 0 && (
                  <ChevronRight
                    size={9}
                    className="text-slate-700 flex-shrink-0"
                  />
                )}
                <button
                  onClick={() => {
                    console.log(
                      "Breadcrumb clicked:",
                      crumb.id,
                      crumb.name,
                      "isLast:",
                      isLast,
                    );
                    if (!isLast) {
                      onBreadcrumbClick(crumb.id);
                    }
                  }}
                  className={`text-[10px] truncate max-w-[120px] transition-colors ${
                    isLast
                      ? "text-slate-400 cursor-default"
                      : "text-slate-600 hover:text-blue-400 cursor-pointer"
                  }`}
                >
                  {crumb.name}
                </button>
                {isLast && (
                  <span className="ml-0.5 px-1 py-0.5 rounded text-[9px] bg-blue-600/15 text-blue-500 border border-blue-600/20 flex-shrink-0">
                    {viewLabel[crumb.type] ?? "Floor View"}
                  </span>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* ── Main canvas area ── */}
      <div className="flex-1 relative flex items-center justify-center overflow-hidden">
        {/* Viewport Toolbar */}
        <ViewportToolbar />

        {/* Grid floor */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(30,58,95,0.35) 1px, transparent 1px),
              linear-gradient(90deg, rgba(30,58,95,0.35) 1px, transparent 1px)
            `,
            backgroundSize: "48px 48px",
          }}
        />

         {/*webComposer 视频流 */}
        <div className="w-full h-full">
          <WebComposerView
            rootUsdPath={rootUsdPath || ""}
            onDragNodeComplete={onDragNodeComplete}
          />
        </div>

        {/* Floor / Overlay Nav Panel (Floor View only) */}
        {viewMode === "floor" && <FloorNavPanel />}
      </div>

      {/* ── Status bar ── */}
      <div className="flex-shrink-0 h-6 bg-[#050f1a]/90 border-t border-[#142235] flex items-center px-3 gap-4 text-[10px] text-slate-600">
        {selectedNode && (
          <>
            <span className="flex items-center gap-1">
              <span className="text-slate-500">Selected:</span>
              <span className="text-slate-300">{selectedNode.name}</span>
            </span>
            <span className="text-[#142235]">|</span>
            <span className="flex items-center gap-1">
              <span className="text-slate-500">Type:</span>
              <span className="text-blue-400 capitalize">
                {selectedNode.type}
              </span>
            </span>
            <span className="text-[#142235]">|</span>
            <span className="flex items-center gap-1">
              <span className="text-slate-500">View:</span>
              <span className="text-emerald-400 capitalize">
                {viewMode === "floor"
                  ? "Floor"
                  : viewMode === "line"
                    ? "Line"
                    : "Equipment"}
              </span>
            </span>
          </>
        )}
        <span className="ml-auto flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          USD Composer Connected
        </span>
      </div>
    </div>
  );
}
