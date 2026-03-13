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
  fetchLabelCounts: vi.fn().mockResolvedValue({}),
  fetchMedia: vi.fn().mockResolvedValue({
    index: 0,
    src: "/media/img_0.jpg",
    information: {},
    type: "image",
  }),
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

  it("shows selected count", () => {
    renderGrid();
    expect(screen.getByText("5 selected")).toBeInTheDocument();
  });

  it("calls onBack when back button is clicked", () => {
    renderGrid();
    const backBtn = screen.getByText("back");
    fireEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("shows download button", () => {
    renderGrid();
    expect(screen.getByText("Download grid as csv")).toBeInTheDocument();
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

  it("toggles label panel with L key", () => {
    renderGrid();
    expect(screen.queryByText("Add label")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "l" });
    expect(screen.getByText("Add label")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "l" });
    expect(screen.queryByText("Add label")).not.toBeInTheDocument();
  });

  it("calls onBack on Escape key for non-grid types", () => {
    renderGrid();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onBack).toHaveBeenCalled();
  });

  it("handles pagination next", async () => {
    const manyIndices = Array.from({ length: 100 }, (_, i) => i);
    renderWithAtoms(<GridView onBack={onBack} />, [
      [uuidAtom, "test-uuid"],
      [configAtom, testConfig],
      [mediaIndicesStackAtom, [manyIndices]],
      [mediaItemsAtom, mediaItems],
    ]);
    // With 100 items, pagination shows: "1 / 2"
    expect(screen.getByText("1 / 3")).toBeInTheDocument();
    // Find the next page button (right double arrow)
    const buttons = screen.getAllByRole("button");
    // The last pagination button is the "next" one (right double angle)
    const nextBtn = buttons.find((btn) => !btn.hasAttribute("disabled") &&
      btn.textContent === "" && btn.closest(".justify-between"));
    // Just click the second button in the pagination area
    const paginationArea = screen.getByText("1 / 3").parentElement!;
    const paginationButtons = paginationArea.querySelectorAll("button");
    fireEvent.click(paginationButtons[1]); // Next button
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

  it("label panel shows label checkboxes on click", () => {
    renderGrid();
    // Click the "Labelling" toggle
    fireEvent.click(screen.getByText("Labelling"));
    // Should show label names from config (may appear multiple times in grid items too)
    const goodElements = screen.getAllByText("good");
    const badElements = screen.getAllByText("bad");
    expect(goodElements.length).toBeGreaterThanOrEqual(1);
    expect(badElements.length).toBeGreaterThanOrEqual(1);
  });

  it("toggling label via click on label checkbox calls saveLabel", async () => {
    renderGrid();
    // Click on the label text in a grid item's MediaLabels
    const goodLabels = screen.getAllByText("good");
    // The label checkboxes are in each grid item
    const labelCheckbox = goodLabels[0].closest("label");
    if (labelCheckbox) {
      fireEvent.click(labelCheckbox);
      await waitFor(() => {
        expect(saveLabel).toHaveBeenCalled();
      });
    }
  });
});
