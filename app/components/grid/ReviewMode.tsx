"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { configAtom, activeLearningAtom, uuidAtom } from "@/app/store/atoms";
import type { Media, BoundingBox, PredictionItem } from "@/app/types";
import { getLabelColor } from "@/app/lib/label-colors";
import { COLORS } from "@/app/lib/constants";
import { fetchMedia, fetchMediaItems, saveLabel } from "@/app/lib/api";
import { parseBoundingBoxes, rotateImage } from "@/app/lib/media-utils";
import PlotlyImagePlot from "../plot/PlotlyImagePlot";
import ImageAdjustments, { DEFAULT_ADJUSTMENTS, adjustmentsToFilter } from "../media/ImageAdjustments";
import { useLabelUndo } from "@/app/lib/use-label-undo";

const PREFETCH_AHEAD = 5;
const FILMSTRIP_COUNT = 5;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

interface ReviewModeProps {
  /** Called after accepting: applies the label via GridView's handler. */
  onLabelToggle: (media: Media, label: string) => void;
  onExit: () => void;
}

export default function ReviewMode({ onLabelToggle, onExit }: ReviewModeProps) {
  const config = useAtomValue(configAtom);
  const uuid = useAtomValue(uuidAtom);
  const alState = useAtomValue(activeLearningAtom);

  const [position, setPosition] = useState(0);
  const [media, setMedia] = useState<Media | null>(null);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<number[]>([]);
  const [filmstrip, setFilmstrip] = useState<(Media | null)[]>([]);
  const [confidenceThreshold, setConfidenceThreshold] = useState(DEFAULT_CONFIDENCE_THRESHOLD);

  // Image tools
  const [adjustments, setAdjustments] = useState(DEFAULT_ADJUSTMENTS);
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [rotatedSrc, setRotatedSrc] = useState<string | null>(null);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);

  // Review tracking
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [labelRejects, setLabelRejects] = useState(true);

  const startTimeRef = useRef(Date.now());

  const containerRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<Map<number, Media>>(new Map());
  const { pushAction } = useLabelUndo();

  const labels = config?.labels ?? [];

  // ── Build the review queue from AL predictions ──
  const reviewQueue = useMemo(() => {
    if (!alState) return [];
    return alState.predictions
      .filter((p) => {
        const confidence = 1 - p.uncertainty;
        return confidence >= confidenceThreshold;
      })
      .sort((a, b) => a.uncertainty - b.uncertainty); // highest confidence first
  }, [alState, confidenceThreshold]);

  const total = reviewQueue.length;

  useEffect(() => {
    setPosition((p) => Math.min(p, Math.max(0, total - 1)));
  }, [total]);

  // Current prediction
  const currentPrediction: PredictionItem | undefined = reviewQueue[position];

  // ── Fetch ──
  const fetchItemBase64 = useCallback(async (mediaId: number): Promise<Media | null> => {
    if (!uuid) return null;
    const cached = cacheRef.current.get(mediaId);
    if (cached) return cached;
    try {
      const item = await fetchMedia(uuid, mediaId, true);
      cacheRef.current.set(mediaId, item);
      return item;
    } catch { return null; }
  }, [uuid]);

  const fetchItemThumbnail = useCallback(async (mediaId: number): Promise<Media | null> => {
    if (!uuid) return null;
    const cached = cacheRef.current.get(mediaId);
    if (cached) return cached;
    try {
      const items = await fetchMediaItems(uuid, [mediaId], 0);
      if (items.length > 0) return items[0];
    } catch { /* skip */ }
    return null;
  }, [uuid]);

  const prefetch = useCallback((fromPos: number) => {
    for (let i = 1; i <= PREFETCH_AHEAD; i++) {
      const nextPos = fromPos + i;
      if (nextPos >= total) break;
      const mediaId = reviewQueue[nextPos].media_id;
      if (cacheRef.current.has(mediaId)) continue;
      fetchItemBase64(mediaId).then((item) => {
        if (item && item.type !== "audio") {
          const img = new Image();
          img.src = item.src;
        }
      });
    }
  }, [fetchItemBase64, reviewQueue, total]);

  // ── Load current item ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRotatedSrc(null);

    if (total === 0 || !currentPrediction) {
      setMedia(null);
      setLoading(false);
      setFilmstrip([]);
      return;
    }

    fetchItemBase64(currentPrediction.media_id).then((item) => {
      if (cancelled) return;
      setMedia(item);
      setLoading(false);
    });

    // Filmstrip
    const filmstripPreds = reviewQueue.slice(position + 1, position + 1 + FILMSTRIP_COUNT);
    Promise.all(filmstripPreds.map((p) => fetchItemThumbnail(p.media_id))).then((items) => {
      if (!cancelled) setFilmstrip(items);
    });

    prefetch(position);
    return () => { cancelled = true; };
  }, [position, total, currentPrediction, reviewQueue, fetchItemBase64, fetchItemThumbnail, prefetch]);

  // Bounding boxes
  useEffect(() => {
    if (!media || !config?.bounding_box) { setBoundingBoxes([]); return; }
    const v = media.information?.[config.bounding_box];
    if (typeof v === "string") setBoundingBoxes(parseBoundingBoxes(v));
    else setBoundingBoxes([]);
  }, [media, config]);

  const shapes = useMemo(() => {
    if (!media || boundingBoxes.length === 0) return [];
    const h = media.height ?? 1000;
    return boundingBoxes.map((bbox, i) => ({
      type: "rect", x0: bbox.xmin, y0: h - bbox.ymin, x1: bbox.xmax, y1: h - bbox.ymax,
      line: { width: 3, color: bbox.color || COLORS[i % COLORS.length] },
    }));
  }, [boundingBoxes, media]);

  useEffect(() => { containerRef.current?.focus(); }, []);

  // ── Navigation ──
  const advance = useCallback(() => {
    if (position < total - 1) {
      setHistory((h) => [...h, position]);
      setPosition((p) => p + 1);
    }
  }, [position, total]);

  const goBack = useCallback(() => {
    if (history.length > 0) {
      setHistory((h) => h.slice(0, -1));
      setPosition(history[history.length - 1]);
    }
  }, [history]);

  const jumpTo = useCallback((targetPos: number) => {
    if (targetPos >= 0 && targetPos < total && targetPos !== position) {
      setHistory((h) => [...h, position]);
      setPosition(targetPos);
    }
  }, [position, total]);

  // ── Rotate ──
  const handleRotate = useCallback((degrees: number) => {
    if (!media) return;
    rotateImage(rotatedSrc || media.src, degrees, (src, width, height) => {
      setMedia((m) => m ? { ...m, width, height } : m);
      setRotatedSrc(src);
    });
  }, [media, rotatedSrc]);

  // ── Accept / Reject ──
  const handleAccept = useCallback(() => {
    if (!media || !currentPrediction) return;
    const label = currentPrediction.predicted_class;
    // Apply the label
    onLabelToggle(media, label);
    // Update local cache
    const updated = { ...media, labels: [...(media.labels ?? []), label] };
    setMedia(updated);
    cacheRef.current.set(media.index, updated);
    setAcceptedCount((c) => c + 1);
    advance();
  }, [media, currentPrediction, onLabelToggle, advance]);

  const handleReject = useCallback(() => {
    if (labelRejects && media) {
      onLabelToggle(media, "exclude");
      const updated = { ...media, labels: [...(media.labels ?? []), "exclude"] };
      setMedia(updated);
      cacheRef.current.set(media.index, updated);
    }
    setRejectedCount((c) => c + 1);
    advance();
  }, [advance, labelRejects, media, onLabelToggle]);

  const handleAcceptAll = useCallback(async () => {
    if (!uuid || !alState) return;
    // Batch-apply all remaining proposals from current position onward
    const remaining = reviewQueue.slice(position);
    const byLabel = new Map<string, number[]>();
    for (const pred of remaining) {
      const ids = byLabel.get(pred.predicted_class) ?? [];
      ids.push(pred.media_id);
      byLabel.set(pred.predicted_class, ids);
    }
    for (const entry of Array.from(byLabel.entries())) {
      await saveLabel(uuid, entry[1], entry[0]);
      pushAction({ type: "add", label: entry[0], mediaIds: entry[1] });
    }
    setAcceptedCount((c) => c + remaining.length);
    // Jump to end
    setPosition(total - 1);
  }, [uuid, alState, reviewQueue, position, total, pushAction]);

  // ── Keyboard ──
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (e.key === "Escape") { e.preventDefault(); onExit(); return; }
    if (e.key === "y" || e.key === "Y") { e.preventDefault(); handleAccept(); return; }
    if (e.key === "n" || e.key === "N") { e.preventDefault(); handleReject(); return; }
    if (e.key === "Backspace" || e.key === "ArrowLeft") { e.preventDefault(); goBack(); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); advance(); return; }
  }, [onExit, handleAccept, handleReject, goBack, advance]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ── Derived ──
  const totalReviewed = acceptedCount + rejectedCount;
  const acceptanceRate = totalReviewed > 0 ? acceptedCount / totalReviewed : 1;
  const progressPercent = total > 0 ? ((position + 1) / total) * 100 : 0;

  // Timer
  const elapsedMs = Date.now() - startTimeRef.current;
  const elapsedMin = elapsedMs / 60_000;
  const itemsPerMin = elapsedMin > 0.05 ? totalReviewed / elapsedMin : 0;
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);


  if (!config || !alState) return null;

  const proposedLabel = currentPrediction?.predicted_class;
  const proposedConfidence = currentPrediction ? (1 - currentPrediction.uncertainty) * 100 : 0;
  const proposedLabelIndex = proposedLabel ? labels.indexOf(proposedLabel) : -1;
  const proposedColor = proposedLabelIndex >= 0 ? getLabelColor(proposedLabelIndex) : "#6b7280";

  return (
    <div ref={containerRef} tabIndex={0} className="fixed inset-0 z-50 flex flex-col bg-white outline-none">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2">
        <div className="flex items-center gap-3">
          <button onClick={onExit} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 18L18 6M6 6l12 12" /></svg>
            Exit
          </button>
          <span className="text-sm font-medium text-gray-900">Review Proposals</span>
          <span className="text-xs text-gray-400">{position + 1} / {total.toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[10px] text-gray-400">
            min confidence
            <input
              type="range" min={50} max={99} value={Math.round(confidenceThreshold * 100)}
              onChange={(e) => { setConfidenceThreshold(parseInt(e.target.value) / 100); setPosition(0); setHistory([]); }}
              className="w-16"
            />
            <span className="w-8 tabular-nums">{Math.round(confidenceThreshold * 100)}%</span>
          </label>
          <label className="flex items-center gap-1.5 text-[10px] text-gray-400" title="When enabled, rejected items are labeled 'exclude' so active learning deprioritizes them on refit">
            <input
              type="checkbox"
              checked={labelRejects}
              onChange={(e) => setLabelRejects(e.target.checked)}
              className="h-3 w-3 rounded border-gray-300 accent-gray-700"
            />
            label rejects
          </label>
          {totalReviewed > 0 && (
            <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${acceptanceRate >= 0.8 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              {(acceptanceRate * 100).toFixed(0)}% accepted
            </span>
          )}
          {totalReviewed > 0 && <span className="text-[10px] tabular-nums text-gray-400">{itemsPerMin.toFixed(1)}/min</span>}
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="text-emerald-600">{acceptedCount} accepted</span>
            <span className="text-red-500">{rejectedCount} rejected</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
            <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5">Y</kbd><span>accept</span>
            <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5">N</kbd><span>reject</span>
            <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5">Esc</kbd><span>exit</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 shrink-0 bg-gray-100">
        <div className="h-full bg-gray-800 transition-all duration-200" style={{ width: `${progressPercent}%` }} />
      </div>

      {/* Image adjustments */}
      {showAdjustments && <ImageAdjustments values={adjustments} onChange={setAdjustments} />}

      {/* Image toolbar */}
      <div className="flex shrink-0 items-center gap-1 border-b border-gray-100 px-3 py-1">
        <button onClick={() => handleRotate(-90)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Rotate left">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 2v6h6" /><path d="M2.66 15.57a10 10 0 1 0 .57-8.38" /></svg>
        </button>
        <button onClick={() => handleRotate(90)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Rotate right">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6" /><path d="M21.34 15.57a10 10 0 1 1-.57-8.38" /></svg>
        </button>
        <button onClick={() => setShowAdjustments((s) => !s)} className={`rounded px-2 py-1 text-[10px] transition-colors ${showAdjustments ? "bg-gray-200 text-gray-800" : "text-gray-400 hover:text-gray-600"}`}>
          Adjustments
        </button>

        {/* Proposed label — prominent display */}
        {proposedLabel && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-gray-400">Proposed:</span>
            <span className="rounded-full px-3 py-1 text-sm font-semibold text-white shadow-sm" style={{ backgroundColor: proposedColor }}>
              {proposedLabel}
            </span>
            <span className="tabular-nums text-xs text-gray-500">{proposedConfidence.toFixed(0)}% confidence</span>
          </div>
        )}
      </div>

      {/* Main image area */}
      <div className="relative min-h-0 flex-1">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
          </div>
        ) : media ? (
          <>
            {media.type === "audio" ? (
              <div className="flex h-full flex-col items-center justify-center gap-4">
                <svg className="h-20 w-20 text-gray-300" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
                <audio controls autoPlay><source src={media.src} /></audio>
              </div>
            ) : (
              <div className="h-full p-2" style={{ filter: adjustmentsToFilter(adjustments) }}>
                <PlotlyImagePlot media={{ ...media, src: rotatedSrc || media.src }} scaleFactor={1} shapes={shapes} boundingBoxes={boundingBoxes} />
              </div>
            )}
            {/* Existing labels */}
            {media.labels && media.labels.length > 0 && (
              <div className="absolute left-4 top-4 flex flex-wrap gap-1">
                {media.labels.map((label) => {
                  const idx = labels.indexOf(label);
                  if (idx === -1) return null;
                  return <span key={label} className="rounded px-2 py-0.5 text-xs font-medium text-white shadow" style={{ backgroundColor: getLabelColor(idx) }}>{label}</span>;
                })}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            {total === 0 ? "No items above confidence threshold — try lowering it" : "All proposals reviewed"}
          </div>
        )}
      </div>

      {/* Action buttons */}
      {media && currentPrediction && (
        <div className="flex shrink-0 items-center justify-center gap-4 border-t border-gray-200 px-4 py-3">
          <button onClick={handleReject} className="flex items-center gap-2 rounded-lg border-2 border-red-200 bg-white px-6 py-2.5 text-sm font-medium text-red-600 transition-all hover:border-red-400 hover:shadow-md">
            <kbd className="flex h-5 w-5 items-center justify-center rounded bg-red-100 text-[10px] font-bold text-red-600">N</kbd>
            Reject
          </button>
          <button onClick={handleAccept} className="flex items-center gap-2 rounded-lg border-2 px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md" style={{ borderColor: proposedColor, backgroundColor: proposedColor }}>
            <kbd className="flex h-5 w-5 items-center justify-center rounded bg-white/30 text-[10px] font-bold">Y</kbd>
            Accept as &ldquo;{proposedLabel}&rdquo;
          </button>
          {total - position > 5 && (
            <button onClick={handleAcceptAll} className="ml-4 rounded-lg border border-gray-200 px-4 py-2.5 text-xs text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-700" title={`Accept all ${total - position} remaining proposals`}>
              Accept all {(total - position).toLocaleString()} remaining
            </button>
          )}
        </div>
      )}

      {/* Filmstrip */}
      {filmstrip.length > 0 && (
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-2">
          <div className="flex items-center justify-center gap-2">
            <span className="mr-2 text-[10px] text-gray-400">Up next</span>
            {filmstrip.map((item, i) => {
              if (!item) return null;
              const pred = reviewQueue[position + i + 1];
              return (
                <button key={item.index} onClick={() => jumpTo(position + i + 1)} className={`group relative h-14 w-14 shrink-0 overflow-hidden rounded border transition-all hover:border-gray-400 ${i === 0 ? "border-gray-400 ring-1 ring-gray-300" : "border-gray-200"}`}>
                  {item.type !== "audio" ? (
                    <img src={item.src} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
                    </div>
                  )}
                  {pred && (
                    <div className="absolute bottom-0 left-0 right-0 truncate bg-black/60 px-1 text-center text-[8px] text-white">
                      {pred.predicted_class}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation arrows */}
      {history.length > 0 && (
        <button onClick={goBack} className="fixed left-4 top-1/2 -translate-y-1/2 rounded-full bg-white p-2 shadow-lg transition-colors hover:bg-gray-50" title="Previous (Backspace)">
          <svg className="h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 19l-7-7 7-7" /></svg>
        </button>
      )}
      {position < total - 1 && (
        <button onClick={advance} className="fixed right-4 top-1/2 -translate-y-1/2 rounded-full bg-white p-2 shadow-lg transition-colors hover:bg-gray-50" title="Next">
          <svg className="h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      )}
    </div>
  );
}
