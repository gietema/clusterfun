"use client";
import { useState, useRef, useEffect } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { uuidAtom, columnsAtom, configAtom, backgroundTasksAtom } from "@/app/store/atoms";
import { computeImageStats, fetchImageStatsStatus, fetchColumns } from "@/app/lib/api";
import { insightsColumnStatsAtom } from "@/app/store/atoms";
import toast from "react-hot-toast";

const IMG_STAT_COLUMNS = [
  "img_brightness", "img_contrast", "img_sharpness",
  "img_colorfulness", "img_saturation", "img_aspect_ratio",
  "img_width", "img_height",
];

interface ShowValueDropdownProps {
  columns: string[];
  values: string[];
  onChange: (values: string[]) => void;
}

export default function ShowValueDropdown({ columns, values, onChange }: ShowValueDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const uuid = useAtomValue(uuidAtom);
  const allColumns = useAtomValue(columnsAtom);
  const setConfig = useSetAtom(configAtom);
  const setColumns = useSetAtom(columnsAtom);
  const setColumnStats = useSetAtom(insightsColumnStatsAtom);
  const setBackgroundTasks = useSetAtom(backgroundTasksAtom);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Use columnsAtom names if available (refreshed after stats computation),
  // fall back to config.columns
  const columnNames = allColumns.length > 0
    ? allColumns.map((c) => c.name)
    : columns;

  // Check if image stats columns already exist
  const hasImageStats = IMG_STAT_COLUMNS.some((c) => columnNames.includes(c));

  const toggle = (col: string) => {
    if (values.includes(col)) {
      onChange(values.filter((v) => v !== col));
    } else {
      onChange([...values, col]);
    }
  };

  const handleComputeStats = async () => {
    setComputing(true);
    try {
      const status = await computeImageStats(uuid);
      if (status.status === "already_computed") {
        // Stats exist — refresh columns so they appear
        const cols = await fetchColumns(uuid);
        setColumns(cols);
        setConfig((prev) => prev ? {
          ...prev,
          columns: [...new Set([...prev.columns, ...IMG_STAT_COLUMNS])],
        } : prev);
        toast("Image statistics available");
      } else {
        setBackgroundTasks((prev) => [
          ...prev,
          {
            id: `img-stats-${uuid}`,
            type: "image_stats" as const,
            viewUuid: uuid,
            label: "Image statistics",
            status: "running" as const,
            progress: 0,
            done: 0,
            total: 0,
            startedAt: Date.now(),
          },
        ]);
        toast("Computing image statistics in background");
        // Poll until done, then refresh
        const poll = setInterval(async () => {
          try {
            const s = await fetchImageStatsStatus(uuid);
            if (s.status === "done" || s.status === "already_computed") {
              clearInterval(poll);
              const cols = await fetchColumns(uuid);
              setColumns(cols);
              setConfig((prev) => prev ? {
                ...prev,
                columns: [...new Set([...prev.columns, ...IMG_STAT_COLUMNS])],
              } : prev);
              setColumnStats({});
              setComputing(false);
            }
          } catch {
            clearInterval(poll);
            setComputing(false);
          }
        }, 2000);
        return; // don't setComputing(false) yet
      }
    } catch {
      toast.error("Failed to compute image statistics");
    }
    setComputing(false);
  };

  const label = values.length === 0
    ? "Show values"
    : values.length === 1
      ? values[0]
      : `${values.length} values`;

  // Display columns: skip id (index 0) and media (index 1)
  const displayColumns = columnNames.slice(2);

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
          {displayColumns.map((col) => (
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
          {!hasImageStats && (
            <li
              onClick={(e) => { e.stopPropagation(); handleComputeStats(); }}
              className="flex cursor-pointer items-center gap-2 whitespace-nowrap border-t border-gray-100 px-3 py-2 text-xs text-gray-500 hover:bg-gray-50"
            >
              {computing ? (
                <>
                  <div className="h-3 w-3 animate-spin rounded-full border border-gray-300 border-t-gray-600" />
                  Computing...
                </>
              ) : (
                <>
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
                  </svg>
                  Compute image statistics
                </>
              )}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
