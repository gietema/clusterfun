"use client";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  configAtom, dataAtom, uuidAtom, columnsAtom,
  plotPanelsAtom, plotPanelDataAtom, highlightedPointsAtom,
  bottomDockVisibleAtom, bottomDockHeightAtom,
  dockPositionAtom, dockWidthAtom, detailMediaIndexAtom,
} from "@/app/store/atoms";
import { fetchColumns, fetchDynamicPlotData } from "@/app/lib/api";
import type { PlotConfig, PlotPanelConfig } from "@/app/types";
import { useMediaPreview } from "@/app/lib/use-media-preview";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";
import PlotlyChart from "../plot/PlotlyChart";
import PlotConfigPanel from "../plot/PlotConfigPanel";
import SelectionToolbar from "../plot/SelectionToolbar";
import AnalysisChart, { isAnalysisType } from "./AnalysisCharts";

const MIN_SIZE = 150;
const MAX_SIZE = 700;

let panelIdCounter = 0;
function nextPanelId() {
  return `panel_${++panelIdCounter}`;
}

interface BottomDockProps {
  position: "bottom" | "top" | "right";
}

export default function BottomDock({ position }: BottomDockProps) {
  const [visible, setVisible] = useAtom(bottomDockVisibleAtom);
  const [dockHeight, setDockHeight] = useAtom(bottomDockHeightAtom);
  const [dockWidth, setDockWidth] = useAtom(dockWidthAtom);
  const [dockPosition, setDockPosition] = useAtom(dockPositionAtom);
  const [plotData, setPlotData] = useAtom(dataAtom);
  const config = useAtomValue(configAtom);
  const uuid = useAtomValue(uuidAtom);
  const [columns, setColumns] = useAtom(columnsAtom);
  const [panels, setPanels] = useAtom(plotPanelsAtom);
  const [panelData, setPanelData] = useAtom(plotPanelDataAtom);
  const setHighlightedPoints = useSetAtom(highlightedPointsAtom);
  const setDetailIndex = useSetAtom(detailMediaIndexAtom);

  const { previewMedia } = useMediaPreview();
  const { pushSelection } = useBreadcrumbNav();

  const [revision, setRevision] = useState(0);
  const [panelLoading, setPanelLoading] = useState<Record<string, boolean>>({});
  const [panelConfigs, setPanelConfigs] = useState<Record<string, PlotConfig>>({});
  const [panelRevisions, setPanelRevisions] = useState<Record<string, number>>({});

  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const abortControllers = useRef<Record<string, AbortController>>({});
  const dragging = useRef(false);
  const currentSize = useRef(position === "right" ? dockWidth : dockHeight);
  const dockRef = useRef<HTMLDivElement>(null);

  const isHorizontal = position === "right";
  const size = isHorizontal ? dockWidth : dockHeight;
  const setSize = isHorizontal ? setDockWidth : setDockHeight;

  // Load columns on mount
  useEffect(() => {
    if (!uuid || uuid === "recent") return;
    fetchColumns(uuid).then(setColumns).catch(() => {});
  }, [uuid, setColumns]);

  // Initialize default panel from current config
  useEffect(() => {
    if (!config || panels.length > 0) return;
    const initialPanel: PlotPanelConfig = {
      id: nextPanelId(),
      type: config.type === "grid" ? "scatter" : config.type,
      x: config.x,
      y: config.y,
      color: config.color,
    };
    setPanels([initialPanel]);
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setRevision((r) => r + 1);
  }, [plotData]);

  // Fetch data for a panel
  const fetchPanelData = useCallback(
    (panel: PlotPanelConfig) => {
      if (!uuid) return;
      // Analysis types (outliers / duplicates / farthest) run their own fetches inside AnalysisChart.
      if (isAnalysisType(panel.type)) return;
      if (
        panels.length === 1 &&
        panel.x === config?.x &&
        panel.y === config?.y &&
        panel.color === config?.color &&
        panel.type === config?.type &&
        (panel.bins == null || panel.bins === 20)
      ) {
        return;
      }
      if (!panel.x && !panel.y && panel.type !== "embedding_map") return;

      if (abortControllers.current[panel.id]) {
        abortControllers.current[panel.id].abort();
      }
      const controller = new AbortController();
      abortControllers.current[panel.id] = controller;

      setPanelLoading((prev) => ({ ...prev, [panel.id]: true }));
      fetchDynamicPlotData(uuid, {
        type: panel.type,
        x: panel.x,
        y: panel.y,
        color: panel.color,
        bins: panel.type === "histogram" ? (panel.bins ?? 20) : undefined,
        sample_size: panel.type === "embedding_map" ? (panel.sampleSize ?? 10000) : undefined,
        method: panel.type === "embedding_map" ? (panel.method ?? "umap") : undefined,
        n_neighbors: panel.type === "embedding_map" ? (panel.nNeighbors ?? 15) : undefined,
      }, controller.signal)
        .then(({ data: newData, config: newConfig }) => {
          if (controller.signal.aborted) return;
          setPanelData((prev) => ({ ...prev, [panel.id]: newData }));
          setPanelConfigs((prev) => ({ ...prev, [panel.id]: newConfig }));
          setPanelRevisions((prev) => ({ ...prev, [panel.id]: (prev[panel.id] ?? 0) + 1 }));
          if (panels.length === 1) {
            setPlotData(newData);
          }
        })
        .catch((err) => {
          if (err?.name === "CanceledError" || controller.signal.aborted) return;
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setPanelLoading((prev) => ({ ...prev, [panel.id]: false }));
          }
        });
    },
    [uuid, config, panels, setPanelData, setPlotData, setPanelConfigs],
  );

  const handlePanelChange = useCallback(
    (panelId: string, updated: PlotPanelConfig) => {
      setPanels((prev) => prev.map((p) => (p.id === panelId ? updated : p)));
      const delay = updated.type === "embedding_map" ? 1500 : 300;
      if (debounceTimers.current[panelId]) {
        clearTimeout(debounceTimers.current[panelId]);
      }
      debounceTimers.current[panelId] = setTimeout(() => {
        fetchPanelData(updated);
      }, delay);
    },
    [setPanels, fetchPanelData],
  );

  const addPanel = useCallback(() => {
    if (panels.length >= 4) return;
    const newPanel: PlotPanelConfig = { id: nextPanelId(), type: "scatter" };
    setPanels((prev) => [...prev, newPanel]);
  }, [panels.length, setPanels]);

  const removePanel = useCallback(
    (panelId: string) => {
      setPanels((prev) => prev.filter((p) => p.id !== panelId));
      setPanelData((prev) => { const next = { ...prev }; delete next[panelId]; return next; });
      setPanelConfigs((prev) => { const next = { ...prev }; delete next[panelId]; return next; });
      setPanelRevisions((prev) => { const next = { ...prev }; delete next[panelId]; return next; });
    },
    [setPanels, setPanelData],
  );

  const handleMediaSelect = (indices: number[]) => {
    if (indices.length > 0) {
      setHighlightedPoints(new Set(indices));
      pushSelection(indices, "Selection");
    }
  };

  const handleMediaClick = (index: number | undefined) => {
    if (index == null) return;
    setDetailIndex(index);
    previewMedia(index);
  };

  // Resize handle — works both vertically and horizontally
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    currentSize.current = size;
    document.body.style.cursor = isHorizontal ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";

    const startPos = isHorizontal ? e.clientX : e.clientY;
    const startSize = size;

    const onMouseMove = (ev: MouseEvent) => {
      const currentPos = isHorizontal ? ev.clientX : ev.clientY;
      // For right position, dragging left increases width; for top, dragging down increases height
      const delta = position === "top"
        ? currentPos - startPos
        : startPos - currentPos;
      const newSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, startSize + delta));
      currentSize.current = newSize;
      if (dockRef.current) {
        if (isHorizontal) {
          dockRef.current.style.width = `${newSize}px`;
        } else {
          dockRef.current.style.height = `${newSize}px`;
        }
      }
    };
    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setSize(currentSize.current);
      window.dispatchEvent(new Event("resize"));
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [size, setSize, isHorizontal, position]);

  if (!visible || !config) return null;

  const gridCols = isHorizontal
    ? 1
    : panels.length <= 1 ? 1 : 2;
  const gridRows = isHorizontal
    ? (panels.length <= 1 ? "1fr" : panels.length <= 2 ? "1fr 1fr" : "repeat(3, 1fr)")
    : (panels.length > 2 ? "1fr 1fr" : "1fr");

  // Position-dependent border and flex direction
  const borderClass = position === "top"
    ? "border-b border-gray-200"
    : position === "right"
      ? "border-l border-gray-200"
      : "border-t border-gray-200";

  const resizeHandle = isHorizontal ? (
    <div
      className="group flex w-1.5 shrink-0 cursor-col-resize items-center justify-center hover:bg-gray-100"
      onMouseDown={handleMouseDown}
    >
      <div className="h-8 w-0.5 rounded-full bg-gray-200 transition-colors group-hover:bg-gray-400" />
    </div>
  ) : (
    <div
      className="group flex h-1.5 shrink-0 items-center justify-center hover:bg-gray-100"
      onMouseDown={handleMouseDown}
      style={{ cursor: "row-resize" }}
    >
      <div className="h-0.5 w-8 rounded-full bg-gray-200 transition-colors group-hover:bg-gray-400" />
    </div>
  );

  const sizeStyle = isHorizontal
    ? { width: dockWidth, minWidth: MIN_SIZE }
    : { height: dockHeight, minHeight: MIN_SIZE };

  return (
    <div
      className={`flex shrink-0 bg-white ${borderClass} ${isHorizontal ? "flex-row" : "flex-col"}`}
      ref={dockRef}
      style={sizeStyle}
    >
      {/* Resize handle — at top for bottom/right, at bottom for top */}
      {position !== "top" && resizeHandle}

      <div className={`flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden`}>
        {/* Toolbar */}
        <div className="flex shrink-0 items-center gap-2 border-b border-gray-100 px-3 py-1">
          <span className="text-[11px] font-medium text-gray-500">Charts</span>
          <SelectionToolbar />
          <div className="flex-1" />

          {/* Position toggles removed — Charts now always docks above the Grid as a sibling. */}

          <button
            onClick={addPanel}
            disabled={panels.length >= 4}
            className="rounded border border-gray-200 px-2 py-0.5 text-[11px] text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-30"
          >
            + Add chart
          </button>
          <button
            onClick={() => setVisible(false)}
            className="rounded p-0.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-600"
            title="Collapse analytics"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              {position === "right" ? (
                <path d="m9 18 6-6-6-6" />
              ) : position === "top" ? (
                <path d="m18 15-6-6-6 6" />
              ) : (
                <path d="m6 9 6 6 6-6" />
              )}
            </svg>
          </button>
        </div>

        {/* Plot panels */}
        <div
          className="min-h-0 flex-1 overflow-hidden"
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
            gridTemplateRows: gridRows,
            gap: panels.length > 1 ? "1px" : "0",
            backgroundColor: panels.length > 1 ? "#e5e7eb" : "transparent",
          }}
        >
          {panels.map((panel) => {
            const hasPanelData = !!panelData[panel.id];
            const data = hasPanelData ? panelData[panel.id] : plotData;
            const pConfig = hasPanelData ? panelConfigs[panel.id] : undefined;
            const loading = panelLoading[panel.id];
            const pointCount = data?.reduce((sum, t) => sum + (t.id?.length ?? 0), 0) ?? 0;
            const totalCount = (pConfig ?? config)?.total_count ?? 0;
            const isSampled = totalCount > 0 && pointCount > 0 && pointCount < totalCount;
            return (
              <div key={panel.id} className="flex min-h-0 flex-col bg-white">
                <div className="shrink-0 border-b border-gray-100 px-2 py-0.5">
                  <PlotConfigPanel
                    panel={panel}
                    onChange={(updated) => handlePanelChange(panel.id, updated)}
                    onRemove={panels.length > 1 ? () => removePanel(panel.id) : undefined}
                  />
                </div>
                <div className="relative min-h-0 flex-1">
                  {loading && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
                    </div>
                  )}
                  {isAnalysisType(panel.type) ? (
                    <div className="absolute inset-0">
                      <AnalysisChart
                        panel={panel}
                        onChange={(updated) => handlePanelChange(panel.id, updated)}
                      />
                    </div>
                  ) : (
                    <>
                      <div className="absolute inset-0">
                        <PlotlyChart
                          revision={hasPanelData ? (panelRevisions[panel.id] ?? 0) : revision}
                          onHover={previewMedia}
                          onClick={handleMediaClick}
                          onSelect={handleMediaSelect}
                          overrideData={hasPanelData ? data : undefined}
                          overrideConfig={pConfig}
                        />
                      </div>
                      {isSampled && (
                        <div className="pointer-events-none absolute bottom-2 right-2 rounded bg-gray-800/70 px-1.5 py-0.5 text-[10px] text-white">
                          {pointCount.toLocaleString()} of {totalCount.toLocaleString()}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Resize handle at bottom for top position */}
      {position === "top" && resizeHandle}
    </div>
  );
}
