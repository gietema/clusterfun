import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import {
  configAtom,
  mediaIndicesStackAtom,
  mediaItemsAtom,
  uuidAtom,
  mediaAtom,
} from "@/app/store/atoms";
import { renderWithAtoms, makeMedia, makeMediaList, testConfig } from "./helpers";
import GridView from "@/app/components/grid/GridView";

// Mock API calls
vi.mock("@/app/lib/api", () => ({
  fetchMediaItems: vi.fn().mockResolvedValue([]),
  downloadGridCsv: vi.fn().mockResolvedValue(new Blob(["csv"])),
  saveLabel: vi.fn().mockResolvedValue(undefined),
  deleteLabel: vi.fn().mockResolvedValue(undefined),
  fetchColumns: vi.fn().mockResolvedValue([]),
  fetchColumnValues: vi.fn().mockResolvedValue([]),
  fetchFilteredPlotData: vi.fn().mockResolvedValue([]),
  fetchLabelCounts: vi.fn().mockResolvedValue([]),
  fetchMedia: vi.fn().mockResolvedValue({
    index: 0,
    src: "/media/img_0.jpg",
    information: {},
    type: "image",
  }),
  fetchMediaThumbnails: vi.fn().mockResolvedValue([]),
  saveView: vi.fn().mockResolvedValue({ uuid: "new-uuid" }),
  downloadLabelCsv: vi.fn().mockResolvedValue(new Blob()),
  fetchAllLabels: vi.fn().mockResolvedValue({}),
  fetchSimilar: vi.fn().mockResolvedValue([]),
}));

// Mock PreviewMedia
vi.mock("@/app/components/shared/PreviewMedia", () => ({
  default: ({ media }: any) => (
    <div data-testid="preview-media">{media?.src}</div>
  ),
}));

// Mock Plotly
vi.mock("@/app/lib/PlotlyChart", () => ({
  default: () => <div data-testid="plotly-chart" />,
}));

// Mock file-saver
vi.mock("file-saver", () => ({
  saveAs: vi.fn(),
}));

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), {
    custom: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

const { fetchMediaItems, saveLabel, deleteLabel } = await import("@/app/lib/api");

describe("GridView", () => {
  const onBack = vi.fn();
  const mediaItems = makeMediaList(5);

  beforeEach(() => {
    vi.clearAllMocks();
    (fetchMediaItems as ReturnType<typeof vi.fn>).mockResolvedValue(mediaItems);
  });

  function renderGrid(extraAtoms: [any, any][] = []) {
    return renderWithAtoms(<GridView onBack={onBack} />, [
      [uuidAtom, "test-uuid"],
      [configAtom, testConfig],
      [mediaIndicesStackAtom, [[0, 1, 2, 3, 4]]],
      [mediaItemsAtom, mediaItems],
      ...extraAtoms,
    ]);
  }

  it("renders media items in grid", () => {
    renderGrid();
    const previews = screen.getAllByTestId("preview-media");
    expect(previews).toHaveLength(5);
  });

  it("shows item count", () => {
    renderGrid();
    expect(screen.getByText("5 items")).toBeInTheDocument();
  });

  it("shows item count for filtered subset", () => {
    // Two levels in the stack = filtered subset
    renderGrid([[mediaIndicesStackAtom, [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [0, 1, 2, 3, 4]]]]);
    expect(screen.getByText("5 items")).toBeInTheDocument();
  });

  it("shows items count at base level", () => {
    renderGrid();
    expect(screen.getByText("5 items")).toBeInTheDocument();
  });

  it("fetches media items on mount", async () => {
    renderGrid();
    await waitFor(() => {
      expect(fetchMediaItems).toHaveBeenCalledWith(
        "test-uuid",
        [0, 1, 2, 3, 4],
        0,
        undefined,
        true,
      );
    });
  });

  it("updates sidebar media on hover", () => {
    const { store } = renderGrid();
    const previews = screen.getAllByTestId("preview-media");
    const gridItem = previews[0].closest("[tabindex]");
    expect(gridItem).toBeTruthy();
    fireEvent.mouseEnter(gridItem!);
    const sideMedia = store.get(mediaAtom);
    expect(sideMedia).toBeTruthy();
    expect(sideMedia?.index).toBe(0);
  });

  it("toggles label via keyboard on focused grid item", async () => {
    renderGrid();
    const gridItems = screen.getAllByTestId("preview-media");
    const firstItem = gridItems[0].closest("[tabindex]");
    expect(firstItem).toBeTruthy();
    fireEvent.mouseEnter(firstItem!);
    fireEvent.keyDown(firstItem!, { key: "1" });
    await waitFor(() => {
      expect(saveLabel).toHaveBeenCalledWith("test-uuid", [0], "good");
    });
  });

  it("calls deleteLabel when removing an existing label", async () => {
    const itemsWithLabel = mediaItems.map((m, i) =>
      i === 0 ? { ...m, labels: ["good"] } : m,
    );
    (fetchMediaItems as ReturnType<typeof vi.fn>).mockResolvedValue(itemsWithLabel);
    renderWithAtoms(<GridView onBack={onBack} />, [
      [uuidAtom, "test-uuid"],
      [configAtom, testConfig],
      [mediaIndicesStackAtom, [[0, 1, 2, 3, 4]]],
      [mediaItemsAtom, itemsWithLabel],
    ]);

    const gridItems = screen.getAllByTestId("preview-media");
    const firstItem = gridItems[0].closest("[tabindex]");
    fireEvent.mouseEnter(firstItem!);
    fireEvent.keyDown(firstItem!, { key: "1" });
    await waitFor(() => {
      expect(deleteLabel).toHaveBeenCalledWith("test-uuid", [0], "good");
    });
  });

  it("calls onBack on Escape key for filtered subset", () => {
    renderGrid([[mediaIndicesStackAtom, [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [0, 1, 2, 3, 4]]]]);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onBack).toHaveBeenCalled();
  });

  it("does not call onBack on Escape when at base level", () => {
    renderGrid();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("handles pagination next", async () => {
    const manyIndices = Array.from({ length: 100 }, (_, i) => i);
    renderWithAtoms(<GridView onBack={onBack} />, [
      [uuidAtom, "test-uuid"],
      [configAtom, testConfig],
      [mediaIndicesStackAtom, [manyIndices]],
      [mediaItemsAtom, mediaItems],
    ]);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    const paginationArea = screen.getByText("1 / 3").closest(".flex")!;
    const paginationButtons = paginationArea.querySelectorAll("button");
    fireEvent.click(paginationButtons[paginationButtons.length - 1]); // Next button (last button)
    await waitFor(() => {
      expect(fetchMediaItems).toHaveBeenCalledWith(
        "test-uuid",
        manyIndices,
        1,
        undefined,
        true,
      );
    });
  });

  it("shows labels section in sidebar by default", () => {
    renderGrid();
    // Labels section is always visible in sidebar (not behind a toggle)
    expect(screen.getByText("Labels")).toBeInTheDocument();
  });

  it("toggling label via click on label checkbox calls saveLabel", async () => {
    renderGrid();
    const goodLabels = screen.getAllByText("good");
    const labelCheckbox = goodLabels[0].closest("label");
    if (labelCheckbox) {
      fireEvent.click(labelCheckbox);
      await waitFor(() => {
        expect(saveLabel).toHaveBeenCalled();
      });
    }
  });
});
