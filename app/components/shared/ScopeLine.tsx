"use client";
import { useAtomValue, useSetAtom } from "jotai";
import React from "react";
import toast from "react-hot-toast";
import {
  configAtom,
  breadcrumbsAtom,
  mediaIndicesStackAtom,
  filtersAtom,
  similarityResultsAtom,
  textSearchQueryAtom,
  filteredCountAtom,
  currentMediaIndicesAtom,
} from "@/app/store/atoms";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";

interface Chip {
  id: string;
  kind: "filter" | "selection" | "search";
  label: string;
  onRemove: () => void;
}

/**
 * One-line sentence describing what the user is currently looking at.
 * Replaces the separate FilterBar pills + BreadcrumbTrail + search status.
 *
 *   Cats — 1,243 of 50,000 · filter: class = cat · similar to #9282
 */
export default function ScopeLine() {
  const config = useAtomValue(configAtom);
  const crumbs = useAtomValue(breadcrumbsAtom);
  const stack = useAtomValue(mediaIndicesStackAtom);
  const filters = useAtomValue(filtersAtom);
  const searchQuery = useAtomValue(textSearchQueryAtom);
  const filteredCount = useAtomValue(filteredCountAtom);
  const currentIndices = useAtomValue(currentMediaIndicesAtom);

  const { popSelection, reset } = useBreadcrumbNav();
  const setFilters = useSetAtom(filtersAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);
  const setSearchQuery = useSetAtom(textSearchQueryAtom);

  if (!config) return null;

  const total = config.total_count ?? 0;
  const count = currentIndices.length > 0
    ? currentIndices.length
    : (filteredCount ?? total);

  // Build chips for active constraints
  const chips: Chip[] = [];
  const seen = new Set<string>();

  const completeFilters = filters.filter(
    (f) => f.column && f.comparison && f.values.length > 0,
  );
  completeFilters.forEach((f, i) => {
    const label = f.values.length === 1
      ? `${f.column} ${f.comparison} ${f.values[0]}`
      : `${f.column} ${f.comparison} (${f.values.length})`;
    seen.add(label);
    chips.push({
      id: `f-${i}`,
      kind: "filter",
      label,
      onRemove: () => {
        const remaining = completeFilters.filter((pf) => pf !== f);
        setFilters(remaining);
        const currentCrumb = crumbs[crumbs.length - 1];
        if (currentCrumb?.filters?.length && remaining.length === 0) popSelection();
      },
    });
  });

  for (let i = 1; i < crumbs.length; i++) {
    const crumb = crumbs[i];
    if (seen.has(crumb.label)) continue;
    if (crumb.filters && crumb.filters.length > 0) continue;
    if (crumb.label.startsWith("Search: ")) continue;
    chips.push({
      id: `s-${i}`,
      kind: "selection",
      label: crumb.label,
      onRemove: popSelection,
    });
  }

  if (searchQuery) {
    chips.push({
      id: "search",
      kind: "search",
      label: `"${searchQuery}"`,
      onRemove: () => {
        setSearchQuery("");
        setSimilarityResults({});
        popSelection();
      },
    });
  }

  const hasConstraints = chips.length > 0;
  const isAll = !hasConstraints && total > 0 && count >= total;

  return (
    <div className="flex min-w-0 items-baseline gap-1.5 text-[12px] leading-tight">
      {/* Count — when unfiltered, read as "All N"; otherwise "K of N" */}
      {isAll ? (
        <span className="shrink-0 tabular-nums text-gray-500">
          All <span className="font-semibold text-gray-900">{total.toLocaleString()}</span>
        </span>
      ) : (
        <>
          <span className="shrink-0 font-semibold tabular-nums tracking-tight text-gray-900">
            {count.toLocaleString()}
          </span>
          {total > 0 && (
            <span className="shrink-0 text-gray-500">
              of {total.toLocaleString()}
            </span>
          )}
        </>
      )}

      {hasConstraints && <span className="shrink-0 text-gray-300">·</span>}

      {/* Constraint chips — quiet, removable */}
      <div className="flex min-w-0 flex-wrap items-center gap-1">
        {chips.map((chip) => (
          <span
            key={chip.id}
            className="group inline-flex max-w-[220px] items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-700 transition-colors hover:bg-gray-200"
          >
            <span className="shrink-0 text-[9px] uppercase tracking-wider text-gray-500">
              {chip.kind === "filter" ? "filter" : chip.kind === "search" ? "search" : "in"}
            </span>
            <span className="truncate">{chip.label}</span>
            <button
              onClick={chip.onRemove}
              className="-mr-0.5 rounded p-0.5 text-gray-500 opacity-0 transition-opacity hover:bg-gray-300/60 hover:text-gray-700 group-hover:opacity-100"
              title="Remove"
            >
              <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        {chips.length > 1 && (
          <button
            onClick={() => {
              // Snapshot state so we can offer Undo
              const snapshot = {
                filters: [...filters],
                searchQuery,
              };
              reset();
              toast.custom(
                (t) => (
                  <div className={`motion-popover pointer-events-auto flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-xl ${t.visible ? "" : "opacity-0"}`}>
                    <span className="text-xs text-gray-700">Cleared all constraints</span>
                    <button
                      onClick={() => {
                        toast.dismiss(t.id);
                        setFilters(snapshot.filters);
                        setSearchQuery(snapshot.searchQuery);
                      }}
                      className="rounded px-2 py-0.5 text-xs font-medium text-teal-700 transition-colors hover:bg-teal-50"
                    >
                      Undo
                    </button>
                  </div>
                ),
                { duration: 4000, position: "bottom-center" },
              );
            }}
            className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
