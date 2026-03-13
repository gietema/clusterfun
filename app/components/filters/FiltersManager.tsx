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
    <div className="container mx-auto p-4 ps-0 pe-0 pt-0">
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
      <div className="text-right">
        {filters.length > 0 && showFilters && (
          <button
            className="rounded bg-blue-900 px-3 py-2 text-xs text-white transition duration-300 hover:bg-blue-500"
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
          className={`ms-1 rounded px-3 py-2 text-xs text-white transition duration-300 ${
            showFilters ? "bg-blue-500 hover:bg-blue-900" : "bg-blue-900 hover:bg-blue-500"
          }`}
        >
          <FontAwesomeIcon icon={faFilter} />
          <span className="ms-1">Filters{filters.length > 0 ? ` (${filters.length})` : ""}</span>
        </button>
      </div>
    </div>
  );
}
