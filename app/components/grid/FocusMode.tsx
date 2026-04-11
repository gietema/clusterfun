"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { configAtom, activeLearningAtom, similarityResultsAtom, uuidAtom } from "@/app/store/atoms";
import type { Media, BoundingBox, PredictionItem } from "@/app/types";
import { getLabelColor } from "@/app/lib/label-colors";
import { COLORS } from "@/app/lib/constants";
import { fetchMedia, fetchMediaItems } from "@/app/lib/api";
import { parseBoundingBoxes, rotateImage } from "@/app/lib/media-utils";
import PlotlyImagePlot from "../plot/PlotlyImagePlot";
import ImageAdjustments, { DEFAULT_ADJUSTMENTS, adjustmentsToFilter } from "../media/ImageAdjustments";

const PREFETCH_AHEAD = 7;
const FILMSTRIP_COUNT = 5;

type FilterMode = "all" | "unlabeled" | "uncertain";

interface FocusModeProps {
  mediaIndices: number[];
  onLabelToggle: (media: Media, label: string) => void;
  onExit: () => void;
}

export default function FocusMode({ mediaIndices, onLabelToggle, onExit }: FocusModeProps) {
  const config = useAtomValue(configAtom);
  const uuid = useAtomValue(uuidAtom);
  const alState = useAtomValue(activeLearningAtom);
  const similarityResults = useAtomValue(similarityResultsAtom);

  const [position, setPosition] = useState(0);
  const [media, setMedia] = useState<Media | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [showStats, setShowStats] = useState(false);
  const [history, setHistory] = useState<number[]>([]);
  const [filmstrip, setFilmstrip] = useState<(Media | null)[]>([]);

  // Image tools (same as MediaPage)
  const [adjustments, setAdjustments] = useState(DEFAULT_ADJUSTMENTS);
  const [showAdjustments, setShowAdjustments] = useState(false);
  const [rotatedSrc, setRotatedSrc] = useState<string | null>(null);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);

  // Session tracking
  const [sessionLabels, setSessionLabels] = useState<Record<string, number>>({});
  const [skippedCount, setSkippedCount] = useState(0);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [acceptedCount, setAcceptedCount] = useState(0);
  const [rejectedCount, setRejectedCount] = useState(0);
  const [labelRejects, setLabelRejects] = useState(true);
  const startTimeRef = useRef(Date.now());

  const containerRef = useRef<HTMLDivElement>(null);
  const cacheRef = useRef<Map<number, Media>>(new Map());

  const labels = config?.labels ?? [];

  // ── Quick-filter ──
  const effectiveIndices = useMemo(() => {
    if (filterMode === "all") return mediaIndices;
    if (filterMode === "unlabeled") {
      return mediaIndices.filter((id) => {
        const cached = cacheRef.current.get(id);
        if (!cached) return true;
        return !cached.labels || cached.labels.length === 0;
      });
    }
    if (filterMode === "uncertain" && alState) {
      return mediaIndices.filter((id) => {
        const pred = alState.predictions.find((p) => p.media_id === id);
        return pred ? pred.uncertainty > 0.3 : true;
      });
    }
    return mediaIndices;
  }, [mediaIndices, filterMode, alState]);

  const total = effectiveIndices.length;

  useEffect(() => {
    setPosition((p) => Math.min(p, Math.max(0, total - 1)));
  }, [total]);

  // ── Fetch helpers ──
  // fetchMedia with base64=true for Plotly (needs data URL), cached
  const fetchItemBase64 = useCallback(async (mediaId: number): Promise<Media | null> => {
    if (!uuid) return null;
    const cached = cacheRef.current.get(mediaId);
    if (cached) return cached;
    try {
      const item = await fetchMedia(uuid, mediaId, true);
      cacheRef.current.set(mediaId, item);
      return item;
    } catch { /* skip */ }
    return null;
  }, [uuid]);

  // fetchMediaItems for filmstrip thumbnails (regular URLs, fine for <img>)
  const fetchItemThumbnail = useCallback(async (mediaId: number): Promise<Media | null> => {
    if (!uuid) return null;
    // If we already have a base64 version, reuse it
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
      const mediaId = effectiveIndices[nextPos];
      if (cacheRef.current.has(mediaId)) continue;
      // Prefetch with base64 so it's ready for Plotly when we navigate to it
      fetchItemBase64(mediaId).then((item) => {
        if (item && item.type !== "audio") {
          const img = new Image();
          img.src = item.src;
        }
      });
    }
  }, [fetchItemBase64, effectiveIndices, total]);

  // ── Load current item ──
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setRotatedSrc(null);

    if (total === 0) {
      setMedia(null);
      setLoading(false);
      setFilmstrip([]);
      return;
    }

    const mediaId = effectiveIndices[position];
    fetchItemBase64(mediaId).then((item) => {
      if (cancelled) return;
      setMedia(item);
      setLoading(false);
    });

    // Load filmstrip (thumbnails are fine with regular URLs)
    const filmstripIds: number[] = [];
    for (let i = 1; i <= FILMSTRIP_COUNT; i++) {
      if (position + i < total) filmstripIds.push(effectiveIndices[position + i]);
    }
    Promise.all(filmstripIds.map((id) => fetchItemThumbnail(id))).then((items) => {
      if (!cancelled) setFilmstrip(items);
    });

    prefetch(position);
    return () => { cancelled = true; };
  }, [position, total, effectiveIndices, fetchItemBase64, fetchItemThumbnail, prefetch]);

  // ── Bounding boxes ──
  useEffect(() => {
    if (!media || !config?.bounding_box) { setBoundingBoxes([]); return; }
    const bboxValue = media.information?.[config.bounding_box];
    if (typeof bboxValue === "string") setBoundingBoxes(parseBoundingBoxes(bboxValue));
    else setBoundingBoxes([]);
  }, [media, config]);

  const shapes = useMemo(() => {
    if (!media || boundingBoxes.length === 0) return [];
    const h = media.height ?? 1000;
    return boundingBoxes.map((bbox, i) => ({
      type: "rect",
      x0: bbox.xmin,
      y0: h - bbox.ymin,
      x1: bbox.xmax,
      y1: h - bbox.ymax,
      line: { width: 3, color: bbox.color || COLORS[i % COLORS.length] },
    }));
  }, [boundingBoxes, media]);

  // Focus container
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
      const prev = history[history.length - 1];
      setHistory((h) => h.slice(0, -1));
      setPosition(prev);
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

  // ── Labeling ──
  const handleLabel = useCallback((label: string) => {
    if (!media) return;
    onLabelToggle(media, label);
    const isRemove = media.labels?.includes(label);
    const updated: Media = isRemove
      ? { ...media, labels: (media.labels ?? []).filter((l) => l !== label) }
      : { ...media, labels: [...(media.labels ?? []), label] };
    setMedia(updated);
    cacheRef.current.set(media.index, updated);
    setReviewedCount((c) => c + 1);
    setSessionLabels((prev) => {
      const count = prev[label] ?? 0;
      return { ...prev, [label]: isRemove ? Math.max(0, count - 1) : count + 1 };
    });
    if (autoAdvance) advance();
  }, [media, onLabelToggle, advance, autoAdvance]);

  const handleSkip = useCallback(() => {
    setSkippedCount((c) => c + 1);
    setReviewedCount((c) => c + 1);
    advance();
  }, [advance]);

  // Accept/reject proposed label (Y/N keys when AL predictions are available)
  const handleAcceptProposal = useCallback(() => {
    if (!media || !alState) return;
    const pred = alState.predictions.find((p) => p.media_id === media.index);
    if (!pred) return;
    handleLabel(pred.predicted_class);
    setAcceptedCount((c) => c + 1);
  }, [media, alState, handleLabel]);

  const handleRejectProposal = useCallback(() => {
    if (!media) return;
    if (labelRejects) {
      onLabelToggle(media, "exclude");
      const updated = { ...media, labels: [...(media.labels ?? []), "exclude"] };
      setMedia(updated);
      cacheRef.current.set(media.index, updated);
    }
    setRejectedCount((c) => c + 1);
    setReviewedCount((c) => c + 1);
    advance();
  }, [media, labelRejects, onLabelToggle, advance]);

  // ── Keyboard ──
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    if (e.key === "Escape") { e.preventDefault(); onExit(); return; }
    if (e.key === " ") { e.preventDefault(); handleSkip(); return; }
    if ((e.key === "y" || e.key === "Y") && alState) { e.preventDefault(); handleAcceptProposal(); return; }
    if ((e.key === "n" || e.key === "N") && alState) { e.preventDefault(); handleRejectProposal(); return; }
    if (e.key === "Backspace") { e.preventDefault(); goBack(); return; }
    if (e.key === "ArrowRight") { e.preventDefault(); advance(); return; }
    if (e.key === "ArrowLeft") { e.preventDefault(); goBack(); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (media) {
        setReviewedCount((c) => c + 1);
        setHistory((h) => [...h, position]);
        setPosition((p) => Math.min(p + 1, total - 1));
      }
      return;
    }
    const key = parseInt(e.key);
    if (key >= 1 && key <= 9 && key <= labels.length) {
      e.preventDefault();
      handleLabel(labels[key - 1]);
    }
  }, [onExit, advance, goBack, handleLabel, handleSkip, handleAcceptProposal, handleRejectProposal, labels, media, position, total, alState]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ── Derived ──
  const prediction: PredictionItem | undefined = media
    ? alState?.predictions.find((p) => p.media_id === media.index)
    : undefined;
  const similarityScore = media ? similarityResults[media.index] : undefined;
  const progressPercent = total > 0 ? ((position + 1) / total) * 100 : 0;

  // Timer
  const elapsedMs = Date.now() - startTimeRef.current;
  const elapsedMin = elapsedMs / 60_000;
  const itemsPerMin = elapsedMin > 0.05 ? reviewedCount / elapsedMin : 0;
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  if (!config) return null;

  const totalSessionLabels = Object.values(sessionLabels).reduce((a, b) => a + b, 0);

  // Height calc for the Plotly plot area
  const plotHeight = `calc(100vh - ${
    40 /* header */ + 4 /* progress */ + 36 /* image tools */ + 52 /* label buttons */ + 58 /* filmstrip */
    + (showStats ? 36 : 0)
    + (showAdjustments ? 40 : 0)
    + ((prediction || similarityScore !== undefined) ? 30 : 0)
  }px)`;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="fixed inset-0 z-50 flex flex-col bg-white outline-none"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2">
        <div className="flex items-center gap-3">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
            Exit
          </button>
          <span className="text-sm font-medium text-gray-900">Focus Mode</span>
          <span className="text-xs text-gray-400">
            {position + 1} / {total.toLocaleString()}
            {filterMode !== "all" && <span className="ml-1 text-blue-500">({filterMode})</span>}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filterMode}
            onChange={(e) => { setFilterMode(e.target.value as FilterMode); setPosition(0); setHistory([]); }}
            className="rounded border border-gray-200 px-2 py-1 text-[10px] text-gray-600 focus:border-gray-400 focus:outline-none"
          >
            <option value="all">All items</option>
            <option value="unlabeled">Unlabeled only</option>
            {alState && <option value="uncertain">Uncertain only</option>}
          </select>
          <label className="flex cursor-pointer items-center gap-1.5 text-[10px] text-gray-400">
            <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} className="h-3 w-3 rounded border-gray-300 text-gray-800 focus:ring-0" />
            auto-advance
          </label>
          <button
            onClick={() => setShowStats((s) => !s)}
            className={`rounded px-2 py-1 text-[10px] transition-colors ${showStats ? "bg-gray-800 text-white" : "text-gray-400 hover:text-gray-600"}`}
          >Stats</button>
          {reviewedCount > 0 && <span className="text-[10px] tabular-nums text-gray-400">{itemsPerMin.toFixed(1)}/min</span>}
          {alState && (
            <>
              <label className="flex items-center gap-1.5 text-[10px] text-gray-400" title="Label rejected items as 'exclude' so active learning deprioritizes them">
                <input type="checkbox" checked={labelRejects} onChange={(e) => setLabelRejects(e.target.checked)} className="h-3 w-3 rounded border-gray-300 accent-gray-700" />
                label rejects
              </label>
              {(acceptedCount > 0 || rejectedCount > 0) && (
                <div className="flex items-center gap-2 text-[10px]">
                  <span className="text-emerald-600">{acceptedCount} accepted</span>
                  <span className="text-red-500">{rejectedCount} rejected</span>
                </div>
              )}
            </>
          )}
          <div className="flex items-center gap-2 text-[10px] text-gray-400">
            {alState && (
              <>
                <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5">Y</kbd><span>accept</span>
                <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5">N</kbd><span>reject</span>
              </>
            )}
            <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5">Space</kbd><span>skip</span>
            <kbd className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5">Esc</kbd><span>exit</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 shrink-0 bg-gray-100">
        <div className="h-full bg-gray-800 transition-all duration-200" style={{ width: `${progressPercent}%` }} />
      </div>

      {/* Stats overlay */}
      {showStats && (
        <div className="shrink-0 border-b border-gray-200 bg-gray-50 px-4 py-2">
          <div className="flex items-center gap-4 text-xs">
            <span className="font-medium text-gray-700">Session</span>
            <span className="text-gray-500">{reviewedCount} reviewed</span>
            <span className="text-gray-500">{totalSessionLabels} labeled</span>
            <span className="text-gray-500">{skippedCount} skipped</span>
            <span className="tabular-nums text-gray-500">{Math.floor(elapsedMin)}:{String(Math.floor((elapsedMs / 1000) % 60)).padStart(2, "0")} elapsed</span>
            <span className="tabular-nums text-gray-500">{itemsPerMin.toFixed(1)} items/min</span>
            {labels.length > 0 && (
              <div className="ml-2 flex items-center gap-2">
                {labels.map((label, i) => {
                  const count = sessionLabels[label] ?? 0;
                  if (count === 0) return null;
                  return (
                    <span key={label} className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: getLabelColor(i) }} />
                      <span className="text-gray-600">{count} {label}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image adjustments bar (same as MediaPage) */}
      {showAdjustments && <ImageAdjustments values={adjustments} onChange={setAdjustments} />}

      {/* Image toolbar: rotate + adjustments toggle */}
      <div className="flex shrink-0 items-center gap-1 border-b border-gray-100 px-3 py-1">
        <button onClick={() => handleRotate(-90)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Rotate left">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2.5 2v6h6" /><path d="M2.66 15.57a10 10 0 1 0 .57-8.38" /></svg>
        </button>
        <button onClick={() => handleRotate(90)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" title="Rotate right">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21.5 2v6h-6" /><path d="M21.34 15.57a10 10 0 1 1-.57-8.38" /></svg>
        </button>
        <button
          onClick={() => setShowAdjustments((s) => !s)}
          className={`rounded px-2 py-1 text-[10px] transition-colors ${showAdjustments ? "bg-gray-200 text-gray-800" : "text-gray-400 hover:text-gray-600"}`}
        >
          Adjustments
        </button>
        {/* Prediction / similarity badges inline */}
        {prediction && (
          <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[10px] font-medium ${prediction.uncertainty > 0.3 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
            {prediction.predicted_class} {((1 - prediction.uncertainty) * 100).toFixed(0)}%
          </span>
        )}
        {similarityScore !== undefined && (
          <span className={`${prediction ? "" : "ml-auto"} rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] text-blue-700`}>
            similarity: {similarityScore.toFixed(4)}
          </span>
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
                <svg className="h-20 w-20 text-gray-300" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
                <audio controls autoPlay><source src={media.src} /></audio>
              </div>
            ) : (
              <div
                className="h-full p-2"
                style={{ filter: adjustmentsToFilter(adjustments) }}
              >
                <PlotlyImagePlot
                  media={{ ...media, src: rotatedSrc || media.src }}
                  scaleFactor={1}
                  shapes={shapes}
                  boundingBoxes={boundingBoxes}
                />
              </div>
            )}
            {/* Label badges overlay */}
            {media.labels && media.labels.length > 0 && (
              <div className="absolute left-4 top-4 flex flex-wrap gap-1">
                {media.labels.map((label) => {
                  const idx = labels.indexOf(label);
                  if (idx === -1) return null;
                  return (
                    <span key={label} className="rounded px-2 py-0.5 text-xs font-medium text-white shadow" style={{ backgroundColor: getLabelColor(idx) }}>
                      {label}
                    </span>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">
            {filterMode !== "all" ? "No matching items — try a different filter" : "No more items"}
          </div>
        )}
      </div>

      {/* Label buttons */}
      {labels.length > 0 && media && (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-gray-200 px-4 py-2">
          {labels.map((label, i) => {
            const isActive = media.labels?.includes(label);
            const color = getLabelColor(i);
            return (
              <button
                key={label}
                onClick={() => handleLabel(label)}
                className="flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-all hover:shadow-md"
                style={{
                  borderColor: isActive ? color : "#e5e7eb",
                  backgroundColor: isActive ? `${color}15` : "white",
                  color: isActive ? color : "#374151",
                }}
              >
                <kbd className="flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold" style={{ backgroundColor: isActive ? color : "#f3f4f6", color: isActive ? "white" : "#6b7280" }}>
                  {i + 1}
                </kbd>
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* Filmstrip */}
      {filmstrip.length > 0 && (
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-2">
          <div className="flex items-center justify-center gap-2">
            <span className="mr-2 text-[10px] text-gray-400">Up next</span>
            {filmstrip.map((item, i) => {
              if (!item) return null;
              const thumbPrediction = alState?.predictions.find((p) => p.media_id === item.index);
              const hasLabels = item.labels && item.labels.length > 0;
              return (
                <button
                  key={item.index}
                  onClick={() => jumpTo(position + i + 1)}
                  className={`group relative h-14 w-14 shrink-0 overflow-hidden rounded border transition-all hover:border-gray-400 ${i === 0 ? "border-gray-400 ring-1 ring-gray-300" : "border-gray-200"}`}
                >
                  {item.type !== "audio" ? (
                    <img src={item.src} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400">
                      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" /></svg>
                    </div>
                  )}
                  {hasLabels && (
                    <div className="absolute left-0.5 top-0.5 flex gap-px">
                      {item.labels!.map((l) => {
                        const li = labels.indexOf(l);
                        if (li === -1) return null;
                        return <span key={l} className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: getLabelColor(li) }} />;
                      })}
                    </div>
                  )}
                  {thumbPrediction && thumbPrediction.uncertainty > 0.3 && (
                    <div className="absolute bottom-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
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
        <button onClick={advance} className="fixed right-4 top-1/2 -translate-y-1/2 rounded-full bg-white p-2 shadow-lg transition-colors hover:bg-gray-50" title="Next (Space)">
          <svg className="h-5 w-5 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      )}
    </div>
  );
}
