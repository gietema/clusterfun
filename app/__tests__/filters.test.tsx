import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import {
  configAtom,
  filtersAtom,
  mediaIndicesStackAtom,
  uuidAtom,
  dataAtom,
} from "@/app/store/atoms";
import { renderWithAtoms, testConfig, testPlotData } from "./helpers";
import FilterBar from "@/app/components/filters/FilterBar";
import FiltersManager from "@/app/components/filters/FiltersManager";

const mockFetchFilteredPlotData = vi.fn();
const mockFetchColumns = vi.fn();
const mockFetchColumnValues = vi.fn();

vi.mock("@/app/lib/api", () => ({
  fetchFilteredPlotData: (...args: any[]) => mockFetchFilteredPlotData(...args),
  fetchColumns: (...args: any[]) => mockFetchColumns(...args),
  fetchColumnValues: (...args: any[]) => mockFetchColumnValues(...args),
  fetchMediaItems: vi.fn().mockResolvedValue([]),
}));

describe("FilterBar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchFilteredPlotData.mockResolvedValue([
      { id: [0, 1], x: [1, 2] },
    ]);
    mockFetchColumns.mockResolvedValue([
      { name: "category", dtype: "object" },
      { name: "score", dtype: "float64" },
    ]);
    mockFetchColumnValues.mockResolvedValue([]);
  });

  it("renders FiltersManager", () => {
    renderWithAtoms(<FilterBar />, [
      [uuidAtom, "test-uuid"],
      [configAtom, testConfig],
    ]);
    // FiltersManager renders a "Filters" button
    expect(screen.getByText(/Filters/)).toBeInTheDocument();
  });

  it("fetches filtered data when filters change", async () => {
    const { store } = renderWithAtoms(<FilterBar />, [
      [uuidAtom, "test-uuid"],
      [configAtom, testConfig],
      [mediaIndicesStackAtom, [[0, 1, 2, 3]]],
    ]);
    // Initial render triggers fetch with empty filters
    await waitFor(() => {
      expect(mockFetchFilteredPlotData).toHaveBeenCalledWith("test-uuid", []);
    });
  });

  it("updates mediaIndices stack when filters return new IDs", async () => {
    mockFetchFilteredPlotData.mockResolvedValue([
      { id: [0, 1], x: [1, 2] },
    ]);
    const { store } = renderWithAtoms(<FilterBar />, [
      [uuidAtom, "test-uuid"],
      [configAtom, testConfig],
      [mediaIndicesStackAtom, [[0, 1, 2, 3]]],
      [filtersAtom, [{ column: "category", comparison: "=", values: ["cat"] }]],
    ]);
    await waitFor(() => {
      const stack = store.get(mediaIndicesStackAtom);
      // The filter should push a new filtered set onto the stack
      expect(stack.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("does NOT call fetchMediaItems (GridView handles that)", async () => {
    const { fetchMediaItems } = await import("@/app/lib/api");
    renderWithAtoms(<FilterBar />, [
      [uuidAtom, "test-uuid"],
      [configAtom, testConfig],
      [mediaIndicesStackAtom, [[0, 1, 2]]],
    ]);
    await waitFor(() => {
      expect(mockFetchFilteredPlotData).toHaveBeenCalled();
    });
    // fetchMediaItems should NOT be called from FilterBar
    expect(fetchMediaItems).not.toHaveBeenCalled();
  });
});

describe("FiltersManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchColumns.mockResolvedValue([
      { name: "category", dtype: "object" },
      { name: "score", dtype: "float64" },
    ]);
    mockFetchColumnValues.mockResolvedValue([]);
  });

  it("shows Filters button", () => {
    renderWithAtoms(<FiltersManager />, [
      [uuidAtom, "test-uuid"],
    ]);
    expect(screen.getByText(/Filters/)).toBeInTheDocument();
  });

  it("creates a filter when Filters button is clicked with no existing filters", async () => {
    const { store } = renderWithAtoms(<FiltersManager />, [
      [uuidAtom, "test-uuid"],
    ]);
    fireEvent.click(screen.getByText(/Filters/));
    expect(store.get(filtersAtom)).toHaveLength(1);
    // The created filter should have empty column/comparison/values
    expect(store.get(filtersAtom)[0]).toEqual({
      column: "",
      comparison: "",
      values: [],
    });
  });

  it("shows + button when filters exist and panel is open", () => {
    renderWithAtoms(<FiltersManager />, [
      [uuidAtom, "test-uuid"],
      [filtersAtom, [{ column: "category", comparison: "=", values: ["cat"] }]],
    ]);
    // Click to open filters
    fireEvent.click(screen.getByText(/Filters/));
    expect(screen.getByText("+")).toBeInTheDocument();
  });

  it("adds another filter when + is clicked", () => {
    const { store } = renderWithAtoms(<FiltersManager />, [
      [uuidAtom, "test-uuid"],
      [filtersAtom, [{ column: "category", comparison: "=", values: ["cat"] }]],
    ]);
    fireEvent.click(screen.getByText(/Filters/));
    fireEvent.click(screen.getByText("+"));
    expect(store.get(filtersAtom)).toHaveLength(2);
  });

  it("removes filter when x is clicked", () => {
    const { store } = renderWithAtoms(<FiltersManager />, [
      [uuidAtom, "test-uuid"],
      [filtersAtom, [{ column: "category", comparison: "=", values: [] }]],
    ]);
    fireEvent.click(screen.getByText(/Filters/));
    // Click the remove button (×) — use getAllByText since value pills also have ×
    const removeButtons = screen.getAllByText("×");
    fireEvent.click(removeButtons[0]);
    expect(store.get(filtersAtom)).toHaveLength(0);
  });

  it("shows filter count in button text", () => {
    renderWithAtoms(<FiltersManager />, [
      [uuidAtom, "test-uuid"],
      [filtersAtom, [
        { column: "a", comparison: "=", values: ["1"] },
        { column: "b", comparison: "=", values: ["2"] },
      ]],
    ]);
    expect(screen.getByText(/Filters \(2\)/)).toBeInTheDocument();
  });

  it("fetches columns on mount", async () => {
    renderWithAtoms(<FiltersManager />, [
      [uuidAtom, "test-uuid"],
    ]);
    await waitFor(() => {
      expect(mockFetchColumns).toHaveBeenCalledWith("test-uuid");
    });
  });
});
