"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  configAtom, showPageAtom, uuidAtom,
  similarityResultsAtom, textSearchQueryAtom,
} from "@/app/store/atoms";
import { fetchSimilarVector } from "@/app/lib/api";
import { encodeText } from "@/app/lib/clip";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";
import TaskQueueIndicator from "./TaskQueueIndicator";

function ProgressRing({ progress }: { progress: number }) {
  const r = 7;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (progress / 100) * circumference;
  return (
    <svg width="18" height="18" className="shrink-0">
      <circle cx="9" cy="9" r={r} fill="none" stroke="#e5e7eb" strokeWidth="2" />
      <circle
        cx="9" cy="9" r={r} fill="none" stroke="#1f2937" strokeWidth="2"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 9 9)"
        className="transition-[stroke-dashoffset] duration-200"
      />
    </svg>
  );
}

export default function TabNavigation() {
  const config = useAtomValue(configAtom);
  const [showPage, setShowPage] = useAtom(showPageAtom);
  const uuid = useAtomValue(uuidAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);
  const [searchQuery, setSearchQuery] = useAtom(textSearchQueryAtom);
  const { replaceTop, popSelection } = useBreadcrumbNav();

  const [inputValue, setInputValue] = useState("");
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasEmbeddingsModel = !!config?.embeddings_model;
  const hasActiveSearch = searchQuery.length > 0;

  // Sync input with persisted query on mount
  useEffect(() => {
    if (searchQuery) setInputValue(searchQuery);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cmd+K to focus search
  useEffect(() => {
    if (!hasEmbeddingsModel) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasEmbeddingsModel]);

  const handleSearch = useCallback(async (query: string) => {
    if (!query.trim() || !config?.embeddings_model) return;
    setSearching(true);
    setError(null);
    setProgress(0);
    try {
      const embedding = await encodeText(
        config.embeddings_model,
        query.trim(),
        (p) => setProgress(p),
      );
      setProgress(null);
      const results = await fetchSimilarVector(uuid, embedding);
      const ids = results.map((r) => r.media_id);
      const scores: Record<number, number> = {};
      for (const r of results) scores[r.media_id] = r.similarity;
      setSimilarityResults(scores);
      setSearchQuery(query.trim());
      replaceTop(ids, `Search: ${query.trim()}`);
      setShowPage("grid");
      inputRef.current?.blur();
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
  }, [setSearchQuery, setSimilarityResults, popSelection]);

  const tabs = [
    ...(config ? [
      { id: "plot", label: "Plot" },
      { id: "grid", label: "Grid" },
      { id: "insights", label: "Insights" },
      { id: "docs", label: "Docs" },
    ] : []),
    { id: "projects", label: "Projects" },
  ];

  return (
    <div className="flex items-center gap-1 border-b border-gray-200 bg-white px-3">
      {config?.project && (
        <span className="mr-2 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
          {config.project}
        </span>
      )}

      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => setShowPage(tab.id)}
          className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            showPage === tab.id
              ? "border-gray-900 text-gray-900"
              : "border-transparent text-gray-400 hover:text-gray-600"
          }`}
        >
          {tab.label}
        </button>
      ))}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Background tasks */}
      <TaskQueueIndicator />

      {/* Text search */}
      {hasEmbeddingsModel && (
        <div className="flex items-center gap-1.5 py-1">
          {/* Active search pill */}
          {hasActiveSearch && !focused && (
            <div className="flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1">
              <svg className="h-3 w-3 text-blue-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <span className="max-w-[150px] truncate text-xs font-medium text-blue-700">
                {searchQuery}
              </span>
              <button
                onClick={handleClearSearch}
                className="ml-0.5 rounded-full p-0.5 text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-700"
                title="Clear search"
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          {/* Search input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSearch(inputValue);
            }}
            className={`flex items-center rounded-md border transition-all ${
              focused
                ? "w-64 border-gray-400 bg-white shadow-sm"
                : hasActiveSearch
                  ? "w-8 border-transparent"
                  : "w-48 border-gray-200 bg-gray-50"
            }`}
          >
            {/* Search icon / button */}
            <button
              type={inputValue.trim() ? "submit" : "button"}
              onClick={() => {
                if (!inputValue.trim()) inputRef.current?.focus();
              }}
              disabled={searching}
              className="flex shrink-0 items-center justify-center px-2 py-1.5 text-gray-400 transition-colors hover:text-gray-600"
              title="Search by text (⌘K)"
            >
              {searching ? (
                progress !== null ? (
                  <ProgressRing progress={progress} />
                ) : (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
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
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  inputRef.current?.blur();
                }
              }}
              placeholder={focused ? "Describe what you're looking for..." : "Search by text..."}
              className={`min-w-0 flex-1 bg-transparent py-1.5 pr-2 text-xs text-gray-700 placeholder-gray-400 focus:outline-none ${
                !focused && hasActiveSearch ? "hidden" : ""
              }`}
            />

            {/* Cmd+K hint — show only when not focused and no active search */}
            {!focused && !hasActiveSearch && !searching && (
              <kbd className="mr-2 shrink-0 rounded border border-gray-200 bg-white px-1 py-0.5 text-[10px] text-gray-400">
                ⌘K
              </kbd>
            )}
          </form>

          {/* Error tooltip */}
          {error && (
            <span className="text-xs text-red-500" title={error}>
              failed
            </span>
          )}
        </div>
      )}
    </div>
  );
}
