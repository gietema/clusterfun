"use client";
import { useEffect } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  configAtom, mediaAtom, mediaItemsAtom, uuidAtom,
  mediaIndexAtom, showPageAtom, detailMediaIndexAtom,
} from "@/app/store/atoms";
import { fetchMedia } from "@/app/lib/api";
import PreviewMedia from "../shared/PreviewMedia";
import { getNextMedia, getPreviousMedia } from "@/app/lib/media-utils";

export default function MediaDetailPanel() {
  const uuid = useAtomValue(uuidAtom);
  const config = useAtomValue(configAtom);
  const [detailIndex, setDetailIndex] = useAtom(detailMediaIndexAtom);
  const [media, setSideMedia] = useAtom(mediaAtom);
  const mediaItems = useAtomValue(mediaItemsAtom);
  const setMediaIndex = useSetAtom(mediaIndexAtom);
  const setShowPage = useSetAtom(showPageAtom);

  // Fetch full media when detail index changes
  useEffect(() => {
    if (detailIndex == null) return;
    fetchMedia(uuid, detailIndex, true).then(setSideMedia);
  }, [uuid, detailIndex, setSideMedia]);

  // Keyboard navigation
  useEffect(() => {
    if (detailIndex == null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setDetailIndex(undefined);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        const next = getNextMedia(mediaItems, detailIndex);
        if (next) setDetailIndex(next.index);
      }
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        const prev = getPreviousMedia(mediaItems, detailIndex);
        if (prev) setDetailIndex(prev.index);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [detailIndex, mediaItems, setDetailIndex]);

  if (detailIndex == null || !config || !media) return null;

  const currentIdx = mediaItems.findIndex((m) => m.index === detailIndex);
  const hasPrev = currentIdx > 0;
  const hasNext = currentIdx < mediaItems.length - 1 && currentIdx !== -1;

  const handleFullScreen = () => {
    setMediaIndex(detailIndex);
    setShowPage("media");
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Header with nav and actions */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setDetailIndex(undefined)}
          className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          title="Close detail (Esc)"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        <span className="text-[11px] text-gray-500">
          #{detailIndex}
          {currentIdx !== -1 && ` (${currentIdx + 1} of ${mediaItems.length})`}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => hasPrev && setDetailIndex(mediaItems[currentIdx - 1].index)}
          disabled={!hasPrev}
          className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
          title="Previous"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m15 18-6-6 6-6" />
          </svg>
        </button>
        <button
          onClick={() => hasNext && setDetailIndex(mediaItems[currentIdx + 1].index)}
          disabled={!hasNext}
          className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
          title="Next"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>
        <button
          onClick={handleFullScreen}
          className="rounded p-1 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
          title="Full screen"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 3 21 3 21 9" />
            <polyline points="9 21 3 21 3 15" />
            <line x1="21" x2="14" y1="3" y2="10" />
            <line x1="3" x2="10" y1="21" y2="14" />
          </svg>
        </button>
      </div>

      {/* Large image preview */}
      <div className="rounded border border-gray-100 [&_img]:max-h-[400px] [&_img]:w-full [&_img]:object-contain [&_video]:max-h-[400px] [&_video]:w-full [&_video]:object-contain">
        <PreviewMedia
          media={media}
          boundingBoxColumn={config.bounding_box}
          displayLabel
        />
      </div>
    </div>
  );
}
