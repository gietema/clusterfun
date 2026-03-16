import { describe, it, expect } from "vitest";
import type { PredictionItem, ProbeSortBy } from "@/app/types";

// Extract the sortPredictions logic (same as in use-active-learning.ts)
function sortPredictions(
  predictions: PredictionItem[],
  classFilter: string | null,
  sortBy: ProbeSortBy,
): PredictionItem[] {
  let items = classFilter
    ? predictions.filter((p) => p.predicted_class === classFilter)
    : [...predictions];

  if (classFilter) {
    items.sort((a, b) =>
      sortBy === "uncertainty"
        ? b.uncertainty - a.uncertainty
        : (b.probabilities[classFilter] ?? 0) - (a.probabilities[classFilter] ?? 0),
    );
  } else {
    items.sort((a, b) =>
      sortBy === "uncertainty"
        ? b.uncertainty - a.uncertainty
        : b.score - a.score,
    );
  }

  return items;
}

// Extract the applyOrder logic
function computeOrderedIds(
  predictions: PredictionItem[],
  classFilter: string | null,
  sortBy: ProbeSortBy,
  mediaIndices: number[],
  totalCount: number,
): number[] {
  const sorted = sortPredictions(predictions, classFilter, sortBy);
  const orderedIds = sorted.map((p) => p.media_id);
  const idSet = new Set(orderedIds);

  // When mediaIndices is empty (grid view = "all items"), generate the
  // full ID range so predictions appear first, then everything else.
  const baseIds = mediaIndices.length > 0
    ? mediaIndices
    : Array.from({ length: totalCount }, (_, i) => i);

  const remaining = baseIds.filter((id) => !idSet.has(id));
  return [...orderedIds, ...remaining];
}

function makePredictions(ids: number[], scores: number[]): PredictionItem[] {
  return ids.map((id, i) => ({
    media_id: id,
    predicted_class: "cat",
    uncertainty: 1 - scores[i],
    probabilities: { cat: scores[i] },
    score: scores[i],
  }));
}

describe("sortPredictions", () => {
  it("sorts by score descending by default", () => {
    const predictions = makePredictions([1, 2, 3], [0.5, 0.9, 0.7]);
    const sorted = sortPredictions(predictions, null, "confidence");
    expect(sorted.map((p) => p.media_id)).toEqual([2, 3, 1]);
  });

  it("sorts by uncertainty descending", () => {
    const predictions = makePredictions([1, 2, 3], [0.5, 0.9, 0.7]);
    const sorted = sortPredictions(predictions, null, "uncertainty");
    // uncertainty = 1 - score, sorted desc: id=1 (0.5), id=3 (0.3), id=2 (0.1)
    expect(sorted.map((p) => p.media_id)).toEqual([1, 3, 2]);
  });

  it("filters by class", () => {
    const predictions: PredictionItem[] = [
      { media_id: 1, predicted_class: "cat", uncertainty: 0.1, probabilities: { cat: 0.9 }, score: 0.9 },
      { media_id: 2, predicted_class: "dog", uncertainty: 0.2, probabilities: { dog: 0.8 }, score: 0.8 },
      { media_id: 3, predicted_class: "cat", uncertainty: 0.3, probabilities: { cat: 0.7 }, score: 0.7 },
    ];
    const sorted = sortPredictions(predictions, "cat", "confidence");
    expect(sorted.map((p) => p.media_id)).toEqual([1, 3]);
  });
});

describe("computeOrderedIds (applyOrder logic)", () => {
  it("puts predictions first, then remaining from explicit selection", () => {
    const predictions = makePredictions([5, 3], [0.9, 0.7]);
    const mediaIndices = [1, 2, 3, 4, 5];
    const result = computeOrderedIds(predictions, null, "confidence", mediaIndices, 10);
    // Predictions first (sorted by score): 5, 3
    // Then remaining from mediaIndices: 1, 2, 4
    expect(result).toEqual([5, 3, 1, 2, 4]);
  });

  it("handles empty mediaIndices (grid view = all items) using totalCount", () => {
    const predictions = makePredictions([3, 7], [0.9, 0.8]);
    const result = computeOrderedIds(predictions, null, "confidence", [], 10);
    // Predictions first: 3, 7
    // Then remaining 0-9 except 3 and 7: 0, 1, 2, 4, 5, 6, 8, 9
    expect(result).toEqual([3, 7, 0, 1, 2, 4, 5, 6, 8, 9]);
  });

  it("returns only predictions when totalCount is 0 and mediaIndices is empty", () => {
    const predictions = makePredictions([1, 2], [0.9, 0.8]);
    const result = computeOrderedIds(predictions, null, "confidence", [], 0);
    expect(result).toEqual([1, 2]);
  });

  it("does not duplicate prediction IDs in remaining", () => {
    const predictions = makePredictions([0, 2, 4], [0.9, 0.8, 0.7]);
    const mediaIndices = [0, 1, 2, 3, 4];
    const result = computeOrderedIds(predictions, null, "confidence", mediaIndices, 5);
    // No duplicates
    expect(new Set(result).size).toBe(result.length);
    expect(result).toEqual([0, 2, 4, 1, 3]);
  });

  it("works with large totalCount and few predictions", () => {
    const predictions = makePredictions([999, 500], [0.95, 0.85]);
    const result = computeOrderedIds(predictions, null, "confidence", [], 1000);
    // First two should be predictions
    expect(result[0]).toBe(999);
    expect(result[1]).toBe(500);
    // Total length should be 1000
    expect(result.length).toBe(1000);
    // No duplicates
    expect(new Set(result).size).toBe(1000);
  });
});
