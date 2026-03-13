import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import {
  fetchUuid,
  fetchPlotData,
  fetchFilteredPlotData,
  fetchMedia,
  fetchMediaItems,
  fetchMediaMetadata,
  fetchColumns,
  fetchColumnValues,
  fetchColumnStats,
  saveLabel,
  deleteLabel,
  fetchLabelCounts,
  downloadLabelCsv,
  saveLabelAsGrid,
  downloadGridCsv,
} from "@/app/lib/api";

vi.mock("axios");

const mockedAxios = vi.mocked(axios, true);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("fetchUuid", () => {
  it("returns the uuid from the API", async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: "abc-123" });
    const uuid = await fetchUuid();
    expect(uuid).toBe("abc-123");
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining("/uuid"));
  });
});

describe("fetchPlotData", () => {
  it("returns config and data", async () => {
    const mockResponse = {
      config: { type: "scatter", columns: ["id", "src"] },
      data: [{ id: [1, 2], x: [1, 2], y: [3, 4] }],
    };
    mockedAxios.get.mockResolvedValueOnce({ data: mockResponse });
    const result = await fetchPlotData("uuid-1");
    expect(result.config.type).toBe("scatter");
    expect(result.data).toHaveLength(1);
    expect(mockedAxios.get).toHaveBeenCalledWith(expect.stringContaining("/views/uuid-1"));
  });
});

describe("fetchFilteredPlotData", () => {
  it("posts filters and returns traces", async () => {
    const traces = [{ id: [1, 2], x: [1, 2] }];
    mockedAxios.post.mockResolvedValueOnce({ data: traces });
    const filters = [{ column: "cat", comparison: "=", values: ["a"] }];
    const result = await fetchFilteredPlotData("uuid-1", filters);
    expect(result).toEqual(traces);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/views/uuid-1/filter"),
      filters,
    );
  });
});

describe("fetchMedia", () => {
  it("fetches media without base64 by default", async () => {
    const mockMedia = { index: 5, src: "/media/img.jpg", information: { score: 0.5 } };
    mockedAxios.get.mockResolvedValueOnce({ data: mockMedia });
    const media = await fetchMedia("uuid-1", 5);
    expect(media.index).toBe(5);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining("as_base64=false"),
    );
  });

  it("fetches media with base64 when requested", async () => {
    const mockMedia = { index: 5, src: "data:image/png;base64,abc", information: {} };
    mockedAxios.get.mockResolvedValueOnce({ data: mockMedia });
    await fetchMedia("uuid-1", 5, true);
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining("as_base64=true"),
    );
  });
});

describe("fetchMediaItems", () => {
  it("sends correct payload with pagination and sort", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: [
        { index: 0, src: "/img0.jpg", information: {} },
        { index: 1, src: "/img1.jpg", information: {} },
      ],
    });
    const result = await fetchMediaItems("uuid-1", [0, 1, 2], 2, "score", false);
    expect(result).toHaveLength(2);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/views/uuid-1/media"),
      {
        media_ids: [0, 1, 2],
        page: 2,
        sort_column: "score",
        ascending: false,
        filters: null,
      },
    );
  });

  it("uses defaults for optional params", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: [] });
    await fetchMediaItems("uuid-1", [0]);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        page: 0,
        sort_column: null,
        ascending: null,
        filters: null,
      }),
    );
  });
});

describe("fetchMediaMetadata", () => {
  it("posts media ids and returns metadata", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: [{ index: 0, information: { score: 0.5 } }],
    });
    const result = await fetchMediaMetadata("uuid-1", [0]);
    expect(result).toHaveLength(1);
    expect(result[0].information).toEqual({ score: 0.5 });
  });
});

describe("fetchColumns", () => {
  it("returns column info", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: [
        { name: "id", dtype: "int64" },
        { name: "score", dtype: "float64" },
      ],
    });
    const columns = await fetchColumns("uuid-1");
    expect(columns).toHaveLength(2);
    expect(columns[0].name).toBe("id");
  });
});

describe("fetchColumnValues", () => {
  it("posts column name and media ids", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: [
        { label: "cat", count: 10 },
        { label: "dog", count: 5 },
      ],
    });
    const values = await fetchColumnValues("uuid-1", "category", [0, 1, 2]);
    expect(values).toHaveLength(2);
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/columns/category/values"),
      { media_ids: [0, 1, 2] },
    );
  });
});

describe("fetchColumnStats", () => {
  it("sends column and media ids", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { type: "categorical", data: [{ label: "a", count: 5 }] },
    });
    const stats = await fetchColumnStats("uuid-1", [0, 1], "category");
    expect(stats.type).toBe("categorical");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/column-stats"),
      { media_ids: [0, 1], column: "category" },
    );
  });
});

describe("label operations", () => {
  it("saveLabel posts label and media indices", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: null });
    await saveLabel("uuid-1", [0, 1], "good");
    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.stringContaining("/label"),
      { label: { title: "good" }, media_indices: { media_ids: [0, 1] } },
    );
  });

  it("deleteLabel sends DELETE with data body", async () => {
    mockedAxios.delete.mockResolvedValueOnce({ data: null });
    await deleteLabel("uuid-1", [0], "bad");
    expect(mockedAxios.delete).toHaveBeenCalledWith(
      expect.stringContaining("/label"),
      {
        data: { label: { title: "bad" }, media_indices: { media_ids: [0] } },
      },
    );
  });

  it("fetchLabelCounts returns label counts", async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: [{ label: "good", inCurrentSelection: 3, inEntireDataset: 10 }],
    });
    const counts = await fetchLabelCounts("uuid-1", [0, 1, 2]);
    expect(counts).toHaveLength(1);
    expect(counts[0].inCurrentSelection).toBe(3);
  });

  it("downloadLabelCsv returns a blob", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: "col1,col2\na,b" });
    const blob = await downloadLabelCsv("uuid-1", [0], "good");
    expect(blob).toBeInstanceOf(Blob);
  });

  it("saveLabelAsGrid returns path", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: "/path/to/grid" });
    const path = await saveLabelAsGrid("uuid-1", [0], "good");
    expect(path).toBe("/path/to/grid");
  });
});

describe("downloadGridCsv", () => {
  it("returns csv blob", async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: "id,score\n1,0.5" });
    const blob = await downloadGridCsv("uuid-1", [0, 1]);
    expect(blob).toBeInstanceOf(Blob);
  });
});
