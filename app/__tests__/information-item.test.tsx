import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InformationItem from "@/app/components/shared/InformationItem";

describe("InformationItem", () => {
  it("renders label and string value", () => {
    render(<InformationItem label="category" value="cat" />);
    expect(screen.getByText("category")).toBeInTheDocument();
    expect(screen.getByText("cat")).toBeInTheDocument();
  });

  it("renders label and number value", () => {
    render(<InformationItem label="score" value={0.95} />);
    expect(screen.getByText("score")).toBeInTheDocument();
    expect(screen.getByText("0.95")).toBeInTheDocument();
  });

  it("renders label and boolean value", () => {
    render(<InformationItem label="active" value={true} />);
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("renders label with null value (empty)", () => {
    render(<InformationItem label="empty_field" value={null} />);
    expect(screen.getByText("empty_field")).toBeInTheDocument();
  });
});
