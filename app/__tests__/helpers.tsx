import React from "react";
import { render, type RenderOptions } from "@testing-library/react";
import { Provider, createStore, type WritableAtom } from "jotai";
import type { Media, PlotConfig, PlotTrace, Filter } from "@/app/types";

// ── Fixtures ──

export const testConfig: PlotConfig = {
  type: "scatter",
  media: "image_path",
  columns: ["id", "image_path", "category", "score", "description"],
  labels: ["good", "bad"],
  x: "score",
  y: "category",
};

export const testGridConfig: PlotConfig = {
  type: "grid",
  media: "image_path",
  columns: ["id", "image_path", "category", "score"],
  labels: ["positive", "negative"],
};

export const testConfigWithBbox: PlotConfig = {
  ...testConfig,
  bounding_box: "bboxes",
  columns: ["id", "image_path", "category", "score", "bboxes"],
};

export const testPlotData: PlotTrace[] = [
  {
    id: [0, 1, 2, 3, 4],
    x: [1.0, 2.0, 3.0, 4.0, 5.0],
    y: [10, 20, 30, 40, 50],
    type: "scattergl",
    mode: "markers",
    name: "trace-a",
  },
];

export function makeMedia(overrides: Partial<Media> = {}): Media {
  return {
    index: 0,
    src: "/media/img_0.jpg",
    information: { category: "cat", score: 0.95, description: "a cat" },
    type: "image",
    labels: [],
    ...overrides,
  };
}

export function makeMediaList(count: number): Media[] {
  return Array.from({ length: count }, (_, i) =>
    makeMedia({
      index: i,
      src: `/media/img_${i}.jpg`,
      information: { category: i % 2 === 0 ? "cat" : "dog", score: i * 0.1 },
      labels: [],
    }),
  );
}

export const testFilter: Filter = {
  column: "category",
  comparison: "=",
  values: ["cat"],
};

// ── Jotai test wrapper ──

type AtomInit = [atom: WritableAtom<any, any, any>, value: any];

export function createTestStore(initialValues?: AtomInit[]) {
  const store = createStore();
  if (initialValues) {
    for (const [atom, value] of initialValues) {
      store.set(atom, value);
    }
  }
  return store;
}

interface WrapperProps {
  children: React.ReactNode;
}

export function renderWithAtoms(
  ui: React.ReactElement,
  initialValues?: AtomInit[],
  options?: Omit<RenderOptions, "wrapper">,
) {
  const store = createTestStore(initialValues);
  const Wrapper = ({ children }: WrapperProps) => (
    <Provider store={store}>{children}</Provider>
  );
  return { ...render(ui, { wrapper: Wrapper, ...options }), store };
}
