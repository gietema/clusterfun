"use client";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  configAtom, gridValuesAtom, mediaAtom,
  currentMediaIndicesAtom, mediaItemsAtom, uuidAtom,
  mediaIndicesStackAtom,
  filtersAtom,
  selectedMediaAtom,
  bottomDockVisibleAtom,
  insightsOutliersAtom,
  outlierHighlightAtom,
  activeLearningAtom,
  similarityResultsAtom,
  focusModeAtom,
  filteredCountAtom,
  maxPageAtom,
  gridCollapsedAtom,
  sidebarCollapsedAtom,
  cursorIndexAtom,
  quickLookOpenAtom,
} from "@/app/store/atoms";
import { fetchMediaItems, fetchFilteredCount, saveLabel, deleteLabel, fetchSimilar } from "@/app/lib/api";
import type { Media } from "@/app/types";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";
import ResizableLayout from "../shared/ResizableLayout";
import MediaGridItem, { EXCLUDE_LABEL } from "./MediaGridItem";
import SelectionActionBar from "./SelectionActionBar";
import GridWorkspaceSidebar from "./GridWorkspaceSidebar";
import FocusMode from "./FocusMode";
import BottomDock from "../workspace/BottomDock";
import { useLabelUndo } from "@/app/lib/use-label-undo";
import { useMediaPreview } from "@/app/lib/use-media-preview";
import { useActiveLearning } from "@/app/lib/use-active-learning";

interface GridViewProps {
  onBack?: () => void;
}

export default function GridView({ onBack }: GridViewProps) {
  const mediaIndices = useAtomValue(currentMediaIndicesAtom);
  const mediaIndicesStack = useAtomValue(mediaIndicesStackAtom);
  const uuid = useAtomValue(uuidAtom);
  const config = useAtomValue(configAtom);
  const setSideMedia = useSetAtom(mediaAtom);
  const [mediaItems, setMediaItems] = useAtom(mediaItemsAtom);
  const [gridValues, setGridValues] = useAtom(gridValuesAtom);
  const filters = useAtomValue(filtersAtom);
  const { replaceTop } = useBreadcrumbNav();
  const [selectedMedia, setSelectedMedia] = useAtom(selectedMediaAtom);
  const [focusMode, setFocusMode] = useAtom(focusModeAtom);
  const lastClickedRef = useRef<number | null>(null);
  const [filteredCount, setFilteredCount] = useAtom(filteredCountAtom);

  const { pushAction, undo, redo } = useLabelUndo();
  const { previewMedia, openMedia } = useMediaPreview();
  // setDetailIndex no longer used — click now opens Quick Look directly
  const outlierState = useAtomValue(insightsOutliersAtom);
  const [dockVisible, setDockVisible] = useAtom(bottomDockVisibleAtom);
  const [gridCollapsed, setGridCollapsed] = useAtom(gridCollapsedAtom);
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);
  const outlierHighlight = useAtomValue(outlierHighlightAtom);
  const alState = useAtomValue(activeLearningAtom);
  const similarityResults = useAtomValue(similarityResultsAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);
  const setMaxPage = useSetAtom(maxPageAtom);
  const hasSearchResults = Object.keys(similarityResults).length > 0;
  const { isActive } = useActiveLearning();

  const canGoBack = onBack && mediaIndicesStack.length > 1;

  // Subsample media indices client-side with a stable shuffle
  const effectiveIndices = useMemo(() => {
    if (gridValues.subsample <= 0) return mediaIndices;

    const total = mediaIndices.length > 0 ? mediaIndices.length : (config?.total_count ?? 0);
    if (total === 0) return mediaIndices;

    const count = Math.max(1, Math.round(total * gridValues.subsample / 100));
    if (count >= total) return mediaIndices;

    // Seeded LCG for deterministic sampling
    let seed = 42;
    const lcg = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 0x100000000; };

    if (mediaIndices.length > 0) {
      // Shuffle a copy of the explicit ID list
      const arr = [...mediaIndices];
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(lcg() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr.slice(0, count);
    }

    // No explicit IDs (empty = all items): generate random indices
    // without allocating the full array
    const selected = new Set<number>();
    while (selected.size < count) {
      selected.add(Math.floor(lcg() * total));
    }
    return Array.from(selected).sort((a, b) => a - b);
  }, [mediaIndices, gridValues.subsample, config?.total_count]);

  // Endless pagination — page=0 replaces items, page>0 appends.
  // Two effects: reset on deps change, fetch on page change.
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadMedia = useCallback((page: number, append: boolean) => {
    if (!uuid) return;
    setIsLoadingMore(true);
    fetchMediaItems(
      uuid,
      effectiveIndices,
      page,
      gridValues.sortBy || undefined,
      gridValues.asc,
      filters.length > 0 ? filters : undefined,
    ).then((items) => {
      setMediaItems((prev) => (append ? [...prev, ...items] : items));
    }).finally(() => setIsLoadingMore(false));
  }, [uuid, effectiveIndices, gridValues.sortBy, gridValues.asc, filters, setMediaItems]);

  // Reset to page 0 + replace items when deps change
  useEffect(() => {
    setGridValues((prev) => ({ ...prev, page: 0 }));
    loadMedia(0, false);
  }, [effectiveIndices, filters, gridValues.sortBy, gridValues.asc]); // eslint-disable-line react-hooks/exhaustive-deps

  // When page increments past 0 (from intersection observer), append the next page
  useEffect(() => {
    if (gridValues.page > 0) loadMedia(gridValues.page, true);
  }, [gridValues.page]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch filtered count when filters change
  useEffect(() => {
    if (!uuid || filters.length === 0) { setFilteredCount(null); return; }
    fetchFilteredCount(uuid, filters).then(setFilteredCount).catch(() => setFilteredCount(null));
  }, [uuid, filters]);

  // Publish max page (still useful for "all loaded" checks)
  useEffect(() => {
    const total = effectiveIndices.length > 0
      ? effectiveIndices.length
      : (filteredCount ?? config?.total_count ?? 0);
    setMaxPage(Math.max(0, Math.ceil(total / 50) - 1));
  }, [effectiveIndices, filteredCount, config?.total_count, setMaxPage]);

  // Intersection observer on a bottom sentinel — auto-fetch next page
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting && !isLoadingMore) {
          setGridValues((prev) => {
            // Compute max page from latest atoms
            const total = effectiveIndices.length > 0
              ? effectiveIndices.length
              : (filteredCount ?? config?.total_count ?? 0);
            const max = Math.max(0, Math.ceil(total / 50) - 1);
            if (prev.page >= max) return prev;
            return { ...prev, page: prev.page + 1 };
          });
        }
      }
    }, { rootMargin: "300px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [isLoadingMore, effectiveIndices, filteredCount, config?.total_count, setGridValues]);

  const [cursor, setCursor] = useAtom(cursorIndexAtom);
  const [quickLookOpen, setQuickLookOpen] = useAtom(quickLookOpenAtom);

  // Initialise cursor to first item once items load
  useEffect(() => {
    if (cursor == null && mediaItems.length > 0) setCursor(mediaItems[0].index);
  }, [cursor, mediaItems, setCursor]);

  // Reset cursor if it points outside the current page
  useEffect(() => {
    if (cursor != null && mediaItems.length > 0 && !mediaItems.some((m) => m.index === cursor)) {
      setCursor(mediaItems[0].index);
    }
  }, [mediaItems, cursor, setCursor]);

  // Keyboard handling
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (quickLookOpen) return; // QuickLook owns the keyboard while it's open
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") { e.preventDefault(); redo(); }
      else if ((e.metaKey || e.ctrlKey) && e.key === "z") { e.preventDefault(); undo(); }
      else if (e.key === "Escape" && selectedMedia.size > 0) { setSelectedMedia(new Set()); }
      else if (e.key === "f" && !e.metaKey && !e.ctrlKey && config?.labels?.length) { e.preventDefault(); setFocusMode(true); }
      else if (e.key === " " && cursor != null) {
        // Space → open Quick Look on the cursor item
        e.preventDefault();
        setQuickLookOpen(true);
      }
      else if (["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key) && cursor != null && mediaItems.length > 0) {
        e.preventDefault();
        const pageIndices = mediaItems.map((m) => m.index);
        const at = pageIndices.indexOf(cursor);
        if (at === -1) return;
        const cols = Math.max(1, gridValues.numberOfColumns);
        let next = at;
        if (e.key === "ArrowRight") next = Math.min(pageIndices.length - 1, at + 1);
        else if (e.key === "ArrowLeft") next = Math.max(0, at - 1);
        else if (e.key === "ArrowDown") next = Math.min(pageIndices.length - 1, at + cols);
        else if (e.key === "ArrowUp") next = Math.max(0, at - cols);
        setCursor(pageIndices[next]);
        // scroll the cursored card into view
        const el = document.querySelector(`[data-media-index="${pageIndices[next]}"]`);
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    },
    [undo, redo, config?.labels, selectedMedia.size, setSelectedMedia, quickLookOpen, cursor, mediaItems, gridValues.numberOfColumns, setCursor, setQuickLookOpen, setFocusMode],
  );
  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleClick = (index: number, e: React.MouseEvent) => {
    // Cmd/Ctrl+click or click while items are selected → toggle selection
    if (e.metaKey || e.ctrlKey) {
      handleSelect(index, e);
      return;
    }
    if (selectedMedia.size > 0) {
      setSelectedMedia(new Set());
    }
    // Click → open full Media view (Plotly zoom + Back). Space still uses Quick Look.
    setCursor(index);
    // openMedia fetches the full media (with base64) BEFORE navigating to /media,
    // so the Plotly view has the image ready. previewMedia only loads a thumbnail.
    openMedia(index);
  };

  const handleSelect = (index: number, e: React.MouseEvent) => {
    setSelectedMedia((prev) => {
      const next = new Set(prev);
      if (e.shiftKey && lastClickedRef.current != null) {
        // Shift+click: range select between last clicked and current
        const pageIndices = mediaItems.map((m) => m.index);
        const from = pageIndices.indexOf(lastClickedRef.current);
        const to = pageIndices.indexOf(index);
        if (from !== -1 && to !== -1) {
          const [start, end] = from < to ? [from, to] : [to, from];
          for (let i = start; i <= end; i++) {
            next.add(pageIndices[i]);
          }
        }
      } else {
        // Toggle single item
        if (next.has(index)) next.delete(index);
        else next.add(index);
      }
      return next;
    });
    lastClickedRef.current = index;
  };

  const handleHover = (index: number) => {
    const item = mediaItems.find((m) => m.index === index);
    if (item) setSideMedia(item);
  };

  const handleLabelToggle = (media: Media, label: string) => {
    const isRemove = media.labels?.includes(label);
    if (isRemove) {
      deleteLabel(uuid, [media.index], label).catch(console.error);
      pushAction({ type: "remove", label, mediaIds: [media.index] });
    } else {
      saveLabel(uuid, [media.index], label).catch(console.error);
      pushAction({ type: "add", label, mediaIds: [media.index] });
    }
    setMediaItems((items) =>
      items.map((m) => {
        if (m.index !== media.index) return m;
        const labels = m.labels ? [...m.labels] : [];
        if (isRemove) {
          return { ...m, labels: labels.filter((l) => l !== label) };
        }
        if (!labels.includes(label)) labels.push(label);
        return { ...m, labels };
      }),
    );
  };

  const handleExclude = (media: Media) => {
    const isAlreadyExcluded = media.labels?.includes(EXCLUDE_LABEL);
    if (isAlreadyExcluded) {
      deleteLabel(uuid, [media.index], EXCLUDE_LABEL).catch(console.error);
      pushAction({ type: "remove", label: EXCLUDE_LABEL, mediaIds: [media.index] });
    } else {
      saveLabel(uuid, [media.index], EXCLUDE_LABEL).catch(console.error);
      pushAction({ type: "add", label: EXCLUDE_LABEL, mediaIds: [media.index] });
    }
    setMediaItems((items) =>
      items.map((m) => {
        if (m.index !== media.index) return m;
        const labels = m.labels ? [...m.labels] : [];
        if (isAlreadyExcluded) {
          return { ...m, labels: labels.filter((l) => l !== EXCLUDE_LABEL) };
        }
        if (!labels.includes(EXCLUDE_LABEL)) labels.push(EXCLUDE_LABEL);
        return { ...m, labels };
      }),
    );
  };

  // ── Selection action handlers ──
  const handleSelectionLabel = (label: string) => {
    const ids = [...selectedMedia];
    saveLabel(uuid, ids, label).catch(console.error);
    pushAction({ type: "add", label, mediaIds: ids });
    setMediaItems((items) =>
      items.map((m) => {
        if (!selectedMedia.has(m.index)) return m;
        const labels = m.labels ? [...m.labels] : [];
        if (!labels.includes(label)) labels.push(label);
        return { ...m, labels };
      }),
    );
    setSelectedMedia(new Set());
  };

  const handleSelectionRemoveLabel = (label: string) => {
    const ids = [...selectedMedia];
    deleteLabel(uuid, ids, label).catch(console.error);
    pushAction({ type: "remove", label, mediaIds: ids });
    setMediaItems((items) =>
      items.map((m) => {
        if (!selectedMedia.has(m.index)) return m;
        return { ...m, labels: (m.labels ?? []).filter((l) => l !== label) };
      }),
    );
    setSelectedMedia(new Set());
  };

  const handleSelectionFindSimilar = async () => {
    if (!config?.embeddings || selectedMedia.size === 0) return;
    const firstId = [...selectedMedia][0];
    const results = await fetchSimilar(uuid, firstId);
    const ids = results.map((r) => r.media_id);
    const scores: Record<number, number> = {};
    for (const r of results) scores[r.media_id] = r.similarity;
    setSimilarityResults(scores);
    replaceTop(ids, `Similar to #${firstId}`);
    setSelectedMedia(new Set());
  };

  // Outlier ID set for highlighting
  const outlierSet = useMemo(() => {
    if (!outlierHighlight || outlierState.ids.length === 0) return null;
    return new Set(outlierState.ids);
  }, [outlierHighlight, outlierState.ids]);

  if (!config) return null;

  // Charts (collapsed strip OR expanded dock) — sibling of the grid section so they
  // collapse/expand independently. The dock always docks ABOVE the grid when expanded
  // (regardless of the old top/bottom/right setting) so it lives next to its expand strip.
  const chartsSection = (
    <>
      {!dockVisible ? (
        <button
          onClick={() => setDockVisible(true)}
          className="flex h-7 shrink-0 items-center justify-center gap-1.5 border-b border-gray-200 bg-gray-50/60 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
          title="Show charts"
          aria-label="Show charts"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m6 9 6 6 6-6" />
          </svg>
          Charts
        </button>
      ) : (
        <BottomDock position="top" />
      )}
    </>
  );

  // Grid section — full content or just a thin "Grid ⌄" expand bar
  const gridSection = gridCollapsed ? (
    <button
      onClick={() => setGridCollapsed(false)}
      className="flex h-7 shrink-0 items-center justify-center gap-1.5 border-b border-gray-200 bg-gray-50/60 text-[11px] font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
      title="Show grid"
      aria-label="Show grid"
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="m6 9 6 6 6-6" />
      </svg>
      Grid
    </button>
  ) : (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Grid pane header — sits directly above the grid content it controls */}
      <div className="flex h-7 shrink-0 items-center justify-end border-b border-gray-100 px-2">
        <button
          onClick={() => {
            // Auto-expand sidebar so the user always sees content.
            if (sidebarCollapsed) setSidebarCollapsed(false);
            setGridCollapsed(true);
          }}
          className="flex h-5 w-5 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          title="Hide grid"
          aria-label="Hide grid"
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
      </div>

      {/* Media grid */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div
          className="grid items-end gap-3"
          style={{
            gridTemplateColumns: `repeat(${gridValues.numberOfColumns}, minmax(0, 1fr))`,
          }}
        >
          {mediaItems.map((media) => (
            <div key={media.index} data-media-index={media.index} style={{ contentVisibility: "auto" }}>
              <MediaGridItem
                media={media}
                columns={gridValues.numberOfColumns}
                showColumns={gridValues.showColumnValues}
                boundingBoxColumn={config.bounding_box}
                showBboxLabel={gridValues.showBboxLabel}
                display={config.display}
                onClick={(e) => handleClick(media.index, e)}
                onHover={() => handleHover(media.index)}
                onLabelToggle={(label) => handleLabelToggle(media, label)}
                onExclude={(isActive || hasSearchResults) ? () => handleExclude(media) : undefined}
                selected={selectedMedia.has(media.index)}
                anySelected={selectedMedia.size > 0}
                onSelect={(e) => handleSelect(media.index, e)}
                isCursor={cursor === media.index}
                isOutlier={outlierSet?.has(media.index) ?? false}
              />
            </div>
          ))}
        </div>
        <div ref={sentinelRef} className="flex h-12 items-center justify-center text-[11px] text-gray-500">
          {isLoadingMore ? (
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-200 border-t-teal-700" />
              Loading…
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );

  // gridContent now stacks Charts (top) + Grid (bottom) as INDEPENDENT collapsible sections.
  const gridContent = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {chartsSection}
      {gridSection}
    </div>
  );

  return (
    <ResizableLayout sidebar={<GridWorkspaceSidebar />}>
      {gridContent}
      <SelectionActionBar
        count={selectedMedia.size}
        onClear={() => setSelectedMedia(new Set())}
        onLabel={handleSelectionLabel}
        onRemoveLabel={handleSelectionRemoveLabel}
        onFindSimilar={config.embeddings ? handleSelectionFindSimilar : undefined}
      />
      {focusMode && (
        <FocusMode
          mediaIndices={effectiveIndices}
          onLabelToggle={handleLabelToggle}
          onExit={() => {
            setFocusMode(false);
            loadMedia(0, false);
          }}
        />
      )}
    </ResizableLayout>
  );
}
