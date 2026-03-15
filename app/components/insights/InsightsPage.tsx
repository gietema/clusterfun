"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  configAtom, uuidAtom, dataAtom, columnsAtom,
  currentMediaIndicesAtom, mediaIndicesStackAtom,
  gridValuesAtom, showPageAtom, embeddingsCacheAtom,
  insightsColumnStatsAtom, insightsOutliersAtom,
  insightsDuplicatesAtom, insightsWeirdestAtom,
} from "@/app/store/atoms";
import {
  fetchColumns, fetchColumnStats, fetchMediaItems,
  fetchEmbeddings, fetchOutliers, fetchDuplicates,
  fetchFilteredPlotData,
} from "@/app/lib/api";
import type { ColumnInfo, ColumnStats, CategoricalStat, Media } from "@/app/types";
import type { EmbeddingsResponse } from "@/app/lib/api";
import {
  computeOutlierScores, findDuplicates, computeDistanceFromCentroid,
} from "@/app/lib/outlier-detection";
import type { EmbeddingData } from "@/app/lib/active-learning/types";
import toast from "react-hot-toast";

// ── Mini bar chart (categorical) ──

function MiniBarChart({
  data,
  maxCount,
  onBarClick,
  selectedLabel,
}: {
  data: CategoricalStat[];
  maxCount: number;
  onBarClick?: (label: string) => void;
  selectedLabel?: string | null;
}) {
  const top = data.slice(0, 8);
  return (
    <div>
      <div className="flex items-end gap-px" style={{ height: 48 }}>
        {top.map((d) => (
          <div
            key={d.label}
            className={`min-w-[6px] flex-1 rounded-t transition-all ${
              selectedLabel === d.label
                ? "bg-blue-600"
                : "bg-blue-400 hover:bg-blue-500"
            } ${onBarClick ? "cursor-pointer" : ""}`}
            style={{ height: `${Math.max(2, (d.count / maxCount) * 100)}%` }}
            title={`${d.label}: ${d.count}`}
            onClick={(e) => {
              if (onBarClick) {
                e.stopPropagation();
                onBarClick(d.label);
              }
            }}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-px overflow-hidden">
        {top.map((d) => (
          <div
            key={d.label}
            className="min-w-[6px] flex-1 truncate text-center text-[8px] leading-tight text-gray-400"
            title={d.label}
          >
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Mini histogram (numeric) ──

function MiniHistogram({
  bins,
  counts,
  maxCount,
  min,
  max,
  onBinClick,
  selectedBin,
}: {
  bins: number[];
  counts: number[];
  maxCount: number;
  min?: number;
  max?: number;
  onBinClick?: (binIndex: number) => void;
  selectedBin?: number | null;
}) {
  return (
    <div>
      <div className="flex items-end gap-px" style={{ height: 48 }}>
        {counts.map((c, i) => (
          <div
            key={i}
            className={`min-w-[4px] flex-1 rounded-t transition-all ${
              selectedBin === i
                ? "bg-emerald-600"
                : "bg-emerald-400 hover:bg-emerald-500"
            } ${onBinClick ? "cursor-pointer" : ""}`}
            style={{ height: `${Math.max(2, (c / maxCount) * 100)}%` }}
            title={`${bins[i]?.toFixed(2)}: ${c}`}
            onClick={(e) => {
              if (onBinClick) {
                e.stopPropagation();
                onBinClick(i);
              }
            }}
          />
        ))}
      </div>
      {min != null && max != null && (
        <div className="mt-0.5 flex justify-between text-[8px] text-gray-400">
          <span>{min.toFixed(1)}</span>
          <span>{max.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}

// ── Column detail panel ──

function ColumnDetail({
  stats,
  column,
  onCategoryClick,
  onBinClick,
}: {
  stats: ColumnStats;
  column: ColumnInfo;
  onCategoryClick?: (label: string) => void;
  onBinClick?: (binIndex: number) => void;
}) {
  if (stats.type === "categorical") {
    const total = stats.data.reduce((s, d) => s + d.count, 0);
    return (
      <div className="space-y-2">
        <div className="flex items-end gap-1" style={{ height: 120 }}>
          {stats.data.slice(0, 20).map((d) => (
            <div
              key={d.label}
              className="flex flex-1 cursor-pointer flex-col items-center gap-1"
              onClick={(e) => {
                e.stopPropagation();
                onCategoryClick?.(d.label);
              }}
            >
              <div
                className="w-full min-w-[8px] rounded-t bg-blue-400 transition-colors hover:bg-blue-600"
                style={{ height: `${Math.max(2, (d.count / stats.data[0].count) * 100)}%` }}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-1 overflow-hidden">
          {stats.data.slice(0, 20).map((d) => (
            <div key={d.label} className="flex-1 truncate text-center text-[9px] text-gray-400" title={d.label}>
              {d.label}
            </div>
          ))}
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="py-1 text-left font-medium text-gray-500">Value</th>
              <th className="py-1 text-right font-medium text-gray-500">Count</th>
              <th className="py-1 text-right font-medium text-gray-500">%</th>
              <th className="py-1 text-right font-medium text-gray-500"></th>
            </tr>
          </thead>
          <tbody>
            {stats.data.slice(0, 15).map((d) => (
              <tr
                key={d.label}
                className="cursor-pointer border-b border-gray-50 transition-colors hover:bg-gray-50"
                onClick={(e) => {
                  e.stopPropagation();
                  onCategoryClick?.(d.label);
                }}
              >
                <td className="py-1 text-gray-700">{d.label}</td>
                <td className="py-1 text-right text-gray-600">{d.count.toLocaleString()}</td>
                <td className="py-1 text-right text-gray-400">{((d.count / total) * 100).toFixed(1)}%</td>
                <td className="py-1 text-right">
                  <span className="text-[10px] text-gray-400 hover:text-gray-600">view →</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {stats.data.length > 15 && (
          <p className="text-xs text-gray-400">+{stats.data.length - 15} more values</p>
        )}
      </div>
    );
  }

  // Numeric
  const maxC = Math.max(...stats.counts);
  const binWidth = stats.bins.length > 1
    ? stats.bins[1] - stats.bins[0]
    : stats.max - stats.min;
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-px" style={{ height: 120 }}>
        {stats.counts.map((c, i) => (
          <div
            key={i}
            className="flex-1 cursor-pointer rounded-t bg-emerald-400 transition-colors hover:bg-emerald-600"
            style={{ height: `${Math.max(2, (c / maxC) * 100)}%` }}
            title={`${stats.bins[i]?.toFixed(2)} – ${(stats.bins[i] + binWidth)?.toFixed(2)}: ${c}`}
            onClick={(e) => {
              e.stopPropagation();
              onBinClick?.(i);
            }}
          />
        ))}
      </div>
      <div className="flex justify-between text-[9px] text-gray-500">
        <span>{stats.min.toFixed(2)}</span>
        {stats.bins.length > 2 && (
          <span>{stats.bins[Math.floor(stats.bins.length / 2)]?.toFixed(2)}</span>
        )}
        <span>{stats.max.toFixed(2)}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="rounded bg-gray-50 px-2 py-1.5">
          <div className="text-gray-400">Min</div>
          <div className="font-medium text-gray-700">{stats.min.toFixed(3)}</div>
        </div>
        <div className="rounded bg-gray-50 px-2 py-1.5">
          <div className="text-gray-400">Max</div>
          <div className="font-medium text-gray-700">{stats.max.toFixed(3)}</div>
        </div>
        <div className="rounded bg-gray-50 px-2 py-1.5">
          <div className="text-gray-400">Range</div>
          <div className="font-medium text-gray-700">{(stats.max - stats.min).toFixed(3)}</div>
        </div>
      </div>
    </div>
  );
}

// ── Thumbnail strip for embedding results ──

function ThumbnailStrip({
  mediaItems,
  loading,
  label,
  onViewAll,
}: {
  mediaItems: Media[];
  loading: boolean;
  label: string;
  onViewAll: () => void;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
        <span className="text-xs text-gray-500">Analyzing...</span>
      </div>
    );
  }
  if (mediaItems.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <button
          onClick={onViewAll}
          className="rounded-md bg-gray-800 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-700"
        >
          View all in grid
        </button>
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {mediaItems.slice(0, 12).map((m) => (
          <img
            key={m.index}
            src={m.src}
            alt={`Item ${m.index}`}
            className="h-16 w-16 shrink-0 rounded object-cover"
          />
        ))}
        {mediaItems.length > 12 && (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-gray-100 text-xs text-gray-500">
            +{mediaItems.length - 12}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ──

export default function InsightsPage() {
  const config = useAtomValue(configAtom);
  const uuid = useAtomValue(uuidAtom);
  const data = useAtomValue(dataAtom);
  const [columns, setColumns] = useAtom(columnsAtom);
  const mediaIndices = useAtomValue(currentMediaIndicesAtom);
  const setMediaIndicesStack = useSetAtom(mediaIndicesStackAtom);
  const setGridValues = useSetAtom(gridValuesAtom);
  const setShowPage = useSetAtom(showPageAtom);
  const embeddingsCache = useAtomValue(embeddingsCacheAtom);

  // Persistent state via atoms
  const [columnStats, setColumnStats] = useAtom(insightsColumnStatsAtom);
  const [outlierState, setOutlierState] = useAtom(insightsOutliersAtom);
  const [duplicateState, setDuplicateState] = useAtom(insightsDuplicatesAtom);
  const [weirdState, setWeirdState] = useAtom(insightsWeirdestAtom);

  const [loadingStats, setLoadingStats] = useState<Set<string>>(new Set());
  const [expandedCol, setExpandedCol] = useState<string | null>(null);

  // Loading states (local — not worth persisting)
  const [outlierLoading, setOutlierLoading] = useState(false);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [weirdLoading, setWeirdLoading] = useState(false);

  // Tunable params
  const [dupThreshold, setDupThreshold] = useState(0.95);
  const [outlierK, setOutlierK] = useState(15);

  // Derived
  const allMediaIds = useMemo(() => {
    if (mediaIndices.length > 0) return mediaIndices;
    if (!data) return [];
    return data.flatMap((d) => d.id ?? []);
  }, [mediaIndices, data]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => c.name !== "id" && !c.name.startsWith("_")),
    [columns],
  );

  // Load columns on mount
  useEffect(() => {
    if (!uuid || uuid === "recent") return;
    if (columns.length > 0) return;
    fetchColumns(uuid).then(setColumns).catch(() => {});
  }, [uuid, setColumns, columns.length]);

  // Load stats for all visible columns
  useEffect(() => {
    if (!uuid || allMediaIds.length === 0 || visibleColumns.length === 0) return;
    const toFetch = visibleColumns.filter(
      (c) => !columnStats[c.name] && !loadingStats.has(c.name),
    );
    if (toFetch.length === 0) return;

    setLoadingStats((prev) => {
      const next = new Set(prev);
      toFetch.forEach((c) => next.add(c.name));
      return next;
    });

    const ids = allMediaIds.slice(0, 50000);
    toFetch.forEach((col) => {
      fetchColumnStats(uuid, ids, col.name)
        .then((stats) => {
          setColumnStats((prev) => ({ ...prev, [col.name]: stats }));
        })
        .catch(() => {})
        .finally(() => {
          setLoadingStats((prev) => {
            const next = new Set(prev);
            next.delete(col.name);
            return next;
          });
        });
    });
  }, [uuid, allMediaIds, visibleColumns]); // eslint-disable-line react-hooks/exhaustive-deps

  const isNumeric = (dtype: string) => /int|float|double|decimal|numeric/i.test(dtype);

  // Navigate to grid with a set of IDs
  const viewInGrid = useCallback(
    (ids: number[]) => {
      setMediaIndicesStack((prev) => {
        if (prev.length === 0 && data) {
          const all = data.flatMap((d) => d.id ?? []);
          return [all, ids];
        }
        return [...prev, ids];
      });
      setGridValues((prev) => ({ ...prev, page: 0 }));
      setShowPage("grid");
    },
    [data, setMediaIndicesStack, setGridValues, setShowPage],
  );

  // Navigate to grid by filtering on a column value
  const viewByColumnValue = useCallback(
    async (column: string, value: string) => {
      try {
        const traces = await fetchFilteredPlotData(uuid, [
          { column, comparison: "=", values: [value] },
        ]);
        if (traces) {
          const ids = traces.flatMap((t) => t.id ?? []);
          if (ids.length > 0) viewInGrid(ids);
        }
      } catch {
        toast.error("Failed to filter data");
      }
    },
    [uuid, viewInGrid],
  );

  // Navigate to grid by filtering on a numeric range
  const viewByNumericRange = useCallback(
    async (column: string, low: number, high: number) => {
      try {
        const traces = await fetchFilteredPlotData(uuid, [
          { column, comparison: ">=", values: [low.toString()] },
          { column, comparison: "<=", values: [high.toString()] },
        ]);
        if (traces) {
          const ids = traces.flatMap((t) => t.id ?? []);
          if (ids.length > 0) viewInGrid(ids);
        }
      } catch {
        toast.error("Failed to filter data");
      }
    },
    [uuid, viewInGrid],
  );

  // ── Embedding helpers ──

  const USE_BROWSER = allMediaIds.length <= 5000 && embeddingsCache != null;

  const ensureEmbeddings = async (): Promise<EmbeddingData | null> => {
    if (embeddingsCache) return embeddingsCache;
    try {
      const resp: EmbeddingsResponse = await fetchEmbeddings(uuid, allMediaIds.slice(0, 5000));
      const flat = new Float32Array(resp.embeddings.flat());
      const idToIndex = new Map(resp.media_ids.map((id, idx) => [id, idx]));
      return { mediaIds: resp.media_ids, embeddings: flat, dimension: resp.dimension, idToIndex };
    } catch {
      return null;
    }
  };

  const loadPreviewMedia = async (ids: number[]): Promise<Media[]> => {
    if (ids.length === 0) return [];
    try {
      return await fetchMediaItems(uuid, ids.slice(0, 12), 0);
    } catch {
      return [];
    }
  };

  const handleOutliers = async () => {
    setOutlierLoading(true);
    try {
      let ids: number[];
      if (USE_BROWSER) {
        const emb = await ensureEmbeddings();
        if (!emb) { toast.error("Could not load embeddings"); return; }
        ids = computeOutlierScores(emb, allMediaIds.slice(0, 5000), outlierK).map((r) => r.mediaId);
      } else {
        ids = (await fetchOutliers(uuid, allMediaIds, outlierK, 200)).map((r) => r.media_id);
      }
      const media = await loadPreviewMedia(ids);
      setOutlierState({ ids, media });
    } catch {
      toast.error("Outlier detection failed");
    } finally {
      setOutlierLoading(false);
    }
  };

  const handleDuplicates = async () => {
    setDuplicateLoading(true);
    try {
      let groups: number[][];
      if (USE_BROWSER) {
        const emb = await ensureEmbeddings();
        if (!emb) { toast.error("Could not load embeddings"); return; }
        groups = findDuplicates(emb, allMediaIds.slice(0, 5000), dupThreshold).map((g) => g.mediaIds);
      } else {
        groups = (await fetchDuplicates(uuid, allMediaIds, dupThreshold, 100)).map((g) => g.media_ids);
      }
      const previewIds = groups.flatMap((g) => g.slice(0, 2)).slice(0, 12);
      const media = await loadPreviewMedia(previewIds);
      setDuplicateState({ groups, media });
    } catch {
      toast.error("Duplicate detection failed");
    } finally {
      setDuplicateLoading(false);
    }
  };

  const handleWeirdest = async () => {
    setWeirdLoading(true);
    try {
      let ids: number[];
      if (USE_BROWSER) {
        const emb = await ensureEmbeddings();
        if (!emb) { toast.error("Could not load embeddings"); return; }
        ids = computeDistanceFromCentroid(emb, allMediaIds.slice(0, 5000)).map((r) => r.mediaId);
      } else {
        ids = (await fetchOutliers(uuid, allMediaIds, 20, 200)).map((r) => r.media_id);
      }
      const media = await loadPreviewMedia(ids);
      setWeirdState({ ids, media });
    } catch {
      toast.error("Weirdness detection failed");
    } finally {
      setWeirdLoading(false);
    }
  };

  if (!config) return null;

  const numericCols = visibleColumns.filter((c) => isNumeric(c.dtype));
  const categoricalCols = visibleColumns.filter((c) => !isNumeric(c.dtype));
  const hasEmbeddings = !!config.embeddings;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-gray-900">Dataset Insights</h1>
          <p className="mt-1 text-sm text-gray-500">
            {allMediaIds.length.toLocaleString()} items
            {mediaIndices.length > 0 && mediaIndices.length < (data?.flatMap((d) => d.id ?? []).length ?? 0)
              ? " in current selection"
              : ""}
            {" \u00b7 "}
            {visibleColumns.length} columns
            ({numericCols.length} numeric, {categoricalCols.length} categorical)
          </p>
        </div>

        {/* Column cards */}
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-gray-700">Column distributions</h2>
          <p className="mb-3 text-[11px] text-gray-400">Click any bar to view those items in the grid</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleColumns.map((col) => {
              const stats = columnStats[col.name];
              const isLoading = loadingStats.has(col.name);
              const isExpanded = expandedCol === col.name;

              const handleCategoryClick = (label: string) => {
                viewByColumnValue(col.name, label);
              };

              const handleBinClick = (binIndex: number) => {
                if (stats?.type !== "numeric") return;
                const binWidth = stats.bins.length > 1
                  ? stats.bins[1] - stats.bins[0]
                  : stats.max - stats.min;
                const low = stats.bins[binIndex];
                const high = low + binWidth;
                viewByNumericRange(col.name, low, high);
              };

              return (
                <div
                  key={col.name}
                  className={`rounded-lg border bg-white p-3 transition-all hover:shadow-md ${
                    isExpanded ? "col-span-2 border-gray-300 shadow-md" : "border-gray-200"
                  }`}
                >
                  <div
                    className="mb-1.5 flex cursor-pointer items-center justify-between"
                    onClick={() => setExpandedCol(isExpanded ? null : col.name)}
                  >
                    <span className="truncate text-xs font-medium text-gray-700">{col.name}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] ${
                        isNumeric(col.dtype)
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-blue-50 text-blue-600"
                      }`}>
                        {isNumeric(col.dtype) ? "num" : "cat"}
                      </span>
                      <svg
                        className={`h-3 w-3 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </div>
                  </div>
                  <div className="mb-1 text-[10px] text-gray-400">
                    {col.n_unique.toLocaleString()} unique
                  </div>

                  {isLoading ? (
                    <div className="flex h-12 items-center justify-center">
                      <div className="h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-gray-600" />
                    </div>
                  ) : stats ? (
                    <>
                      {!isExpanded ? (
                        stats.type === "categorical" ? (
                          <MiniBarChart
                            data={stats.data}
                            maxCount={stats.data[0]?.count ?? 1}
                            onBarClick={handleCategoryClick}
                          />
                        ) : (
                          <MiniHistogram
                            bins={stats.bins}
                            counts={stats.counts}
                            maxCount={Math.max(...stats.counts)}
                            min={stats.min}
                            max={stats.max}
                            onBinClick={handleBinClick}
                          />
                        )
                      ) : (
                        <ColumnDetail
                          stats={stats}
                          column={col}
                          onCategoryClick={handleCategoryClick}
                          onBinClick={handleBinClick}
                        />
                      )}
                    </>
                  ) : (
                    <div className="h-12" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Embedding-powered tools */}
        {hasEmbeddings && (
          <div className="mb-8">
            <h2 className="mb-3 text-sm font-medium text-gray-700">Embedding analysis</h2>
            <div className="space-y-4">
              {/* Outliers */}
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-800">Outlier detection</div>
                    <div className="text-xs text-gray-500">
                      Find items that are most different from their neighbors using Local Outlier Factor
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-gray-500">
                      k neighbors
                      <input
                        type="number"
                        min={3}
                        max={50}
                        value={outlierK}
                        onChange={(e) => setOutlierK(Math.max(3, parseInt(e.target.value) || 15))}
                        className="w-14 rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
                      />
                    </label>
                    <button
                      onClick={handleOutliers}
                      disabled={outlierLoading}
                      className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
                    >
                      {outlierLoading ? "Analyzing..." : outlierState.ids.length > 0 ? "Re-run" : "Run"}
                    </button>
                  </div>
                </div>
                <ThumbnailStrip
                  mediaItems={outlierState.media}
                  loading={outlierLoading}
                  label={`${outlierState.ids.length} outliers found`}
                  onViewAll={() => viewInGrid(outlierState.ids)}
                />
              </div>

              {/* Duplicates */}
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-800">Near-duplicate detection</div>
                    <div className="text-xs text-gray-500">
                      Find groups of items with high cosine similarity in embedding space
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-gray-500">
                      threshold
                      <input
                        type="number"
                        min={0.5}
                        max={1}
                        step={0.01}
                        value={dupThreshold}
                        onChange={(e) => setDupThreshold(Math.min(1, Math.max(0.5, parseFloat(e.target.value) || 0.95)))}
                        className="w-16 rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
                      />
                    </label>
                    <button
                      onClick={handleDuplicates}
                      disabled={duplicateLoading}
                      className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
                    >
                      {duplicateLoading ? "Analyzing..." : duplicateState.groups.length > 0 ? "Re-run" : "Run"}
                    </button>
                  </div>
                </div>
                {duplicateLoading && (
                  <div className="flex items-center gap-2 py-3">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
                    <span className="text-xs text-gray-500">Analyzing...</span>
                  </div>
                )}
                {!duplicateLoading && duplicateState.groups.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-700">
                        {duplicateState.groups.length} duplicate group{duplicateState.groups.length !== 1 ? "s" : ""} ({duplicateState.groups.reduce((s, g) => s + g.length, 0)} items)
                      </span>
                      <button
                        onClick={() => viewInGrid(duplicateState.groups.flat())}
                        className="rounded-md bg-gray-800 px-2.5 py-1 text-xs font-medium text-white transition-colors hover:bg-gray-700"
                      >
                        View all in grid
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {duplicateState.groups.slice(0, 10).map((group, i) => (
                        <button
                          key={i}
                          onClick={() => viewInGrid(group)}
                          className="rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-600 transition-colors hover:bg-gray-50"
                        >
                          Group {i + 1} ({group.length} items)
                        </button>
                      ))}
                      {duplicateState.groups.length > 10 && (
                        <span className="px-1 py-1 text-xs text-gray-400">+{duplicateState.groups.length - 10} more</span>
                      )}
                    </div>
                    {duplicateState.media.length > 0 && (
                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {duplicateState.media.map((m) => (
                          <img
                            key={m.index}
                            src={m.src}
                            alt={`Item ${m.index}`}
                            className="h-16 w-16 shrink-0 rounded object-cover"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Weirdest */}
              <div className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-800">Farthest from centroid</div>
                    <div className="text-xs text-gray-500">
                      Items ranked by cosine distance from the dataset centroid — the most unusual items first
                    </div>
                  </div>
                  <button
                    onClick={handleWeirdest}
                    disabled={weirdLoading}
                    className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
                  >
                    {weirdLoading ? "Analyzing..." : weirdState.ids.length > 0 ? "Re-run" : "Run"}
                  </button>
                </div>
                <ThumbnailStrip
                  mediaItems={weirdState.media}
                  loading={weirdLoading}
                  label={`${weirdState.ids.length} items ranked by distance`}
                  onViewAll={() => viewInGrid(weirdState.ids)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
