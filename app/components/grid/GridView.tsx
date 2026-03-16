"use client";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { faSquare } from "@fortawesome/free-regular-svg-icons";
import { faTableCells, faFloppyDisk, faCrosshairs } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  configAtom, gridValuesAtom, mediaAtom,
  currentMediaIndicesAtom, mediaItemsAtom, uuidAtom,
  mediaIndicesStackAtom,
  filtersAtom, similarityResultsAtom, showPageAtom,
  selectedMediaAtom,
} from "@/app/store/atoms";
import { fetchMediaItems, fetchFilteredCount, saveLabel, deleteLabel, saveView, fetchSimilar } from "@/app/lib/api";
import type { Media } from "@/app/types";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";
import BreadcrumbTrail from "../shared/BreadcrumbTrail";
import ResizableLayout from "../shared/ResizableLayout";
import FilterBar from "../filters/FilterBar";
import MediaGridItem, { EXCLUDE_LABEL } from "./MediaGridItem";
import SelectionActionBar from "./SelectionActionBar";
import Pagination from "./Pagination";
import SortDropdown from "./SortDropdown";
import ShowValueDropdown from "./ShowValueDropdown";
import BoundingBoxCheckbox from "./BoundingBoxCheckbox";
import GridWorkspaceSidebar from "./GridWorkspaceSidebar";
import FocusMode from "./FocusMode";
import { useLabelUndo } from "@/app/lib/use-label-undo";
import { useMediaPreview } from "@/app/lib/use-media-preview";
import { useActiveLearning } from "@/app/lib/use-active-learning";
import { useState } from "react";

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
  const setUuid = useSetAtom(uuidAtom);
  const setShowPage = useSetAtom(showPageAtom);
  const [filters, setFilters] = useAtom(filtersAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);
  const { reset: resetBreadcrumbs, replaceTop } = useBreadcrumbNav();
  const [selectedMedia, setSelectedMedia] = useAtom(selectedMediaAtom);
  const [focusMode, setFocusMode] = useState(false);
  const lastClickedRef = useRef<number | null>(null);
  const [filteredCount, setFilteredCount] = useState<number | null>(null);

  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedViewUuid, setSavedViewUuid] = useState<string | null>(null);
  const { pushAction, undo, redo } = useLabelUndo();
  const { openMedia } = useMediaPreview();
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

  const loadMedia = (sortCol?: string, asc?: boolean) => {
    if (!uuid) return;
    fetchMediaItems(
      uuid,
      effectiveIndices,
      gridValues.page,
      sortCol ?? (gridValues.sortBy || undefined),
      asc ?? gridValues.asc,
      filters.length > 0 ? filters : undefined,
    ).then(setMediaItems);
  };

  useEffect(() => { loadMedia(); }, [effectiveIndices, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch filtered count when filters change
  useEffect(() => {
    if (!uuid || filters.length === 0) { setFilteredCount(null); return; }
    fetchFilteredCount(uuid, filters).then(setFilteredCount).catch(() => setFilteredCount(null));
  }, [uuid, filters]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "z") {
        e.preventDefault();
        redo();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "z") {
        e.preventDefault();
        undo();
      } else if (e.key === "Escape" && selectedMedia.size > 0) {
        setSelectedMedia(new Set());
      } else if (e.key === "Escape" && canGoBack) {
        onBack!();
      } else if (e.key === "f" && !e.metaKey && !e.ctrlKey && config?.labels && config.labels.length > 0) {
        // Don't trigger if typing in an input
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        setFocusMode(true);
      }
    },
    [undo, redo, canGoBack, onBack, config?.labels, selectedMedia.size, setSelectedMedia],
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

  const handleSort = (column: string, ascending: boolean) => {
    if (!config?.columns.includes(column)) return;
    setGridValues((prev) => ({ ...prev, sortBy: column, asc: ascending }));
    loadMedia(column, ascending);
  };

  const handlePageChange = (newPage: number) => {
    setGridValues((prev) => ({ ...prev, page: newPage }));
    setSelectedMedia(new Set());
    fetchMediaItems(uuid, effectiveIndices, newPage, gridValues.sortBy || undefined, gridValues.asc)
      .then(setMediaItems);
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

  if (!config) return null;

  return (
    <ResizableLayout sidebar={<GridWorkspaceSidebar />}>
      <div className="flex h-full flex-col">
      {config.title && <div className="mb-2 shrink-0 px-3 pt-2 text-sm font-medium text-gray-900">{config.title}</div>}
      {/* Toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 px-3 py-2">
        <span className="text-xs text-gray-500">
          {gridValues.subsample > 0
            ? `${effectiveIndices.length.toLocaleString()} of ${mediaIndices.length.toLocaleString()}`
            : (filteredCount != null ? filteredCount : (mediaIndices.length > 0 ? mediaIndices.length : (config.total_count ?? 0))).toLocaleString()}{" "}
          items
        </span>
        <select
          value={gridValues.subsample}
          onChange={(e) => {
            setGridValues((prev) => ({ ...prev, subsample: parseInt(e.target.value), page: 0 }));
          }}
          className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
        >
          <option value={0}>All data</option>
          <option value={1}>1% sample</option>
          <option value={5}>5% sample</option>
          <option value={10}>10% sample</option>
          <option value={25}>25% sample</option>
          <option value={50}>50% sample</option>
        </select>
        <SortDropdown
          columns={config.columns}
          gridValues={gridValues}
          onSort={handleSort}
        />
        {config.bounding_box && (
          <BoundingBoxCheckbox
            checked={gridValues.showBboxLabel}
            onChange={(checked) => setGridValues((prev) => ({ ...prev, showBboxLabel: checked }))}
          />
        )}
        <ShowValueDropdown
          columns={config.columns}
          values={gridValues.showColumnValues}
          onChange={(vals) => setGridValues((prev) => ({ ...prev, showColumnValues: vals }))}
        />
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <FontAwesomeIcon icon={faSquare} />
          <input
            type="range"
            className="w-20"
            min={1}
            max={10}
            value={gridValues.numberOfColumns}
            onChange={(e) => setGridValues((prev) => ({ ...prev, numberOfColumns: parseInt(e.target.value) }))}
          />
          <FontAwesomeIcon icon={faTableCells} />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Pagination
            page={gridValues.page}
            maxPage={Math.max(0, Math.ceil((effectiveIndices.length > 0 ? effectiveIndices.length : (filteredCount ?? config.total_count ?? 0)) / 50) - 1)}
            onPageChange={handlePageChange}
          />
          {config.labels && config.labels.length > 0 && (
            <button
              onClick={() => setFocusMode(true)}
              className="rounded-md px-2 py-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-900"
              title="Focus mode (F)"
            >
              <FontAwesomeIcon icon={faCrosshairs} />
            </button>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 px-3 py-2">
        <FilterBar />
        <BreadcrumbTrail />
        {mediaIndicesStack.length > 1 && !showSaveForm && (
          <button
            onClick={() => setShowSaveForm(true)}
            className="flex shrink-0 items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600 transition-colors hover:border-gray-400 hover:text-gray-900"
            title="Save selection as new view"
          >
            <FontAwesomeIcon icon={faFloppyDisk} className="h-3 w-3" />
            Save as view
          </button>
        )}
        {showSaveForm && !savedViewUuid && (
          <form
            className="flex shrink-0 items-center gap-1.5"
            onSubmit={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                const { uuid: newUuid } = await saveView(uuid, mediaIndices, saveTitle.trim() || undefined);
                setSavedViewUuid(newUuid);
              } catch { /* ignore */ }
              setSaving(false);
            }}
          >
            <input
              autoFocus
              type="text"
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="View name..."
              className="w-40 rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-700 focus:border-gray-400 focus:outline-none"
              onKeyDown={(e) => { if (e.key === "Escape") { setShowSaveForm(false); setSaveTitle(""); } }}
            />
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-gray-800 px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              type="button"
              onClick={() => { setShowSaveForm(false); setSaveTitle(""); }}
              className="rounded-md px-2 py-1 text-[11px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              Cancel
            </button>
          </form>
        )}
        {savedViewUuid && (
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-[11px] text-green-600">Saved!</span>
            <button
              onClick={() => {
                resetBreadcrumbs();
                setGridValues({ sortBy: "", asc: true, page: 0, numberOfColumns: 5, showColumnValues: [], showBboxLabel: false, subsample: 0 });
                setMediaItems([]);
                setFilters([]);
                setSimilarityResults({});
                setUuid(savedViewUuid);
                setShowPage("grid");
                setShowSaveForm(false);
                setSaveTitle("");
                setSavedViewUuid(null);
              }}
              className="rounded-md px-2 py-1 text-[11px] text-blue-600 transition-colors hover:bg-blue-50 hover:text-blue-800"
            >
              Open view
            </button>
            <button
              onClick={() => { setShowSaveForm(false); setSaveTitle(""); setSavedViewUuid(null); }}
              className="rounded-md px-2 py-1 text-[11px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Media grid */}
      <div
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
        <div
          className="grid items-end gap-3"
          style={{
            gridTemplateColumns: `repeat(${gridValues.numberOfColumns}, minmax(0, 1fr))`,
          }}
        >
          {mediaItems.map((media) => (
            <div key={media.index} style={{ contentVisibility: "auto" }}>
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
                onExclude={isActive ? () => handleExclude(media) : undefined}
                selected={selectedMedia.has(media.index)}
                anySelected={selectedMedia.size > 0}
                onSelect={(e) => handleSelect(media.index, e)}
              />
            </div>
          ))}
        </div>
      </div>
      </div>
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
            loadMedia();
          }}
        />
      )}
    </ResizableLayout>
  );
}
