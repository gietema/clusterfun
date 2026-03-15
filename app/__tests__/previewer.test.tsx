import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import {
  configAtom,
  dataAtom,
  mediaIndicesStackAtom,
  showPageAtom,
  uuidAtom,
  mediaAtom,
  mediaIndexAtom,
} from "@/app/store/atoms";
import { renderWithAtoms, testConfig, testGridConfig, testPlotData, makeMedia } from "./helpers";
import Previewer from "@/app/components/Previewer";

const mockFetchUuid = vi.fn().mockResolvedValue("uuid-1");
const mockFetchPlotData = vi.fn().mockResolvedValue({
  config: testConfig,
  data: testPlotData,
});
const mockFetchFilteredPlotData = vi.fn().mockResolvedValue([
  { id: [0, 1, 2], x: [1, 2, 3] },
]);
const mockFetchMedia = vi.fn().mockResolvedValue(makeMedia());
const mockFetchMediaItems = vi.fn().mockResolvedValue([]);
const mockFetchColumns = vi.fn().mockResolvedValue([]);

vi.mock("@/app/lib/api", () => ({
  fetchUuid: (...args: any[]) => mockFetchUuid(...args),
  fetchPlotData: (...args: any[]) => mockFetchPlotData(...args),
  fetchFilteredPlotData: (...args: any[]) => mockFetchFilteredPlotData(...args),
  fetchMedia: (...args: any[]) => mockFetchMedia(...args),
  fetchMediaItems: (...args: any[]) => mockFetchMediaItems(...args),
  fetchColumns: (...args: any[]) => mockFetchColumns(...args),
  saveLabel: vi.fn().mockResolvedValue(undefined),
  deleteLabel: vi.fn().mockResolvedValue(undefined),
  fetchLabelCounts: vi.fn().mockResolvedValue([]),
  downloadLabelCsv: vi.fn().mockResolvedValue(new Blob()),
  saveLabelAsGrid: vi.fn().mockResolvedValue(""),
  downloadGridCsv: vi.fn().mockResolvedValue(new Blob()),
  fetchMediaThumbnails: vi.fn().mockResolvedValue([]),
  fetchAllLabels: vi.fn().mockResolvedValue({}),
  saveView: vi.fn().mockResolvedValue({ uuid: "new-uuid" }),
  fetchSimilar: vi.fn().mockResolvedValue([]),
  fetchSimilarVector: vi.fn().mockResolvedValue([]),
}));

// Mock PreviewMedia
vi.mock("@/app/components/shared/PreviewMedia", () => ({
  default: ({ media }: any) => (
    <div data-testid="preview-media">{media?.src}</div>
  ),
}));

// Mock PlotlyChart since Plotly can't render in jsdom
vi.mock("@/app/components/plot/PlotlyChart", () => ({
  default: ({ onHover, onClick, onSelect }: any) => (
    <div data-testid="plotly-chart">
      <button data-testid="hover-point" onClick={() => onHover(0)}>hover</button>
      <button data-testid="click-point" onClick={() => onClick(0)}>click</button>
      <button data-testid="select-points" onClick={() => onSelect([0, 1, 2])}>select</button>
    </div>
  ),
}));

// Mock file-saver
vi.mock("file-saver", () => ({ saveAs: vi.fn() }));

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    custom: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

// Mock use-url-state (it touches window.location)
vi.mock("@/app/lib/use-url-state", () => ({
  useUrlState: vi.fn(),
}));

describe("Previewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchPlotData.mockResolvedValue({
      config: testConfig,
      data: testPlotData,
    });
  });

  it("fetches UUID when prop is 'recent'", async () => {
    renderWithAtoms(<Previewer uuidProp="recent" />);
    await waitFor(() => {
      expect(mockFetchUuid).toHaveBeenCalled();
    });
  });

  it("uses provided UUID directly", async () => {
    const { store } = renderWithAtoms(<Previewer uuidProp="my-uuid" />);
    await waitFor(() => {
      expect(store.get(uuidAtom)).toBe("my-uuid");
    });
  });

  it("loads plot data on mount", async () => {
    renderWithAtoms(<Previewer uuidProp="uuid-1" />);
    await waitFor(() => {
      expect(mockFetchPlotData).toHaveBeenCalledWith("uuid-1");
    });
  });

  it("shows plot page by default", async () => {
    renderWithAtoms(<Previewer uuidProp="uuid-1" />);
    await waitFor(() => {
      expect(screen.getByTestId("plotly-chart")).toBeInTheDocument();
    });
  });

  it("transitions to grid view on point selection", async () => {
    const { store } = renderWithAtoms(<Previewer uuidProp="uuid-1" />, [
      [configAtom, testConfig],
      [dataAtom, testPlotData],
    ]);
    await waitFor(() => {
      expect(screen.getByTestId("select-points")).toBeInTheDocument();
    });
    screen.getByTestId("select-points").click();
    await waitFor(() => {
      expect(store.get(showPageAtom)).toBe("grid");
    });
  });

  it("pushes indices to stack on selection", async () => {
    const { store } = renderWithAtoms(<Previewer uuidProp="uuid-1" />, [
      [configAtom, testConfig],
      [dataAtom, testPlotData],
    ]);
    await waitFor(() => {
      expect(screen.getByTestId("select-points")).toBeInTheDocument();
    });
    screen.getByTestId("select-points").click();
    const stack = store.get(mediaIndicesStackAtom);
    expect(stack[stack.length - 1]).toEqual([0, 1, 2]);
  });

  it("starts in grid view for grid-type configs", async () => {
    mockFetchPlotData.mockResolvedValue({
      config: testGridConfig,
      data: testPlotData,
    });
    const { store } = renderWithAtoms(<Previewer uuidProp="uuid-1" />);
    await waitFor(() => {
      expect(store.get(showPageAtom)).toBe("grid");
    });
  });

  it("fetches filtered plot data for grid configs", async () => {
    mockFetchPlotData.mockResolvedValue({
      config: testGridConfig,
      data: testPlotData,
    });
    renderWithAtoms(<Previewer uuidProp="uuid-1" />);
    await waitFor(() => {
      expect(mockFetchFilteredPlotData).toHaveBeenCalled();
    });
  });

  it("deep-links to media page when URL has media index", async () => {
    mockFetchPlotData.mockResolvedValue({
      config: testConfig,
      data: testPlotData,
    });
    const { store } = renderWithAtoms(<Previewer uuidProp="uuid-1" />, [
      [showPageAtom, "media"],
      [mediaIndexAtom, 5],
    ]);
    await waitFor(() => {
      expect(mockFetchMedia).toHaveBeenCalledWith("uuid-1", 5, true);
    });
  });
});
