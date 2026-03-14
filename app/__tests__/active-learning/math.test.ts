import { describe, it, expect } from "vitest";
import {
  cosineSimilarity,
  dot,
  norm,
  normalize,
  centroid,
  softmax,
  squaredDistance,
  adamUpdate,
} from "@/app/lib/active-learning/math";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const a = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1, 5);
  });

  it("returns -1 for opposite vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  it("returns 0 if either vector is zero", () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("is scale-invariant", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([2, 4, 6]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });
});

describe("dot", () => {
  it("computes dot product", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 5, 6]);
    expect(dot(a, b)).toBeCloseTo(32, 5); // 4 + 10 + 18
  });
});

describe("norm", () => {
  it("computes L2 norm", () => {
    const v = new Float32Array([3, 4]);
    expect(norm(v)).toBeCloseTo(5, 5);
  });
});

describe("normalize", () => {
  it("returns unit vector", () => {
    const v = new Float32Array([3, 4]);
    const n = normalize(v);
    expect(norm(n)).toBeCloseTo(1, 5);
    expect(n[0]).toBeCloseTo(0.6, 5);
    expect(n[1]).toBeCloseTo(0.8, 5);
  });

  it("handles zero vector", () => {
    const v = new Float32Array([0, 0, 0]);
    const n = normalize(v);
    expect(n[0]).toBe(0);
    expect(n[1]).toBe(0);
    expect(n[2]).toBe(0);
  });
});

describe("centroid", () => {
  it("computes mean of vectors", () => {
    const vecs = [
      new Float32Array([2, 4]),
      new Float32Array([4, 6]),
    ];
    const c = centroid(vecs, 2);
    expect(c[0]).toBeCloseTo(3, 5);
    expect(c[1]).toBeCloseTo(5, 5);
  });

  it("handles single vector", () => {
    const vecs = [new Float32Array([1, 2, 3])];
    const c = centroid(vecs, 3);
    expect(c[0]).toBeCloseTo(1, 5);
    expect(c[1]).toBeCloseTo(2, 5);
    expect(c[2]).toBeCloseTo(3, 5);
  });

  it("returns zero for empty list", () => {
    const c = centroid([], 3);
    expect(c[0]).toBe(0);
    expect(c[1]).toBe(0);
    expect(c[2]).toBe(0);
  });
});

describe("softmax", () => {
  it("sums to 1", () => {
    const probs = softmax([1, 2, 3]);
    const total = probs.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("largest logit gets largest probability", () => {
    const probs = softmax([1, 5, 2]);
    expect(probs[1]).toBeGreaterThan(probs[0]);
    expect(probs[1]).toBeGreaterThan(probs[2]);
  });

  it("is numerically stable with large values", () => {
    const probs = softmax([1000, 1001, 1002]);
    const total = probs.reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(probs[2]).toBeGreaterThan(probs[1]);
  });

  it("handles equal logits", () => {
    const probs = softmax([3, 3, 3]);
    expect(probs[0]).toBeCloseTo(1 / 3, 5);
    expect(probs[1]).toBeCloseTo(1 / 3, 5);
    expect(probs[2]).toBeCloseTo(1 / 3, 5);
  });
});

describe("squaredDistance", () => {
  it("computes squared Euclidean distance", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 6, 3]);
    expect(squaredDistance(a, b)).toBeCloseTo(25, 5); // 9 + 16 + 0
  });

  it("returns 0 for identical vectors", () => {
    const a = new Float32Array([1, 2, 3]);
    expect(squaredDistance(a, a)).toBeCloseTo(0, 5);
  });
});

describe("adamUpdate", () => {
  it("moves parameters in direction that reduces gradient", () => {
    const params = new Float32Array([1, 1]);
    const grads = new Float32Array([0.5, -0.5]);
    const m = new Float32Array(2);
    const v = new Float32Array(2);

    adamUpdate(params, grads, m, v, 0.01, 0.9, 0.999, 1e-8, 1);

    // Parameter 0 should decrease (positive gradient)
    expect(params[0]).toBeLessThan(1);
    // Parameter 1 should increase (negative gradient)
    expect(params[1]).toBeGreaterThan(1);
  });
});
