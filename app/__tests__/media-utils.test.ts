import { describe, it, expect } from "vitest";
import {
  determineMediaType,
  createMedia,
  parseBoundingBoxes,
  getNextMedia,
  getPreviousMedia,
  isCategorical,
} from "@/app/lib/media-utils";
import { makeMedia } from "./helpers";

describe("determineMediaType", () => {
  it("identifies image extensions", () => {
    expect(determineMediaType("photo.jpg")).toBe("image");
    expect(determineMediaType("photo.jpeg")).toBe("image");
    expect(determineMediaType("photo.png")).toBe("image");
    expect(determineMediaType("photo.gif")).toBe("image");
    expect(determineMediaType("photo.bmp")).toBe("image");
    expect(determineMediaType("photo.tiff")).toBe("image");
  });

  it("identifies audio extensions", () => {
    expect(determineMediaType("song.mp3")).toBe("audio");
    expect(determineMediaType("song.wav")).toBe("audio");
    expect(determineMediaType("song.ogg")).toBe("audio");
    expect(determineMediaType("song.flac")).toBe("audio");
  });

  it("handles URLs with query params", () => {
    expect(determineMediaType("photo.jpg?token=abc")).toBe("image");
    expect(determineMediaType("song.mp3?v=2")).toBe("audio");
  });

  it("defaults to image for unknown extensions", () => {
    expect(determineMediaType("file.xyz")).toBe("image");
    expect(determineMediaType("noextension")).toBe("image");
  });
});

describe("createMedia", () => {
  it("creates media from raw data", () => {
    const raw = {
      index: 5,
      src: "/media/img.jpg",
      information: { score: 0.5 },
      height: 100,
      width: 200,
      labels: ["good"],
    };
    const media = createMedia(raw);
    expect(media.index).toBe(5);
    expect(media.src).toBe("/media/img.jpg");
    expect(media.information).toEqual({ score: 0.5 });
    expect(media.type).toBe("image");
    expect(media.labels).toEqual(["good"]);
  });

  it("determines type from src when not provided", () => {
    const media = createMedia({ index: 0, src: "/song.mp3" });
    expect(media.type).toBe("audio");
  });

  it("uses explicit type when provided", () => {
    const media = createMedia({ index: 0, src: "/file.xyz", type: "audio" });
    expect(media.type).toBe("audio");
  });
});

describe("parseBoundingBoxes", () => {
  it("parses valid bounding box JSON", () => {
    const json = JSON.stringify([
      { xmin: 10, ymin: 20, xmax: 100, ymax: 200, label: "cat" },
    ]);
    const boxes = parseBoundingBoxes(json);
    expect(boxes).toHaveLength(1);
    expect(boxes[0].xmin).toBe(10);
    expect(boxes[0].label).toBe("cat");
  });

  it("handles multiple boxes", () => {
    const json = JSON.stringify([
      { xmin: 0, ymin: 0, xmax: 50, ymax: 50 },
      { xmin: 60, ymin: 60, xmax: 100, ymax: 100, color: "red" },
    ]);
    const boxes = parseBoundingBoxes(json);
    expect(boxes).toHaveLength(2);
    expect(boxes[1].color).toBe("red");
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseBoundingBoxes("not json")).toEqual([]);
  });

  it("filters out boxes with NaN coordinates", () => {
    const json = '[{"xmin":"abc","ymin":0,"xmax":50,"ymax":50},{"xmin":10,"ymin":20,"xmax":30,"ymax":40}]';
    const boxes = parseBoundingBoxes(json);
    // First box has xmin="abc" which isNaN("abc") === true, so it gets filtered out
    expect(boxes).toHaveLength(1);
    expect(boxes[0].xmin).toBe(10);
  });
});

describe("getNextMedia / getPreviousMedia", () => {
  const list = [
    makeMedia({ index: 10 }),
    makeMedia({ index: 20 }),
    makeMedia({ index: 30 }),
  ];

  it("getNextMedia returns next item", () => {
    const next = getNextMedia(list, 10);
    expect(next?.index).toBe(20);
  });

  it("getNextMedia returns null at end", () => {
    expect(getNextMedia(list, 30)).toBeNull();
  });

  it("getNextMedia returns null for unknown index", () => {
    expect(getNextMedia(list, 99)).toBeNull();
  });

  it("getPreviousMedia returns previous item", () => {
    const prev = getPreviousMedia(list, 20);
    expect(prev?.index).toBe(10);
  });

  it("getPreviousMedia returns null at start", () => {
    expect(getPreviousMedia(list, 10)).toBeNull();
  });

  it("getPreviousMedia returns null for unknown index", () => {
    expect(getPreviousMedia(list, 99)).toBeNull();
  });
});

describe("isCategorical", () => {
  it("returns true for all strings", () => {
    expect(isCategorical(["a", "b", "c"])).toBe(true);
  });

  it("returns true for strings with nulls", () => {
    expect(isCategorical(["a", null, "c"])).toBe(true);
  });

  it("returns false for numbers", () => {
    expect(isCategorical([1, 2, 3])).toBe(false);
  });

  it("returns false for mixed types", () => {
    expect(isCategorical(["a", 1, "c"])).toBe(false);
  });

  it("returns true for empty array", () => {
    expect(isCategorical([])).toBe(true);
  });
});
