"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Annotation, AnnotationTool, RectangleData, PolygonData } from "@/app/types";
import { COLORS } from "@/app/lib/constants";

interface AnnotationCanvasProps {
  /** Source image URL (base64 or path) */
  imageSrc: string;
  /** Natural width of the image */
  imageWidth: number;
  /** Natural height of the image */
  imageHeight: number;
  /** Current list of annotations */
  annotations: Annotation[];
  /** Called whenever annotations change */
  onAnnotationsChange: (annotations: Annotation[]) => void;
  /** Currently selected drawing tool */
  tool: AnnotationTool;
  /** Label to assign to new annotations */
  currentLabel: string;
  /** Index of selected annotation (for highlighting) */
  selectedAnnotationId: string | null;
  /** Called when an annotation is clicked/selected */
  onSelectAnnotation: (id: string | null) => void;
  /** Whether annotation mode is active (drawing enabled) */
  active: boolean;
}

function getLabelColor(label: string, annotations: Annotation[]): string {
  const labels = Array.from(new Set(annotations.map((a) => a.label)));
  let idx = labels.indexOf(label);
  if (idx === -1) idx = labels.length;
  return COLORS[idx % COLORS.length];
}

function generateId(): string {
  return `ann_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function AnnotationCanvas({
  imageSrc,
  imageWidth,
  imageHeight,
  annotations,
  onAnnotationsChange,
  tool,
  currentLabel,
  selectedAnnotationId,
  onSelectAnnotation,
  active,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);

  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);
  const [polygonPoints, setPolygonPoints] = useState<[number, number][]>([]);

  const scaleX = canvasSize.width > 0 ? canvasSize.width / imageWidth : 1;
  const scaleY = canvasSize.height > 0 ? canvasSize.height / imageHeight : 1;

  // Load and size the image
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      setImageLoaded(true);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // Fit canvas to container while preserving aspect ratio
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !imageWidth || !imageHeight) return;

    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      const aspect = imageWidth / imageHeight;
      let w = rect.width;
      let h = w / aspect;
      if (h > rect.height) {
        h = rect.height;
        w = h * aspect;
      }
      setCanvasSize({ width: Math.floor(w), height: Math.floor(h) });
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [imageWidth, imageHeight]);

  // Convert mouse event to natural image coordinates
  const toImageCoords = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const x = (e.clientX - rect.left) / scaleX;
      const y = (e.clientY - rect.top) / scaleY;
      return { x: Math.round(x), y: Math.round(y) };
    },
    [scaleX, scaleY],
  );

  // Find annotation under cursor
  const hitTest = useCallback(
    (x: number, y: number): string | null => {
      // Iterate in reverse so topmost drawn annotation is hit first
      for (let i = annotations.length - 1; i >= 0; i--) {
        const ann = annotations[i];
        if (ann.type === "rectangle") {
          const d = ann.data as RectangleData;
          if (x >= d.xmin && x <= d.xmax && y >= d.ymin && y <= d.ymax) {
            return ann.id;
          }
        } else if (ann.type === "polygon") {
          const d = ann.data as PolygonData;
          if (pointInPolygon(x, y, d.points)) {
            return ann.id;
          }
        }
      }
      return null;
    },
    [annotations],
  );

  // Render everything
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imageRef.current;
    if (!canvas || !ctx || !img || !imageLoaded) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw the image
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw existing annotations
    for (const ann of annotations) {
      const color = ann.color || getLabelColor(ann.label, annotations);
      const isSelected = ann.id === selectedAnnotationId;
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.fillStyle = color + "30"; // 30 = ~19% opacity

      if (ann.type === "rectangle") {
        const d = ann.data as RectangleData;
        const rx = d.xmin * scaleX;
        const ry = d.ymin * scaleY;
        const rw = (d.xmax - d.xmin) * scaleX;
        const rh = (d.ymax - d.ymin) * scaleY;
        ctx.fillRect(rx, ry, rw, rh);
        ctx.strokeRect(rx, ry, rw, rh);

        // Label text
        ctx.fillStyle = color;
        const fontSize = Math.max(11, Math.min(14, canvasSize.width / 60));
        ctx.font = `${fontSize}px sans-serif`;
        const textWidth = ctx.measureText(ann.label).width;
        ctx.fillRect(rx, ry, textWidth + 6, fontSize + 4);
        ctx.fillStyle = "white";
        ctx.fillText(ann.label, rx + 3, ry + fontSize);
      } else if (ann.type === "polygon") {
        const d = ann.data as PolygonData;
        if (d.points.length < 2) continue;
        ctx.beginPath();
        ctx.moveTo(d.points[0][0] * scaleX, d.points[0][1] * scaleY);
        for (let i = 1; i < d.points.length; i++) {
          ctx.lineTo(d.points[i][0] * scaleX, d.points[i][1] * scaleY);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Label text at first point
        ctx.fillStyle = color;
        const fontSize = Math.max(11, Math.min(14, canvasSize.width / 60));
        ctx.font = `${fontSize}px sans-serif`;
        const textWidth = ctx.measureText(ann.label).width;
        const lx = d.points[0][0] * scaleX;
        const ly = d.points[0][1] * scaleY;
        ctx.fillRect(lx, ly - fontSize - 4, textWidth + 6, fontSize + 4);
        ctx.fillStyle = "white";
        ctx.fillText(ann.label, lx + 3, ly - 4);
      }

      // Selection indicator
      if (isSelected) {
        ctx.setLineDash([5, 3]);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1;
        if (ann.type === "rectangle") {
          const d = ann.data as RectangleData;
          ctx.strokeRect(
            d.xmin * scaleX - 2, d.ymin * scaleY - 2,
            (d.xmax - d.xmin) * scaleX + 4, (d.ymax - d.ymin) * scaleY + 4,
          );
        }
        ctx.setLineDash([]);
      }
    }

    // Draw in-progress rectangle
    if (tool === "rectangle" && isDrawing && drawStart && drawCurrent) {
      const color = getLabelColor(currentLabel, annotations);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      const rx = drawStart.x * scaleX;
      const ry = drawStart.y * scaleY;
      const rw = (drawCurrent.x - drawStart.x) * scaleX;
      const rh = (drawCurrent.y - drawStart.y) * scaleY;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.setLineDash([]);
    }

    // Draw in-progress polygon
    if (tool === "polygon" && polygonPoints.length > 0) {
      const color = getLabelColor(currentLabel, annotations);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.beginPath();
      ctx.moveTo(polygonPoints[0][0] * scaleX, polygonPoints[0][1] * scaleY);
      for (let i = 1; i < polygonPoints.length; i++) {
        ctx.lineTo(polygonPoints[i][0] * scaleX, polygonPoints[i][1] * scaleY);
      }
      if (drawCurrent) {
        ctx.lineTo(drawCurrent.x * scaleX, drawCurrent.y * scaleY);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw vertices
      for (const pt of polygonPoints) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pt[0] * scaleX, pt[1] * scaleY, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }, [
    annotations, selectedAnnotationId, isDrawing, drawStart, drawCurrent,
    polygonPoints, tool, currentLabel, scaleX, scaleY, canvasSize, imageLoaded,
  ]);

  useEffect(() => {
    render();
  }, [render]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!active) return;
    const pos = toImageCoords(e);

    if (tool === "rectangle") {
      // Check if clicking on existing annotation
      const hitId = hitTest(pos.x, pos.y);
      if (hitId && !e.shiftKey) {
        onSelectAnnotation(hitId);
        return;
      }
      setIsDrawing(true);
      setDrawStart(pos);
      setDrawCurrent(pos);
      onSelectAnnotation(null);
    } else if (tool === "polygon") {
      // Check if clicking on existing annotation (only when not drawing)
      if (polygonPoints.length === 0) {
        const hitId = hitTest(pos.x, pos.y);
        if (hitId && !e.shiftKey) {
          onSelectAnnotation(hitId);
          return;
        }
      }
      onSelectAnnotation(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!active) return;
    const pos = toImageCoords(e);

    if (tool === "rectangle" && isDrawing) {
      setDrawCurrent(pos);
    } else if (tool === "polygon" && polygonPoints.length > 0) {
      setDrawCurrent(pos);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!active || tool !== "rectangle" || !isDrawing || !drawStart) return;
    const pos = toImageCoords(e);

    const xmin = Math.min(drawStart.x, pos.x);
    const ymin = Math.min(drawStart.y, pos.y);
    const xmax = Math.max(drawStart.x, pos.x);
    const ymax = Math.max(drawStart.y, pos.y);

    // Only create if the rectangle has meaningful size
    if (xmax - xmin > 3 && ymax - ymin > 3) {
      const newAnn: Annotation = {
        id: generateId(),
        type: "rectangle",
        label: currentLabel,
        color: getLabelColor(currentLabel, annotations),
        data: { xmin, ymin, xmax, ymax },
      };
      onAnnotationsChange([...annotations, newAnn]);
    }

    setIsDrawing(false);
    setDrawStart(null);
    setDrawCurrent(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!active || tool !== "polygon") return;
    const pos = toImageCoords(e);

    // Close polygon if clicking near the first point
    if (polygonPoints.length >= 3) {
      const first = polygonPoints[0];
      const dist = Math.sqrt(
        Math.pow((pos.x - first[0]) * scaleX, 2) +
        Math.pow((pos.y - first[1]) * scaleY, 2),
      );
      if (dist < 10) {
        const newAnn: Annotation = {
          id: generateId(),
          type: "polygon",
          label: currentLabel,
          color: getLabelColor(currentLabel, annotations),
          data: { points: polygonPoints },
        };
        onAnnotationsChange([...annotations, newAnn]);
        setPolygonPoints([]);
        setDrawCurrent(null);
        return;
      }
    }

    setPolygonPoints([...polygonPoints, [pos.x, pos.y]]);
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!active || tool !== "polygon" || polygonPoints.length < 3) return;
    e.preventDefault();
    const newAnn: Annotation = {
      id: generateId(),
      type: "polygon",
      label: currentLabel,
      color: getLabelColor(currentLabel, annotations),
      data: { points: polygonPoints },
    };
    onAnnotationsChange([...annotations, newAnn]);
    setPolygonPoints([]);
    setDrawCurrent(null);
  };

  // Escape cancels in-progress drawing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isDrawing) {
          setIsDrawing(false);
          setDrawStart(null);
          setDrawCurrent(null);
        }
        if (polygonPoints.length > 0) {
          setPolygonPoints([]);
          setDrawCurrent(null);
        }
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedAnnotationId) {
          onAnnotationsChange(annotations.filter((a) => a.id !== selectedAnnotationId));
          onSelectAnnotation(null);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isDrawing, polygonPoints, selectedAnnotationId, annotations, onAnnotationsChange, onSelectAnnotation]);

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center"
      style={{ width: "100%", height: "100%", position: "relative" }}
    >
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        style={{
          cursor: active
            ? tool === "rectangle" ? "crosshair" : "crosshair"
            : "default",
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
      />
    </div>
  );
}

/** Ray-casting point-in-polygon test */
function pointInPolygon(x: number, y: number, points: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i][0], yi = points[i][1];
    const xj = points[j][0], yj = points[j][1];
    if (
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}
