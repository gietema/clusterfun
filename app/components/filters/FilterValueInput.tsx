"use client";
import { useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { filtersAtom, mediaIndicesAtom, uuidAtom } from "@/app/store/atoms";
import { fetchColumnValues } from "@/app/lib/api";
import type { Filter } from "@/app/types";

interface FilterValueInputProps {
  filter: Filter;
  onValueChange: (values: string[]) => void;
}

export default function FilterValueInput({ filter, onValueChange }: FilterValueInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<{ label: string; count: number }[]>([]);
  const uuid = useAtomValue(uuidAtom);
  const mediaIndices = useAtomValue(mediaIndicesAtom);
  const filters = useAtomValue(filtersAtom);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prevComparison = useRef<string | null>(null);
  const prevColumn = useRef<string | null>(null);

  // Reset values when operator changes from IN/NOT IN
  useEffect(() => {
    const prev = prevComparison.current;
    if (
      prev &&
      (prev === "IN" || prev === "NOT IN") &&
      filter.comparison !== "IN" &&
      filter.comparison !== "NOT IN"
    ) {
      onValueChange([]);
    }
    prevComparison.current = filter.comparison;
  }, [filter.comparison]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset values when column changes
  useEffect(() => {
    if (prevColumn.current && prevColumn.current !== filter.column) {
      onValueChange([]);
    }
    prevColumn.current = filter.column;
  }, [filter.column]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch column values
  useEffect(() => {
    if (!filter.column) return;
    const mediaIds = mediaIndices.length > 0 ? mediaIndices[mediaIndices.length - 1] : [];
    fetchColumnValues(uuid, filter.column, mediaIds)
      .then(setOptions)
      .catch(() => setOptions([]));
  }, [filter.column, uuid, filters, mediaIndices]);

  // Handle custom value on close
  useEffect(() => {
    if (!isOpen && inputValue) {
      handleSelect(inputValue);
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (value: string) => {
    if (filter.comparison === "IN" || filter.comparison === "NOT IN") {
      if (!filter.values.includes(value)) {
        onValueChange([...filter.values, value]);
      }
    } else {
      onValueChange([value]);
    }
    setInputValue("");
    setIsOpen(false);
  };

  const handleRemove = (value: string) => {
    onValueChange(filter.values.filter((v) => v !== value));
  };

  const filteredOptions = options
    .filter((o) => o.label.includes(inputValue))
    .filter((o) => !filter.values.includes(o.label));

  return (
    <div className="relative mb-2 inline-block w-full" ref={dropdownRef}>
      <input
        type="text"
        className="w-full rounded border border-gray-300 bg-white px-4 py-2 text-gray-700 focus:border-blue-500 focus:outline-none"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={() => setIsOpen(true)}
      />
      {isOpen && filteredOptions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg">
          {filteredOptions.map((opt) => (
            <li
              key={opt.label}
              onClick={() => handleSelect(opt.label)}
              className="cursor-pointer px-4 py-2 hover:bg-gray-100"
            >
              {opt.label}
              <span className="ml-2 rounded bg-gray-100 p-1 text-gray-500">{opt.count}</span>
            </li>
          ))}
        </ul>
      )}
      {filter.values.length > 0 && (
        <div className="mt-2 flex flex-wrap">
          {filter.values.map((value) => (
            <span
              key={value}
              className="mb-2 mr-2 flex items-center rounded-full bg-blue-900 px-2 py-1 text-white"
            >
              {value}
              <button onClick={() => handleRemove(value)} className="ml-2 text-sm">&times;</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
