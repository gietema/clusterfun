import { describe, it, expect } from "vitest";
import { createStore } from "jotai";
import {
  mediaIndicesStackAtom,
  currentMediaIndicesAtom,
  filtersAtom,
  gridValuesAtom,
  mediaAtom,
  mediaItemsAtom,
  configAtom,
  dataAtom,
  uuidAtom,
  labelUndoStackAtom,
} from "@/app/store/atoms";
import { makeMedia, testConfig, testPlotData } from "./helpers";

function createTestStore() {
  return createStore();
}

describe("currentMediaIndicesAtom", () => {
  it("returns empty array when stack is empty", () => {
    const store = createTestStore();
    expect(store.get(currentMediaIndicesAtom)).toEqual([]);
  });

  it("returns last element of the stack", () => {
    const store = createTestStore();
    store.set(mediaIndicesStackAtom, [[1, 2, 3], [4, 5]]);
    expect(store.get(currentMediaIndicesAtom)).toEqual([4, 5]);
  });

  it("updates when stack changes", () => {
    const store = createTestStore();
    store.set(mediaIndicesStackAtom, [[10, 20]]);
    expect(store.get(currentMediaIndicesAtom)).toEqual([10, 20]);

    store.set(mediaIndicesStackAtom, (prev: number[][]) => [...prev, [30, 40]]);
    expect(store.get(currentMediaIndicesAtom)).toEqual([30, 40]);
  });

  it("handles single-element stack", () => {
    const store = createTestStore();
    store.set(mediaIndicesStackAtom, [[7, 8, 9]]);
    expect(store.get(currentMediaIndicesAtom)).toEqual([7, 8, 9]);
  });
});

describe("mediaIndicesStackAtom", () => {
  it("starts empty", () => {
    const store = createTestStore();
    expect(store.get(mediaIndicesStackAtom)).toEqual([]);
  });

  it("can push selections", () => {
    const store = createTestStore();
    store.set(mediaIndicesStackAtom, (prev: number[][]) => [...prev, [1, 2, 3]]);
    store.set(mediaIndicesStackAtom, (prev: number[][]) => [...prev, [2, 3]]);
    expect(store.get(mediaIndicesStackAtom)).toEqual([[1, 2, 3], [2, 3]]);
  });

  it("can be cleared", () => {
    const store = createTestStore();
    store.set(mediaIndicesStackAtom, [[1], [2]]);
    store.set(mediaIndicesStackAtom, []);
    expect(store.get(currentMediaIndicesAtom)).toEqual([]);
  });
});

describe("filtersAtom", () => {
  it("starts empty", () => {
    const store = createTestStore();
    expect(store.get(filtersAtom)).toEqual([]);
  });

  it("can store filters", () => {
    const store = createTestStore();
    store.set(filtersAtom, [{ column: "category", comparison: "=", values: ["cat"] }]);
    expect(store.get(filtersAtom)).toHaveLength(1);
    expect(store.get(filtersAtom)[0].column).toBe("category");
  });

  it("can add multiple filters", () => {
    const store = createTestStore();
    store.set(filtersAtom, [
      { column: "category", comparison: "=", values: ["cat"] },
      { column: "score", comparison: ">=", values: ["0.5"] },
    ]);
    expect(store.get(filtersAtom)).toHaveLength(2);
  });
});

describe("gridValuesAtom", () => {
  it("has correct defaults", () => {
    const store = createTestStore();
    const values = store.get(gridValuesAtom);
    expect(values.sortBy).toBe("");
    expect(values.asc).toBe(true);
    expect(values.page).toBe(0);
    expect(values.numberOfColumns).toBe(5);
    expect(values.showColumnValues).toEqual([]);
    expect(values.showBboxLabel).toBe(false);
  });

  it("can update page", () => {
    const store = createTestStore();
    store.set(gridValuesAtom, (prev) => ({ ...prev, page: 3 }));
    expect(store.get(gridValuesAtom).page).toBe(3);
  });

  it("can update sort", () => {
    const store = createTestStore();
    store.set(gridValuesAtom, (prev) => ({ ...prev, sortBy: "score", asc: false }));
    const values = store.get(gridValuesAtom);
    expect(values.sortBy).toBe("score");
    expect(values.asc).toBe(false);
  });
});

describe("mediaAtom and mediaItemsAtom", () => {
  it("mediaAtom starts undefined", () => {
    const store = createTestStore();
    expect(store.get(mediaAtom)).toBeUndefined();
  });

  it("mediaAtom can hold a media object", () => {
    const store = createTestStore();
    const media = makeMedia();
    store.set(mediaAtom, media);
    expect(store.get(mediaAtom)).toEqual(media);
  });

  it("mediaItemsAtom starts empty", () => {
    const store = createTestStore();
    expect(store.get(mediaItemsAtom)).toEqual([]);
  });

  it("can update labels in media items", () => {
    const store = createTestStore();
    const items = [makeMedia({ index: 0 }), makeMedia({ index: 1 })];
    store.set(mediaItemsAtom, items);
    store.set(mediaItemsAtom, (prev) =>
      prev.map((m) =>
        m.index === 0 ? { ...m, labels: ["good"] } : m,
      ),
    );
    expect(store.get(mediaItemsAtom)[0].labels).toEqual(["good"]);
    expect(store.get(mediaItemsAtom)[1].labels).toEqual([]);
  });
});

describe("configAtom and dataAtom", () => {
  it("configAtom starts undefined", () => {
    const store = createTestStore();
    expect(store.get(configAtom)).toBeUndefined();
  });

  it("configAtom can hold config", () => {
    const store = createTestStore();
    store.set(configAtom, testConfig);
    expect(store.get(configAtom)?.type).toBe("scatter");
    expect(store.get(configAtom)?.columns).toHaveLength(5);
  });

  it("dataAtom starts undefined", () => {
    const store = createTestStore();
    expect(store.get(dataAtom)).toBeUndefined();
  });

  it("dataAtom can hold traces", () => {
    const store = createTestStore();
    store.set(dataAtom, testPlotData);
    expect(store.get(dataAtom)).toHaveLength(1);
    expect(store.get(dataAtom)![0].id).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("labelUndoStackAtom", () => {
  it("starts empty", () => {
    const store = createTestStore();
    expect(store.get(labelUndoStackAtom)).toEqual([]);
  });

  it("can push and read actions", () => {
    const store = createTestStore();
    store.set(labelUndoStackAtom, [
      { type: "add" as const, label: "good", mediaIds: [0, 1] },
    ]);
    expect(store.get(labelUndoStackAtom)).toHaveLength(1);
    expect(store.get(labelUndoStackAtom)[0].label).toBe("good");
  });
});
