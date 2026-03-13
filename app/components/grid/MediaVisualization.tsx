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

  const handleHistogramClick = (points: { pointIndices: number[] }[], col: string) => {
    const indices = points[0].pointIndices;
    if (!stats || stats.type !== "numeric") return;
    const selected = indices.map((i) => stats.data[i]).filter((v): v is number => v != null);
    const min = Math.min(...selected);
    const max = Math.max(...selected);
    const newFilters = filters.filter((f) => f.column !== col);
    setFilters([
      ...newFilters,
      { column: col, comparison: ">=", values: [String(min)] },
      { column: col, comparison: "<=", values: [String(max)] },
    ]);
  };

  const handleBarClick = (points: { label: string }[], col: string) => {
    const label = points[0].label;
    const newFilters = filters.filter((f) => f.column !== col);
    setFilters([...newFilters, { column: col, comparison: "=", values: [label] }]);
  };

  if (!config || !selectedColumn || !stats) return null;

  return (
    <div>
      <div className="flex">
        <div className="mt-2 rounded-s-md border border-gray-300 bg-gray-100 p-1 px-2 text-xs">
          Show stats for
        </div>
        <select
          className="mt-2 grow rounded-e-md border border-l-0 border-gray-300 p-1 text-xs"
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
            data={[{ type: "histogram", x: stats.data }]}
            layout={{
              font: { size: 8 }, margin: { l: 20, r: 0, b: 50, t: 0 }, height: 200,
            }}
            config={{ displayModeBar: false }}
            onClick={(e: unknown) => handleHistogramClick((e as { points: { pointIndices: number[] }[] }).points, selectedColumn)}
          />
        ) : null}
      </div>
    </div>
  );
}
