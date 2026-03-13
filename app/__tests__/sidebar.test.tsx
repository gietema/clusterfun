import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { configAtom, mediaAtom } from "@/app/store/atoms";
import { renderWithAtoms, makeMedia, testConfig, testConfigWithBbox } from "./helpers";
import SideBar from "@/app/components/shared/SideBar";

// Mock PreviewMedia since it uses refs and image loading
vi.mock("@/app/components/shared/PreviewMedia", () => ({
  default: ({ media, boundingBoxColumn }: any) => (
    <div data-testid="preview-media" data-bbox-col={boundingBoxColumn ?? ""}>
      {media?.src}
    </div>
  ),
}));

describe("SideBar", () => {
  it("renders empty div when no media", () => {
    const { container } = renderWithAtoms(<SideBar />, [
      [configAtom, testConfig],
    ]);
    expect(container.querySelector("[data-testid='preview-media']")).toBeNull();
  });

  it("renders empty div when no config", () => {
    const { container } = renderWithAtoms(<SideBar />, [
      [mediaAtom, makeMedia()],
    ]);
    expect(container.querySelector("[data-testid='preview-media']")).toBeNull();
  });

  it("renders media information as key-value pairs", () => {
    const media = makeMedia({
      information: { category: "cat", score: 0.95, description: "a cat" },
    });
    renderWithAtoms(<SideBar />, [
      [configAtom, testConfig],
      [mediaAtom, media],
    ]);
    expect(screen.getByText("category")).toBeInTheDocument();
    expect(screen.getByText("cat")).toBeInTheDocument();
    expect(screen.getByText("score")).toBeInTheDocument();
    expect(screen.getByText("0.95")).toBeInTheDocument();
    expect(screen.getByText("description")).toBeInTheDocument();
    expect(screen.getByText("a cat")).toBeInTheDocument();
  });

  it("filters out bounding box column from information", () => {
    const media = makeMedia({
      information: {
        category: "cat",
        score: 0.95,
        bboxes: '[{"xmin":0,"ymin":0,"xmax":1,"ymax":1}]',
      },
    });
    renderWithAtoms(<SideBar />, [
      [configAtom, testConfigWithBbox],
      [mediaAtom, media],
    ]);
    expect(screen.getByText("category")).toBeInTheDocument();
    expect(screen.getByText("score")).toBeInTheDocument();
    // bboxes column should be filtered out
    expect(screen.queryByText("bboxes")).not.toBeInTheDocument();
  });

  it("passes boundingBoxColumn to PreviewMedia", () => {
    const media = makeMedia({
      information: { category: "cat", score: 0.95, bboxes: "[]" },
    });
    renderWithAtoms(<SideBar />, [
      [configAtom, testConfigWithBbox],
      [mediaAtom, media],
    ]);
    const preview = screen.getByTestId("preview-media");
    expect(preview.getAttribute("data-bbox-col")).toBe("bboxes");
  });

  it("passes undefined boundingBoxColumn when no bounding box configured", () => {
    renderWithAtoms(<SideBar />, [
      [configAtom, testConfig],
      [mediaAtom, makeMedia()],
    ]);
    const preview = screen.getByTestId("preview-media");
    expect(preview.getAttribute("data-bbox-col")).toBe("");
  });

  it("handles media with no information", () => {
    const media = makeMedia({ information: undefined });
    const { container } = renderWithAtoms(<SideBar />, [
      [configAtom, testConfig],
      [mediaAtom, media],
    ]);
    // Should render but with no information items
    expect(container.querySelector("[data-testid='preview-media']")).toBeNull();
  });
});
