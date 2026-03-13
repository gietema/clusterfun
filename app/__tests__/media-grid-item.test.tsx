import React from "react";
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { configAtom } from "@/app/store/atoms";
import { renderWithAtoms, makeMedia, testConfig, testConfigWithBbox } from "./helpers";
import MediaGridItem from "@/app/components/grid/MediaGridItem";

// Mock PreviewMedia
vi.mock("@/app/components/shared/PreviewMedia", () => ({
  default: ({ media, boundingBoxColumn, displayLabel }: any) => (
    <div
      data-testid="preview-media"
      data-bbox-col={boundingBoxColumn ?? ""}
      data-show-label={displayLabel}
    >
      {media?.src}
    </div>
  ),
}));

describe("MediaGridItem", () => {
  const defaultProps = {
    media: makeMedia({
      index: 5,
      information: { category: "cat", score: 0.95 },
    }),
    columns: 4,
    showBboxLabel: false,
    onClick: vi.fn(),
    onHover: vi.fn(),
    onLabelToggle: vi.fn(),
  };

  function renderItem(props = {}, configOverride = testConfig) {
    return renderWithAtoms(
      <MediaGridItem {...defaultProps} {...props} />,
      [[configAtom, configOverride]],
    );
  }

  it("renders media preview", () => {
    renderItem();
    expect(screen.getByTestId("preview-media")).toBeInTheDocument();
    expect(screen.getByText("/media/img_0.jpg")).toBeInTheDocument();
  });

  it("shows column value when showColumn is set", () => {
    renderItem({ showColumn: "category" });
    expect(screen.getByText("cat")).toBeInTheDocument();
  });

  it("does not show column value when showColumn is not set", () => {
    renderItem();
    // "cat" might appear in media labels but not as a column value display
    const truncateDivs = document.querySelectorAll(".truncate");
    expect(truncateDivs).toHaveLength(0);
  });

  it("calls onClick when clicked", () => {
    renderItem();
    fireEvent.click(screen.getByTestId("preview-media").closest("[tabindex]")!);
    expect(defaultProps.onClick).toHaveBeenCalled();
  });

  it("calls onHover and focuses on mouseEnter", () => {
    renderItem();
    const item = screen.getByTestId("preview-media").closest("[tabindex]")!;
    fireEvent.mouseEnter(item);
    expect(defaultProps.onHover).toHaveBeenCalled();
    expect(document.activeElement).toBe(item);
  });

  it("passes boundingBoxColumn to PreviewMedia", () => {
    renderItem(
      { boundingBoxColumn: "bboxes" },
      testConfigWithBbox,
    );
    const preview = screen.getByTestId("preview-media");
    expect(preview.getAttribute("data-bbox-col")).toBe("bboxes");
  });

  it("renders label checkboxes from config", () => {
    renderItem();
    // testConfig has labels: ["good", "bad"]
    expect(screen.getByText("good")).toBeInTheDocument();
    expect(screen.getByText("bad")).toBeInTheDocument();
  });

  it("calls onLabelToggle when label checkbox is clicked", () => {
    const onLabelToggle = vi.fn();
    renderItem({ onLabelToggle });
    const goodLabel = screen.getByText("good").closest("label")!;
    fireEvent.click(goodLabel);
    expect(onLabelToggle).toHaveBeenCalledWith("good");
  });

  it("triggers label toggle via number key shortcut", () => {
    const onLabelToggle = vi.fn();
    renderItem({ onLabelToggle });
    const item = screen.getByTestId("preview-media").closest("[tabindex]")!;
    fireEvent.mouseEnter(item); // Focus
    fireEvent.keyDown(item, { key: "1" });
    expect(onLabelToggle).toHaveBeenCalledWith("good");
  });

  it("triggers second label with key 2", () => {
    const onLabelToggle = vi.fn();
    renderItem({ onLabelToggle });
    const item = screen.getByTestId("preview-media").closest("[tabindex]")!;
    fireEvent.mouseEnter(item);
    fireEvent.keyDown(item, { key: "2" });
    expect(onLabelToggle).toHaveBeenCalledWith("bad");
  });

  it("renders audio icon for audio media", () => {
    renderItem({
      media: makeMedia({ type: "audio", src: "/song.mp3" }),
    });
    // Should not render PreviewMedia
    expect(screen.queryByTestId("preview-media")).not.toBeInTheDocument();
  });

  it("renders display columns for audio media", () => {
    renderItem({
      media: makeMedia({
        type: "audio",
        src: "/song.mp3",
        information: { category: "music", score: 0.8 },
      }),
      display: ["category"],
    });
    expect(screen.getByText("category")).toBeInTheDocument();
    expect(screen.getByText("music")).toBeInTheDocument();
  });

  it("looks up information by column name (not index)", () => {
    // This tests the fix: information is now a dict, not a positional array
    const media = makeMedia({
      information: { category: "dog", score: 0.42, description: "good boy" },
    });
    renderItem({ media, showColumn: "score" });
    expect(screen.getByText("0.42")).toBeInTheDocument();
  });
});
