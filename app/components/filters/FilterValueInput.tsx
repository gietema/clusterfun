"use client";
import { useEffect, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { currentMediaIndicesAtom, uuidAtom } from "@/app/store/atoms";
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
  const mediaIndices = useAtomValue(currentMediaIndicesAtom);
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
    fetchColumnValues(uuid, filter.column, mediaIndices)
      .then(setOptions)
      .catch(() => setOptions([]));
  }, [filter.column, uuid, mediaIndices]);

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
    <div className="relative inline-block w-full" ref={dropdownRef}>
      <input
        type="text"
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 focus:border-gray-400 focus:outline-none focus:ring-1 focus:ring-gray-400"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={() => setIsOpen(true)}
      />
      {isOpen && filteredOptions.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filteredOptions.map((opt) => (
            <li
              key={opt.label}
              onClick={() => handleSelect(opt.label)}
              className="cursor-pointer px-3 py-2 text-xs hover:bg-gray-50"
            >
              {opt.label}
              <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{opt.count}</span>
            </li>
          ))}
        </ul>
      )}
      {filter.values.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {filter.values.map((value) => (
            <span
              key={value}
              className="flex items-center rounded-md bg-gray-800 px-2 py-0.5 text-xs text-white"
            >
              {value}
              <button onClick={() => handleRemove(value)} className="ml-1.5 text-gray-500 hover:text-white">&times;</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
