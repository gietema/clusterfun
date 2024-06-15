import {
    dataAtom,
    filtersAtom,
    gridValuesAtom,
    mediaIndicesAtom,
    mediaItemsAtom,
    showPageAtom,
    uuidAtom,
  } from "@/app/components/Previewer";
  import { useAtom, useAtomValue, useSetAtom } from "jotai";
  import React, { ChangeEvent, FC, useEffect, useState } from "react";
  import { getFilteredPlotData } from "../requests/GetFilteredPlotData";
  import { getMediaItems } from "../requests/GetMediaItems";
import FiltersManager from "./FiltersManager";
  
  
  export const Filter: FC = () => {
    const [filters, setFilters] = useAtom(filtersAtom);
    const uuid = useAtomValue(uuidAtom);
    const setPlotData = useSetAtom(dataAtom);
    const setMediaItems = useSetAtom(mediaItemsAtom);
    const showPage = useAtomValue(showPageAtom);
    const [gridValues, setGridValues] = useAtom(gridValuesAtom);
  
    const [mediaIndices, setMediaIndices] = useAtom(mediaIndicesAtom); // [0, 1, 2, 3, 4, 5, 6, 7, 8, 9
  
    useEffect(() => {
      handleFiltering();
    }, [filters]);
  
    const handleFiltering = (): void => {
      getFilteredPlotData(uuid, filters)
        .then((data) => {
          if (data) {
            setPlotData(data);
            let indices: number[] = [];
            data.forEach((d) => {
              // d.index is an array of indices that need to be added to indices
              // @ts-ignore
              indices = [...indices, ...d.id];
            });
            // filter indices by indices in first mediaIndices
            if (mediaIndices !== undefined && mediaIndices.length > 0) {
              const filteredIndices = indices.filter((i) =>
                mediaIndices[0].includes(i),
              );
              // append filteredIndices to mediaIndices
              setMediaIndices([...mediaIndices, filteredIndices]);
            }
            setGridValues({
              ...gridValues,
              page: 0,
            });
          }
        })
        .catch((e) => console.error(e));
  
      if (
        showPage === "grid" &&
        mediaIndices !== undefined &&
        mediaIndices.length > 0 &&
        mediaIndices[mediaIndices.length - 1] !== undefined &&
        mediaIndices[mediaIndices.length - 1].length > 0
      ) {
        getMediaItems(
          uuid,
          mediaIndices[mediaIndices.length - 1],
          gridValues.page,
          gridValues.sortBy,
          gridValues.asc,
          filters,
        )
          .then((data) => {
            if (data) setMediaItems(data);
          })
          .catch((e) => console.error(e));
      }
    };
  
    return (
      <>
        <div className="flex">
        <FiltersManager />
        </div>
      </>
    );
  };