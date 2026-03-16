"use client";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { configAtom, currentMediaIndicesAtom, mediaAtom, mediaIndexAtom, mediaItemsAtom, uuidAtom } from "@/app/store/atoms";
import { COLORS } from "@/app/lib/constants";
import { getNextMedia, getPreviousMedia, parseBoundingBoxes, rotateImage } from "@/app/lib/media-utils";
import { fetchAnnotations, saveAnnotations as saveAnnotationsApi, exportAnnotations } from "@/app/lib/api";
import { useMediaPreview } from "@/app/lib/use-media-preview";
import type { Annotation, AnnotationTool, BoundingBox } from "@/app/types";
import HeaderControls from "./HeaderControls";
import ImageAdjustments, { DEFAULT_ADJUSTMENTS, adjustmentsToFilter } from "./ImageAdjustments";
import AnnotationCanvas from "./AnnotationCanvas";
import AnnotationToolbar from "./AnnotationToolbar";
import PlotlyImagePlot from "../plot/PlotlyImagePlot";
import SideBar from "../shared/SideBar";
import ResizableLayout from "../shared/ResizableLayout";

interface MediaPageProps {
  mediaIndex?: number;
  onBack?: () => void;
}

export default function MediaPage({ mediaIndex, onBack }: MediaPageProps) {
  const config = useAtomValue(configAtom);
  const media = useAtomValue(mediaAtom);
  const mediaItems = useAtomValue(mediaItemsAtom);
  const mediaIndices = useAtomValue(currentMediaIndicesAtom);
  const uuid = useAtomValue(uuidAtom);
  const setSideMedia = useSetAtom(mediaAtom);
  const [shapes, setShapes] = useState<Record<string, any>[]>([]);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [rotatedSrc, setRotatedSrc] = useState<string | null>(null);
  const [adjustments, setAdjustments] = useState(DEFAULT_ADJUSTMENTS);
  const [showAdjustments, setShowAdjustments] = useState(false);
  const { navigateToMedia } = useMediaPreview();

  // Annotation state
  const [annotateMode, setAnnotateMode] = useState(false);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [annotationTool, setAnnotationTool] = useState<AnnotationTool>("rectangle");
  const [annotationLabels, setAnnotationLabels] = useState<string[]>(["object"]);
  const [currentAnnotationLabel, setCurrentAnnotationLabel] = useState("object");
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setRotatedSrc(null); }, [mediaIndex]);

  // Load annotations when media changes
  useEffect(() => {
    if (!media || !uuid) return;
    fetchAnnotations(uuid, media.index)
      .then((anns) => {
        setAnnotations(anns);
        // Collect labels from existing annotations
        const existingLabels = Array.from(new Set(anns.map((a) => a.label)));
        setAnnotationLabels((prev) => {
          const merged = Array.from(new Set(prev.concat(existingLabels)));
          return merged;
        });
      })
      .catch(() => setAnnotations([]));
  }, [media?.index, uuid]);

  // Auto-save annotations with debounce
  const saveAnnotations = useCallback(
    (anns: Annotation[]) => {
      setAnnotations(anns);
      if (!media || !uuid) return;
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = setTimeout(() => {
        saveAnnotationsApi(uuid, media.index, anns).catch(console.error);
      }, 500);
    },
    [media, uuid],
  );

  const navigateTo = useCallback(
    (getter: typeof getNextMedia) => {
      if (mediaIndex == null) return;
      const target = getter(mediaItems, mediaIndex);
      if (!target) return;
      navigateToMedia(target.index);
    },
    [mediaIndex, mediaItems, navigateToMedia],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't intercept navigation in annotate mode (arrows might be needed)
      if (annotateMode) {
        if (e.key === "Escape") {
          setAnnotateMode(false);
        }
        return;
      }
      if (e.key === "ArrowLeft") navigateTo(getPreviousMedia);
      else if (e.key === "ArrowRight") navigateTo(getNextMedia);
      else if (e.key === "Escape") onBack?.();
    },
    [navigateTo, onBack, annotateMode],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleRotate = (degrees: number) => {
    if (!media) return;
    rotateImage(rotatedSrc || media.src, degrees, (src, width, height) => {
      setSideMedia({ ...media, width, height });
      setRotatedSrc(src);
    });
  };

  useEffect(() => {
    if (!media || !config?.bounding_box) return;
    const bboxValue = media.information?.[config.bounding_box];
    if (typeof bboxValue === "string") setBoundingBoxes(parseBoundingBoxes(bboxValue));
  }, [media, config]);

  useEffect(() => {
    const h = media?.height ?? 1000;
    setShapes(
      boundingBoxes.map((bbox, i) => ({
        type: "rect",
        x0: bbox.xmin,
        y0: h - bbox.ymin,
        x1: bbox.xmax,
        y1: h - bbox.ymax,
        line: { width: 3, color: bbox.color || COLORS[i % COLORS.length] },
      })),
    );
  }, [boundingBoxes, media]);

  const handleExport = async () => {
    if (!uuid) return;
    try {
      const data = await exportAnnotations(uuid);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `annotations_${uuid}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    }
  };

  const handleDeleteAnnotation = (id: string) => {
    const updated = annotations.filter((a) => a.id !== id);
    saveAnnotations(updated);
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
  };

  const handleAddLabel = (label: string) => {
    setAnnotationLabels((prev) =>
      prev.includes(label) ? prev : [...prev, label],
    );
  };

  return (
    <ResizableLayout sidebar={config && media ? <SideBar /> : <div />}>
      <HeaderControls
        mediaIndex={mediaIndex}
        mediaItems={mediaItems}
        onPrevious={() => navigateTo(getPreviousMedia)}
        onNext={() => navigateTo(getNextMedia)}
        onRotateClockwise={() => handleRotate(90)}
        onRotateCounterclockwise={() => handleRotate(-90)}
        onBack={onBack ?? (() => {})}
        showAdjustments={showAdjustments}
        onToggleAdjustments={() => setShowAdjustments((s) => !s)}
        annotateMode={annotateMode}
        onToggleAnnotate={() => setAnnotateMode((s) => !s)}
        totalCount={mediaIndices.length > 0 ? mediaIndices.length : (config?.total_count ?? undefined)}
      />
      {showAdjustments && (
        <ImageAdjustments values={adjustments} onChange={setAdjustments} />
      )}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 p-2">
          {media && !annotateMode && (
            <div
              style={{
                height: `calc(100vh - ${showAdjustments ? "120px" : "80px"})`,
                filter: adjustmentsToFilter(adjustments),
              }}
            >
              <PlotlyImagePlot
                media={{ ...media, src: rotatedSrc || media.src }}
                scaleFactor={1}
                shapes={shapes}
                boundingBoxes={boundingBoxes}
              />
            </div>
          )}
          {media && annotateMode && (
            <div
              style={{
                height: `calc(100vh - ${showAdjustments ? "120px" : "80px"})`,
                filter: adjustmentsToFilter(adjustments),
              }}
            >
              <AnnotationCanvas
                imageSrc={rotatedSrc || media.src}
                imageWidth={media.width ?? 1000}
                imageHeight={media.height ?? 1000}
                annotations={annotations}
                onAnnotationsChange={saveAnnotations}
                tool={annotationTool}
                currentLabel={currentAnnotationLabel}
                selectedAnnotationId={selectedAnnotationId}
                onSelectAnnotation={setSelectedAnnotationId}
                active={annotateMode}
              />
            </div>
          )}
        </div>
        {annotateMode && (
          <AnnotationToolbar
            tool={annotationTool}
            onToolChange={setAnnotationTool}
            currentLabel={currentAnnotationLabel}
            onLabelChange={setCurrentAnnotationLabel}
            labels={annotationLabels}
            onAddLabel={handleAddLabel}
            annotations={annotations}
            selectedAnnotationId={selectedAnnotationId}
            onSelectAnnotation={setSelectedAnnotationId}
            onDeleteAnnotation={handleDeleteAnnotation}
            onExport={handleExport}
          />
        )}
      </div>
    </ResizableLayout>
  );
}
