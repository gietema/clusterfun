"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import { filtersAtom, uuidAtom } from "@/app/store/atoms";
import { fetchColumns, fetchColumnValues } from "@/app/lib/api";
import type { ColumnInfo, Filter } from "@/app/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OPERATORS = [
  { value: "=", label: "=" },
  { value: "!=", label: "≠" },
  { value: ">=", label: "≥" },
  { value: "<=", label: "≤" },
  { value: "IN", label: "in" },
  { value: "NOT IN", label: "not in" },
  { value: "COL =", label: "= col" },
  { value: "COL !=", label: "≠ col" },
];

function isComplete(f: Filter): boolean {
  return f.column !== "" && f.comparison !== "" && f.values.length > 0;
}

function isColumnOp(op: string): boolean {
  return op === "COL =" || op === "COL !=";
}

function filterLabel(f: Filter, columns: ColumnInfo[]): string {
  const op = OPERATORS.find((o) => o.value === f.comparison);
  const opLabel = op?.label ?? f.comparison;
  const valLabel =
    f.values.length === 1
      ? f.values[0]
      : f.values.length <= 3
        ? f.values.join(", ")
        : `${f.values.slice(0, 2).join(", ")} +${f.values.length - 2}`;
  return `${f.column} ${opLabel} ${valLabel}`;
}

// ---------------------------------------------------------------------------
// Value autocomplete
// ---------------------------------------------------------------------------

function ValueInput({
  filter,
  uuid,
  onSelect,
}: {
  filter: Filter;
  uuid: string;
  onSelect: (value: string) => void;
}) {
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState<{ label: string; count: number }[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filter.column) return;
    fetchColumnValues(uuid, filter.column, [])
      .then(setOptions)
      .catch(() => setOptions([]));
  }, [filter.column, uuid]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        // Commit typed value on close
        if (inputValue.trim()) {
          onSelect(inputValue.trim());
          setInputValue("");
        }
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [inputValue, onSelect]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && inputValue.trim()) {
      onSelect(inputValue.trim());
      setInputValue("");
      if (filter.comparison !== "IN" && filter.comparison !== "NOT IN") {
        setIsOpen(false);
      }
    }
  };

  const filtered = options
    .filter((o) => o.label.toLowerCase().includes(inputValue.toLowerCase()))
    .filter((o) => !filter.values.includes(o.label))
    .slice(0, 30);

  return (
    <div className="relative" ref={ref}>
      <input
        type="text"
        className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 placeholder-gray-400 focus:border-gray-400 focus:outline-none"
        placeholder="Value..."
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={() => setIsOpen(true)}
        onKeyDown={handleKeyDown}
      />
      {isOpen && filtered.length > 0 && (
        <ul className="absolute left-0 z-20 mt-1 max-h-48 w-full overflow-y-auto rounded border border-gray-200 bg-white shadow-lg">
          {filtered.map((opt) => (
            <li
              key={opt.label}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(opt.label);
                setInputValue("");
                if (filter.comparison !== "IN" && filter.comparison !== "NOT IN") {
                  setIsOpen(false);
                }
              }}
              className="flex cursor-pointer items-center justify-between px-2 py-1.5 text-xs hover:bg-gray-50"
            >
              <span className="truncate">{opt.label}</span>
              <span className="ml-1 shrink-0 text-[10px] text-gray-400">{opt.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single filter row
// ---------------------------------------------------------------------------

function FilterRow({
  filter,
  columns,
  onChange,
  onRemove,
}: {
  filter: Filter;
  columns: ColumnInfo[];
  onChange: (f: Filter) => void;
  onRemove: () => void;
}) {
  const uuid = useAtomValue(uuidAtom);
  const colOp = isColumnOp(filter.comparison);
  const multiValue = filter.comparison === "IN" || filter.comparison === "NOT IN";

  const handleValueSelect = useCallback(
    (value: string) => {
      if (multiValue) {
        if (!filter.values.includes(value)) {
          onChange({ ...filter, values: [...filter.values, value] });
        }
      } else {
        onChange({ ...filter, values: [value] });
      }
    },
    [filter, multiValue, onChange],
  );

  const handleRemoveValue = (value: string) => {
    onChange({ ...filter, values: filter.values.filter((v) => v !== value) });
  };

  return (
    <div className="flex items-start gap-1.5 py-1.5">
      {/* Column */}
      <select
        value={filter.column}
        onChange={(e) => onChange({ ...filter, column: e.target.value, values: [] })}
        className="w-28 shrink-0 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
      >
        <option value="">Column...</option>
        {columns
          .filter((c) => c.name !== "id" && !c.name.startsWith("_"))
          .map((c) => (
            <option key={c.name} value={c.name}>
              {c.name}
            </option>
          ))}
      </select>

      {/* Operator */}
      <select
        value={filter.comparison}
        onChange={(e) => onChange({ ...filter, comparison: e.target.value, values: [] })}
        className="w-16 shrink-0 rounded border border-gray-200 bg-white px-1 py-1 text-center text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
      >
        <option value="">op</option>
        {OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      {/* Value */}
      <div className="min-w-0 flex-1">
        {colOp ? (
          <select
            value={filter.values[0] ?? ""}
            onChange={(e) => onChange({ ...filter, values: e.target.value ? [e.target.value] : [] })}
            className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
          >
            <option value="">Column...</option>
            {columns
              .filter((c) => c.name !== filter.column && c.name !== "id" && !c.name.startsWith("_"))
              .map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
          </select>
        ) : (
          <ValueInput filter={filter} uuid={uuid} onSelect={handleValueSelect} />
        )}
        {/* Multi-value pills */}
        {multiValue && filter.values.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {filter.values.map((v) => (
              <span
                key={v}
                className="flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700"
              >
                {v}
                <button
                  onClick={() => handleRemoveValue(v)}
                  className="text-gray-400 hover:text-gray-700"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {/* Single value display (non-multi) */}
        {!multiValue && !colOp && filter.values.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1">
            {filter.values.map((v) => (
              <span
                key={v}
                className="flex items-center gap-1 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-700"
              >
                {v}
                <button
                  onClick={() => handleRemoveValue(v)}
                  className="text-gray-400 hover:text-gray-700"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="shrink-0 rounded p-1 text-gray-300 transition-colors hover:bg-gray-100 hover:text-gray-600"
        title="Remove filter"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function FiltersManager() {
  const [isOpen, setIsOpen] = useState(false);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [filters, setFilters] = useAtom(filtersAtom);
  const uuid = useAtomValue(uuidAtom);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchColumns(uuid).then(setColumns).catch(console.error);
  }, [uuid]);

  // Close panel on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  const addFilter = () => {
    setFilters([...filters, { column: "", comparison: "=", values: [] }]);
  };

  const updateFilter = (index: number, filter: Filter) => {
    const updated = [...filters];
    updated[index] = filter;
    setFilters(updated);
  };

  const removeFilter = (index: number) => {
    setFilters(filters.filter((_, i) => i !== index));
  };

  const clearAll = () => {
    setFilters([]);
    setIsOpen(false);
  };

  const activeCount = filters.filter(isComplete).length;

  return (
    <div className="relative" ref={panelRef}>
      {/* Trigger button + active filter pills */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen && filters.length === 0) addFilter();
          }}
          className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
            activeCount > 0
              ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
              : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          {activeCount > 0 ? `Filters (${activeCount})` : "Filter"}
        </button>

        {/* Active filter pills (compact summary) */}
        {activeCount > 0 && !isOpen && (
          <div className="flex flex-wrap gap-1">
            {filters.filter(isComplete).map((f, i) => (
              <span
                key={i}
                className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
              >
                {filterLabel(f, columns)}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const realIndex = filters.indexOf(f);
                    if (realIndex >= 0) removeFilter(realIndex);
                  }}
                  className="text-gray-400 hover:text-gray-700"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 w-[460px] rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <div className="space-y-0">
            {filters.map((filter, i) => (
              <FilterRow
                key={i}
                filter={filter}
                columns={columns}
                onChange={(f) => updateFilter(i, f)}
                onRemove={() => removeFilter(i)}
              />
            ))}
          </div>

          <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2">
            <button
              onClick={addFilter}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-700"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Add filter
            </button>
            {filters.length > 0 && (
              <button
                onClick={clearAll}
                className="ml-auto rounded-md px-2 py-1 text-xs text-gray-400 transition-colors hover:text-red-500"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
