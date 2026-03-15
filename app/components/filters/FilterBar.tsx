"use client";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import {
  dataAtom, filtersAtom, gridValuesAtom,
  mediaIndicesStackAtom, showPageAtom, uuidAtom,
} from "@/app/store/atoms";
import { fetchFilteredPlotData } from "@/app/lib/api";
import FiltersManager from "./FiltersManager";

export default function FilterBar() {
  const [filters] = useAtom(filtersAtom);
  const uuid = useAtomValue(uuidAtom);
  const setPlotData = useSetAtom(dataAtom);
  const showPage = useAtomValue(showPageAtom);
  const setGridValues = useSetAtom(gridValuesAtom);
  const [mediaIndices, setMediaIndices] = useAtom(mediaIndicesStackAtom);

  useEffect(() => {
    fetchFilteredPlotData(uuid, filters)
      .then((data) => {
        if (!data) return;
        setPlotData(data);
        // Only push filtered indices when there are actual filters.
        // Without this guard, mounting with empty filters pushes ALL
        // indices onto the stack, overwriting any existing selection
        // (e.g. from a plot drag-select).
        if (filters.length > 0 && mediaIndices.length > 0) {
          const indices = data.flatMap((d) => d.id ?? []);
          const filtered = indices.filter((i: number) => mediaIndices[0].includes(i));
          setMediaIndices((prev) => [...prev, filtered]);
          setGridValues((prev) => ({ ...prev, page: 0 }));
        }
      })
      .catch(console.error);
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  return <FiltersManager />;
}
