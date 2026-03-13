"use client";
import { useAtomValue } from "jotai";
import { useEffect, useRef } from "react";
import { faFileAudio } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { configAtom } from "@/app/store/atoms";
import type { Media } from "@/app/types";
import PreviewMedia from "../shared/PreviewMedia";
import MediaLabels from "./MediaLabels";

interface MediaGridItemProps {
  media: Media;
  columns: number;
  showColumn?: string;
  boundingBoxColumn?: string;
  showBboxLabel: boolean;
  display?: string[];
  onClick: () => void;
  onHover: () => void;
  onLabelToggle: (label: string) => void;
}

export default function MediaGridItem({
  media, columns, showColumn, boundingBoxColumn, showBboxLabel,
  display, onClick, onHover, onLabelToggle,
}: MediaGridItemProps) {
  const config = useAtomValue(configAtom);
  const elementRef = useRef<HTMLDivElement>(null);

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

  const columnValue =
    showColumn && media.information
      ? media.information[showColumn]
      : undefined;

  return (
    <div
      ref={elementRef}
      tabIndex={0}
      onClick={onClick}
      onMouseEnter={() => {
        onHover();
        elementRef.current?.focus();
      }}
    >
      {media.type !== "audio" ? (
        <PreviewMedia
          media={media}
          boundingBoxColumn={boundingBoxColumn}
          displayLabel={showBboxLabel}
          columns={columns}
        />
      ) : (
        <div>
          {!display && (
            <div className="text-gray-300 hover:text-gray-500">
              <FontAwesomeIcon icon={faFileAudio} size="5x" />
            </div>
          )}
          {display?.map((d) => (
            <div key={d}>
              {!media.information?.[d] ? (
                <div>{d}</div>
              ) : (
                <div>
                  <div className="border-b border-gray-300 text-xs text-gray-500">{d}</div>
                  <small>{media.information[d]}</small>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {columnValue !== undefined && (
        <div className="truncate"><small>{columnValue}</small></div>
      )}
      <MediaLabels
        mediaLabels={media.labels ?? []}
        onLabelToggle={onLabelToggle}
      />
    </div>
  );
}
