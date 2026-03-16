import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import QACard from "@/app/components/shared/QACard";

describe("QACard", () => {
  it("renders question text", () => {
    render(<QACard question="What animal is this?" />);
    expect(screen.getByText("What animal is this?")).toBeInTheDocument();
  });

  it("renders choices with letter badges", () => {
    render(
      <QACard
        question="Pick one"
        choices='["cat", "dog", "bird"]'
        answer="A"
      />,
    );
    // "A" appears as both choice badge and answer text
    expect(screen.getAllByText("A").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("C")).toBeInTheDocument();
    expect(screen.getByText("cat")).toBeInTheDocument();
    expect(screen.getByText("dog")).toBeInTheDocument();
    expect(screen.getByText("bird")).toBeInTheDocument();
  });

  it("shows answer immediately", () => {
    render(<QACard question="Q" answer="cat" />);
    expect(screen.getByText("cat")).toBeInTheDocument();
  });

  it("highlights correct choice", () => {
    render(
      <QACard
        question="Pick"
        choices='["red", "blue", "green"]'
        answer="B"
      />,
    );
    // The "B" badge and answer text should both be visible
    const badges = screen.getAllByText("B");
    expect(badges.length).toBeGreaterThan(0);
    expect(screen.getByText("B", { selector: ".text-sm" })).toBeInTheDocument();
  });

  it("shows explanation immediately", () => {
    render(
      <QACard
        question="Q"
        answer="A"
        explanation="Because cats are mammals"
      />,
    );
    expect(screen.getByText("Because cats are mammals")).toBeInTheDocument();
  });

  it("handles missing choices gracefully", () => {
    render(<QACard question="What?" answer="42" />);
    expect(screen.queryByText("A")).not.toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("handles missing explanation gracefully", () => {
    render(<QACard question="Q" answer="yes" />);
    expect(screen.queryByText("Explanation")).not.toBeInTheDocument();
  });

  it("does not render answer section when answer is null", () => {
    render(<QACard question="Q" answer={null} />);
    expect(screen.queryByText("Answer")).not.toBeInTheDocument();
  });

  it("renders extra images when provided", () => {
    render(
      <QACard
        question="Q"
        extraImages={[
          { col: "image_2", url: "/img/1.jpg" },
          { col: "image_3", url: "/img/2.jpg" },
        ]}
      />,
    );
    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute("src", "/img/1.jpg");
    expect(images[1]).toHaveAttribute("src", "/img/2.jpg");
  });

  it("parses Python repr choices", () => {
    render(
      <QACard question="Q" choices="['yes', 'no']" answer="A" />,
    );
    expect(screen.getByText("yes")).toBeInTheDocument();
    expect(screen.getByText("no")).toBeInTheDocument();
  });

  it("handles numeric answer index for choices", () => {
    render(
      <QACard
        question="Q"
        choices='["first", "second", "third"]'
        answer={1}
      />,
    );
    expect(screen.getByText("1")).toBeInTheDocument();
  });
});
