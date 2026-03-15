"use client";
import { useAtomValue } from "jotai";
import { configAtom, dataAtom, dragModeAtom, highlightedPointsAtom } from "@/app/store/atoms";
import type { PlotConfig, PlotTrace } from "@/app/types";
import type { Thumbnail } from "./PlotPage";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Data } from "plotly.js";

const Plot = dynamic(() => import("@/app/lib/PlotlyChart"), { ssr: false });

export interface ViewportRange {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

interface PlotlyChartProps {
  revision: number;
  onHover: (index: number | undefined) => void;
  onClick: (index: number | undefined) => void;
  onSelect: (indices: number[]) => void;
  /** Override data for multi-plot panels */
  overrideData?: PlotTrace[];
  /** Override config for multi-plot panels */
  overrideConfig?: PlotConfig;
  /** Thumbnail images to overlay on the plot (embedding maps) */
  thumbnails?: Thumbnail[];
  /** Called (debounced) when the user zooms/pans, with the visible axis range */
  onViewportChange?: (range: ViewportRange | null) => void;
}

function getXAxis(cfg: PlotConfig): Record<string, any> {
  if (cfg.type === "violin") {
    return {
      tick0: 0,
      dtick: 2,
      tickvals: cfg.colors?.map((_, i) => i * 2),
      ticktext: cfg.colors,
      autorange: true,
    };
  }
  if (cfg.type === "bar_chart") {
    return {
      tick0: 0.35,
      dtick: 1,
      tickvals: cfg.x_names?.map((_, i) => i + 0.35),
      ticktext: cfg.x_names,
      autorange: true,
      automargin: true,
    };
  }
  return {
    showgrid: true,
    showline: false,
    zeroline: false,
    title: { text: cfg.x, font: { color: "black", size: 11 } },
    autorange: true,
    automargin: true,
  };
}

function createReferenceLine(
  position: number,
  axis: "h" | "v",
): Record<string, any> {
  return {
    type: "line",
    x0: axis === "h" ? 0 : position,
    x1: axis === "h" ? 1 : position,
    y0: axis === "v" ? 0 : position,
    y1: axis === "v" ? 1 : position,
    xref: axis === "h" ? "paper" : "x",
    yref: axis === "v" ? "paper" : "y",
    line: { color: "rgba(255,0,0,0.5)", width: 2, dash: "dash" },
  };
}

export default function PlotlyChart({
  revision,
  onHover,
  onClick,
  onSelect,
  overrideData,
  overrideConfig,
  thumbnails,
  onViewportChange,
}: PlotlyChartProps) {
  const globalConfig = useAtomValue(configAtom);
  const globalData = useAtomValue(dataAtom);
  const dragMode = useAtomValue(dragModeAtom);
  const highlightedIds = useAtomValue(highlightedPointsAtom);

  const config = overrideConfig ?? globalConfig;
  const data = overrideData ?? globalData;

  const [layout, setLayout] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Stable ref for the viewport callback so handleRelayout doesn't depend on it
  const onViewportChangeRef = useRef(onViewportChange);
  onViewportChangeRef.current = onViewportChange;
  const viewportDebounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (viewportDebounceRef.current) clearTimeout(viewportDebounceRef.current);
    };
  }, []);

  // Build layout when config/data/revision/thumbnails change
  useEffect(() => {
    if (!config) return;
    const shapes = [
      ...(typeof config.hline === "number" ? [createReferenceLine(config.hline, "h")] : []),
      ...(typeof config.vline === "number" ? [createReferenceLine(config.vline, "v")] : []),
    ];

    // Compute thumbnail overlay images for embedding maps
    let images: Record<string, any>[] | undefined;
    if (thumbnails?.length && data) {
      // Compute data extent for sizing thumbnails
      let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
      for (const trace of data) {
        if (!trace.x || !trace.y) continue;
        for (let i = 0; i < trace.x.length; i++) {
          const x = trace.x[i] as number;
          const y = trace.y[i] as number;
          if (x < xMin) xMin = x;
          if (x > xMax) xMax = x;
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
      }
      const xRange = xMax - xMin || 1;
      const yRange = yMax - yMin || 1;
      const thumbSize = Math.min(xRange, yRange) * 0.06;
      images = thumbnails.map((t) => ({
        source: t.src,
        x: t.x,
        y: t.y,
        xref: "x",
        yref: "y",
        sizex: thumbSize,
        sizey: thumbSize,
        xanchor: "center",
        yanchor: "middle",
        layer: "above",
        sizing: "contain",
        opacity: 0.7,
      }));
    }

    setLayout({
      uirevision: revision,
      hovermode: "closest",
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      xaxis: getXAxis(config),
      yaxis: {
        autorange: true,
        showgrid: true,
        showline: false,
        title: { text: config.y, font: { color: "black", size: 11 } },
      },
      displayModeBar: false,
      dragmode: dragMode,
      datarevision: revision,
      autosize: true,
      margin: { l: 40, r: 0, b: 40, t: 0, pad: 0 },
      shapes,
      ...(images ? { images } : {}),
      legend: {
        traceorder: "normal",
        ...(config.color ? { title: { text: config.color } } : {}),
      },
    });
  }, [config, revision, data, thumbnails]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update only dragmode without resetting zoom
  useEffect(() => {
    setLayout((prev) => ({ ...prev, dragmode: dragMode }));
  }, [dragMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setLayout((prev) => ({
        ...prev,
        legend: {
          ...prev.legend,
          x: window.innerWidth < 768 ? 0.5 : undefined,
          xanchor: window.innerWidth < 768 ? "center" : undefined,
          y: window.innerWidth < 768 ? 1.1 : undefined,
          yanchor: window.innerWidth < 768 ? "bottom" : undefined,
        },
      }));
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Capture viewport changes from zoom/pan — debounced, only notifies parent for re-sampling
  const handleRelayout = useCallback((e: any) => {
    if (viewportDebounceRef.current) clearTimeout(viewportDebounceRef.current);
    if (
      e["xaxis.range[0]"] != null && e["xaxis.range[1]"] != null &&
      e["yaxis.range[0]"] != null && e["yaxis.range[1]"] != null
    ) {
      const range: ViewportRange = {
        xMin: e["xaxis.range[0]"],
        xMax: e["xaxis.range[1]"],
        yMin: e["yaxis.range[0]"],
        yMax: e["yaxis.range[1]"],
      };
      viewportDebounceRef.current = setTimeout(() => {
        onViewportChangeRef.current?.(range);
      }, 300);
    } else if (e["xaxis.autorange"] || e["yaxis.autorange"]) {
      viewportDebounceRef.current = setTimeout(() => {
        onViewportChangeRef.current?.(null);
      }, 300);
    }
  }, []);

  // Apply linked brushing: compute selectedpoints per trace
  const displayData = useMemo(() => {
    if (!data) return [];
    const sorted = [...data].sort((a: PlotTrace, b: PlotTrace) =>
      ((a.name ?? "") > (b.name ?? "") ? 1 : -1),
    );
    if (highlightedIds.size === 0) return sorted;
    return sorted.map((trace) => ({
      ...trace,
      selectedpoints: trace.id
        .map((id, idx) => (highlightedIds.has(id) ? idx : -1))
        .filter((idx) => idx >= 0),
    }));
  }, [data, highlightedIds]);

  if (!config || !data) return null;

  const getPointId = (point: { data?: { id?: number[] }; pointIndex?: number }): number | undefined => {
    return point?.data?.id?.[point.pointIndex ?? 0];
  };

  return (
    <>
      {isLoading && (
        <div className="flex h-full items-center justify-center">
          <svg
            aria-hidden="true"
            className="h-8 w-8 animate-spin fill-orange-500 text-gray-200"
            viewBox="0 0 100 101"
            fill="none"
          >
            <path
              d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
              fill="currentColor"
            />
            <path
              d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
              fill="currentFill"
            />
          </svg>
        </div>
      )}
      <Plot
        data={displayData as unknown as Data[]}
        layout={layout}
        revision={revision}
        useResizeHandler
        style={{ width: "100%", height: "100%" }}
        config={{ scrollZoom: true, displayModeBar: false }}
        onRelayout={handleRelayout}
        onInitialized={() => setIsLoading(false)}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onHover={(e: any) => onHover(getPointId(e.points?.[0] ?? {}))}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onClick={(e: any) => onClick(getPointId(e.points?.[0] ?? {}))}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onSelected={(e: any) => {
          if (e?.points?.length > 0) {
            const indices = e.points
              .map((p: any) => p.data?.id?.[p.pointIndex])
              .filter((id: number | undefined): id is number => id != null);
            onSelect(indices);
          }
        }}
      />
    </>
  );
}
