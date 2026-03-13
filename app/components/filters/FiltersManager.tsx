"use client";
import { useEffect, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { faFilter } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { filtersAtom, uuidAtom } from "@/app/store/atoms";
import { fetchColumns } from "@/app/lib/api";
import type { ColumnInfo, Filter } from "@/app/types";
import FilterRow from "./FilterRow";

export default function FiltersManager() {
  const [showFilters, setShowFilters] = useState(false);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [filters, setFilters] = useAtom(filtersAtom);
  const uuid = useAtomValue(uuidAtom);

  useEffect(() => {
    fetchColumns(uuid).then(setColumns).catch(console.error);
  }, [uuid]);

  const addFilter = () => {
    setShowFilters(true);
    setFilters([...filters, { column: "", comparison: "", values: [] }]);
  };

  const updateFilter = (index: number, filter: Filter) => {
    const updated = [...filters];
    updated[index] = filter;
    setFilters(updated);
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const options = columns.map((col) => ({
    value: col.name,
    label: col.name,
    dtype: col.dtype,
  }));

  return (
    <div className="py-2">
      <div className={`flex flex-col ${showFilters ? "" : "hidden"}`}>
        {filters.map((filter, i) => (
          <FilterRow
            key={i}
            filter={filter}
            columns={options}
            onChange={(f) => updateFilter(i, f)}
            onRemove={() => removeFilter(i)}
          />
        ))}
      </div>
      <div className="flex items-center justify-end gap-1.5">
        {filters.length > 0 && showFilters && (
          <button
            className="rounded-md bg-gray-800 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-gray-700"
            onClick={addFilter}
          >
            +
          </button>
        )}
        <button
          onClick={() => {
            setShowFilters(!showFilters);
            if (filters.length === 0) addFilter();
          }}
          className={`rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors ${
            showFilters ? "bg-gray-600 hover:bg-gray-800" : "bg-gray-800 hover:bg-gray-700"
          }`}
        >
          <FontAwesomeIcon icon={faFilter} />
          <span className="ml-1.5">Filters{filters.length > 0 ? ` (${filters.length})` : ""}</span>
        </button>
      </div>
    </div>
  );
}
