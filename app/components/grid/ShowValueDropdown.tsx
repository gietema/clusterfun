"use client";
import { useState, useRef, useEffect } from "react";

interface ShowValueDropdownProps {
  columns: string[];
  values: string[];
  onChange: (values: string[]) => void;
}

export default function ShowValueDropdown({ columns, values, onChange }: ShowValueDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (col: string) => {
    if (values.includes(col)) {
      onChange(values.filter((v) => v !== col));
    } else {
      onChange([...values, col]);
    }
  };

  const label = values.length === 0
    ? "Show values"
    : values.length === 1
      ? values[0]
      : `${values.length} values`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="rounded-md border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 focus:border-gray-400 focus:outline-none"
      >
        {label}
      </button>
      {isOpen && (
        <ul className="absolute z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {columns.slice(2).map((col) => (
            <li
              key={col}
              onClick={() => toggle(col)}
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap px-3 py-1.5 text-xs hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={values.includes(col)}
                readOnly
                className="rounded"
              />
              {col}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
