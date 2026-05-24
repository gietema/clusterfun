"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  configAtom, uuidAtom, columnsAtom,
  embeddingsCacheAtom, insightsOutlierGroupByAtom,
  insightsColumnStatsAtom, insightsOutliersAtom,
  insightsDuplicatesAtom, insightsWeirdestAtom,
  backgroundTasksAtom,
} from "@/app/store/atoms";
import {
  fetchColumns, fetchColumnStats, fetchMediaItems,
  fetchEmbeddings, fetchOutliers, fetchDuplicates,
  fetchCentroidDistance, computeImageStats,
} from "@/app/lib/api";
import type { InsightsTaskResponse } from "@/app/lib/api";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";
import type { ColumnInfo, ColumnStats, CategoricalStat, Media } from "@/app/types";
import type { EmbeddingsResponse } from "@/app/lib/api";
import {
  computeOutlierScores, findDuplicates, computeDistanceFromCentroid,
} from "@/app/lib/outlier-detection";
import type { EmbeddingData } from "@/app/lib/active-learning/types";
import toast from "react-hot-toast";
import Highlights from "./Highlights";

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
      <div className="flex items-end gap-px overflow-hidden" style={{ height: 48 }}>
        {top.map((d) => (
          <div
            key={d.label}
            className={`min-w-0 flex-1 rounded-t transition-all ${
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
            className="min-w-0 flex-1 truncate text-center text-[8px] leading-tight text-gray-500"
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
      <div className="flex items-end gap-px overflow-hidden" style={{ height: 48 }}>
        {counts.map((c, i) => (
          <div
            key={i}
            className={`min-w-0 flex-1 rounded-t transition-all ${
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
        <div className="mt-0.5 flex justify-between text-[8px] text-gray-500">
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
  onLoadMore,
  loadingMore,
}: {
  stats: ColumnStats;
  column: ColumnInfo;
  onCategoryClick?: (label: string) => void;
  onBinClick?: (binIndex: number) => void;
  onLoadMore?: () => void;
  loadingMore?: boolean;
}) {
  if (stats.type === "categorical") {
    const total = stats.data.reduce((s, d) => s + d.count, 0);
    const totalUnique = stats.total_unique ?? stats.data.length;
    const hasMore = stats.data.length < totalUnique;
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
            <div key={d.label} className="flex-1 truncate text-center text-[9px] text-gray-500" title={d.label}>
              {d.label}
            </div>
          ))}
        </div>
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-gray-100">
                <th className="py-1 text-left font-medium text-gray-500">Value</th>
                <th className="py-1 text-right font-medium text-gray-500">Count</th>
                <th className="py-1 text-right font-medium text-gray-500">%</th>
                <th className="py-1 text-right font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {stats.data.map((d) => (
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
                  <td className="py-1 text-right text-gray-500">{((d.count / total) * 100).toFixed(1)}%</td>
                  <td className="py-1 text-right">
                    <span className="text-[10px] text-gray-500 hover:text-gray-600">view →</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hasMore && (
          <button
            onClick={(e) => { e.stopPropagation(); onLoadMore?.(); }}
            disabled={loadingMore}
            className="text-xs text-blue-500 hover:text-blue-700 disabled:text-gray-500"
          >
            {loadingMore ? "Loading..." : `Show more (${stats.data.length} of ${totalUnique})`}
          </button>
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
          <div className="text-gray-500">Min</div>
          <div className="font-medium text-gray-700">{stats.min.toFixed(3)}</div>
        </div>
        <div className="rounded bg-gray-50 px-2 py-1.5">
          <div className="text-gray-500">Max</div>
          <div className="font-medium text-gray-700">{stats.max.toFixed(3)}</div>
        </div>
        <div className="rounded bg-gray-50 px-2 py-1.5">
          <div className="text-gray-500">Range</div>
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
  const [columns, setColumns] = useAtom(columnsAtom);
  // Insights always operate on the full dataset (not a grid selection)
  const { pushSelection, pushFilter } = useBreadcrumbNav();
  const embeddingsCache = useAtomValue(embeddingsCacheAtom);

  // Persistent state via atoms
  const [columnStats, setColumnStats] = useAtom(insightsColumnStatsAtom);
  const [outlierState, setOutlierState] = useAtom(insightsOutliersAtom);
  const [duplicateState, setDuplicateState] = useAtom(insightsDuplicatesAtom);
  const [weirdState, setWeirdState] = useAtom(insightsWeirdestAtom);
  const setBackgroundTasks = useSetAtom(backgroundTasksAtom);

  const [loadingStats, setLoadingStats] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState<string | null>(null);
  const [expandedCol, setExpandedCol] = useState<string | null>(null);

  const [showAllDupGroups, setShowAllDupGroups] = useState(false);

  // Loading states (local — not worth persisting)
  const [outlierLoading, setOutlierLoading] = useState(false);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [weirdLoading, setWeirdLoading] = useState(false);

  // Tunable params
  const [dupThreshold, setDupThreshold] = useState(0.95);
  const [outlierK, setOutlierK] = useState(15);
  const [outlierThreshold, setOutlierThreshold] = useState(1.5);
  const [outlierGroupBy, setOutlierGroupBy] = useAtom(insightsOutlierGroupByAtom);

  // Always operate on the entire dataset — pass empty array to the backend
  // which means "all items". This avoids sending millions of IDs and ensures
  // insights (outliers, duplicates, etc.) reflect the full dataset, not just
  // the current grid selection.
  const allMediaIds: number[] = useMemo(() => [], []);

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

  // Load stats for all visible columns in parallel, batch state updates
  useEffect(() => {
    if (!uuid || visibleColumns.length === 0) return;
    const toFetch = visibleColumns.filter(
      (c) => !columnStats[c.name] && !loadingStats.has(c.name),
    );
    if (toFetch.length === 0) return;

    setLoadingStats((prev) => {
      const next = new Set(prev);
      toFetch.forEach((c) => next.add(c.name));
      return next;
    });

    // Pass IDs for subset views, empty array for "all items" (lets backend use full dataset)
    const ids = allMediaIds.length > 0 && allMediaIds.length < (config?.total_count ?? Infinity)
      ? allMediaIds.slice(0, 50000)
      : [];
    Promise.all(
      toFetch.map((col) =>
        fetchColumnStats(uuid, ids, col.name)
          .then((stats) => ({ name: col.name, stats }))
          .catch(() => ({ name: col.name, stats: null as ColumnStats | null }))
      )
    ).then((results) => {
      const newStats: Record<string, ColumnStats> = {};
      for (const r of results) {
        if (r.stats) newStats[r.name] = r.stats;
      }
      setColumnStats((prev) => ({ ...prev, ...newStats }));
      setLoadingStats((prev) => {
        const next = new Set(prev);
        for (const r of results) next.delete(r.name);
        return next;
      });
    });
  }, [uuid, allMediaIds, visibleColumns]); // eslint-disable-line react-hooks/exhaustive-deps

  const isNumeric = (dtype: string) => /int|float|double|decimal|numeric/i.test(dtype);

  // Navigate to grid with a set of IDs
  const viewInGrid = useCallback(
    (ids: number[], label = "Insight results") => {
      pushSelection(ids, label);
    },
    [pushSelection],
  );

  // Navigate to grid by pushing a filter breadcrumb — O(1), no ID transfer.
  // The grid paginates server-side with the filter applied.
  const viewByColumnValue = useCallback(
    (column: string, value: string) => {
      const stats = columnStats[column];
      const count = stats?.type === "categorical"
        ? stats.data.find((d) => d.label === value)?.count
        : undefined;
      pushFilter(
        [{ column, comparison: "=", values: [value] }],
        `${column} = ${value}`,
        count,
      );
    },
    [pushFilter, columnStats],
  );

  const handleLoadMore = useCallback(
    async (colName: string) => {
      const stats = columnStats[colName];
      if (!stats || stats.type !== "categorical") return;
      setLoadingMore(colName);
      try {
        const ids = allMediaIds.slice(0, 50000);
        const more = await fetchColumnStats(uuid, ids, colName, stats.data.length, 50);
        if (more.type === "categorical") {
          setColumnStats((prev) => {
            const existing = prev[colName];
            if (!existing || existing.type !== "categorical") return prev;
            return {
              ...prev,
              [colName]: {
                ...existing,
                data: [...existing.data, ...more.data],
                total_unique: more.total_unique ?? existing.total_unique,
              },
            };
          });
        }
      } catch { /* ignore */ }
      setLoadingMore(null);
    },
    [uuid, allMediaIds, columnStats, setColumnStats],
  );

  const viewByNumericRange = useCallback(
    (column: string, low: number, high: number) => {
      pushFilter(
        [
          { column, comparison: ">=", values: [low.toString()] },
          { column, comparison: "<=", values: [high.toString()] },
        ],
        `${column}: ${low.toFixed(1)}\u2013${high.toFixed(1)}`,
      );
    },
    [pushFilter],
  );

  // ── Embedding helpers ──

  // Always use server-side computation — it handles large datasets efficiently
  // via FAISS and background tasks. Browser-side is only viable for tiny datasets.
  const totalItems = config?.total_count ?? 0;
  const USE_BROWSER = totalItems <= 5000 && totalItems > 0 && embeddingsCache != null;

  const isTaskResponse = (data: any): data is InsightsTaskResponse =>
    data && typeof data === "object" && "task_id" in data;

  const addBackgroundTask = (
    taskId: string,
    type: "outliers" | "duplicates" | "centroid_distance",
    label: string,
  ) => {
    setBackgroundTasks((prev) => [
      ...prev,
      {
        id: `insight-${taskId}`,
        type,
        viewUuid: uuid,
        label,
        status: "running" as const,
        progress: 0,
        done: 0,
        total: 0,
        startedAt: Date.now(),
        taskId,
        phase: "Starting",
      },
    ]);
  };

  const ensureEmbeddings = async (): Promise<EmbeddingData | null> => {
    if (embeddingsCache) return embeddingsCache;
    // Only fetch embeddings for small datasets (browser-side computation).
    // For large datasets the server handles everything via FAISS.
    if (totalItems > 5000) return null;
    try {
      const resp: EmbeddingsResponse = await fetchEmbeddings(uuid, []);
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
      if (outlierGroupBy) {
        // Grouped mode — always use server (it handles grouping internally)
        const response = await fetchOutliers(uuid, allMediaIds, outlierK, outlierThreshold, outlierGroupBy);
        if (isTaskResponse(response)) {
          addBackgroundTask(response.task_id, "outliers", "Outlier detection");
          toast("Outlier detection running in background");
          return;
        }
        const results = response as import("@/app/types").OutlierResult[];
        // Group results by label
        const groupMap = new Map<string, number[]>();
        for (const r of results) {
          const label = r.group ?? "(unknown)";
          const arr = groupMap.get(label) ?? [];
          arr.push(r.media_id);
          groupMap.set(label, arr);
        }
        const allIds = results.map((r) => r.media_id);
        // Extract group totals from results
        const groupTotals = new Map<string, number>();
        for (const r of results) {
          const label = r.group ?? "(unknown)";
          if (r.group_total && !groupTotals.has(label)) groupTotals.set(label, r.group_total);
        }
        const groups: { label: string; ids: number[]; media: Media[]; total: number }[] = [];
        for (const entry of Array.from(groupMap.entries())) {
          const gMedia = await loadPreviewMedia(entry[1]);
          groups.push({ label: entry[0], ids: entry[1], media: gMedia, total: groupTotals.get(entry[0]) ?? entry[1].length });
        }
        groups.sort((a, b) => a.label.localeCompare(b.label));
        const media = await loadPreviewMedia(allIds);
        setOutlierState({ ids: allIds, media, groups });
      } else {
        // Ungrouped mode
        let ids: number[];
        if (USE_BROWSER) {
          const emb = await ensureEmbeddings();
          if (!emb) { toast.error("Could not load embeddings"); return; }
          ids = computeOutlierScores(emb, allMediaIds.slice(0, 5000), outlierK)
            .filter((r) => r.score > outlierThreshold)
            .map((r) => r.mediaId);
        } else {
          const response = await fetchOutliers(uuid, allMediaIds, outlierK, outlierThreshold);
          if (isTaskResponse(response)) {
            addBackgroundTask(response.task_id, "outliers", "Outlier detection");
            toast("Outlier detection running in background");
            return;
          }
          ids = (response as import("@/app/types").OutlierResult[]).map((r) => r.media_id);
        }
        const media = await loadPreviewMedia(ids);
        setOutlierState({ ids, media });
      }
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
        const response = await fetchDuplicates(uuid, allMediaIds, dupThreshold, 100);
        if (isTaskResponse(response)) {
          addBackgroundTask(response.task_id, "duplicates", "Duplicate detection");
          toast("Duplicate detection running in background");
          return;
        }
        groups = (response as import("@/app/types").DuplicateGroup[]).map((g) => g.media_ids);
      }
      // Load per-group media previews (up to 6 images per group, first 20 groups)
      const groupMedia: Media[][] = [];
      const previewGroups = groups.slice(0, 20);
      const allPreviewIds = previewGroups.flatMap((g) => g.slice(0, 6));
      let allMedia: Media[] = [];
      if (allPreviewIds.length > 0) {
        try {
          allMedia = await fetchMediaItems(uuid, allPreviewIds, 0);
        } catch { /* ignore */ }
      }
      const mediaById = new Map(allMedia.map((m) => [m.index, m]));
      for (const g of previewGroups) {
        groupMedia.push(g.slice(0, 6).map((id) => mediaById.get(id)).filter(Boolean) as Media[]);
      }
      // Pad remaining groups with empty arrays
      for (let i = previewGroups.length; i < groups.length; i++) {
        groupMedia.push([]);
      }
      setDuplicateState({ groups, groupMedia });
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
        const response = await fetchCentroidDistance(uuid, allMediaIds, 200);
        if (isTaskResponse(response)) {
          addBackgroundTask(response.task_id, "centroid_distance", "Centroid distance");
          toast("Centroid distance running in background");
          return;
        }
        ids = (response as import("@/app/lib/api").CentroidDistanceResult[]).map((r) => r.media_id);
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

  // Image-stats columns already present?
  const IMG_STAT_COLUMNS = ["img_brightness", "img_contrast", "img_sharpness", "img_colorfulness", "img_saturation", "img_aspect_ratio", "img_width", "img_height"];
  const hasImageStats = IMG_STAT_COLUMNS.some((c) => columns.some((col) => col.name === c));

  return (
    <div className="h-full overflow-y-auto bg-gray-50/50">
      <div className="mx-auto max-w-5xl px-6 py-6">
        {/* Header \u2014 gives the page a sense of place */}
        <div className="mb-6 flex items-baseline justify-between border-b border-gray-200 pb-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-gray-900">
              {config.title || config.project || "Insights"}
            </h1>
            <p className="mt-1 text-[13px] text-gray-600">
              <span className="font-medium text-gray-900">{(config.total_count ?? 0).toLocaleString()}</span> items
              {" \u00b7 "}
              <span className="font-medium text-gray-900">{visibleColumns.length}</span> columns
              {" "}
              <span className="text-gray-500">({numericCols.length} numeric, {categoricalCols.length} categorical)</span>
            </p>
          </div>
        </div>

        {/* Highlights \u2014 auto-detected, hero card */}
        <Highlights
          stats={columnStats}
          totalItems={config.total_count ?? 0}
          viewByColumnValue={viewByColumnValue}
          viewByNumericRange={viewByNumericRange}
        />

        {/* Column cards */}
        <div className="mb-6">
          <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">Column distributions</h2>
          <p className="mb-3 text-[11px] text-gray-500">Click any bar to drill into those items in the grid.</p>
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
                  className={`overflow-hidden rounded-lg border bg-white p-3 transition-all hover:shadow-md ${
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
                        className={`h-3 w-3 text-gray-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="m6 9 6 6 6-6" />
                      </svg>
                    </div>
                  </div>
                  <div className="mb-1 text-[10px] text-gray-500">
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
                          onLoadMore={() => handleLoadMore(col.name)}
                          loadingMore={loadingMore === col.name}
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

        {/* Computed columns — collapsed disclosure */}
        <details className="mb-6 rounded-xl border border-gray-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-4 py-3 hover:bg-gray-50">
            <div className="flex items-center gap-2.5">
              <svg className="h-4 w-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
              </svg>
              <div>
                <div className="text-[13px] font-medium text-gray-900">Image statistics</div>
                <div className="text-[11px] text-gray-600">
                  {hasImageStats
                    ? "Brightness, contrast, sharpness, and other columns are available — find them above."
                    : "Add brightness, contrast, sharpness, colourfulness, aspect ratio, and other columns."}
                </div>
              </div>
            </div>
            <svg className="h-4 w-4 text-gray-500 transition-transform [details[open]_&]:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </summary>
          <div className="border-t border-gray-100 px-4 py-3">
            <button
              onClick={async () => {
                try {
                  const status = await computeImageStats(uuid);
                  if (status.status === "already_computed") {
                    toast("Image statistics already computed");
                  } else {
                    setBackgroundTasks((prev) => [
                      ...prev,
                      {
                        id: `img-stats-${uuid}`,
                        type: "image_stats" as const,
                        viewUuid: uuid,
                        label: "Image statistics",
                        status: "running" as const,
                        progress: 0,
                        done: 0,
                        total: 0,
                        startedAt: Date.now(),
                      },
                    ]);
                    toast("Computing image statistics in background");
                  }
                } catch {
                  toast.error("Failed to start image stats computation");
                }
              }}
              disabled={hasImageStats}
              className="rounded-md bg-teal-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {hasImageStats ? "Already computed" : "Compute"}
            </button>
            <span className="ml-2 text-[11px] text-gray-500">Runs in the background; takes a few minutes for large datasets.</span>
          </div>
        </details>

        {hasEmbeddings && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.997.398-.997.95v8a1 1 0 0 0 1 1h8Z" />
              <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
            </svg>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-gray-900">Outliers · Duplicates · Farthest from centroid</div>
              <div className="mt-0.5 text-[11px] text-gray-600">
                These embedding-driven analyses now live in the <span className="font-medium">Charts</span> panel of the main view —
                add a chart and pick "Outliers (LOF)", "Near-duplicates", or "Farthest from centroid".
              </div>
            </div>
            <a
              href="/"
              className="shrink-0 rounded-md bg-teal-700 px-3 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-teal-800"
            >
              Open Charts →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
