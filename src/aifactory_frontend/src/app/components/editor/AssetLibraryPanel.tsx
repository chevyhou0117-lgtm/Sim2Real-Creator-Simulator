import React, { useState, useEffect, useCallback } from "react";
import { ChevronDown, ChevronRight, Search, Box, Layers3 } from "lucide-react";
import { CategoryNode } from "../../../types/category";
import { t, useLocalized } from "../../utils/i18n";
import "./editor.css";

const iconList = ["⚙", "▣", "◈", "◉", "▷"];
const iconColorList = [
  "text-blue-400",
  "text-emerald-400",
  "text-amber-400",
  "text-violet-400",
  "text-slate-400",
];

function AssetLibraryNode({
  node,
  depth,
  onDragStart,
  onDragEnd,
}: {
  node: CategoryNode;
  depth: number;
  onDragStart: (e: React.DragEvent, node: CategoryNode) => void;
  onDragEnd: (e: React.DragEvent) => void;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = (node.children?.length ?? 0) > 0;
  const L = useLocalized();

  // const isLeaf = !hasChildren;
  const isLeaf = node.type == "line_model";

  return (
    <div>
      <button
        onClick={() => hasChildren && setOpen((o) => !o)}
        draggable={isLeaf}
        onDragStart={(e) => isLeaf && onDragStart(e, node)}
        onDragEnd={onDragEnd}
        className={`w-full flex items-center gap-1 py-0.5 rounded-sm mx-1 transition-colors text-[10px] ${
          isLeaf
            ? "cursor-grab text-slate-400 hover:text-blue-300 hover:bg-blue-600/10 active:cursor-grabbing"
            : " text-slate-400 hover:text-slate-200 hover:bg-[#0f2035]"
        }`}
        style={{ paddingLeft: `${6 + depth * 10}px` }}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown size={9} className="text-slate-600 flex-shrink-0" />
          ) : (
            <ChevronRight size={9} className="text-slate-600 flex-shrink-0" />
          )
        ) : (
          <span className="w-2.5 flex-shrink-0 text-center text-slate-700">
            ·
          </span>
        )}
        {isLeaf && <Box size={9} className="text-blue-400/70 flex-shrink-0" />}
        <span className="truncate">{L(node, "name")}</span>
      </button>
      {open &&
        hasChildren &&
        node.children!.map((child) => (
          <AssetLibraryNode
            key={child.id}
            node={child}
            depth={depth + 1}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
          />
        ))}
    </div>
  );
}

export function AssetLibraryPanel({
  assetList,
  onDragStart,
}: {
  assetList: any[];
  onDragStart?: (node: any) => void;
}) {
  const [search, setSearch] = useState("");
  const [openCats, setOpenCats] = useState<Set<string>>(new Set(["equipment"]));
  const [draggingNode, setDraggingNode] = useState<any | null>(null);
  const L = useLocalized();

  const handleDragStart = useCallback(
    (e: React.DragEvent, node: any) => {
      setDraggingNode(node);
      console.log(node);
      e.dataTransfer.effectAllowed = "copy";
      e.dataTransfer.setData("application/json", JSON.stringify(node));
      onDragStart?.(node);
    },
    [onDragStart],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingNode(null);
  }, []);

  function toggleCat(id: string) {
    setOpenCats((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function matchesSearch(node: any): boolean {
    if (node.name.toLowerCase().includes(search.toLowerCase())) return true;
    return (node.children ?? []).some(matchesSearch);
  }

  const filtered: any[] = search
    ? assetList
        .map((cat) => ({
          ...cat,
          children: cat.children.filter(matchesSearch),
        }))
        .filter((cat) => cat.children.length > 0)
    : assetList;

  useEffect(() => {
    assetList.forEach((cat, index) => {
      cat.icon = iconList[index % iconList.length];
      cat.color = iconColorList[index % iconColorList.length];
    });
  }, []);

  return (
    <div
      className="border-b border-[#142235] flex-shrink-0 flex flex-col"
      style={{ maxHeight: "45%", overflow: "hidden" }}
    >
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-[#142235]">
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
          <Layers3 size={10} className="text-blue-400" /> {t("assetLibrary.title")}
        </span>
      </div>

      <div className="px-2 py-1.5 border-b border-[#142235]">
        <div className="relative">
          <Search
            size={9}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-600"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("assetLibrary.searchPlaceholder")}
            className="w-full pl-6 pr-2 py-1 bg-[#040d18] border border-[#1e3a55] rounded text-[10px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 py-1 tree-content">
        {filtered.map((cat) => (
          <div key={cat.id}>
            <button
              onClick={() => toggleCat(cat.id)}
              className="w-full flex items-center gap-1.5 px-2 py-1 text-[10px] font-semibold hover:bg-[#0f2035] transition-colors"
            >
              {openCats.has(cat.id) ? (
                <ChevronDown size={9} className="text-slate-600" />
              ) : (
                <ChevronRight size={9} className="text-slate-600" />
              )}
              <span className={cat.color}>{cat.icon}</span>
              <span className="text-slate-300">{L(cat, "name")}</span>
              <span className="ml-auto text-[9px] text-slate-600">
                {cat.children.length}
              </span>
            </button>
            {openCats.has(cat.id) &&
              cat.children.map((node) => (
                <AssetLibraryNode
                  key={node.id}
                  node={node}
                  depth={1}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))}
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-[10px] text-slate-600 text-center py-4">
            {t("assetLibrary.noAssets")}
          </div>
        )}
      </div>

      <div className="px-2 py-1.5 border-t border-[#142235]">
        <div className="text-[9px] text-slate-700 text-center">
          {draggingNode ? (
            <span className="text-blue-400">
              {t("assetLibrary.dragging", { name: L(draggingNode, "name") || "" })}
            </span>
          ) : (
            t("assetLibrary.dragHint")
          )}
        </div>
      </div>
    </div>
  );
}
