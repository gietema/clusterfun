"use client";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
              <span className="ml-1 shrink-0 text-[10px] text-gray-500">{opt.count}</span>
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
                  className="text-gray-500 hover:text-gray-700"
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
                  className="text-gray-500 hover:text-gray-700"
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

export default function FiltersManager({ hidePills = false }: { hidePills?: boolean } = {}) {
  const [isOpen, setIsOpen] = useState(false);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [filters, setFilters] = useAtom(filtersAtom);
  const uuid = useAtomValue(uuidAtom);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    fetchColumns(uuid).then(setColumns).catch(console.error);
  }, [uuid]);

  // Position popover under trigger (fixed coords so it escapes any overflow clipping)
  // Clamps to viewport so a right-side trigger doesn't push the popover off-screen.
  useLayoutEffect(() => {
    if (!isOpen) { setPopoverPos(null); return; }
    const update = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const popoverWidth = 460;
      const margin = 8;
      let left = rect.left;
      // If overflowing the right edge, anchor to the trigger's right edge instead
      if (left + popoverWidth + margin > window.innerWidth) {
        left = Math.max(margin, rect.right - popoverWidth);
      }
      setPopoverPos({ top: rect.bottom + 4, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [isOpen]);

  // Close panel on click outside (trigger OR portal popover counts as inside)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setIsOpen(false);
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
          ref={triggerRef}
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen && filters.length === 0) addFilter();
          }}
          aria-label="Filter"
          title="Filter"
          className={`relative flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${
            activeCount > 0
              ? "bg-teal-50 text-teal-700 hover:bg-teal-100"
              : isOpen
                ? "bg-gray-100 text-gray-900"
                : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          {activeCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-teal-600 text-[9px] font-semibold text-white">
              {activeCount}
            </span>
          )}
        </button>

        {/* Active filter pills (compact summary) — hidden when breadcrumb shows the same info */}
        {activeCount > 0 && !isOpen && !hidePills && (
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
                  className="text-gray-500 hover:text-gray-700"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Dropdown panel — portal so it escapes any ancestor overflow clipping */}
      {isOpen && popoverPos && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: popoverPos.top, left: popoverPos.left }}
          className="motion-popover z-50 w-[460px] rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-700">Filters</span>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded p-0.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-600"
              title="Close"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
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
                className="ml-auto rounded-md px-2 py-1 text-xs text-gray-500 transition-colors hover:text-red-500"
              >
                Clear all
              </button>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
