export type MediaType = "image" | "video" | "audio";

interface MediaParams {
  index: number;
  src: string;
  information?: any[];
  width?: number;
  height?: number;
  type?: MediaType;
  labels?: string[];
}
export class Media {
  index: number;
  src: string;
  information?: any[];
  width?: number;
  height?: number;
  type?: MediaType;
  labels?: string[];

  constructor(params: MediaParams) {
    this.index = params.index;
    this.src = params.src;
    this.information = params.information;
    this.height = params.height;
    this.width = params.width;
    this.labels = params.labels;
    this.type = params.type;
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
