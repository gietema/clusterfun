"use client";
import { useEffect, useLayoutEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  configAtom, uuidAtom, currentMediaIndicesAtom, mediaItemsAtom,
  similarityResultsAtom, embeddingsCacheAtom, focusModeAtom,
  labelRailCollapsedAtom,
} from "@/app/store/atoms";
import {
  fetchLabelCounts, fetchAllLabels, fetchEmbeddings, fetchSimilarVector,
} from "@/app/lib/api";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";
import { getLabelColor } from "@/app/lib/label-colors";
import Tooltip from "../shared/Tooltip";
import EmptyState from "../shared/EmptyState";
import type { LabelCount } from "@/app/types";

const EXCLUDE_LABEL = "exclude";

/**
 * Persistent left rail for label classes — the app's hero verb.
 *
 *   ┌─────────────┐
 *   │ Labels   ↹  │
 *   │ + Add ...   │
 *   ├─────────────┤
 *   │ ● cat   12  │   ← click to filter
 *   │ ● dog    5  │
 *   │ ● bird   3  │
 *   ├─────────────┤
 *   │ Find more   │
 *   │ Focus mode  │
 *   └─────────────┘
 */
export default function LabelRail() {
  const [config, setConfig] = useAtom(configAtom);
  const uuid = useAtomValue(uuidAtom);
  const mediaIndices = useAtomValue(currentMediaIndicesAtom);
  const mediaItems = useAtomValue(mediaItemsAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);
  const embeddingsCache = useAtomValue(embeddingsCacheAtom);
  const setFocusMode = useSetAtom(focusModeAtom);
  const [collapsed, setCollapsed] = useAtom(labelRailCollapsedAtom);
  const { replaceTop, setBaseAndSelection } = useBreadcrumbNav();

  const [labelCounts, setLabelCounts] = useState<LabelCount[]>([]);
  const [loading, setLoading] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [searchLabel, setSearchLabel] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  // Find-more popover
  const [findMoreOpen, setFindMoreOpen] = useState(false);
  const findMoreTriggerRef = useRef<HTMLButtonElement>(null);
  const findMorePopoverRef = useRef<HTMLDivElement>(null);
  const [findMorePos, setFindMorePos] = useState<{ top: number; left: number } | null>(null);

  const labels = (config?.labels ?? []).filter((l) => l !== EXCLUDE_LABEL);
  const hasEmbeddings = !!config?.embeddings;
  const eligibleLabels = labels.filter(
    (l) => (labelCounts.find((lc) => lc.label === l)?.inEntireDataset ?? 0) >= 2,
  );
  const isSearching = searchLabel !== null;

  useEffect(() => {
    if (!config) return;
    fetchLabelCounts(uuid, mediaIndices).then(setLabelCounts).catch(() => {});
  }, [uuid, mediaIndices, mediaItems, config]);

  useEffect(() => {
    if (!findMoreOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (findMoreTriggerRef.current?.contains(t)) return;
      if (findMorePopoverRef.current?.contains(t)) return;
      setFindMoreOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [findMoreOpen]);

  useLayoutEffect(() => {
    if (!findMoreOpen) { setFindMorePos(null); return; }
    const update = () => {
      const rect = findMoreTriggerRef.current?.getBoundingClientRect();
      if (rect) setFindMorePos({ top: rect.top, left: rect.right + 6 });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [findMoreOpen]);

  const findMore = useCallback(async (label: string) => {
    if (!hasEmbeddings) return;
    setLoading(true);
    setSearchLabel(label);
    setFindMoreOpen(false);
    try {
      const allLabels = await fetchAllLabels(uuid);
      const positiveIds: number[] = [];
      const excludeIds: number[] = [];
      for (const [mediaId, lbls] of Object.entries(allLabels)) {
        if (lbls.includes(label)) positiveIds.push(parseInt(mediaId));
        if (lbls.includes(EXCLUDE_LABEL)) excludeIds.push(parseInt(mediaId));
      }
      if (positiveIds.length === 0) { setLoading(false); return; }

      const allIds = [...positiveIds, ...excludeIds];
      let embeddings: Float32Array;
      let dimension: number;
      let idToIndex: Map<number, number>;

      if (embeddingsCache) {
        embeddings = embeddingsCache.embeddings;
        dimension = embeddingsCache.dimension;
        idToIndex = embeddingsCache.idToIndex;
      } else {
        const resp = await fetchEmbeddings(uuid, allIds);
        embeddings = new Float32Array(resp.embeddings.flat());
        dimension = resp.dimension;
        idToIndex = new Map(resp.media_ids.map((id: number, idx: number) => [id, idx]));
      }

      const centroid = new Float32Array(dimension);
      let posCount = 0;
      for (const id of positiveIds) {
        const idx = idToIndex.get(id);
        if (idx == null) continue;
        for (let d = 0; d < dimension; d++) {
          centroid[d] += embeddings[idx * dimension + d];
        }
        posCount++;
      }
      if (posCount === 0) { setLoading(false); return; }
      for (let d = 0; d < dimension; d++) centroid[d] /= posCount;

      if (excludeIds.length > 0) {
        const negCentroid = new Float32Array(dimension);
        let negCount = 0;
        for (const id of excludeIds) {
          const idx = idToIndex.get(id);
          if (idx == null) continue;
          for (let d = 0; d < dimension; d++) {
            negCentroid[d] += embeddings[idx * dimension + d];
          }
          negCount++;
        }
        if (negCount > 0) {
          for (let d = 0; d < dimension; d++) {
            centroid[d] -= 0.3 * (negCentroid[d] / negCount);
          }
        }
      }

      let norm = 0;
      for (let d = 0; d < dimension; d++) norm += centroid[d] * centroid[d];
      norm = Math.sqrt(norm);
      if (norm > 0) for (let d = 0; d < dimension; d++) centroid[d] /= norm;

      const results = await fetchSimilarVector(uuid, Array.from(centroid));
      const ids = results.map((r) => r.media_id);
      const scores: Record<number, number> = {};
      for (const r of results) scores[r.media_id] = r.similarity;
      setSimilarityResults(scores);
      replaceTop(ids, `Finding "${label}"`);
    } catch (err) {
      console.error("Search failed:", err);
    }
    setLoading(false);
  }, [uuid, hasEmbeddings, embeddingsCache, setSimilarityResults, replaceTop]);

  if (!config) return null;

  const handleAddLabel = () => {
    const name = newLabel.trim();
    if (!name || config.labels.includes(name)) return;
    setConfig({ ...config, labels: [...config.labels, name] });
    setNewLabel("");
  };

  const handleLabelClick = (label: string) => {
    if (activeFilter === label) {
      setActiveFilter(null);
      return;
    }
    setActiveFilter(label);
    fetchAllLabels(uuid).then((allLabels) => {
      const ids: number[] = [];
      for (const [mediaId, lbls] of Object.entries(allLabels)) {
        if (lbls.includes(label)) ids.push(parseInt(mediaId));
      }
      if (ids.length > 0) setBaseAndSelection([], ids, `Label: ${label}`);
    });
  };

  const clearSearch = () => {
    setSearchLabel(null);
    setSimilarityResults({});
  };

  // ─── Collapsed: icon-only rail ─────────────────────────────────
  if (collapsed) {
    return (
      <div className="flex h-full w-12 flex-col items-center gap-0.5 border-r border-gray-200 bg-gray-50/40 py-2">
        <button
          onClick={() => setCollapsed(false)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
          title="Expand labels"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        <div className="my-1 h-px w-6 bg-gray-200" />
        {labels.map((label, i) => {
          const count = labelCounts.find((lc) => lc.label === label)?.inEntireDataset ?? 0;
          const isFiltered = activeFilter === label;
          const prefix = label.slice(0, 2).toUpperCase();
          return (
            <button
              key={label}
              onClick={() => handleLabelClick(label)}
              className={`group relative flex h-7 w-10 items-center justify-center gap-1 rounded-md transition-colors ${
                isFiltered ? "bg-gray-200/70" : "hover:bg-gray-200"
              }`}
              title={`${label} · ${count}`}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: getLabelColor(i) }}
              />
              <span className={`text-[10px] font-medium tabular-nums tracking-tight ${
                isFiltered ? "text-gray-900" : "text-gray-600"
              }`}>
                {prefix}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // ─── Expanded: full rail ───────────────────────────────────────
  return (
    <div className="flex h-full w-44 flex-col border-r border-gray-200 bg-gray-50/40">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-gray-200 px-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">Labels</span>
        <button
          onClick={() => setCollapsed(true)}
          className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
          title="Collapse rail"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      </div>

      {/* Add label */}
      <form
        className="flex shrink-0 items-center gap-1 border-b border-gray-100 px-2 py-2"
        onSubmit={(e) => { e.preventDefault(); handleAddLabel(); }}
      >
        <input
          type="text"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder={labels.length === 0 ? "First label..." : "Add label..."}
          className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-800 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/20"
          onKeyDown={(e) => { if (e.key === "Escape") setNewLabel(""); }}
        />
        {newLabel.trim() && (
          <button
            type="submit"
            className="rounded-md bg-teal-700 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-teal-800"
          >
            +
          </button>
        )}
      </form>

      {/* Label list — clickable to filter */}
      <div className="min-h-0 flex-1 overflow-y-auto px-1.5 py-1">
        {activeFilter && (
          <button
            onClick={() => setActiveFilter(null)}
            className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Show all
          </button>
        )}
        {labels.length === 0 ? (
          <EmptyState
            illustration="label"
            title="No labels yet"
            hint="Type a name above, then press 1-9 to assign labels by hovering items."
          />
        ) : (
          labels.map((label, i) => {
            const count = labelCounts.find((lc) => lc.label === label)?.inEntireDataset ?? 0;
            const isFiltered = activeFilter === label;
            const color = getLabelColor(i);
            return (
              <button
                key={label}
                onClick={() => handleLabelClick(label)}
                className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                  isFiltered
                    ? "bg-gray-200/70 text-gray-900"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="min-w-0 flex-1 truncate">{label}</span>
                <span className="tabular-nums text-[10px] text-gray-500">{count}</span>
                <span className="-mr-0.5 text-[9px] text-gray-300 opacity-0 transition-opacity group-hover:opacity-100">
                  {i + 1}
                </span>
              </button>
            );
          })
        )}
      </div>

      {/* Find more + Focus mode */}
      {labels.length > 0 && (
        <div className="flex shrink-0 flex-col gap-1 border-t border-gray-100 p-2">
          {hasEmbeddings && !isSearching && !loading && (
            <button
              ref={findMoreTriggerRef}
              onClick={() => eligibleLabels.length === 1 ? findMore(eligibleLabels[0]) : setFindMoreOpen((v) => !v)}
              disabled={eligibleLabels.length === 0}
              className="flex items-center justify-center gap-1.5 rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 transition-colors hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              title={eligibleLabels.length === 0 ? "Label 2+ items in a class to enable" : "Find more like a labeled class"}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              Find more
              {eligibleLabels.length > 1 && (
                <svg className="h-3 w-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              )}
            </button>
          )}
          {loading && (
            <div className="flex items-center justify-center gap-1.5 rounded-md bg-gray-100 px-2 py-1 text-[11px] text-gray-600">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-200 border-t-teal-700" />
              Searching...
            </div>
          )}
          {isSearching && !loading && (
            <div className="flex flex-col gap-1 rounded-md border border-teal-500/30 bg-teal-50/50 px-2 py-1.5">
              <span className="truncate text-[11px] font-medium text-gray-800">
                Finding "{searchLabel}"
              </span>
              <div className="flex gap-1">
                <button
                  onClick={() => findMore(searchLabel!)}
                  className="flex-1 rounded px-1.5 py-0.5 text-[10px] text-gray-700 transition-colors hover:bg-white"
                >
                  Refine
                </button>
                <button
                  onClick={clearSearch}
                  className="flex-1 rounded px-1.5 py-0.5 text-[10px] text-gray-500 transition-colors hover:bg-white"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
          <Tooltip label="Focus mode" shortcut="F" side="top">
          <button
            onClick={() => setFocusMode(true)}
            className="flex items-center justify-center gap-1.5 rounded-md bg-teal-700 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-teal-800"
            aria-label="Focus mode"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Focus
          </button>
          </Tooltip>
        </div>
      )}

      {/* Find-more popover (portal) */}
      {findMoreOpen && eligibleLabels.length > 1 && findMorePos && typeof document !== "undefined" && createPortal(
        <div
          ref={findMorePopoverRef}
          style={{ position: "fixed", top: findMorePos.top, left: findMorePos.left }}
          className="motion-popover z-50 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
        >
          <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Expand class
          </div>
          {eligibleLabels.map((label) => {
            const i = labels.indexOf(label);
            const count = labelCounts.find((lc) => lc.label === label)?.inEntireDataset ?? 0;
            return (
              <button
                key={label}
                onClick={() => findMore(label)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                <span
                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: getLabelColor(i) }}
                />
                <span className="flex-1 text-left">{label}</span>
                <span className="tabular-nums text-[11px] text-gray-500">{count}</span>
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
