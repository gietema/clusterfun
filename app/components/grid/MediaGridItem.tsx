"use client";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { faFileAudio, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { configAtom, similarityResultsAtom, activeLearningAtom } from "@/app/store/atoms";
import type { Media, PredictionItem } from "@/app/types";
import { getLabelColor } from "@/app/lib/label-colors";
import PreviewMedia from "../shared/PreviewMedia";

export const EXCLUDE_LABEL = "exclude";

interface MediaGridItemProps {
  media: Media;
  columns: number;
  showColumns?: string[];
  boundingBoxColumn?: string;
  showBboxLabel: boolean;
  display?: string[];
  onClick: (e: React.MouseEvent) => void;
  onHover: () => void;
  onLabelToggle: (label: string) => void;
  onExclude?: () => void;
  selected?: boolean;
  anySelected?: boolean;
  onSelect?: (e: React.MouseEvent) => void;
  isCursor?: boolean;
  isOutlier?: boolean;
}

export default function MediaGridItem({
  media, columns, showColumns, boundingBoxColumn, showBboxLabel,
  display, onClick, onHover, onLabelToggle, onExclude,
  selected, anySelected, onSelect,
  isCursor, isOutlier,
}: MediaGridItemProps) {
  const config = useAtomValue(configAtom);
  const similarityResults = useAtomValue(similarityResultsAtom);
  const alState = useAtomValue(activeLearningAtom);
  const elementRef = useRef<HTMLDivElement>(null);
  const similarityScore = similarityResults[media.index];
  const prediction: PredictionItem | undefined = alState?.predictions.find(
    (p) => p.media_id === media.index,
  );

  const isExcluded = media.labels?.includes(EXCLUDE_LABEL);
  const hasLabel = media.labels && media.labels.length > 0 && media.labels.some((l) => l !== EXCLUDE_LABEL);
  const primaryLabelIndex = hasLabel && config?.labels
    ? config.labels.indexOf(media.labels!.find((l) => l !== EXCLUDE_LABEL)!)
    : -1;

  useEffect(() => {
    const el = elementRef.current;
    if (!el || !config?.labels) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "x" && onExclude) {
        e.preventDefault();
        onExclude();
        return;
      }
      const key = parseInt(e.key);
      if (key >= 1 && key <= 9 && key <= config.labels.length) {
        onLabelToggle(config.labels[key - 1]);
      }
    };
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [config, media.index, onLabelToggle, alState, onExclude]);

  if (!config?.labels) return null;

  const columnEntries = (showColumns ?? [])
    .map((col) => ({ col, value: media.information?.[col] }))
    .filter((e) => e.value !== undefined);

  // ── State hierarchy ────────────────────────────────────────────
  //   selected  : teal ring (accent)
  //   cursor    : focus-like ring
  //   outlier   : amber ring (subtle)
  //   hover     : shadow lift only (no border)
  //   default   : nearly invisible border, content forward
  const stateClasses = selected
    ? "ring-2 ring-teal-600 ring-offset-1 ring-offset-white shadow-sm"
    : isCursor
      ? "ring-2 ring-teal-400/70 ring-offset-1 ring-offset-white"
      : isOutlier
        ? "ring-1 ring-amber-400/70"
        : "ring-1 ring-gray-200/60 hover:ring-gray-300 hover:shadow-md hover:-translate-y-[1px]";

  return (
    <div
      ref={elementRef}
      tabIndex={0}
      className={`group relative flex h-full cursor-pointer flex-row overflow-hidden rounded-md bg-white outline-none transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-teal-500/60 ${stateClasses}`}
      onClick={onClick}
      onMouseEnter={() => {
        onHover();
        elementRef.current?.focus();
      }}
    >
      {/* Colored left strip for labeled items */}
      {hasLabel && primaryLabelIndex >= 0 && (
        <div
          className="w-1 shrink-0"
          style={{ backgroundColor: getLabelColor(primaryLabelIndex) }}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="relative flex-grow">
          {/* Selection checkbox */}
          {onSelect && (
            <button
              onClick={(e) => { e.stopPropagation(); onSelect(e); }}
              className={`absolute right-1.5 top-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-md border transition-all duration-150 ${
                selected
                  ? "border-teal-600 bg-teal-600 text-white"
                  : anySelected
                    ? "border-gray-300 bg-white/90 text-transparent hover:border-teal-500"
                    : "border-gray-300 bg-white/90 text-transparent opacity-0 group-hover:opacity-100 hover:border-teal-500"
              }`}
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
          {/* Label badges */}
          {media.labels && media.labels.length > 0 && config?.labels && (
            <div className="absolute left-1.5 top-1.5 z-10 flex flex-wrap gap-0.5">
              {media.labels.map((label) => {
                const labelIndex = config.labels.indexOf(label);
                if (labelIndex === -1) return null;
                return (
                  <span
                    key={label}
                    className="rounded px-1 py-px text-[10px] font-medium leading-tight text-white shadow-sm"
                    style={{ backgroundColor: getLabelColor(labelIndex) }}
                    title={label}
                  >
                    {columns >= 6 ? (labelIndex + 1) : label}
                  </span>
                );
              })}
            </div>
          )}
          {/* Exclude button */}
          {(alState || similarityScore !== undefined) && onExclude && !isExcluded && (
            <button
              onClick={(e) => { e.stopPropagation(); onExclude(); }}
              className="absolute left-1.5 top-1.5 z-20 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow transition-opacity hover:bg-red-600 group-hover:opacity-100"
              title="Exclude (x)"
            >
              <FontAwesomeIcon icon={faXmark} className="text-xs" />
            </button>
          )}
          {/* Excluded indicator — small badge, not a full red wash */}
          {isExcluded && (
            <div
              className="absolute right-1.5 top-1.5 z-20 flex h-4 items-center gap-1 rounded-full bg-red-500/95 px-1.5 text-[9px] font-semibold uppercase tracking-wider text-white shadow-sm"
              title="Excluded"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              excluded
            </div>
          )}
          {media.type !== "audio" ? (
            <div className={isExcluded ? "saturate-0 opacity-60 transition-all" : "transition-all"}>
              <PreviewMedia
                media={media}
                boundingBoxColumn={boundingBoxColumn}
                displayLabel={showBboxLabel}
                columns={columns}
              />
              {display && display.length > 0 && (
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-1.5 pt-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <div className="line-clamp-2 text-xs leading-snug text-white/90">
                    {display.map((d) => media.information?.[d]).filter(Boolean).join(" ")}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-2">
              {!display && (
                <div className="text-gray-300 hover:text-gray-500">
                  <FontAwesomeIcon icon={faFileAudio} size="5x" />
                </div>
              )}
              {display?.map((d) => (
                <div key={d}>
                  {!media.information?.[d] ? (
                    <div className="text-xs text-gray-500">{d}</div>
                  ) : (
                    <div>
                      <div className="text-xs font-medium text-gray-500">{d}</div>
                      <div className="text-sm text-gray-900">{media.information[d]}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        {similarityScore !== undefined && (
          <div className="flex items-center gap-1.5 bg-teal-50 px-2 py-0.5 text-[11px] text-teal-800">
            <div className="h-1 w-12 overflow-hidden rounded-full bg-teal-200">
              <div
                className="h-full rounded-full bg-teal-600"
                style={{ width: `${Math.max(0, Math.min(100, similarityScore * 100))}%` }}
              />
            </div>
            <span className="tabular-nums">{(similarityScore * 100).toFixed(1)}%</span>
          </div>
        )}
        {prediction && (
          <div
            className={`px-2 py-0.5 text-[11px] ${
              prediction.uncertainty > 0.3
                ? "bg-amber-50 text-amber-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            {prediction.predicted_class}{" "}
            <span className="tabular-nums opacity-70">
              {((1 - prediction.uncertainty) * 100).toFixed(0)}%
            </span>
          </div>
        )}
        {/* Column captions — always visible when the user explicitly selected columns to show */}
        {columnEntries.length > 0 && (
          <div className="bg-gray-50/80 px-2 py-1">
            {columnEntries.map(({ col, value }) => (
              <div key={col} className="truncate text-[11px] text-gray-600">
                {columnEntries.length > 1 && (
                  <span className="font-medium text-gray-500">{col}: </span>
                )}
                {value}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
