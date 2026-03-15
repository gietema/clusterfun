"use client";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  configAtom, dataAtom, mediaAtom, uuidAtom, columnsAtom,
  plotPanelsAtom, plotPanelDataAtom, highlightedPointsAtom,
} from "@/app/store/atoms";
import { fetchColumns, fetchDynamicPlotData } from "@/app/lib/api";
import type { PlotConfig, PlotPanelConfig, PlotTrace } from "@/app/types";
import { useMediaPreview } from "@/app/lib/use-media-preview";
import PlotlyChart from "./PlotlyChart";
import PlotConfigPanel from "./PlotConfigPanel";
import SelectionToolbar from "./SelectionToolbar";
import SideBar from "../shared/SideBar";
import ResizableLayout from "../shared/ResizableLayout";
import FilterBar from "../filters/FilterBar";

interface PlotPageProps {
  onMediaSelect: (indices: number[]) => void;
}

let panelIdCounter = 0;
function nextPanelId() {
  return `panel_${++panelIdCounter}`;
}

export default function PlotPage({ onMediaSelect }: PlotPageProps) {
  const [plotData, setPlotData] = useAtom(dataAtom);
  const config = useAtomValue(configAtom);
  const uuid = useAtomValue(uuidAtom);
  const [revision, setRevision] = useState(0);
  const [sideMedia] = useAtom(mediaAtom);
  const { openMedia, previewMedia } = useMediaPreview();

  const [columns, setColumns] = useAtom(columnsAtom);
  const [panels, setPanels] = useAtom(plotPanelsAtom);
  const [panelData, setPanelData] = useAtom(plotPanelDataAtom);
  const setHighlightedPoints = useSetAtom(highlightedPointsAtom);
  const [panelLoading, setPanelLoading] = useState<Record<string, boolean>>({});
  const [panelConfigs, setPanelConfigs] = useState<Record<string, PlotConfig>>({});
  const [panelRevisions, setPanelRevisions] = useState<Record<string, number>>({});

  // Debounce timer ref
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Abort controllers for stale panel data requests
  const abortControllers = useRef<Record<string, AbortController>>({});

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

  useEffect(() => {
    if (!plotData || sideMedia || plotData.length === 0) return;
    const firstId = plotData[0]?.id?.[0];
    if (firstId != null) previewMedia(firstId);
  }, [plotData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch data for a panel
  const fetchPanelData = useCallback(
    (panel: PlotPanelConfig) => {
      if (!uuid) return;
      // For the first panel using the original config, use the existing data
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
      // Need at least x or y to make a meaningful plot (except embedding_map)
      if (!panel.x && !panel.y && panel.type !== "embedding_map") return;

      // Cancel any in-flight request for this panel
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
          // If it's the only panel, also update the global data/config atoms
          if (panels.length === 1) {
            setPlotData(newData);
          }
        })
        .catch((err) => {
          if (err?.name === "CanceledError" || controller.signal.aborted) return;
          console.error(err);
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

      // Debounce the API call — longer delay for embedding maps since
      // each parameter change triggers an expensive computation
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
    const newPanel: PlotPanelConfig = {
      id: nextPanelId(),
      type: "scatter",
    };
    setPanels((prev) => [...prev, newPanel]);
  }, [panels.length, setPanels]);

  const removePanel = useCallback(
    (panelId: string) => {
      setPanels((prev) => prev.filter((p) => p.id !== panelId));
      setPanelData((prev) => {
        const next = { ...prev };
        delete next[panelId];
        return next;
      });
      setPanelConfigs((prev) => {
        const next = { ...prev };
        delete next[panelId];
        return next;
      });
      setPanelRevisions((prev) => {
        const next = { ...prev };
        delete next[panelId];
        return next;
      });
    },
    [setPanels, setPanelData],
  );

  const handleMediaClick = (index: number | undefined) => {
    if (index == null) return;
    openMedia(index);
  };

  const handleMediaSelect = (indices: number[]) => {
    if (indices.length > 0) {
      setHighlightedPoints(new Set(indices));
      onMediaSelect(indices);
    }
  };

  if (!config) return <div />;

  const isMultiPlot = panels.length > 1;
  const gridCols = panels.length <= 1 ? 1 : panels.length <= 2 ? 2 : 2;

  return (
    <div className="h-full">
      <ResizableLayout sidebar={<SideBar />}>
        <div className="flex h-full flex-col overflow-hidden">
          {config.title && (
            <div className="shrink-0 px-3 py-2 text-sm font-medium text-gray-900">
              {config.title}
            </div>
          )}
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-1.5">
            <div className="min-w-0 flex-1">
              <FilterBar />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <SelectionToolbar />
              <button
                onClick={addPanel}
                disabled={panels.length >= 4}
                className="rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-30"
                title="Add plot panel"
              >
                + Add plot
              </button>
            </div>
          </div>

          <div
            className="min-h-0 flex-1 overflow-hidden"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
              gridTemplateRows: panels.length > 2 ? "1fr 1fr" : "1fr",
              gap: "1px",
              backgroundColor: isMultiPlot ? "#e5e7eb" : "transparent",
            }}
          >
            {panels.map((panel) => {
              const hasPanelData = !!panelData[panel.id];
              const data = hasPanelData ? panelData[panel.id] : plotData;
              const panelConfig = hasPanelData ? panelConfigs[panel.id] : undefined;
              const loading = panelLoading[panel.id];
              return (
                <div key={panel.id} className="flex min-h-0 flex-col bg-white">
                  <div className="shrink-0 border-b border-gray-100 px-2 py-1">
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
                    <div className="absolute inset-0">
                      <PlotlyChart
                        revision={hasPanelData ? (panelRevisions[panel.id] ?? 0) : revision}
                        onHover={previewMedia}
                        onClick={handleMediaClick}
                        onSelect={handleMediaSelect}
                        overrideData={hasPanelData ? data : undefined}
                        overrideConfig={panelConfig}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </ResizableLayout>
    </div>
  );
}
