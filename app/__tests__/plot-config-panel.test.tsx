import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { columnsAtom } from "@/app/store/atoms";
import { renderWithAtoms } from "./helpers";
import PlotConfigPanel from "@/app/components/plot/PlotConfigPanel";
import type { PlotPanelConfig } from "@/app/types";

const testColumns = [
  { name: "col_num1", dtype: "float64", n_unique: 10 },
  { name: "col_num2", dtype: "int64", n_unique: 5 },
  { name: "col_cat", dtype: "object", n_unique: 3 },
  { name: "col_str", dtype: "string", n_unique: 8 },
];

function makePanel(overrides: Partial<PlotPanelConfig> = {}): PlotPanelConfig {
  return {
    id: "test-panel",
    type: "scatter",
    ...overrides,
  };
}

describe("PlotConfigPanel", () => {
  it("renders plot type selector with all types", () => {
    const onChange = vi.fn();
    renderWithAtoms(
      <PlotConfigPanel panel={makePanel()} onChange={onChange} />,
      [[columnsAtom, testColumns]],
    );

    const typeSelect = screen.getAllByRole("combobox")[0];
    expect(typeSelect).toBeInTheDocument();

    // Check that all four plot types are present as options
    const options = typeSelect.querySelectorAll("option");
    const optionValues = Array.from(options).map((o) => o.getAttribute("value"));
    expect(optionValues).toContain("scatter");
    expect(optionValues).toContain("histogram");
    expect(optionValues).toContain("bar_chart");
    expect(optionValues).toContain("violin");
  });

  it("shows X and Y dropdowns for scatter type", () => {
    const onChange = vi.fn();
    renderWithAtoms(
      <PlotConfigPanel panel={makePanel({ type: "scatter" })} onChange={onChange} />,
      [[columnsAtom, testColumns]],
    );

    expect(screen.getByText("X")).toBeInTheDocument();
    expect(screen.getByText("Y")).toBeInTheDocument();
  });

  it("shows only Column dropdown for histogram type (no Y)", () => {
    const onChange = vi.fn();
    renderWithAtoms(
      <PlotConfigPanel panel={makePanel({ type: "histogram" })} onChange={onChange} />,
      [[columnsAtom, testColumns]],
    );

    expect(screen.getByText("Column")).toBeInTheDocument();
    expect(screen.queryByText("Y")).not.toBeInTheDocument();
  });

  it("calls onChange when type is changed", () => {
    const onChange = vi.fn();
    renderWithAtoms(
      <PlotConfigPanel panel={makePanel({ type: "scatter" })} onChange={onChange} />,
      [[columnsAtom, testColumns]],
    );

    const typeSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(typeSelect, { target: { value: "histogram" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: "histogram" }),
    );
  });

  it("shows color dropdown with all columns", () => {
    const onChange = vi.fn();
    renderWithAtoms(
      <PlotConfigPanel panel={makePanel()} onChange={onChange} />,
      [[columnsAtom, testColumns]],
    );

    expect(screen.getByText("Color")).toBeInTheDocument();

    // Find the Color select — it's the last combobox
    const selects = screen.getAllByRole("combobox");
    const colorSelect = selects[selects.length - 1];
    const options = Array.from(colorSelect.querySelectorAll("option"))
      .map((o) => o.textContent)
      .filter((t) => t !== "—"); // filter out the empty option

    // All columns should appear (none start with _ and none are named "id")
    expect(options).toContain("col_num1");
    expect(options).toContain("col_num2");
    expect(options).toContain("col_cat");
    expect(options).toContain("col_str");
  });

  it("shows remove button when onRemove is provided", () => {
    const onChange = vi.fn();
    const onRemove = vi.fn();
    renderWithAtoms(
      <PlotConfigPanel panel={makePanel()} onChange={onChange} onRemove={onRemove} />,
      [[columnsAtom, testColumns]],
    );

    const removeButton = screen.getByTitle("Remove plot");
    expect(removeButton).toBeInTheDocument();

    fireEvent.click(removeButton);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("does not show remove button when onRemove is not provided", () => {
    const onChange = vi.fn();
    renderWithAtoms(
      <PlotConfigPanel panel={makePanel()} onChange={onChange} />,
      [[columnsAtom, testColumns]],
    );

    expect(screen.queryByTitle("Remove plot")).not.toBeInTheDocument();
  });

  it("filters numeric columns for Y dropdown", () => {
    const onChange = vi.fn();
    renderWithAtoms(
      <PlotConfigPanel panel={makePanel({ type: "scatter" })} onChange={onChange} />,
      [[columnsAtom, testColumns]],
    );

    // The Y select is the one after the "Y" label.
    // For scatter, dropdowns are: type, X (numeric), Y (numeric), Color (all).
    // X and Y should only contain numeric columns.
    const selects = screen.getAllByRole("combobox");
    // selects: [type, X, Y, Color]
    const ySelect = selects[2];
    const yOptions = Array.from(ySelect.querySelectorAll("option"))
      .map((o) => o.textContent)
      .filter((t) => t !== "—");

    // Should contain only numeric columns
    expect(yOptions).toContain("col_num1");
    expect(yOptions).toContain("col_num2");
    // Should NOT contain non-numeric columns
    expect(yOptions).not.toContain("col_cat");
    expect(yOptions).not.toContain("col_str");
  });
});
