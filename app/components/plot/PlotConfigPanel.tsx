"use client";
import { useAtomValue } from "jotai";
import { columnsAtom, configAtom } from "@/app/store/atoms";
import type { PlotPanelConfig } from "@/app/types";

interface PlotConfigPanelProps {
  panel: PlotPanelConfig;
  onChange: (updated: PlotPanelConfig) => void;
  onRemove?: () => void;
}

const BASE_PLOT_TYPES = [
  { value: "scatter", label: "Scatter" },
  { value: "histogram", label: "Histogram" },
  { value: "bar_chart", label: "Bar chart" },
  { value: "violin", label: "Violin" },
];

function isNumericDtype(dtype: string): boolean {
  return /int|float|double|decimal|numeric/i.test(dtype);
}

export default function PlotConfigPanel({ panel, onChange, onRemove }: PlotConfigPanelProps) {
  const columns = useAtomValue(columnsAtom);
  const config = useAtomValue(configAtom);
  const hasEmbeddings = !!config?.embeddings;

  const PLOT_TYPES = hasEmbeddings
    ? [...BASE_PLOT_TYPES, { value: "embedding_map", label: "Embedding map" }]
    : BASE_PLOT_TYPES;

  const MAX_COLOR_UNIQUE = 50;
  const numericCols = columns.filter((c) => isNumericDtype(c.dtype));
  const allCols = columns.filter((c) => c.name !== "id" && !c.name.startsWith("_"));
  const colorCols = allCols.filter((c) => c.n_unique <= MAX_COLOR_UNIQUE);

  const isEmbeddingMap = panel.type === "embedding_map";
  const needsY = panel.type === "scatter";
  const xLabel = panel.type === "histogram" ? "Column" : panel.type === "violin" ? "Group by" : "X";
  const yLabel = panel.type === "violin" ? "Value" : "Y";
  const showX = !isEmbeddingMap && (panel.type !== "violin" || allCols.length > 0);

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <select
        value={panel.type}
        onChange={(e) => onChange({ ...panel, type: e.target.value })}
        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
      >
        {PLOT_TYPES.map((pt) => (
          <option key={pt.value} value={pt.value}>{pt.label}</option>
        ))}
      </select>

      {showX && (
        <>
          <span className="text-gray-400">{xLabel}</span>
          <select
            value={panel.x ?? ""}
            onChange={(e) => onChange({ ...panel, x: e.target.value || undefined })}
            className="max-w-[140px] rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
          >
            <option value="">—</option>
            {(panel.type === "bar_chart" ? allCols : numericCols).map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </>
      )}

      {(needsY || panel.type === "violin") && (
        <>
          <span className="text-gray-400">{yLabel}</span>
          <select
            value={panel.y ?? ""}
            onChange={(e) => onChange({ ...panel, y: e.target.value || undefined })}
            className="max-w-[140px] rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
          >
            <option value="">—</option>
            {numericCols.map((c) => (
              <option key={c.name} value={c.name}>{c.name}</option>
            ))}
          </select>
        </>
      )}

      {panel.type === "histogram" && (
        <>
          <span className="text-gray-400">Bins</span>
          <input
            type="number"
            min={5}
            max={200}
            value={panel.bins ?? 20}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (!isNaN(v) && v >= 1) onChange({ ...panel, bins: v });
            }}
            className="w-16 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
          />
        </>
      )}

      {isEmbeddingMap && (
        <>
          <span className="text-gray-400">Method</span>
          <select
            value={panel.method ?? "umap"}
            onChange={(e) => onChange({ ...panel, method: e.target.value })}
            className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
          >
            <option value="umap">UMAP</option>
            <option value="tsne">t-SNE</option>
            <option value="pca">PCA</option>
          </select>

          <span className="text-gray-400">Sample</span>
          <input
            type="number"
            min={100}
            max={100000}
            step={1000}
            value={panel.sampleSize ?? 10000}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (!isNaN(v) && v >= 100) onChange({ ...panel, sampleSize: v });
            }}
            className="w-20 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
          />

          {(panel.method ?? "umap") === "umap" && (
            <>
              <span className="text-gray-400">Neighbors</span>
              <input
                type="number"
                min={2}
                max={200}
                value={panel.nNeighbors ?? 15}
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v) && v >= 2) onChange({ ...panel, nNeighbors: v });
                }}
                className="w-16 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
              />
            </>
          )}
        </>
      )}

      <span className="text-gray-400">Color</span>
      <select
        value={panel.color ?? ""}
        onChange={(e) => onChange({ ...panel, color: e.target.value || undefined })}
        className="max-w-[140px] rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
      >
        <option value="">—</option>
        {colorCols.map((c) => (
          <option key={c.name} value={c.name}>{c.name}</option>
        ))}
      </select>

      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-auto rounded px-1.5 py-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          title="Remove plot"
        >
          ×
        </button>
      )}
    </div>
  );
}
