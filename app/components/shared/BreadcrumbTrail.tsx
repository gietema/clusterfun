"use client";
import { useAtomValue, useSetAtom } from "jotai";
import {
  breadcrumbsAtom,
  mediaIndicesStackAtom,
  filtersAtom,
  similarityResultsAtom,
  textSearchQueryAtom,
  configAtom,
} from "@/app/store/atoms";
import { useBreadcrumbNav } from "@/app/lib/use-breadcrumb-nav";

interface Chip {
  id: string;
  label: string;
  type: "selection" | "filter" | "search";
  count?: number | null;
  onRemove: () => void;
}

const TYPE_STYLES = {
  selection: {
    bg: "bg-violet-50 border-violet-200 text-violet-700",
    hover: "hover:bg-violet-100 hover:text-violet-900",
    icon: (
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M7 22a5 5 0 0 1-2-4" /><path d="M3.3 14A6.8 6.8 0 0 1 2 10c0-4.4 4.5-8 10-8s10 3.6 10 8-4.5 8-10 8a12 12 0 0 1-3.7-.5" />
        <circle cx="7" cy="18" r="2" />
      </svg>
    ),
  },
  filter: {
    bg: "bg-amber-50 border-amber-200 text-amber-700",
    hover: "hover:bg-amber-100 hover:text-amber-900",
    icon: (
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
      </svg>
    ),
  },
  search: {
    bg: "bg-blue-50 border-blue-200 text-blue-700",
    hover: "hover:bg-blue-100 hover:text-blue-900",
    icon: (
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
    ),
  },
};

/**
 * Active constraints bar — shows removable chips for each constraint
 * shaping the current grid view (selections, filters, searches).
 */
export default function BreadcrumbTrail() {
  const crumbs = useAtomValue(breadcrumbsAtom);
  const stack = useAtomValue(mediaIndicesStackAtom);
  const filters = useAtomValue(filtersAtom);
  const searchQuery = useAtomValue(textSearchQueryAtom);
  const config = useAtomValue(configAtom);
  const { popSelection, reset } = useBreadcrumbNav();
  const setFilters = useSetAtom(filtersAtom);
  const setSimilarityResults = useSetAtom(similarityResultsAtom);
  const setSearchQuery = useSetAtom(textSearchQueryAtom);

  // Build the list of active chips
  const chips: Chip[] = [];

  // Collect labels already shown to avoid duplicates
  const shownLabels = new Set<string>();

  // Active filters — show as amber chips (primary source of truth)
  const completeFilters = filters.filter(
    (f) => f.column && f.comparison && f.values.length > 0,
  );
  for (let i = 0; i < completeFilters.length; i++) {
    const f = completeFilters[i];
    const fLabel = f.values.length === 1
      ? `${f.column} ${f.comparison} ${f.values[0]}`
      : `${f.column} ${f.comparison} (${f.values.length})`;
    shownLabels.add(fLabel);

    chips.push({
      id: `filter-${i}`,
      label: fLabel,
      type: "filter",
      onRemove: () => {
        const remaining = completeFilters.filter((pf) => pf !== f);
        setFilters(remaining);
        // If this was a breadcrumb-driven filter, also pop the stack level
        const currentCrumb = crumbs[crumbs.length - 1];
        if (currentCrumb?.filters?.length && remaining.length === 0) {
          popSelection();
        }
      },
    });
  }

  // Selection chips — from stack levels (skip "All" base)
  for (let i = 1; i < crumbs.length; i++) {
    const crumb = crumbs[i];
    // Skip if already shown as a filter or search chip
    if (shownLabels.has(crumb.label)) continue;
    if (crumb.filters && crumb.filters.length > 0) continue;
    if (crumb.label.startsWith("Search: ")) continue;

    const stackLen = stack[i]?.length ?? 0;
    const count = crumb.filterCount ?? (stackLen > 0 ? stackLen : null);

    chips.push({
      id: `sel-${i}`,
      label: crumb.label,
      type: "selection",
      count,
      onRemove: popSelection,
    });
  }

  // Search chip
  if (searchQuery) {
    chips.push({
      id: "search",
      label: searchQuery,
      type: "search",
      onRemove: () => {
        setSearchQuery("");
        setSimilarityResults({});
        popSelection();
      },
    });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {chips.map((chip) => {
        const style = TYPE_STYLES[chip.type];
        return (
          <div
            key={chip.id}
            className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${style.bg}`}
          >
            {style.icon}
            <span className="max-w-[160px] truncate">{chip.label}</span>
            {chip.count != null && chip.count > 0 && (
              <span className="opacity-60">({chip.count.toLocaleString()})</span>
            )}
            <button
              onClick={chip.onRemove}
              className={`-mr-0.5 ml-0.5 rounded p-0.5 opacity-50 transition-opacity hover:opacity-100 ${style.hover}`}
              title={`Remove ${chip.type}`}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}

      {/* Clear all — shown when multiple constraints */}
      {chips.length > 1 && (
        <button
          onClick={reset}
          className="rounded px-1.5 py-0.5 text-[10px] text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
