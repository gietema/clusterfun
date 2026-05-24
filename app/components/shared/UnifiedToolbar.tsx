"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  configAtom,
  showPageAtom,
  uuidAtom,
  similarityResultsAtom,
  textSearchQueryAtom,
  mediaIndicesStackAtom,
  filtersAtom,
  gridValuesAtom,
  mediaItemsAtom,
  bottomDockVisibleAtom,
  maxPageAtom,
  sidebarCollapsedAtom,
} from "@/app/store/atoms";
import { fetchSimilarVector, fetchTextSearch, saveView, exportData, downloadGridCsv } from "@/app/lib/api";
import type { ExportFormat } from "@/app/lib/api";
import { saveAs } from "file-saver";
import { encodeText, supportsTextSearch, supportsBrowserTextSearch } from "@/app/lib/clip";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";
import TaskQueueIndicator from "./TaskQueueIndicator";
import ScopeLine from "./ScopeLine";
import FilterBar from "../filters/FilterBar";
import Tooltip from "./Tooltip";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFloppyDisk, faSortAlphaAsc, faSortAlphaDesc } from "@fortawesome/free-solid-svg-icons";


function ProgressRing({ progress }: { progress: number }) {
  const r = 7;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (progress / 100) * circumference;
  return (
    <svg width="18" height="18" className="shrink-0">
      <circle cx="9" cy="9" r={r} fill="none" stroke="#e5e7eb" strokeWidth="2" />
      <circle
        cx="9" cy="9" r={r} fill="none" stroke="#0d6e6e" strokeWidth="2"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 9 9)"
        className="transition-[stroke-dashoffset] duration-200"
      />
    </svg>
  );
}

const ICON_BTN =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800";
const ICON_BTN_ACTIVE =
  "flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-900 transition-colors";

export default function UnifiedToolbar() {
  const config = useAtomValue(configAtom);
  const [showPage, setShowPage] = useAtom(showPageAtom);
  const uuid = useAtomValue(uuidAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);
  const [searchQuery, setSearchQuery] = useAtom(textSearchQueryAtom);
  const mediaIndicesStack = useAtomValue(mediaIndicesStackAtom);
  const mediaIndices = mediaIndicesStack.length > 0 ? mediaIndicesStack[mediaIndicesStack.length - 1] : [];
  const { replaceTop, popSelection, reset: resetBreadcrumbs } = useBreadcrumbNav();

  const setFilters = useSetAtom(filtersAtom);
  const [gridValues, setGridValues] = useAtom(gridValuesAtom);
  const setMediaItems = useSetAtom(mediaItemsAtom);
  const setUuid = useSetAtom(uuidAtom);
  const setDockVisible = useSetAtom(bottomDockVisibleAtom);
  const dockVisible = useAtomValue(bottomDockVisibleAtom);
  const maxPage = useAtomValue(maxPageAtom);
  const [sidebarCollapsed, setSidebarCollapsed] = useAtom(sidebarCollapsedAtom);

  const [inputValue, setInputValue] = useState("");
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load recent searches once
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("clusterfun:recentSearches");
      if (raw) setRecentSearches(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  // Save-as-view state
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedViewUuid, setSavedViewUuid] = useState<string | null>(null);

  // Menu portal
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const menuPopoverRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

  // Sort dropdown portal
  const [sortOpen, setSortOpen] = useState(false);
  const sortTriggerRef = useRef<HTMLButtonElement>(null);
  const sortPopoverRef = useRef<HTMLDivElement>(null);
  const [sortPos, setSortPos] = useState<{ top: number; right: number } | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exportSubOpen, setExportSubOpen] = useState(false);

  const hasEmbeddingsModel = supportsTextSearch(config?.embeddings_model);
  const hasActiveSearch = searchQuery.length > 0;
  const isDirty = inputValue.trim() !== searchQuery;

  useEffect(() => {
    if (searchQuery && !inputValue) setInputValue(searchQuery);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hasActiveSearch) setSearchOpen(true);
  }, [hasActiveSearch]);

  // ── Close popovers on outside click ────────────────────────────
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuTriggerRef.current?.contains(t)) return;
      if (menuPopoverRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (!sortOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (sortTriggerRef.current?.contains(t)) return;
      if (sortPopoverRef.current?.contains(t)) return;
      setSortOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [sortOpen]);

  // ── Position portaled popovers ─────────────────────────────────
  useLayoutEffect(() => {
    if (!menuOpen) { setMenuPos(null); return; }
    const update = () => {
      const rect = menuTriggerRef.current?.getBoundingClientRect();
      if (rect) setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [menuOpen]);

  useLayoutEffect(() => {
    if (!sortOpen) { setSortPos(null); return; }
    const update = () => {
      const rect = sortTriggerRef.current?.getBoundingClientRect();
      if (rect) setSortPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [sortOpen]);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim() || !config?.embeddings_model) return;
    setSearching(true);
    setError(null);
    setProgress(0);
    try {
      let results;
      if (supportsBrowserTextSearch(config.embeddings_model)) {
        const embedding = await encodeText(
          config.embeddings_model,
          query.trim(),
          (p) => setProgress(p),
        );
        setProgress(null);
        results = await fetchSimilarVector(uuid, embedding);
      } else {
        setProgress(null);
        results = await fetchTextSearch(uuid, query.trim());
      }
      const ids = results.map((r) => r.media_id);
      const scores: Record<number, number> = {};
      for (const r of results) scores[r.media_id] = r.similarity;
      setSimilarityResults(scores);
      setSearchQuery(query.trim());
      setInputValue(query.trim());
      replaceTop(ids, `Search: ${query.trim()}`);
      setShowPage("grid");

      // Persist recent searches (last 5)
      try {
        const key = "clusterfun:recentSearches";
        const raw = window.localStorage.getItem(key);
        const prev: string[] = raw ? JSON.parse(raw) : [];
        const next = [query.trim(), ...prev.filter((q) => q !== query.trim())].slice(0, 5);
        window.localStorage.setItem(key, JSON.stringify(next));
        setRecentSearches(next);
      } catch { /* ignore */ }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
      setProgress(null);
    }
  }, [config, uuid, setSimilarityResults, setSearchQuery, replaceTop, setShowPage]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setInputValue("");
    setSimilarityResults({});
    popSelection();
    setError(null);
    inputRef.current?.focus();
  }, [setSearchQuery, setSimilarityResults, popSelection]);

  const handleSaveView = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { uuid: newUuid } = await saveView(uuid, mediaIndices, saveTitle.trim() || undefined);
      setSavedViewUuid(newUuid);
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleOpenSavedView = () => {
    resetBreadcrumbs();
    setGridValues({ sortBy: "", asc: true, page: 0, numberOfColumns: 5, showColumnValues: [], showBboxLabel: false, subsample: 0 });
    setMediaItems([]);
    setFilters([]);
    setSimilarityResults({});
    setUuid(savedViewUuid!);
    setShowPage("grid");
    setShowSaveForm(false);
    setSaveTitle("");
    setSavedViewUuid(null);
  };

  const handleExport = async (fmt: ExportFormat) => {
    setExporting(true);
    try {
      const blob = await exportData(uuid, { format: fmt });
      saveAs(blob, `${uuid}_${fmt}.zip`);
    } catch { /* ignore */ }
    setExporting(false);
    setMenuOpen(false);
  };

  const handleCsv = async () => {
    setExporting(true);
    try {
      const blob = await downloadGridCsv(uuid, []);
      saveAs(blob, "data.csv");
    } catch { /* ignore */ }
    setExporting(false);
    setMenuOpen(false);
  };

  const sortColumns = (config?.columns ?? []).slice(2);

  return (
    <div className="relative z-30 flex h-11 shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-2">
      {/* ── Leading zone: dataset identity ─────────────────────────── */}
      <button
        onClick={() => setShowPage(showPage === "projects" ? "grid" : "projects")}
        className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-[13px] transition-colors ${
          showPage === "projects"
            ? "bg-gray-100 text-gray-900"
            : "text-gray-900 hover:bg-gray-100"
        }`}
        title="Switch dataset or project"
      >
        <svg className="h-3.5 w-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
        </svg>
        <span className="max-w-[200px] truncate font-medium tracking-tight">
          {config?.title || config?.project || "Dataset"}
        </span>
        <svg className="h-3 w-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/* ── Center: scope sentence ────────────────────────────────── */}
      {config && (
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <ScopeLine />

          {mediaIndicesStack.length > 1 && !showSaveForm && !savedViewUuid && (
            <button
              onClick={() => setShowSaveForm(true)}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              title="Save selection as new view"
            >
              <FontAwesomeIcon icon={faFloppyDisk} className="text-[9px]" />
              Save view
            </button>
          )}
          {showSaveForm && !savedViewUuid && (
            <form className="flex shrink-0 items-center gap-1.5" onSubmit={handleSaveView}>
              <input
                autoFocus
                type="text"
                value={saveTitle}
                onChange={(e) => setSaveTitle(e.target.value)}
                placeholder="View name..."
                className="w-40 rounded-md border border-gray-200 bg-white py-1 px-2 text-xs text-gray-800 placeholder-gray-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500/30"
                onKeyDown={(e) => { if (e.key === "Escape") { setShowSaveForm(false); setSaveTitle(""); } }}
              />
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-teal-700 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={() => { setShowSaveForm(false); setSaveTitle(""); }}
                className="rounded-md px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                Cancel
              </button>
            </form>
          )}
          {savedViewUuid && (
            <div className="flex shrink-0 items-center gap-2">
              <span className="text-[11px] font-medium text-gray-700">Saved.</span>
              <button onClick={handleOpenSavedView} className="rounded-md bg-teal-700 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-teal-800">
                Open view
              </button>
              <button
                onClick={() => { setShowSaveForm(false); setSaveTitle(""); setSavedViewUuid(null); }}
                className="rounded-md px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}

      {!config && <div className="flex-1" />}

      {/* ── Trailing zone ──────────────────────────────────────────── */}

      {/* Filter */}
      {config && <FilterBar />}

      {/* Sort */}
      {config && sortColumns.length > 0 && (
        <Tooltip label={gridValues.sortBy ? `Sorted by ${gridValues.sortBy} ${gridValues.asc ? "↑" : "↓"}` : "Sort"}>
          <button
            ref={sortTriggerRef}
            onClick={() => setSortOpen((v) => !v)}
            className={sortOpen ? ICON_BTN_ACTIVE : ICON_BTN}
            aria-label="Sort"
          >
            <FontAwesomeIcon icon={gridValues.asc ? faSortAlphaAsc : faSortAlphaDesc} className="text-[12px]" />
          </button>
        </Tooltip>
      )}

      {/* Pagination removed — grid uses endless scroll */}

      {/* Search */}
      {hasEmbeddingsModel && (
        <>
          {!searchOpen && !hasActiveSearch ? (
            <Tooltip label="Search by text">
              <button
                onClick={() => { setSearchOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
                className={ICON_BTN}
                aria-label="Search by text"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
              </button>
            </Tooltip>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); handleSearch(inputValue); }}
              className="relative flex shrink-0 items-center gap-1.5"
            >
              <div className={`flex items-center rounded-md border transition-all ${
                hasActiveSearch ? "border-teal-500 bg-teal-50/40" : "border-gray-200 bg-white focus-within:border-teal-500 focus-within:ring-1 focus-within:ring-teal-500/20"
              }`}
                style={{ width: "14rem" }}
              >
                <button
                  type="submit"
                  disabled={searching || !inputValue.trim()}
                  className="flex shrink-0 items-center justify-center px-2 py-1.5 text-gray-500 transition-colors hover:text-gray-800 disabled:opacity-50"
                  title="Search (Enter)"
                >
                  {searching ? (
                    progress !== null ? (
                      <ProgressRing progress={progress} />
                    ) : (
                      <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-teal-700" />
                    )
                  ) : (
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <circle cx="11" cy="11" r="8" />
                      <path d="m21 21-4.35-4.35" />
                    </svg>
                  )}
                </button>
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    if (error) setError(null);
                  }}
                  onFocus={() => setSearchFocused(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      if (hasActiveSearch) setInputValue(searchQuery);
                      else { setSearchOpen(false); setInputValue(""); }
                      inputRef.current?.blur();
                    }
                  }}
                  onBlur={() => {
                    // delay so a click on a suggestion can register first
                    setTimeout(() => setSearchFocused(false), 150);
                    if (!hasActiveSearch && !inputValue.trim()) setSearchOpen(false);
                  }}
                  placeholder='e.g. "sleeping cat", "blurry"...'
                  className={`min-w-0 flex-1 bg-transparent py-1.5 text-xs placeholder-gray-400 focus:outline-none ${
                    hasActiveSearch ? "font-medium text-gray-900" : "text-gray-800"
                  }`}
                />
                {hasActiveSearch && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="mr-1 shrink-0 rounded p-0.5 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800"
                    title="Clear search"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
                {isDirty && inputValue.trim() && !searching && (
                  <span className="mr-2 shrink-0 text-[10px] text-gray-500">↵</span>
                )}
              </div>
              {error && (
                <span className="text-xs text-red-600" title={error}>failed</span>
              )}
              {/* Recent searches — shown when input is focused, empty, and we have history */}
              {searchFocused && !inputValue.trim() && !hasActiveSearch && recentSearches.length > 0 && (
                <div className="motion-popover absolute left-0 top-full z-50 mt-1 w-[14rem] rounded-lg border border-gray-200 bg-white py-1 shadow-xl">
                  <div className="px-3 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">Recent</div>
                  {recentSearches.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); handleSearch(q); }}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <svg className="h-3 w-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7v5l3 2" strokeLinecap="round" />
                      </svg>
                      <span className="truncate">{q}</span>
                    </button>
                  ))}
                </div>
              )}
            </form>
          )}
        </>
      )}

      <TaskQueueIndicator />

      {/* Overflow menu — portaled to escape stacking context */}
      <Tooltip label="More">
        <button
          ref={menuTriggerRef}
          onClick={() => setMenuOpen((v) => !v)}
          className={menuOpen ? ICON_BTN_ACTIVE : ICON_BTN}
          aria-label="More"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" />
          </svg>
        </button>
      </Tooltip>

      {/* Sort popover (portal) */}
      {sortOpen && sortPos && typeof document !== "undefined" && createPortal(
        <div
          ref={sortPopoverRef}
          style={{ position: "fixed", top: sortPos.top, right: sortPos.right }}
          className="motion-popover z-50 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
        >
          <div className="px-3 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">Sort by</div>
          <button
            onClick={() => { setGridValues((prev) => ({ ...prev, sortBy: "", page: 0 })); setSortOpen(false); }}
            className={`flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-gray-50 ${
              gridValues.sortBy === "" ? "font-medium text-teal-700" : "text-gray-700"
            }`}
          >
            <span>None (default)</span>
            {gridValues.sortBy === "" && <span>✓</span>}
          </button>
          {sortColumns.map((col) => (
            <button
              key={col}
              onClick={() => { setGridValues((prev) => ({ ...prev, sortBy: col, page: 0 })); setSortOpen(false); }}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-xs hover:bg-gray-50 ${
                gridValues.sortBy === col ? "font-medium text-teal-700" : "text-gray-700"
              }`}
            >
              <span>{col}</span>
              {gridValues.sortBy === col && <span>✓</span>}
            </button>
          ))}
          {gridValues.sortBy && (
            <>
              <div className="my-1 border-t border-gray-100" />
              <button
                onClick={() => { setGridValues((prev) => ({ ...prev, asc: !prev.asc })); }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                <FontAwesomeIcon icon={gridValues.asc ? faSortAlphaAsc : faSortAlphaDesc} className="text-[12px] text-gray-500" />
                {gridValues.asc ? "Ascending" : "Descending"} (click to toggle)
              </button>
            </>
          )}
        </div>,
        document.body,
      )}

      {/* Menu popover (portal) */}
      {menuOpen && menuPos && typeof document !== "undefined" && createPortal(
        <div
          ref={menuPopoverRef}
          style={{ position: "fixed", top: menuPos.top, right: menuPos.right }}
          className="motion-popover z-50 w-56 origin-top-right rounded-lg border border-gray-200 bg-white py-1 shadow-xl"
        >
          {config && (
            <>
              <div className="px-3 pb-0.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-gray-500">View</div>
              <div className="flex items-center gap-2 px-3 py-1.5">
                <svg className="h-3 w-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                <input
                  type="range"
                  className="min-w-0 flex-1 accent-teal-700"
                  min={1}
                  max={10}
                  value={gridValues.numberOfColumns}
                  onChange={(e) =>
                    setGridValues((prev) => ({ ...prev, numberOfColumns: parseInt(e.target.value) }))
                  }
                  aria-label="Grid columns"
                />
                <span className="w-4 text-right text-[10px] tabular-nums text-gray-500">{gridValues.numberOfColumns}</span>
              </div>
              <button
                onClick={() => { setSidebarCollapsed(!sidebarCollapsed); setMenuOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-50"
              >
                <svg className="h-3.5 w-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="15" y1="3" x2="15" y2="21" />
                </svg>
                {sidebarCollapsed ? "Show preview pane" : "Hide preview pane"}
                <kbd className="ml-auto rounded border border-gray-200 bg-gray-50 px-1 text-[9px] text-gray-500">⌘\</kbd>
              </button>

              {/* Show under image — column captions */}
              {config.columns.length > 2 && (
                <>
                  <div className="px-3 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wider text-gray-500">
                    Show under image
                  </div>
                  <div className="max-h-40 overflow-y-auto px-1 pb-1">
                    {config.columns.slice(2).map((col) => {
                      const checked = gridValues.showColumnValues.includes(col);
                      return (
                        <button
                          key={col}
                          onClick={() => {
                            setGridValues((prev) => ({
                              ...prev,
                              showColumnValues: checked
                                ? prev.showColumnValues.filter((v) => v !== col)
                                : [...prev.showColumnValues, col],
                            }));
                          }}
                          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs text-gray-700 transition-colors hover:bg-gray-50"
                        >
                          <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border transition-colors ${
                            checked
                              ? "border-teal-600 bg-teal-600 text-white"
                              : "border-gray-300 bg-white"
                          }`}>
                            {checked && (
                              <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          <span className="truncate">{col}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}

              <div className="my-1 border-t border-gray-100" />
              <button
                onClick={() => {
                  setMenuOpen(false);
                  window.location.href = `/insights?uuid=${encodeURIComponent(uuid)}`;
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-50"
              >
                <svg className="h-3.5 w-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.997.398-.997.95v8a1 1 0 0 0 1 1h8Z" />
                  <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
                </svg>
                Insights
                <svg className="ml-auto h-3 w-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M7 17 17 7M7 7h10v10" />
                </svg>
              </button>
              <button
                onClick={() => { setDockVisible((v) => !v); setMenuOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-50"
              >
                <svg className="h-3.5 w-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 3v18h18" />
                  <path d="m19 9-5 5-4-4-3 3" />
                </svg>
                {dockVisible ? "Hide charts" : "Show charts"}
                <kbd className="ml-auto rounded border border-gray-200 bg-gray-50 px-1 text-[9px] text-gray-500">⌘⇧A</kbd>
              </button>

              <div className="my-1 border-t border-gray-100" />
              {/* Export — single entry that expands inline; flat list of 4 formats was too heavy */}
              <button
                onClick={() => setExportSubOpen((v) => !v)}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-50"
              >
                <svg className="h-3.5 w-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
                </svg>
                Export…
                <svg className={`ml-auto h-3 w-3 text-gray-500 transition-transform ${exportSubOpen ? "rotate-90" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m9 6 6 6-6 6" />
                </svg>
              </button>
              {exportSubOpen && (
                <div className="bg-gray-50/60 py-0.5">
                  <button onClick={handleCsv} disabled={exporting} className="flex w-full items-center gap-2 px-6 py-1 text-[11px] text-gray-700 hover:bg-gray-100 disabled:opacity-50"><span className="font-mono text-[10px] text-gray-500">CSV</span><span className="text-gray-500">spreadsheet</span></button>
                  <button onClick={() => handleExport("coco")} disabled={exporting} className="flex w-full items-center gap-2 px-6 py-1 text-[11px] text-gray-700 hover:bg-gray-100 disabled:opacity-50"><span className="font-mono text-[10px] text-gray-500">COCO</span><span className="text-gray-500">JSON annotations</span></button>
                  <button onClick={() => handleExport("yolo")} disabled={exporting} className="flex w-full items-center gap-2 px-6 py-1 text-[11px] text-gray-700 hover:bg-gray-100 disabled:opacity-50"><span className="font-mono text-[10px] text-gray-500">YOLO</span><span className="text-gray-500">.txt per image</span></button>
                  <button onClick={() => handleExport("classification")} disabled={exporting} className="flex w-full items-center gap-2 px-6 py-1 text-[11px] text-gray-700 hover:bg-gray-100 disabled:opacity-50"><span className="font-mono text-[10px] text-gray-500">Folders</span><span className="text-gray-500">one per class</span></button>
                </div>
              )}
            </>
          )}

          <div className="my-1 border-t border-gray-100" />
          <button
            onClick={() => {
              const DOCS_URL = process.env.NODE_ENV === "production"
                ? "https://docs.clusterfun.app"
                : "http://localhost:3001";
              window.open(DOCS_URL, "_blank", "noopener,noreferrer");
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-50"
          >
            <svg className="h-3.5 w-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 0 0-5H20" />
            </svg>
            Docs
            <svg className="ml-auto h-3 w-3 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17 17 7M7 7h10v10" />
            </svg>
          </button>
          <button
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true }));
              setMenuOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-50"
          >
            <svg className="h-3.5 w-3.5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" />
            </svg>
            Keyboard shortcuts
            <kbd className="ml-auto rounded border border-gray-200 bg-gray-50 px-1 text-[9px] text-gray-500">?</kbd>
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}
