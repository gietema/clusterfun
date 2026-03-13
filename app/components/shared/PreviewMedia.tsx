"use client";
import { useEffect, useRef, useState, Fragment } from "react";
import type { BoundingBox, Dimension, Media } from "@/app/types";
import { COLORS } from "@/app/lib/constants";
import { getContainedSize, parseBoundingBoxes } from "@/app/lib/media-utils";

interface PreviewMediaProps {
  media: Media | undefined;
  boundingBoxColumn: string | undefined;
  displayLabel: boolean;
  columns?: number;
}

function debounce(fn: () => void, ms: number) {
  let timer: ReturnType<typeof setTimeout> | null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

export default function PreviewMedia({
  media,
  boundingBoxColumn,
  displayLabel,
  columns,
}: PreviewMediaProps) {
  const [boundingBoxes, setBoundingBoxes] = useState<BoundingBox[]>([]);
  const [dims, setDims] = useState<Dimension>({
    width: 0, height: 0, naturalWidth: 0, naturalHeight: 0,
  });
  const imageRef = useRef<HTMLImageElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const measureImage = () => {
    const img = imageRef.current;
    if (!img) return;
    const size = getContainedSize(img);
    setDims({
      width: size.width || 0,
      height: size.height || 0,
      naturalWidth: img.naturalWidth || 0,
      naturalHeight: img.naturalHeight || 0,
    });
  };

  useEffect(() => { measureImage(); }, []);

  useEffect(() => {
    const handler = debounce(measureImage, 300);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  useEffect(() => {
    if (!media) return;
    if (media.information != null && boundingBoxColumn) {
      const bboxValue = media.information[boundingBoxColumn];
      if (typeof bboxValue === "string") setBoundingBoxes(parseBoundingBoxes(bboxValue));
    }
    audioRef.current?.load();
  }, [media, boundingBoxColumn]);

  useEffect(() => { measureImage(); }, [media, columns, displayLabel]);

  if (!media) return null;

  if (media.type === "audio") {
    return (
      <div className="image--preview" ref={containerRef}>
        <audio controls autoPlay ref={audioRef}>
          <source src={media.src} />
        </audio>
      </div>
    );
  }

  const scaleX = dims.naturalWidth > 0 ? dims.width / dims.naturalWidth : 0;
  const scaleY = dims.naturalHeight > 0 ? dims.height / dims.naturalHeight : 0;

  return (
    <div className="image--preview" ref={containerRef}>
      <img
        src={media.src}
        ref={imageRef}
        loading="lazy"
        style={{ objectFit: "contain", width: "100%" }}
        onLoad={measureImage}
        alt=""
      />
      {dims.width > 0 && dims.height > 0 && boundingBoxes.length > 0 && (
        <div
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
          className="flex items-center justify-center"
        >
          <svg width={dims.width} height={dims.height}>
            {boundingBoxes.map((bbox, i) => {
              const color = bbox.color ?? COLORS[i % COLORS.length];
              return (
                <Fragment key={i}>
                  <rect
                    x={bbox.xmin * scaleX}
                    y={bbox.ymin * scaleY}
                    width={(bbox.xmax - bbox.xmin) * scaleX}
                    height={(bbox.ymax - bbox.ymin) * scaleY}
                    stroke={color}
                    strokeWidth="3"
                    fill="none"
                  />
                  {bbox.label && displayLabel && (
                    <>
                      <rect
                        x={bbox.xmin * scaleX}
                        y={bbox.ymin * scaleY}
                        width={(bbox.xmax - bbox.xmin) * scaleX}
                        height={12}
                        fill={color}
                      />
                      <text
                        x={bbox.xmin * scaleX + 2}
                        y={bbox.ymin * scaleY + 10}
                        fill="white"
                        className="small"
                      >
                        {bbox.label}
                      </text>
                    </>
                  )}
                </Fragment>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
