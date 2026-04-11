"use client";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import {
  dataAtom, filtersAtom, gridValuesAtom, uuidAtom,
} from "@/app/store/atoms";
import { fetchFilteredPlotData } from "@/app/lib/api";
import type { Filter } from "@/app/types";
import FiltersManager from "./FiltersManager";

function isComplete(f: Filter): boolean {
  return f.column !== "" && f.comparison !== "" && f.values.length > 0;
}

export default function FilterBar() {
  const [filters] = useAtom(filtersAtom);
  const uuid = useAtomValue(uuidAtom);
  const setPlotData = useSetAtom(dataAtom);
  const setGridValues = useSetAtom(gridValuesAtom);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // When filters change, update the plot data (for plot view) and reset page.
  // The grid view passes filters server-side via fetchMediaItems — no need
  // to push IDs or crumbs here. The constraint bar handles display.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const completeFilters = filters.filter(isComplete);

    debounceRef.current = setTimeout(() => {
      fetchFilteredPlotData(uuid, completeFilters)
        .then((data) => {
          if (data) setPlotData(data);
        })
        .catch(console.error);
      setGridValues((prev) => ({ ...prev, page: 0 }));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Always hide pills — the constraint bar shows active filters
  return <FiltersManager hidePills />;
}
