export type MediaType = "image" | "video" | "audio";

export class Media {
  index: number;
  src: string;
  information?: any[];
  width?: number;
  height?: number;
  type?: MediaType;
  labels?: string[];

  constructor(
    index: number,
    src: string,
    information?: any[],
    height?: number,
    width?: number,
    type?: MediaType,
    labels?: string[],
  ) {
    this.index = index;
    this.src = src;
    this.information = information;
    this.height = height;
    this.width = width;
    this.labels = labels;
    this.type = type;
    if (this.type === undefined) {
      this.type = determineMediaType(this.src);
    }
  }
}

function determineMediaType(filename: string): MediaType | undefined {
  const imageExtensions = new Set([
    "jpg",
    "jpeg",
    "png",
    "gif",
    "bmp",
    "tif",
    "tiff",
  ]);
  const audioExtensions = new Set([
    "mp3",
    "wav",
    "aac",
    "ogg",
    "flac",
    "wma",
    "m4a",
    "aiff",
    "midi",
    "ape",
    "wavpack",
    "alac",
    "ac3",
    "opus",
  ]);

  const parts = filename.split(".");
  let extension = parts.pop();
  // remove ? part which can be part of S3 signed url
  if (extension && extension.includes("?")) {
    extension = extension.split("?")[0];
  }

  if (extension) {
    const lowerCaseExtension = extension.toLowerCase();

    if (imageExtensions.has(lowerCaseExtension)) {
      return "image";
    } else if (audioExtensions.has(lowerCaseExtension)) {
      return "audio";
    }
  }
  // default to image for now.
  return "image";
}
