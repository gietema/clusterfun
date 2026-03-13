"use client";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";
import {
  dataAtom, filtersAtom, gridValuesAtom,
  mediaIndicesAtom, mediaItemsAtom, showPageAtom, uuidAtom,
} from "@/app/store/atoms";
import { fetchFilteredPlotData, fetchMediaItems } from "@/app/lib/api";
import FiltersManager from "./FiltersManager";

export default function FilterBar() {
  const [filters] = useAtom(filtersAtom);
  const uuid = useAtomValue(uuidAtom);
  const setPlotData = useSetAtom(dataAtom);
  const setMediaItems = useSetAtom(mediaItemsAtom);
  const showPage = useAtomValue(showPageAtom);
  const [gridValues, setGridValues] = useAtom(gridValuesAtom);
  const [mediaIndices, setMediaIndices] = useAtom(mediaIndicesAtom);

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

    if (
      showPage === "grid" &&
      mediaIndices.length > 0 &&
      mediaIndices[mediaIndices.length - 1]?.length > 0
    ) {
      fetchMediaItems(
        uuid,
        mediaIndices[mediaIndices.length - 1],
        gridValues.page,
        gridValues.sortBy || undefined,
        gridValues.asc,
        filters,
      )
        .then((data) => { if (data) setMediaItems(data); })
        .catch(console.error);
    }
  }, [filters]); // eslint-disable-line react-hooks/exhaustive-deps

  return <FiltersManager />;
}
