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
      { name: "category", dtype: "object", n_unique: 5 },
      { name: "score", dtype: "float64", n_unique: 100 },
    ]);
    mockFetchColumnValues.mockResolvedValue([]);
  });

  it("renders FiltersManager with Filter button", () => {
    renderWithAtoms(<FilterBar />, [
      [uuidAtom, "test-uuid"],
      [configAtom, testConfig],
    ]);
    expect(screen.getByText("Filter")).toBeInTheDocument();
  });

  it("fetches filtered data when filters change", async () => {
    renderWithAtoms(<FilterBar />, [
      [uuidAtom, "test-uuid"],
      [configAtom, testConfig],
      [mediaIndicesStackAtom, [[0, 1, 2, 3]]],
    ]);
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
    expect(fetchMediaItems).not.toHaveBeenCalled();
  });
});

describe("FiltersManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchColumns.mockResolvedValue([
      { name: "category", dtype: "object", n_unique: 5 },
      { name: "score", dtype: "float64", n_unique: 100 },
    ]);
    mockFetchColumnValues.mockResolvedValue([]);
  });

  it("shows Filter button", () => {
    renderWithAtoms(<FiltersManager />, [
      [uuidAtom, "test-uuid"],
    ]);
    expect(screen.getByText("Filter")).toBeInTheDocument();
  });

  it("creates a filter when Filter button is clicked with no existing filters", async () => {
    const { store } = renderWithAtoms(<FiltersManager />, [
      [uuidAtom, "test-uuid"],
    ]);
    fireEvent.click(screen.getByText("Filter"));
    expect(store.get(filtersAtom)).toHaveLength(1);
    expect(store.get(filtersAtom)[0]).toEqual({
      column: "",
      comparison: "=",
      values: [],
    });
  });

  it("shows Add filter button when panel is open", () => {
    renderWithAtoms(<FiltersManager />, [
      [uuidAtom, "test-uuid"],
      [filtersAtom, [{ column: "category", comparison: "=", values: ["cat"] }]],
    ]);
    fireEvent.click(screen.getByText(/Filters/));
    expect(screen.getByText("Add filter")).toBeInTheDocument();
  });

  it("adds another filter when Add filter is clicked", () => {
    const { store } = renderWithAtoms(<FiltersManager />, [
      [uuidAtom, "test-uuid"],
      [filtersAtom, [{ column: "category", comparison: "=", values: ["cat"] }]],
    ]);
    fireEvent.click(screen.getByText(/Filters/));
    fireEvent.click(screen.getByText("Add filter"));
    expect(store.get(filtersAtom)).toHaveLength(2);
  });

  it("removes filter when remove button is clicked", () => {
    const { store } = renderWithAtoms(<FiltersManager />, [
      [uuidAtom, "test-uuid"],
      [filtersAtom, [{ column: "category", comparison: "=", values: [] }]],
    ]);
    fireEvent.click(screen.getByText("Filter"));
    const removeBtn = screen.getByTitle("Remove filter");
    fireEvent.click(removeBtn);
    expect(store.get(filtersAtom)).toHaveLength(0);
  });

  it("shows filter count in button text for complete filters", () => {
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
