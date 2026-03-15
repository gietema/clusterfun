"use client";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";
import {
  dataAtom, filtersAtom, gridValuesAtom,
  mediaIndicesStackAtom, uuidAtom,
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
  const [mediaIndices, setMediaIndices] = useAtom(mediaIndicesStackAtom);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Only apply complete filters, debounced
  useEffect(() => {
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
            setGridValues((prev) => ({ ...prev, page: 0 }));
          }
        })
        .catch(console.error);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  return <FiltersManager />;
}
