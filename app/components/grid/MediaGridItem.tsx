"use client";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { faFileAudio, faXmark } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { configAtom, similarityResultsAtom, activeLearningAtom } from "@/app/store/atoms";
import type { Media, PredictionItem } from "@/app/types";
import PreviewMedia from "../shared/PreviewMedia";
import MediaLabels from "./MediaLabels";

export const EXCLUDE_LABEL = "exclude";

interface MediaGridItemProps {
  media: Media;
  columns: number;
  showColumns?: string[];
  boundingBoxColumn?: string;
  showBboxLabel: boolean;
  display?: string[];
  onClick: () => void;
  onHover: () => void;
  onLabelToggle: (label: string) => void;
  onExclude?: () => void;
}

export default function MediaGridItem({
  media, columns, showColumns, boundingBoxColumn, showBboxLabel,
  display, onClick, onHover, onLabelToggle, onExclude,
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

  useEffect(() => {
    const el = elementRef.current;
    if (!el || !config?.labels) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "x" && alState && onExclude) {
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

  return (
    <div
      ref={elementRef}
      tabIndex={0}
      className="group flex h-full cursor-pointer flex-col overflow-hidden border border-gray-200 transition-colors hover:border-gray-300"
      onClick={onClick}
      onMouseEnter={() => {
        onHover();
        elementRef.current?.focus();
      }}
    >
      <div className="relative flex-grow">
        {alState && onExclude && !isExcluded && (
          <button
            onClick={(e) => { e.stopPropagation(); onExclude(); }}
            className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white opacity-0 shadow transition-opacity hover:bg-red-600 group-hover:opacity-100"
            title="Exclude (x)"
          >
            <FontAwesomeIcon icon={faXmark} className="text-xs" />
          </button>
        )}
        {isExcluded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40">
            <span className="rounded bg-red-500 px-2 py-0.5 text-xs font-medium text-white">excluded</span>
          </div>
        )}
        {media.type !== "audio" ? (
          <PreviewMedia
            media={media}
            boundingBoxColumn={boundingBoxColumn}
            displayLabel={showBboxLabel}
            columns={columns}
          />
        ) : (
          <div className="p-2">
            {!display && (
              <div className="text-gray-300 hover:text-gray-400">
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
        <div className="bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
          similarity: {similarityScore.toFixed(4)}
        </div>
      )}
      {prediction && (
        <div
          className={`px-2 py-0.5 text-xs ${
            prediction.uncertainty > 0.3
              ? "bg-amber-50 text-amber-700"
              : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {prediction.predicted_class}{" "}
          <span className="opacity-70">
            {((1 - prediction.uncertainty) * 100).toFixed(0)}%
          </span>
        </div>
      )}
      {columnEntries.length > 0 && (
        <div className="bg-gray-50 px-2 py-1">
          {columnEntries.map(({ col, value }) => (
            <div key={col} className="truncate text-xs text-gray-500">
              {columnEntries.length > 1 && (
                <span className="font-medium text-gray-400">{col}: </span>
              )}
              {value}
            </div>
          ))}
        </div>
      )}
      <MediaLabels
        mediaLabels={media.labels ?? []}
        onLabelToggle={onLabelToggle}
      />
    </div>
  );
}
