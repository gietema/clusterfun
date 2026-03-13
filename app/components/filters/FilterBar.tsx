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
        const indices = data.flatMap((d) => d.id ?? []);
        if (mediaIndices.length > 0) {
          const filtered = indices.filter((i: number) => mediaIndices[0].includes(i));
          setMediaIndices((prev) => [...prev, filtered]);
        }
        setGridValues((prev) => ({ ...prev, page: 0 }));
      })
      .catch(console.error);
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  return <FiltersManager />;
}
