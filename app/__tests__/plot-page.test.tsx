import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import {
  configAtom,
  dataAtom,
  uuidAtom,
  columnsAtom,
  plotPanelsAtom,
  plotPanelDataAtom,
} from "@/app/store/atoms";
import { renderWithAtoms, testConfig, testPlotData } from "./helpers";
import type { PlotPanelConfig, PlotTrace } from "@/app/types";

const mockFetchDynamicPlotData = vi.fn();
const mockFetchColumns = vi.fn();

vi.mock("@/app/lib/api", () => ({
  fetchDynamicPlotData: (...args: any[]) => mockFetchDynamicPlotData(...args),
  fetchColumns: (...args: any[]) => mockFetchColumns(...args),
  fetchFilteredPlotData: vi.fn().mockResolvedValue([]),
  fetchColumnValues: vi.fn().mockResolvedValue([]),
  fetchMediaItems: vi.fn().mockResolvedValue([]),
  fetchMedia: vi.fn().mockResolvedValue(null),
}));

// Mock PlotlyChart to avoid dynamic import issues
vi.mock("@/app/components/plot/PlotlyChart", () => ({
  default: ({ revision, overrideData }: { revision: number; overrideData?: PlotTrace[] }) => (
    <div data-testid="plotly-chart" data-revision={revision} data-has-override={!!overrideData}>
      {overrideData ? `override-${overrideData[0]?.name ?? "unknown"}` : "global-data"}
    </div>
  ),
}));

// Mock ResizableLayout to just render children
vi.mock("@/app/components/shared/ResizableLayout", () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock SideBar
vi.mock("@/app/components/shared/SideBar", () => ({
  default: () => <div data-testid="sidebar" />,
}));

// Import after mocks
import PlotPage from "@/app/components/plot/PlotPage";

const testColumns = [
  { name: "score", dtype: "float64", n_unique: 100 },
  { name: "category", dtype: "object", n_unique: 5 },
];

const panel1: PlotPanelConfig = { id: "p1", type: "scatter", x: "score", y: "category" };
const panel2: PlotPanelConfig = { id: "p2", type: "histogram", x: "score" };

const traceA: PlotTrace[] = [
  { id: [0, 1], x: [1, 2], y: [10, 20], type: "scattergl", mode: "markers", name: "traceA" },
];
const traceB: PlotTrace[] = [
  { id: [0, 1], x: [3, 4], y: [30, 40], type: "scattergl", mode: "markers", name: "traceB" },
];

function renderPlotPage(panels: PlotPanelConfig[] = [panel1, panel2]) {
  return renderWithAtoms(
    <PlotPage onMediaSelect={vi.fn()} />,
    [
      [uuidAtom, "test-uuid"],
      [configAtom, { ...testConfig, type: "scatter", x: "score", y: "category" }],
      [dataAtom, testPlotData],
      [columnsAtom, testColumns],
      [plotPanelsAtom, panels],
      [plotPanelDataAtom, { p1: traceA, p2: traceB }],
    ],
  );
}

describe("PlotPage multi-panel isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchColumns.mockResolvedValue(testColumns);
  });

  it("renders separate charts for each panel", () => {
    renderPlotPage();
    const charts = screen.getAllByTestId("plotly-chart");
    expect(charts).toHaveLength(2);
    // Each chart should show its own override data
    expect(charts[0].textContent).toContain("override-traceA");
    expect(charts[1].textContent).toContain("override-traceB");
  });

  it("only fetches data for the changed panel, not all panels", async () => {
    const newTraceA: PlotTrace[] = [
      { id: [0, 1, 2], x: [1, 2, 3], y: [10, 20, 30], type: "scattergl", mode: "markers", name: "newA" },
    ];
    mockFetchDynamicPlotData.mockResolvedValue({
      data: newTraceA,
      config: { ...testConfig, type: "histogram", x: "score" },
    });

    renderPlotPage();

    // Change panel 1's type — find the first plot type dropdown
    const typeSelects = screen.getAllByRole("combobox");
    // First combobox in each PlotConfigPanel is the type selector
    fireEvent.change(typeSelects[0], { target: { value: "histogram" } });

    await waitFor(() => {
      expect(mockFetchDynamicPlotData).toHaveBeenCalledTimes(1);
    });

    // The API should only be called with panel 1's new config
    expect(mockFetchDynamicPlotData).toHaveBeenCalledWith("test-uuid", expect.objectContaining({
      type: "histogram",
    }));
  });

  it("does not refetch panel 2 when panel 1 changes", async () => {
    mockFetchDynamicPlotData.mockResolvedValue({
      data: traceA,
      config: { ...testConfig },
    });

    renderPlotPage();

    // Change panel 1
    const typeSelects = screen.getAllByRole("combobox");
    fireEvent.change(typeSelects[0], { target: { value: "histogram" } });

    await waitFor(() => {
      expect(mockFetchDynamicPlotData).toHaveBeenCalledTimes(1);
    });

    // Verify panel 2's data is still intact (not refetched)
    const charts = screen.getAllByTestId("plotly-chart");
    expect(charts[1].textContent).toContain("override-traceB");
  });

  it("uses per-panel revision so unchanged panels keep their zoom", () => {
    renderPlotPage();
    const charts = screen.getAllByTestId("plotly-chart");

    // Both panels have override data, so they use panelRevisions (initially 0)
    const rev1 = charts[0].getAttribute("data-revision");
    const rev2 = charts[1].getAttribute("data-revision");
    // Both should start at 0 (no fetches have completed)
    expect(rev1).toBe("0");
    expect(rev2).toBe("0");
  });

  it("only bumps revision for the panel that was updated", async () => {
    mockFetchDynamicPlotData.mockResolvedValue({
      data: traceA,
      config: { ...testConfig, type: "histogram" },
    });

    const { store } = renderPlotPage();

    // Change panel 1
    const typeSelects = screen.getAllByRole("combobox");
    fireEvent.change(typeSelects[0], { target: { value: "histogram" } });

    await waitFor(() => {
      expect(mockFetchDynamicPlotData).toHaveBeenCalledTimes(1);
    });

    // After fetch completes, panel 1's revision should bump but panel 2's should not
    await waitFor(() => {
      const charts = screen.getAllByTestId("plotly-chart");
      const rev1 = Number(charts[0].getAttribute("data-revision"));
      const rev2 = Number(charts[1].getAttribute("data-revision"));
      expect(rev1).toBeGreaterThan(0);
      expect(rev2).toBe(0);
    });
  });
});
