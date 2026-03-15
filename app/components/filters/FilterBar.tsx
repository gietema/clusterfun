"use client";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import {
  dataAtom, filtersAtom, gridValuesAtom,
  mediaIndicesStackAtom, breadcrumbsAtom, uuidAtom,
} from "@/app/store/atoms";
import { fetchFilteredPlotData } from "@/app/lib/api";
import type { Filter } from "@/app/types";
import FiltersManager from "./FiltersManager";

function isComplete(f: Filter): boolean {
  return f.column !== "" && f.comparison !== "" && f.values.length > 0;
}

function filterLabel(filters: Filter[]): string {
  if (filters.length === 1) {
    const f = filters[0];
    return `${f.column} ${f.comparison} ${f.values.join(", ")}`;
  }
  return `${filters.length} filters`;
}

export default function FilterBar() {
  const [filters] = useAtom(filtersAtom);
  const uuid = useAtomValue(uuidAtom);
  const setPlotData = useSetAtom(dataAtom);
  const setGridValues = useSetAtom(gridValuesAtom);
  const [mediaIndices, setMediaIndices] = useAtom(mediaIndicesStackAtom);
  const crumbs = useAtomValue(breadcrumbsAtom);
  const setCrumbs = useSetAtom(breadcrumbsAtom);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Check if the active filters came from a breadcrumb (not user-created)
  const currentCrumb = crumbs.length > 0 ? crumbs[crumbs.length - 1] : null;
  const filtersFromBreadcrumb = currentCrumb?.filters && currentCrumb.filters.length > 0;

  // Only apply complete filters, debounced
  useEffect(() => {
    // Skip if filters are breadcrumb-driven — the grid handles them directly
    if (filtersFromBreadcrumb) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    const completeFilters = filters.filter(isComplete);

    debounceRef.current = setTimeout(() => {
      fetchFilteredPlotData(uuid, completeFilters)
        .then((data) => {
          if (!data) return;
          setPlotData(data);
          if (completeFilters.length > 0 && mediaIndices.length > 0) {
            const indices = data.flatMap((d) => d.id ?? []);
            const filtered = indices.filter((i: number) => mediaIndices[0].includes(i));
            setMediaIndices((prev) => [...prev, filtered]);
            const label = filterLabel(completeFilters);
            setCrumbs((c) => [...c, { label, thumbnailId: filtered[0] }]);
            setGridValues((prev) => ({ ...prev, page: 0 }));
          }
        })
        .catch(console.error);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filters, filtersFromBreadcrumb]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hide the filter bar when filters are breadcrumb-driven
  if (filtersFromBreadcrumb) return null;

  return <FiltersManager />;
}
