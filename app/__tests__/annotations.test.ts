import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import {
  fetchAnnotations,
  saveAnnotations,
  deleteAnnotation,
  exportAnnotations,
} from "@/app/lib/api";

vi.mock("axios");

const mockedAxios = vi.mocked(axios, true);

beforeEach(() => {
  vi.clearAllMocks();
});

const RECT_ANN = {
  id: "ann_1",
  type: "rectangle" as const,
  label: "car",
  color: "#ff0000",
  data: { xmin: 10, ymin: 20, xmax: 100, ymax: 200 },
};

const POLY_ANN = {
  id: "ann_2",
  type: "polygon" as const,
  label: "tree",
  color: "#00ff00",
  data: { points: [[10, 10], [50, 10], [50, 50], [10, 50]] as [number, number][] },
};

describe("fetchAnnotations", () => {
  it("fetches annotations for a media item", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [RECT_ANN, POLY_ANN] });
    const result = await fetchAnnotations("uuid-1", 5);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("ann_1");
    expect(result[1].type).toBe("polygon");
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining("/views/uuid-1/annotations/5"),
    );
  });

  it("returns empty array when no annotations exist", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: [] });
    const result = await fetchAnnotations("uuid-1", 0);
    expect(result).toEqual([]);
  });
});

describe("saveAnnotations", () => {
  it("posts annotations with media_id", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: "OK" });
    await saveAnnotations("uuid-1", 5, [RECT_ANN]);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/views/uuid-1/annotations"),
      {
        media_id: 5,
        annotations: [RECT_ANN],
      },
    );
  });

  it("can save empty annotation list", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: "OK" });
    await saveAnnotations("uuid-1", 0, []);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ media_id: 0, annotations: [] }),
    );
  });
});

describe("deleteAnnotation", () => {
  it("sends DELETE with media_id and annotation_id", async () => {
    mockedAxios.delete.mockResolvedValueOnce({ data: "OK" });
    await deleteAnnotation("uuid-1", 5, "ann_1");
    expect(mockedAxios.delete).toHaveBeenCalledWith(
      expect.stringContaining("/views/uuid-1/annotations"),
      {
        data: { media_id: 5, annotation_id: "ann_1" },
      },
    );
  });
});

describe("exportAnnotations", () => {
  it("exports all annotations when no media_ids specified", async () => {
    const exported = [
      { media_id: 0, ...RECT_ANN },
      { media_id: 1, ...POLY_ANN },
    ];
    mockedAxios.post.mockResolvedValueOnce({ data: exported });
    const result = await exportAnnotations("uuid-1");
    expect(result).toHaveLength(2);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/annotations/export"),
      { media_ids: null },
    );
  });

  it("exports filtered by media_ids", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: [{ media_id: 1, ...POLY_ANN }] });
    const result = await exportAnnotations("uuid-1", [1]);
    expect(result).toHaveLength(1);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/annotations/export"),
      { media_ids: [1] },
    );
  });
});
