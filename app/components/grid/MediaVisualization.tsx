"use client";
import { useAtom, useAtomValue } from "jotai";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { configAtom, filtersAtom, uuidAtom } from "@/app/store/atoms";
import { fetchColumnStats } from "@/app/lib/api";
import type { ColumnStats } from "@/app/types";

const Plot = dynamic(() => import("@/app/lib/PlotlyChart"), { ssr: false });

interface MediaVisualizationProps {
  mediaIndices: number[];
}

export default function MediaVisualization({ mediaIndices }: MediaVisualizationProps) {
  const uuid = useAtomValue(uuidAtom);
  const config = useAtomValue(configAtom);
  const [filters, setFilters] = useAtom(filtersAtom);
  const [stats, setStats] = useState<ColumnStats | null>(null);
  const [selectedColumn, setSelectedColumn] = useState(config?.columns?.[0] ?? "");
  const columns = config?.columns;

  useEffect(() => {
    if (!mediaIndices?.length || !selectedColumn) return;
    fetchColumnStats(uuid, mediaIndices, selectedColumn).then(setStats);
  }, [uuid, mediaIndices, selectedColumn]);

  const handleBarClick = (points: { label: string }[], col: string) => {
    const label = points[0].label;
    const newFilters = filters.filter((f) => f.column !== col);
    setFilters([...newFilters, { column: col, comparison: "=", values: [label] }]);
  };

  const handleHistogramClick = (points: { x: number }[], col: string) => {
    if (!stats || stats.type !== "numeric") return;
    const clickedX = points[0].x;
    // Find the bin that contains this x value
    const binWidth = stats.bins.length > 1 ? stats.bins[1] - stats.bins[0] : 1;
    const binStart = clickedX;
    const binEnd = clickedX + binWidth;
    const newFilters = filters.filter((f) => f.column !== col);
    setFilters([
      ...newFilters,
      { column: col, comparison: ">=", values: [String(binStart)] },
      { column: col, comparison: "<=", values: [String(binEnd)] },
    ]);
  };

  if (!config || !selectedColumn || !stats) return null;

  return (
    <div className="px-3 py-2">
      <div className="flex">
        <div className="flex items-center rounded-l-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-500">
          Show stats for
        </div>
        <select
          className="grow rounded-r-md border border-l-0 border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
          onChange={(e) => setSelectedColumn(e.target.value)}
          value={selectedColumn}
        >
          {columns?.map((col) => (
            <option key={col} value={col}>{col}</option>
          ))}
        </select>
      </div>
      <div style={{ width: "100%" }}>
        {stats.type === "categorical" ? (
          <Plot
            data={[{
              type: "bar",
              x: stats.data.map((d) => d.label),
              y: stats.data.map((d) => d.count),
            }]}
            layout={{
              title: { text: `Top ${stats.data.length} ${selectedColumn}`, xref: "paper" },
              yaxis: { automargin: true }, xaxis: { automargin: true },
              font: { size: 8 }, margin: { l: 20, r: 20, b: 0, t: 30 }, height: 300,
            }}
            config={{ displayModeBar: false }}
            onClick={(e: unknown) => handleBarClick((e as { points: { label: string }[] }).points, selectedColumn)}
          />
        ) : stats.type === "numeric" ? (
          <Plot
            data={[{
              type: "bar",
              x: stats.bins,
              y: stats.counts,
              width: stats.bins.length > 1 ? stats.bins[1] - stats.bins[0] : 1,
            }]}
            layout={{
              font: { size: 8 },
              margin: { l: 20, r: 0, b: 50, t: 0 },
              height: 200,
              bargap: 0.05,
            }}
            config={{ displayModeBar: false }}
            onClick={(e: unknown) => handleHistogramClick((e as { points: { x: number }[] }).points, selectedColumn)}
          />
        ) : null}
      </div>
    </div>
  );
}
