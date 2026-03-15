import type { MediaType, BoundingBox, Dimension, HeightWidth } from "@/app/types";
import { IMAGE_EXTENSIONS, AUDIO_EXTENSIONS, BACKEND_URL } from "./constants";
import type { Media } from "@/app/types";

export function determineMediaType(filename: string): MediaType {
  const parts = filename.split(".");
  let extension = parts.pop();
  if (extension?.includes("?")) {
    extension = extension.split("?")[0];
  }
  if (extension) {
    const lower = extension.toLowerCase();
    if (IMAGE_EXTENSIONS.has(lower)) return "image";
    if (AUDIO_EXTENSIONS.has(lower)) return "audio";
  }
  return "image";
}

export function createMedia(data: Record<string, unknown>): Media {
  let src = data.src as string;
  // In dev mode, /media/ paths need the backend URL prefix since the
  // Next.js dev server doesn't serve them.
  if (src?.startsWith("/media/") && BACKEND_URL) {
    src = `${BACKEND_URL}${src}`;
  }
  const media: Media = {
    index: data.index as number,
    src,
    information: data.information as Media["information"],
    height: data.height as number | undefined,
    width: data.width as number | undefined,
    labels: data.labels as string[] | undefined,
    type: data.type as Media["type"],
  };
  if (!media.type) {
    media.type = determineMediaType(media.src);
  }
  return media;
}

export function getContainedSize(img: HTMLImageElement): HeightWidth {
  const ratio = img.naturalWidth / img.naturalHeight;
  let width = img.height * ratio;
  let height = img.height;
  if (width > img.width) {
    width = img.width;
    height = img.width / ratio;
  }
  return { width, height };
}

export function parseBoundingBoxes(unparsedBbox: string): BoundingBox[] {
  try {
    const bboxes = JSON.parse(unparsedBbox);
    return bboxes
      .map((bbox: any) => ({
        xmin: bbox.xmin,
        ymin: bbox.ymin,
        xmax: bbox.xmax,
        ymax: bbox.ymax,
        color: bbox.color,
        label: bbox.label,
      }))
      .filter((bbox: BoundingBox) =>
        !isNaN(bbox.xmin) && !isNaN(bbox.ymin) && !isNaN(bbox.xmax) && !isNaN(bbox.ymax)
      );
  } catch {
    return [];
  }
}

export function getNextMedia(mediaList: Media[], currentIndex: number): Media | null {
  const idx = mediaList.findIndex((m) => m.index === currentIndex);
  return idx === -1 || idx >= mediaList.length - 1 ? null : mediaList[idx + 1];
}

export function getPreviousMedia(mediaList: Media[], currentIndex: number): Media | null {
  const idx = mediaList.findIndex((m) => m.index === currentIndex);
  return idx <= 0 ? null : mediaList[idx - 1];
}

export function rotateImage(
  base64Image: string,
  degrees: number,
  callback: (src: string, width: number, height: number) => void,
): void {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  const image = new Image();

  image.onload = () => {
    if (degrees % 180 === 0) {
      canvas.width = image.width;
      canvas.height = image.height;
    } else {
      canvas.width = image.height;
      canvas.height = image.width;
    }
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();
    callback(canvas.toDataURL(), canvas.width, canvas.height);
  };

  image.src = base64Image;
}

export function isCategorical(data: (string | number | boolean | null)[]): boolean {
  return data.every(
    (value) => typeof value === "string" || value === null || value === undefined,
  );
}
