import { useEffect, useRef } from "react";
import { useAtom } from "jotai";
import {
  showPageAtom,
  gridValuesAtom,
  filtersAtom,
  mediaIndexAtom,
} from "@/app/store/atoms";
import type { Filter } from "@/app/types";

function parseFilters(raw: string | null): Filter[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (f: unknown): f is Filter =>
        typeof f === "object" &&
        f !== null &&
        "column" in f &&
        "comparison" in f &&
        "values" in f,
    );
  } catch {
    return null;
  }
}

export function useUrlState() {
  const [showPage, setShowPage] = useAtom(showPageAtom);
  const [gridValues, setGridValues] = useAtom(gridValuesAtom);
  const [filters, setFilters] = useAtom(filtersAtom);
  const [mediaIndex, setMediaIndex] = useAtom(mediaIndexAtom);
  const initialized = useRef(false);

  // Read from URL on mount
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const params = new URLSearchParams(window.location.search);

    const view = params.get("view");
    if (view === "grid" || view === "media" || view === "plot") {
      setShowPage(view);
    }

    const page = params.get("page");
    const sort = params.get("sort");
    const asc = params.get("asc");
    if (page != null || sort != null || asc != null) {
      setGridValues((prev) => ({
        ...prev,
        ...(page != null ? { page: parseInt(page) || 0 } : {}),
        ...(sort != null ? { sortBy: sort } : {}),
        ...(asc != null ? { asc: asc !== "false" } : {}),
      }));
    }

    const parsedFilters = parseFilters(params.get("filters"));
    if (parsedFilters && parsedFilters.length > 0) {
      setFilters(parsedFilters);
    }

    const media = params.get("media");
    if (media != null) {
      const idx = parseInt(media);
      if (!isNaN(idx)) setMediaIndex(idx);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Write to URL on state changes
  useEffect(() => {
    if (!initialized.current) return;

    const params = new URLSearchParams();

    if (showPage !== "plot") params.set("view", showPage);
    if (gridValues.page > 0) params.set("page", String(gridValues.page));
    if (gridValues.sortBy) params.set("sort", gridValues.sortBy);
    if (!gridValues.asc) params.set("asc", "false");
    if (filters.length > 0) params.set("filters", JSON.stringify(filters));
    if (showPage === "media" && mediaIndex != null) params.set("media", String(mediaIndex));

    const search = params.toString();
    const url = search ? `${window.location.pathname}?${search}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [showPage, gridValues.page, gridValues.sortBy, gridValues.asc, filters, mediaIndex]);
}
