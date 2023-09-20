import {
  configAtom,
  dataAtom,
  filtersAtom,
  gridValuesAtom,
  mediaIndicesAtom,
  mediaItemsAtom,
  showPageAtom,
  uuidAtom,
} from "@/app/components/Previewer";
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import React, { ChangeEvent, FC, useEffect, useState } from "react";
import { FilterInterface } from "../models/FilterInterface";
import { getFilteredPlotData } from "../requests/GetFilteredPlotData";
import { getMediaItems } from "../requests/GetMediaItems";

const FilterButton: FC<{ filter: FilterInterface; onRemove: () => void }> = ({
  filter,
  onRemove,
}) => (
  <div
    className="pb-1"
    key={`${filter.column}${filter.comparison}${filter.value}`}
  >
    <div>
      <button
        type="button"
        className="button rounded-l border border-e-0 border-gray-300  p-1 text-xs text-gray-900 "
      >
        {filter.column} {filter.comparison} {filter.value}
      </button>
      <button
        type="button"
        className="button me-1 rounded-r  border border-gray-300 p-1 text-xs text-gray-900 "
        onClick={onRemove}
      >
        <FontAwesomeIcon icon={faTimes} />
      </button>
    </div>
  </div>
);

export const Filter: FC = () => {
  const config = useAtomValue(configAtom);
  const [filters, setFilters] = useAtom(filtersAtom);
  const uuid = useAtomValue(uuidAtom);
  const setPlotData = useSetAtom(dataAtom);
  const [selectedColumn, setSelectedColumn] = useState<string>();
  const [selectedComparison, setSelectedComparison] = useState<string>();
  const [selectedValue, setSelectedValue] = useState<string>();
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

  const handleAddFilter = (): void => {
    if (selectedValue && selectedComparison && selectedColumn) {
      const newFilter: FilterInterface = {
        column: selectedColumn,
        comparison: selectedComparison,
        value: selectedValue,
      };

      if (
        !filters?.some(
          (f) =>
            f.column === newFilter.column &&
            f.comparison === newFilter.comparison &&
            f.value === newFilter.value,
        )
      ) {
        setFilters((prevFilters) => [...prevFilters, newFilter]);
      }
    }
  };

  const handleRemoveFilter = (selectedFilter: FilterInterface): void => {
    setFilters((filters) =>
      filters.filter((filter) => filter !== selectedFilter),
    );
  };

  const handleDropdownChange =
    (setter: React.Dispatch<React.SetStateAction<string | undefined>>) =>
    (e: ChangeEvent<HTMLSelectElement>): void => {
      setter(e.target.value);
    };

  return (
    <>
      <div className="flex">
        {filters?.map((filter) => (
          <FilterButton
            filter={filter}
            onRemove={() => handleRemoveFilter(filter)}
            key={filter.column + filter.comparison + filter.value}
          />
        ))}
      </div>
      <div>
        <div className="pe-0 ps-0 pt-1 lg:flex lg:h-8">
          <div className="flex w-full border border-gray-300 px-2 lg:m-0 lg:my-0 lg:w-1/3 lg:rounded-s-md lg:border-e-0">
            <select
              defaultValue=""
              className="my-1 block grow text-xs text-gray-900 lg:my-0"
              aria-label="Default select example"
              onChange={handleDropdownChange(setSelectedColumn)}
            >
              <option value="" disabled>
                Column
              </option>
              {config?.columns
                .slice(2)
                .filter((c) => c !== "_y")
                .map((column) => (
                  <option key={column} value={column}>
                    {column}
                  </option>
                ))}
            </select>
          </div>
          <div className="lg:rounded-0 flex w-full border-s border-e lg:border border-gray-300 px-2 lg:m-0 lg:my-0 lg:w-1/3 lg:border-e-0">
            <select
              defaultValue=""
              className="my-1 block grow text-xs text-gray-900 lg:my-0"
              onChange={handleDropdownChange(setSelectedComparison)}
            >
              <option value="">comparison</option>
              <option value=">">&gt;</option>
              <option value=">=">&ge;</option>
              <option value="<">&lt;</option>
              <option value="=<">&le;</option>
              <option value="=">=</option>
              <option value="!=">&ne;</option>
            </select>
          </div>
          <input
            type="text"
            aria-label="Last name"
            placeholder="..."
            className="block w-full py-1 lg:py-0 border-e border-s border-t lg:border border-gray-300 px-2 text-xs text-gray-900 lg:my-0 lg:w-1/3 lg:border-e-0"
            onChange={(e) => setSelectedValue(e.target.value)}
          />
          <div
            className="button my-0 text-center cursor-pointer py-1 w-full border border-gray-300 bg-gray-100 text-xs text-gray-900 hover:text-blue-500 focus:border-blue-500  focus:ring-blue-500 lg:my-0 lg:w-1/3 lg:rounded-e-md"
            onClick={handleAddFilter}
          >
            Filter
          </div>
        </div>
      </div>
    </>
  );
};
