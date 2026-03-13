"use client";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { configAtom, mediaAtom, mediaIndexAtom, mediaItemsAtom } from "@/app/store/atoms";
import { COLORS } from "@/app/lib/constants";
import { getNextMedia, getPreviousMedia, parseBoundingBoxes, rotateImage } from "@/app/lib/media-utils";
import { useMediaPreview } from "@/app/lib/use-media-preview";
import type { BoundingBox } from "@/app/types";
import HeaderControls from "./HeaderControls";
import PlotlyImagePlot from "../plot/PlotlyImagePlot";
import SideBar from "../shared/SideBar";

interface MediaPageProps {
  mediaIndex?: number;
  onBack?: () => void;
}

export default function MediaPage({ mediaIndex, onBack }: MediaPageProps) {
  const config = useAtomValue(configAtom);
  const media = useAtomValue(mediaAtom);
  const mediaItems = useAtomValue(mediaItemsAtom);
  const setSideMedia = useSetAtom(mediaAtom);
  const [shapes, setShapes] = useState<Record<string, any>[]>([]);
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [rotatedSrc, setRotatedSrc] = useState<string | null>(null);
  const { navigateToMedia } = useMediaPreview();

  useEffect(() => { setRotatedSrc(null); }, [mediaIndex]);

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
      if (e.key === "ArrowLeft") navigateTo(getPreviousMedia);
      else if (e.key === "ArrowRight") navigateTo(getNextMedia);
      else if (e.key === "Escape") onBack?.();
    },
    [navigateTo, onBack],
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

  return (
    <div className="flex">
      <div className="w-3/4">
        <HeaderControls
          mediaIndex={mediaIndex}
          mediaItems={mediaItems}
          onPrevious={() => navigateTo(getPreviousMedia)}
          onNext={() => navigateTo(getNextMedia)}
          onRotateClockwise={() => handleRotate(90)}
          onRotateCounterclockwise={() => handleRotate(-90)}
          onBack={onBack ?? (() => {})}
        />
        <div className="p-2">
          {media && (
            <div style={{ height: "calc(100vh - 80px)" }}>
              <PlotlyImagePlot
                media={{ ...media, src: rotatedSrc || media.src }}
                scaleFactor={1}
                shapes={shapes}
                boundingBoxes={boundingBoxes}
              />
            </div>
          )}
        </div>
      </div>
      <div className="w-1/4">{config && media && <SideBar />}</div>
    </div>
  );
}
