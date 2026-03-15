import { describe, it, expect } from "vitest";
import type { EmbeddingData } from "@/app/lib/active-learning/types";
import {
  computeOutlierScores,
  findDuplicates,
  computeDistanceFromCentroid,
} from "@/app/lib/outlier-detection";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function createEmbeddings(vectors: number[][]): {
  data: EmbeddingData;
  ids: number[];
} {
  const n = vectors.length;
  const dim = vectors[0].length;
  const ids = Array.from({ length: n }, (_, i) => i);
  const flat = new Float32Array(n * dim);
  for (let i = 0; i < n; i++) {
    for (let d = 0; d < dim; d++) {
      flat[i * dim + d] = vectors[i][d];
    }
  }
  const idToIndex = new Map(ids.map((id, idx) => [id, idx]));
  return {
    data: { dimension: dim, embeddings: flat, mediaIds: ids, idToIndex },
    ids,
  };
}

// ---------------------------------------------------------------------------
// computeOutlierScores
// ---------------------------------------------------------------------------

describe("computeOutlierScores", () => {
  it("returns empty array for empty scopeIds", () => {
    const { data } = createEmbeddings([[1, 0], [0, 1]]);
    const result = computeOutlierScores(data, []);
    expect(result).toEqual([]);
  });

  it("returns score of 1 for single item", () => {
    const { data } = createEmbeddings([[1, 2, 3]]);
    const result = computeOutlierScores(data, [0]);
    expect(result).toHaveLength(1);
    expect(result[0].mediaId).toBe(0);
    expect(result[0].score).toBe(1);
  });

  it("items in a tight cluster should have lower scores than an outlier point placed far away", () => {
    // 4 points clustered near [1, 0, 0] and one outlier at [-1, -1, -1]
    const { data, ids } = createEmbeddings([
      [1, 0.01, 0],
      [1, -0.01, 0],
      [1, 0, 0.01],
      [1, 0, -0.01],
      [-1, -1, -1], // outlier
    ]);

    const results = computeOutlierScores(data, ids, 3);

    // The outlier (id 4) should have the highest score
    const outlierResult = results.find((r) => r.mediaId === 4)!;
    const clusterScores = results.filter((r) => r.mediaId !== 4);

    for (const cr of clusterScores) {
      expect(outlierResult.score).toBeGreaterThan(cr.score);
    }
  });

  it("results should be sorted by score descending", () => {
    const { data, ids } = createEmbeddings([
      [1, 0, 0],
      [1, 0.1, 0],
      [1, -0.1, 0],
      [0, 1, 0],
      [-1, -1, -1],
    ]);

    const results = computeOutlierScores(data, ids, 2);

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it("k parameter should be respected (k=1 vs k=5 should produce different but valid results)", () => {
    // Create enough points so that k=1 and k=5 are both valid
    const vectors: number[][] = [];
    for (let i = 0; i < 10; i++) {
      vectors.push([Math.cos(i * 0.3), Math.sin(i * 0.3), i * 0.1]);
    }
    // Add an outlier
    vectors.push([-5, -5, -5]);

    const { data, ids } = createEmbeddings(vectors);

    const resultsK1 = computeOutlierScores(data, ids, 1);
    const resultsK5 = computeOutlierScores(data, ids, 5);

    // Both should return results for all items
    expect(resultsK1).toHaveLength(ids.length);
    expect(resultsK5).toHaveLength(ids.length);

    // Both should be sorted descending
    for (let i = 1; i < resultsK1.length; i++) {
      expect(resultsK1[i - 1].score).toBeGreaterThanOrEqual(resultsK1[i].score);
    }
    for (let i = 1; i < resultsK5.length; i++) {
      expect(resultsK5[i - 1].score).toBeGreaterThanOrEqual(resultsK5[i].score);
    }

    // The scores should differ between k=1 and k=5 (different neighborhood sizes
    // produce different local density estimates).
    const scoresK1 = resultsK1.map((r) => r.score);
    const scoresK5 = resultsK5.map((r) => r.score);
    const allSame = scoresK1.every(
      (s, i) => Math.abs(s - scoresK5[i]) < 1e-10,
    );
    expect(allSame).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findDuplicates
// ---------------------------------------------------------------------------

describe("findDuplicates", () => {
  it("returns empty for less than 2 items", () => {
    const { data } = createEmbeddings([[1, 0, 0]]);
    expect(findDuplicates(data, [0])).toEqual([]);
    expect(findDuplicates(data, [])).toEqual([]);
  });

  it("two identical vectors should form a duplicate group", () => {
    const { data, ids } = createEmbeddings([
      [1, 2, 3],
      [1, 2, 3],
    ]);

    const groups = findDuplicates(data, ids, 0.95);

    expect(groups).toHaveLength(1);
    expect(groups[0].mediaIds).toHaveLength(2);
    expect(groups[0].mediaIds).toContain(0);
    expect(groups[0].mediaIds).toContain(1);
    expect(groups[0].similarity).toBeCloseTo(1, 3);
  });

  it("two very different vectors should NOT form a duplicate group (threshold 0.95)", () => {
    const { data, ids } = createEmbeddings([
      [1, 0, 0],
      [0, 0, 1],
    ]);

    const groups = findDuplicates(data, ids, 0.95);
    expect(groups).toHaveLength(0);
  });

  it("groups multiple duplicates into one group via union-find", () => {
    // Three nearly identical vectors should all end up in the same group
    const { data, ids } = createEmbeddings([
      [1, 0, 0],
      [1, 0.001, 0],
      [1, 0, 0.001],
      [0, 1, 0], // different — should not be in the group
    ]);

    const groups = findDuplicates(data, ids, 0.95);

    // The first three should form one group
    expect(groups).toHaveLength(1);
    expect(groups[0].mediaIds).toHaveLength(3);
    expect(groups[0].mediaIds).toContain(0);
    expect(groups[0].mediaIds).toContain(1);
    expect(groups[0].mediaIds).toContain(2);
    // id 3 should NOT be in the group
    expect(groups[0].mediaIds).not.toContain(3);
  });

  it("returns groups sorted by similarity descending", () => {
    // Create two separate duplicate groups with different levels of similarity
    const { data, ids } = createEmbeddings([
      // Group A: very similar (nearly identical)
      [1, 0, 0],
      [1, 0, 0],
      // Group B: similar but less so
      [0, 1, 0],
      [0, 1, 0.2],
    ]);

    const groups = findDuplicates(data, ids, 0.95);

    if (groups.length >= 2) {
      for (let i = 1; i < groups.length; i++) {
        expect(groups[i - 1].similarity).toBeGreaterThanOrEqual(
          groups[i].similarity,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// computeDistanceFromCentroid
// ---------------------------------------------------------------------------

describe("computeDistanceFromCentroid", () => {
  it("returns empty for empty scopeIds", () => {
    const { data } = createEmbeddings([[1, 0], [0, 1]]);
    const result = computeDistanceFromCentroid(data, []);
    expect(result).toEqual([]);
  });

  it("items closer to centroid should have lower scores", () => {
    // Centroid will be near [1, 0.5, 0], so the vector closest to that
    // direction should have the lowest score, and the orthogonal one the
    // highest.
    const { data, ids } = createEmbeddings([
      [1, 0, 0],   // close to centroid direction
      [1, 1, 0],   // close to centroid direction
      [0, 0, 1],   // far from centroid direction (orthogonal)
    ]);

    const results = computeDistanceFromCentroid(data, ids);

    // The point at [0, 0, 1] (id=2) should have the highest score (furthest)
    const farResult = results.find((r) => r.mediaId === 2)!;
    const closeResults = results.filter((r) => r.mediaId !== 2);

    for (const cr of closeResults) {
      expect(farResult.score).toBeGreaterThan(cr.score);
    }
  });

  it("results should be sorted by score descending", () => {
    const { data, ids } = createEmbeddings([
      [1, 0, 0],
      [1, 0.1, 0],
      [0, 1, 0],
      [-1, -1, 0],
      [0, 0, 1],
    ]);

    const results = computeDistanceFromCentroid(data, ids);

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });
});
