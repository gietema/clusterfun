"use client";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { faFileAudio } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { configAtom, similarityResultsAtom } from "@/app/store/atoms";
import type { Media } from "@/app/types";
import PreviewMedia from "../shared/PreviewMedia";
import MediaLabels from "./MediaLabels";

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
}

export default function MediaGridItem({
  media, columns, showColumns, boundingBoxColumn, showBboxLabel,
  display, onClick, onHover, onLabelToggle,
}: MediaGridItemProps) {
  const config = useAtomValue(configAtom);
  const similarityResults = useAtomValue(similarityResultsAtom);
  const elementRef = useRef<HTMLDivElement>(null);
  const similarityScore = similarityResults[media.index];

  useEffect(() => {
    const el = elementRef.current;
    if (!el || !config?.labels) return;
    const handler = (e: KeyboardEvent) => {
      const key = parseInt(e.key);
      if (key >= 1 && key <= 9 && key <= config.labels.length) {
        onLabelToggle(config.labels[key - 1]);
      }
    };
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, [config, media.index, onLabelToggle]);

  if (!config?.labels) return null;

  const columnEntries = (showColumns ?? [])
    .map((col) => ({ col, value: media.information?.[col] }))
    .filter((e) => e.value !== undefined);

  return (
    <div
      ref={elementRef}
      tabIndex={0}
      className="flex h-full cursor-pointer flex-col overflow-hidden border border-gray-200 transition-colors hover:border-gray-300"
      onClick={onClick}
      onMouseEnter={() => {
        onHover();
        elementRef.current?.focus();
      }}
    >
      <div className="flex-grow">
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
