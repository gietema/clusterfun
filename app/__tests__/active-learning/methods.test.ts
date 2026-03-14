import { describe, it, expect } from "vitest";
import type { EmbeddingData, FitParams } from "@/app/lib/active-learning/types";
import { centroidMethod } from "@/app/lib/active-learning/centroid";
import { knnMethod } from "@/app/lib/active-learning/knn";
import { linearMethod } from "@/app/lib/active-learning/linear";
import { prototypeMethod } from "@/app/lib/active-learning/prototype";
import { mlpMethod } from "@/app/lib/active-learning/mlp";
import { AL_METHODS, getMethod } from "@/app/lib/active-learning";

// ── Helpers ──

/** Create synthetic embedding data with clear cluster structure. */
function makeEmbeddingData(
  items: { id: number; emb: number[] }[],
): EmbeddingData {
  const dim = items[0].emb.length;
  const flat = new Float32Array(items.length * dim);
  const mediaIds: number[] = [];
  const idToIndex = new Map<number, number>();

  for (let i = 0; i < items.length; i++) {
    flat.set(items[i].emb, i * dim);
    mediaIds.push(items[i].id);
    idToIndex.set(items[i].id, i);
  }

  return { dimension: dim, embeddings: flat, mediaIds, idToIndex };
}

/** Create a dataset with two clearly separable clusters. */
function makeTwoClusterData() {
  // Cluster A: positive x direction
  // Cluster B: negative x direction
  const items = [
    // Labeled: cluster A
    { id: 0, emb: [5, 0.1, 0] },
    { id: 1, emb: [4.5, -0.2, 0.1] },
    { id: 2, emb: [5.5, 0.3, -0.1] },
    // Labeled: cluster B
    { id: 3, emb: [-5, 0.1, 0] },
    { id: 4, emb: [-4.5, -0.1, 0.2] },
    { id: 5, emb: [-5.5, 0.2, -0.1] },
    // Unlabeled: close to A
    { id: 6, emb: [4, 0.5, 0] },
    { id: 7, emb: [3.5, -0.3, 0.1] },
    // Unlabeled: close to B
    { id: 8, emb: [-4, 0.5, 0] },
    { id: 9, emb: [-3.5, -0.3, 0.1] },
    // Unlabeled: ambiguous (near origin)
    { id: 10, emb: [0.1, 0.5, 0] },
  ];

  const embeddings = makeEmbeddingData(items);
  const labels = new Map<number, string>([
    [0, "cat"],
    [1, "cat"],
    [2, "cat"],
    [3, "dog"],
    [4, "dog"],
    [5, "dog"],
  ]);
  const scopeIds = items.map((i) => i.id);

  return { embeddings, labels, scopeIds };
}

/** Create a single-class dataset (only positive examples). */
function makeSingleClassData() {
  const items = [
    // Labeled: cluster A
    { id: 0, emb: [5, 0.1] },
    { id: 1, emb: [4.5, -0.2] },
    // Unlabeled: similar to A
    { id: 2, emb: [4, 0.5] },
    // Unlabeled: dissimilar
    { id: 3, emb: [-3, 2] },
    { id: 4, emb: [-4, -1] },
  ];

  const embeddings = makeEmbeddingData(items);
  const labels = new Map<number, string>([
    [0, "good"],
    [1, "good"],
  ]);
  const scopeIds = items.map((i) => i.id);

  return { embeddings, labels, scopeIds };
}

/** Create three-class dataset with 4D embeddings for more reliable separation. */
function makeThreeClassData() {
  const items = [
    // Class A: strong positive x
    { id: 0, emb: [5, 0, 0, 0] },
    { id: 1, emb: [4.5, 0.1, -0.1, 0] },
    { id: 10, emb: [5.2, -0.1, 0.1, 0] },
    // Class B: strong positive y
    { id: 2, emb: [0, 5, 0, 0] },
    { id: 3, emb: [0.1, 4.5, -0.1, 0] },
    { id: 11, emb: [-0.1, 5.2, 0.1, 0] },
    // Class C: strong positive z
    { id: 4, emb: [0, 0, 5, 0] },
    { id: 5, emb: [0.1, -0.1, 4.5, 0] },
    { id: 12, emb: [-0.1, 0.1, 5.2, 0] },
    // Unlabeled
    { id: 6, emb: [3, 0.2, 0.1, 0] }, // near A
    { id: 7, emb: [0.2, 3, 0.1, 0] }, // near B
    { id: 8, emb: [0.1, 0.2, 3, 0] }, // near C
  ];

  const embeddings = makeEmbeddingData(items);
  const labels = new Map<number, string>([
    [0, "a"],
    [1, "a"],
    [10, "a"],
    [2, "b"],
    [3, "b"],
    [11, "b"],
    [4, "c"],
    [5, "c"],
    [12, "c"],
  ]);
  const scopeIds = items.map((i) => i.id);

  return { embeddings, labels, scopeIds };
}

// ── Registry tests ──

describe("AL_METHODS registry", () => {
  it("has 5 methods", () => {
    expect(AL_METHODS).toHaveLength(5);
  });

  it("has unique IDs", () => {
    const ids = AL_METHODS.map((m) => m.id);
    expect(new Set(ids).size).toBe(5);
  });

  it("getMethod returns correct method", () => {
    expect(getMethod("knn").id).toBe("knn");
    expect(getMethod("mlp").id).toBe("mlp");
  });

  it("getMethod falls back to centroid for unknown ID", () => {
    expect(getMethod("unknown").id).toBe("centroid");
  });
});

// ── Method 1: Centroid ──

describe("centroidMethod", () => {
  it("has correct metadata", () => {
    expect(centroidMethod.id).toBe("centroid");
    expect(centroidMethod.minClasses).toBe(1);
  });

  it("works with single class", () => {
    const { embeddings, labels, scopeIds } = makeSingleClassData();
    const result = centroidMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    expect(result.n_labeled).toBe(2);
    expect(result.label_classes).toEqual(["good"]);
    expect(result.predictions).toHaveLength(3); // 3 unlabeled items

    // Item 2 (close to labeled cluster) should be ranked first
    expect(result.predictions[0].media_id).toBe(2);
    expect(result.predictions[0].score).toBeGreaterThan(0);
  });

  it("works with two classes", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    const result = centroidMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    expect(result.n_labeled).toBe(6);
    expect(result.label_classes).toEqual(["cat", "dog"]);
    expect(result.predictions).toHaveLength(5);

    // Items 6, 7 should be predicted as "cat"
    const pred6 = result.predictions.find((p) => p.media_id === 6)!;
    const pred8 = result.predictions.find((p) => p.media_id === 8)!;
    expect(pred6.predicted_class).toBe("cat");
    expect(pred8.predicted_class).toBe("dog");
  });

  it("respects uncertainty sort", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    const result = centroidMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "uncertainty",
    });

    // Ambiguous item (id=10) should be near the top when sorting by uncertainty
    const pred10 = result.predictions.find((p) => p.media_id === 10)!;
    expect(pred10.uncertainty).toBeGreaterThan(0.3);
  });

  it("returns empty for no labels", () => {
    const { embeddings, scopeIds } = makeSingleClassData();
    const result = centroidMethod.fit({
      embeddings,
      labels: new Map(),
      scopeIds,
      sortBy: "confidence",
    });
    expect(result.predictions).toHaveLength(0);
    expect(result.n_labeled).toBe(0);
  });
});

// ── Method 2: KNN ──

describe("knnMethod", () => {
  it("has correct metadata", () => {
    expect(knnMethod.id).toBe("knn");
    expect(knnMethod.minClasses).toBe(1);
  });

  it("works with single class", () => {
    const { embeddings, labels, scopeIds } = makeSingleClassData();
    const result = knnMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    expect(result.n_labeled).toBe(2);
    expect(result.predictions).toHaveLength(3);
    // Item 2 should be closest
    expect(result.predictions[0].media_id).toBe(2);
  });

  it("classifies two clusters correctly", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    const result = knnMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    const pred6 = result.predictions.find((p) => p.media_id === 6)!;
    const pred8 = result.predictions.find((p) => p.media_id === 8)!;
    expect(pred6.predicted_class).toBe("cat");
    expect(pred8.predicted_class).toBe("dog");
  });

  it("probabilities sum to ~1", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    const result = knnMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    for (const pred of result.predictions) {
      const total = Object.values(pred.probabilities).reduce(
        (a, b) => a + b,
        0,
      );
      expect(total).toBeCloseTo(1, 1);
    }
  });
});

// ── Method 3: Linear Classifier ──

describe("linearMethod", () => {
  it("has correct metadata", () => {
    expect(linearMethod.id).toBe("linear");
    expect(linearMethod.minClasses).toBe(2);
  });

  it("returns empty for single class", () => {
    const { embeddings, labels, scopeIds } = makeSingleClassData();
    const result = linearMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });
    expect(result.predictions).toHaveLength(0);
  });

  it("separates two clear clusters", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    const result = linearMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    expect(result.predictions).toHaveLength(5);

    const pred6 = result.predictions.find((p) => p.media_id === 6)!;
    const pred8 = result.predictions.find((p) => p.media_id === 8)!;
    expect(pred6.predicted_class).toBe("cat");
    expect(pred8.predicted_class).toBe("dog");
  });

  it("handles three classes", () => {
    const { embeddings, labels, scopeIds } = makeThreeClassData();
    const result = linearMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    expect(result.label_classes).toEqual(["a", "b", "c"]);
    const pred6 = result.predictions.find((p) => p.media_id === 6)!;
    const pred7 = result.predictions.find((p) => p.media_id === 7)!;
    const pred8 = result.predictions.find((p) => p.media_id === 8)!;
    expect(pred6.predicted_class).toBe("a");
    expect(pred7.predicted_class).toBe("b");
    expect(pred8.predicted_class).toBe("c");
  });

  it("probabilities sum to ~1", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    const result = linearMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    for (const pred of result.predictions) {
      const total = Object.values(pred.probabilities).reduce(
        (a, b) => a + b,
        0,
      );
      expect(total).toBeCloseTo(1, 3);
    }
  });
});

// ── Method 4: Prototype Network ──

describe("prototypeMethod", () => {
  it("has correct metadata", () => {
    expect(prototypeMethod.id).toBe("prototype");
    expect(prototypeMethod.minClasses).toBe(2);
  });

  it("returns empty for single class", () => {
    const { embeddings, labels, scopeIds } = makeSingleClassData();
    const result = prototypeMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });
    expect(result.predictions).toHaveLength(0);
  });

  it("separates two clusters", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    const result = prototypeMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    expect(result.predictions).toHaveLength(5);

    const pred6 = result.predictions.find((p) => p.media_id === 6)!;
    const pred8 = result.predictions.find((p) => p.media_id === 8)!;
    expect(pred6.predicted_class).toBe("cat");
    expect(pred8.predicted_class).toBe("dog");
  });

  it("handles three classes", () => {
    const { embeddings, labels, scopeIds } = makeThreeClassData();
    const result = prototypeMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    const pred6 = result.predictions.find((p) => p.media_id === 6)!;
    const pred7 = result.predictions.find((p) => p.media_id === 7)!;
    const pred8 = result.predictions.find((p) => p.media_id === 8)!;
    expect(pred6.predicted_class).toBe("a");
    expect(pred7.predicted_class).toBe("b");
    expect(pred8.predicted_class).toBe("c");
  });

  it("ambiguous items have higher uncertainty", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    const result = prototypeMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    const pred6 = result.predictions.find((p) => p.media_id === 6)!; // close to cat
    const pred10 = result.predictions.find((p) => p.media_id === 10)!; // ambiguous
    expect(pred10.uncertainty).toBeGreaterThan(pred6.uncertainty);
  });
});

// ── Method 5: MLP ──

describe("mlpMethod", () => {
  it("has correct metadata", () => {
    expect(mlpMethod.id).toBe("mlp");
    expect(mlpMethod.minClasses).toBe(2);
  });

  it("returns empty for single class", () => {
    const { embeddings, labels, scopeIds } = makeSingleClassData();
    const result = mlpMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });
    expect(result.predictions).toHaveLength(0);
  });

  it("separates two clear clusters", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    const result = mlpMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    expect(result.predictions).toHaveLength(5);

    const pred6 = result.predictions.find((p) => p.media_id === 6)!;
    const pred8 = result.predictions.find((p) => p.media_id === 8)!;
    expect(pred6.predicted_class).toBe("cat");
    expect(pred8.predicted_class).toBe("dog");
  });

  it("handles three classes", () => {
    const { embeddings, labels, scopeIds } = makeThreeClassData();
    const result = mlpMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    const pred6 = result.predictions.find((p) => p.media_id === 6)!;
    const pred7 = result.predictions.find((p) => p.media_id === 7)!;
    const pred8 = result.predictions.find((p) => p.media_id === 8)!;
    expect(pred6.predicted_class).toBe("a");
    expect(pred7.predicted_class).toBe("b");
    expect(pred8.predicted_class).toBe("c");
  });

  it("probabilities sum to ~1", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    const result = mlpMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    for (const pred of result.predictions) {
      const total = Object.values(pred.probabilities).reduce(
        (a, b) => a + b,
        0,
      );
      expect(total).toBeCloseTo(1, 3);
    }
  });

  it("scores are between 0 and 1", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    const result = mlpMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    for (const pred of result.predictions) {
      expect(pred.score).toBeGreaterThanOrEqual(0);
      expect(pred.score).toBeLessThanOrEqual(1);
    }
  });

  it("works with 2 hidden layers", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    const result = mlpMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
      options: { mlpLayers: 2 },
    });

    expect(result.predictions).toHaveLength(5);
    const pred6 = result.predictions.find((p) => p.media_id === 6)!;
    const pred8 = result.predictions.find((p) => p.media_id === 8)!;
    expect(pred6.predicted_class).toBe("cat");
    expect(pred8.predicted_class).toBe("dog");
  });

  it("works with 3 hidden layers", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    const result = mlpMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
      options: { mlpLayers: 3 },
    });

    expect(result.predictions).toHaveLength(5);
    const pred6 = result.predictions.find((p) => p.media_id === 6)!;
    const pred8 = result.predictions.find((p) => p.media_id === 8)!;
    expect(pred6.predicted_class).toBe("cat");
    expect(pred8.predicted_class).toBe("dog");
  });

  it("3-layer probabilities sum to ~1", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    const result = mlpMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
      options: { mlpLayers: 3 },
    });

    for (const pred of result.predictions) {
      const total = Object.values(pred.probabilities).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1, 3);
    }
  });

  it("defaults to 1 layer when no option is set", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    const r1 = mlpMethod.fit({
      embeddings, labels, scopeIds, sortBy: "confidence",
    });
    const r1opt = mlpMethod.fit({
      embeddings, labels, scopeIds, sortBy: "confidence",
      options: { mlpLayers: 1 },
    });
    // Same seed, same layers → same predictions
    expect(r1.predictions.map((p) => p.media_id)).toEqual(
      r1opt.predictions.map((p) => p.media_id),
    );
  });

  it("clamps layers to valid range", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();
    // mlpLayers: 0 should clamp to 1
    const r0 = mlpMethod.fit({
      embeddings, labels, scopeIds, sortBy: "confidence",
      options: { mlpLayers: 0 },
    });
    expect(r0.predictions).toHaveLength(5);
    // mlpLayers: 5 should clamp to 3
    const r5 = mlpMethod.fit({
      embeddings, labels, scopeIds, sortBy: "confidence",
      options: { mlpLayers: 5 },
    });
    expect(r5.predictions).toHaveLength(5);
  });

  it("3-layer MLP handles three classes", () => {
    const { embeddings, labels, scopeIds } = makeThreeClassData();
    const result = mlpMethod.fit({
      embeddings, labels, scopeIds, sortBy: "confidence",
      options: { mlpLayers: 3 },
    });

    const pred6 = result.predictions.find((p) => p.media_id === 6)!;
    const pred7 = result.predictions.find((p) => p.media_id === 7)!;
    const pred8 = result.predictions.find((p) => p.media_id === 8)!;
    expect(pred6.predicted_class).toBe("a");
    expect(pred7.predicted_class).toBe("b");
    expect(pred8.predicted_class).toBe("c");
  });
});

// ── Cross-method comparison tests ──

describe("all methods consistency", () => {
  const methods = [centroidMethod, knnMethod, linearMethod, prototypeMethod, mlpMethod];

  it("all methods return correct n_labeled", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();

    for (const method of methods) {
      if (new Set(labels.values()).size < method.minClasses) continue;
      const result = method.fit({
        embeddings,
        labels,
        scopeIds,
        sortBy: "confidence",
      });
      expect(result.n_labeled).toBe(6);
    }
  });

  it("all methods exclude labeled items from predictions", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();

    for (const method of methods) {
      if (new Set(labels.values()).size < method.minClasses) continue;
      const result = method.fit({
        embeddings,
        labels,
        scopeIds,
        sortBy: "confidence",
      });
      const predIds = new Set(result.predictions.map((p) => p.media_id));
      for (const labeledId of labels.keys()) {
        expect(predIds.has(labeledId)).toBe(false);
      }
    }
  });

  it("all methods agree on clear-cut classifications", () => {
    const { embeddings, labels, scopeIds } = makeTwoClusterData();

    for (const method of methods) {
      if (new Set(labels.values()).size < method.minClasses) continue;
      const result = method.fit({
        embeddings,
        labels,
        scopeIds,
        sortBy: "confidence",
      });
      // Items 6, 7 are clearly cats; 8, 9 are clearly dogs
      const pred6 = result.predictions.find((p) => p.media_id === 6)!;
      const pred8 = result.predictions.find((p) => p.media_id === 8)!;
      expect(pred6.predicted_class).toBe("cat");
      expect(pred8.predicted_class).toBe("dog");
    }
  });
});

// ── Edge cases ──

describe("edge cases", () => {
  it("handles exclude label in two-class setup", () => {
    const items = [
      { id: 0, emb: [5, 0] },
      { id: 1, emb: [4, 0] },
      { id: 2, emb: [-5, 0] },
      { id: 3, emb: [-4, 0] },
      { id: 4, emb: [3, 0] }, // unlabeled, near positive
      { id: 5, emb: [-3, 0] }, // unlabeled, near negative
    ];

    const embeddings = makeEmbeddingData(items);
    const labels = new Map<number, string>([
      [0, "good"],
      [1, "good"],
      [2, "exclude"],
      [3, "exclude"],
    ]);
    const scopeIds = items.map((i) => i.id);

    // Test with centroid (supports 1+ class)
    const result = centroidMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });

    // Item 4 should have higher positive score than item 5
    const pred4 = result.predictions.find((p) => p.media_id === 4)!;
    const pred5 = result.predictions.find((p) => p.media_id === 5)!;
    expect(pred4.score).toBeGreaterThan(pred5.score);
  });

  it("handles very few labeled items (2 items, 2 classes)", () => {
    const items = [
      { id: 0, emb: [5, 0, 0, 0] },
      { id: 1, emb: [-5, 0, 0, 0] },
      { id: 2, emb: [3, 0, 0, 0] },
      { id: 3, emb: [-3, 0, 0, 0] },
    ];

    const embeddings = makeEmbeddingData(items);
    const labels = new Map<number, string>([
      [0, "a"],
      [1, "b"],
    ]);
    const scopeIds = items.map((i) => i.id);

    // All methods that support 2 classes should work
    for (const method of [linearMethod, prototypeMethod, mlpMethod]) {
      const result = method.fit({
        embeddings,
        labels,
        scopeIds,
        sortBy: "confidence",
      });
      expect(result.predictions).toHaveLength(2);
      const pred2 = result.predictions.find((p) => p.media_id === 2)!;
      const pred3 = result.predictions.find((p) => p.media_id === 3)!;
      expect(pred2.predicted_class).toBe("a");
      expect(pred3.predicted_class).toBe("b");
    }
  });

  it("handles scopeIds that don't have embeddings", () => {
    const items = [
      { id: 0, emb: [5, 0] },
      { id: 1, emb: [-5, 0] },
    ];
    const embeddings = makeEmbeddingData(items);
    const labels = new Map<number, string>([[0, "a"]]);
    // scopeIds includes id 99 which has no embedding
    const scopeIds = [0, 1, 99];

    const result = centroidMethod.fit({
      embeddings,
      labels,
      scopeIds,
      sortBy: "confidence",
    });
    // Only id 1 should get a prediction (0 is labeled, 99 has no embedding)
    expect(result.predictions).toHaveLength(1);
    expect(result.predictions[0].media_id).toBe(1);
  });
});
