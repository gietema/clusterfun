"use client";
import { useEffect, useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import {
  configAtom, uuidAtom, mediaItemsAtom, quickLookOpenAtom, cursorIndexAtom,
} from "@/app/store/atoms";
import { fetchMedia } from "@/app/lib/api";
import type { Media } from "@/app/types";
import PreviewMedia from "../shared/PreviewMedia";
import { getLabelColor } from "@/app/lib/label-colors";

/**
 * Apple-style Quick Look overlay. Opens on Space, dismisses on Esc/Space,
 * arrow keys cycle between items while open.
 */
export default function QuickLook() {
  const [open, setOpen] = useAtom(quickLookOpenAtom);
  const [cursor, setCursor] = useAtom(cursorIndexAtom);
  const config = useAtomValue(configAtom);
  const uuid = useAtomValue(uuidAtom);
  const mediaItems = useAtomValue(mediaItemsAtom);

  const [media, setMedia] = useState<Media | undefined>(undefined);

  // Look up the item by index
  useEffect(() => {
    if (!open || cursor == null) {
      setMedia(undefined);
      return;
    }
    const inPage = mediaItems.find((m) => m.index === cursor);
    if (inPage) {
      setMedia(inPage);
    } else {
      fetchMedia(uuid, cursor, true).then(setMedia).catch(() => {});
    }
  }, [open, cursor, mediaItems, uuid]);

  // Esc/Space to close, arrow keys to move
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (cursor == null || mediaItems.length === 0) return;
      const pageIndices = mediaItems.map((m) => m.index);
      const at = pageIndices.indexOf(cursor);
      if (at === -1) return;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(pageIndices.length - 1, at + 1);
        setCursor(pageIndices[next]);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = Math.max(0, at - 1);
        setCursor(pageIndices[prev]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, cursor, mediaItems, setOpen, setCursor]);

  if (!open || !config || !media) return null;

  const entries = media.information
    ? Object.entries(media.information).filter(([k]) => k !== config.bounding_box)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center motion-fade"
      onClick={() => setOpen(false)}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="motion-popover relative flex max-h-[85vh] w-[min(920px,92vw)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image area */}
        <div className="flex min-h-0 flex-1 items-center justify-center bg-gray-50 p-4">
          <div className="flex max-h-[60vh] items-center justify-center [&_img]:max-h-[60vh] [&_img]:w-auto [&_img]:object-contain [&_video]:max-h-[60vh] [&_video]:w-auto">
            <PreviewMedia
              media={media}
              boundingBoxColumn={config.bounding_box}
              displayLabel
            />
          </div>
        </div>

        {/* Metadata strip */}
        <div className="grid shrink-0 grid-cols-[auto_1fr_auto] items-center gap-4 border-t border-gray-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {media.labels?.map((label) => {
              const idx = config.labels.indexOf(label);
              if (idx === -1) return null;
              return (
                <span
                  key={label}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                  style={{ backgroundColor: getLabelColor(idx) }}
                >
                  {label}
                </span>
              );
            })}
            {(!media.labels || media.labels.length === 0) && (
              <span className="text-[11px] text-gray-500">no labels</span>
            )}
          </div>

          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1 overflow-hidden text-[11px] text-gray-600">
            {entries.slice(0, 5).map(([k, v]) => (
              <span key={k} className="truncate">
                <span className="font-medium text-gray-500">{k}:</span>{" "}
                <span className="text-gray-900">{String(v)}</span>
              </span>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-1 text-[10px] text-gray-500">
            <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5">←</kbd>
            <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5">→</kbd>
            navigate
            <span className="mx-1 text-gray-300">·</span>
            <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5">Esc</kbd>
            close
          </div>
        </div>
      </div>
    </div>
  );
}
