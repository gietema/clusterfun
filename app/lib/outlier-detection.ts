/**
 * In-browser outlier detection and duplicate finding.
 *
 * Uses cached embeddings from the Jotai store and the shared math utilities
 * to compute LOF-based outlier scores, near-duplicate groups, and simple
 * centroid-distance "weirdness" scores — all without a server round-trip.
 */

import {
  getEmbedding,
  cosineSimilarity,
  centroid,
} from "./active-learning/math";
import type { EmbeddingData } from "./active-learning/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OutlierResult {
  mediaId: number;
  /** Higher = more outlier-like. */
  score: number;
}

export interface DuplicateGroup {
  groupId: number;
  mediaIds: number[];
  /** Average pairwise cosine similarity within the group. */
  similarity: number;
}

// ---------------------------------------------------------------------------
// Union-Find (disjoint set) for connected-component grouping
// ---------------------------------------------------------------------------

class UnionFind {
  parent: number[];
  rank: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }

  find(x: number): number {
    // Iterative path compression to avoid stack overflow on large inputs.
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root];
    while (this.parent[x] !== root) {
      const next = this.parent[x];
      this.parent[x] = root;
      x = next;
    }
    return root;
  }

  union(x: number, y: number): void {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return;
    if (this.rank[rx] < this.rank[ry]) {
      this.parent[rx] = ry;
    } else if (this.rank[rx] > this.rank[ry]) {
      this.parent[ry] = rx;
    } else {
      this.parent[ry] = rx;
      this.rank[rx]++;
    }
  }
}

// ---------------------------------------------------------------------------
// 1. LOF-based outlier detection
// ---------------------------------------------------------------------------

/**
 * Compute Local Outlier Factor scores for every media ID in `scopeIds`.
 *
 * The LOF algorithm compares the local density around each point to the
 * densities of its k nearest neighbors.  Points in sparser regions receive
 * higher scores — a score significantly above 1.0 indicates an outlier.
 *
 * @param embeddings  Cached embedding data (flat Float32Array + metadata).
 * @param scopeIds    Media IDs to consider (must be a subset of embeddings).
 * @param k           Number of nearest neighbors (default 15).
 * @returns           Results sorted by LOF score descending.
 */
export function computeOutlierScores(
  embeddings: EmbeddingData,
  scopeIds: number[],
  k: number = 15,
): OutlierResult[] {
  const n = scopeIds.length;
  if (n === 0) return [];

  // Clamp k so it does not exceed the number of available neighbors.
  const effectiveK = Math.min(k, n - 1);
  if (effectiveK <= 0) {
    // Only one point (or zero) — nothing to compare.
    return scopeIds.map((id) => ({ mediaId: id, score: 1 }));
  }

  // ------------------------------------------------------------------
  // Step 1 — Retrieve embeddings for all points in scope, filtering
  //          out any that are missing so the distance matrix is valid.
  // ------------------------------------------------------------------
  const validVecs: Float32Array[] = [];
  const validIds: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = getEmbedding(embeddings, scopeIds[i]);
    if (v !== null) {
      validVecs.push(v);
      validIds.push(scopeIds[i]);
    }
  }

  const m = validVecs.length;
  if (m <= 1) {
    return validIds.map((id) => ({ mediaId: id, score: 1 }));
  }

  // Re-clamp k for the filtered set.
  const kActual = Math.min(effectiveK, m - 1);
  if (kActual <= 0) {
    return validIds.map((id) => ({ mediaId: id, score: 1 }));
  }

  // ------------------------------------------------------------------
  // Step 2 — Compute pairwise cosine DISTANCE matrix.
  // Using a flat Float64Array to avoid per-row array allocation.
  // dist[i * m + j] = 1 - cosineSimilarity(vec_i, vec_j)
  // ------------------------------------------------------------------
  const dist = new Float64Array(m * m);
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      const d = 1 - cosineSimilarity(validVecs[i], validVecs[j]);
      dist[i * m + j] = d;
      dist[j * m + i] = d;
    }
  }

  // ------------------------------------------------------------------
  // Step 3 — Find k nearest neighbors for every point.
  // knnIndices[i] contains the indices (into validIds) of i's k-NN.
  // ------------------------------------------------------------------
  const knnIndices: number[][] = new Array(m);
  const kDist = new Float64Array(m); // k-distance for each point

  for (let i = 0; i < m; i++) {
    // Build (index, distance) pairs for all other points.
    const neighbors: { idx: number; d: number }[] = [];
    for (let j = 0; j < m; j++) {
      if (j === i) continue;
      neighbors.push({ idx: j, d: dist[i * m + j] });
    }
    // Partial sort: we only need the top-k smallest.
    neighbors.sort((a, b) => a.d - b.d);
    knnIndices[i] = neighbors.slice(0, kActual).map((nb) => nb.idx);
    kDist[i] = neighbors[kActual - 1].d;
  }

  // ------------------------------------------------------------------
  // Step 4 — Reachability distance & Local Reachability Density (LRD).
  //   reach_dist(p, o) = max(kDist[o], dist(p, o))
  //   LRD(p) = k / sum(reach_dist(p, o) for o in kNN(p))
  // ------------------------------------------------------------------
  const lrd = new Float64Array(m);
  for (let i = 0; i < m; i++) {
    let reachSum = 0;
    for (const j of knnIndices[i]) {
      reachSum += Math.max(kDist[j], dist[i * m + j]);
    }
    lrd[i] = reachSum === 0 ? 0 : kActual / reachSum;
  }

  // ------------------------------------------------------------------
  // Step 5 — LOF score.
  //   LOF(p) = mean( LRD(o) / LRD(p)  for o in kNN(p) )
  // ------------------------------------------------------------------
  const results: OutlierResult[] = new Array(m);
  for (let i = 0; i < m; i++) {
    let lofSum = 0;
    if (lrd[i] === 0) {
      // If the point has zero density, treat it as a strong outlier.
      results[i] = { mediaId: validIds[i], score: Infinity };
      continue;
    }
    for (const j of knnIndices[i]) {
      lofSum += lrd[j] / lrd[i];
    }
    results[i] = { mediaId: validIds[i], score: lofSum / kActual };
  }

  // Sort by score descending (biggest outliers first).
  results.sort((a, b) => b.score - a.score);
  return results;
}

// ---------------------------------------------------------------------------
// 2. Duplicate detection via cosine similarity + union-find
// ---------------------------------------------------------------------------

/**
 * Find groups of near-duplicate items based on cosine similarity.
 *
 * @param embeddings  Cached embedding data.
 * @param scopeIds    Media IDs to consider.
 * @param threshold   Minimum cosine similarity to consider a pair as
 *                    duplicates (default 0.95).
 * @returns           Duplicate groups sorted by average similarity descending.
 */
export function findDuplicates(
  embeddings: EmbeddingData,
  scopeIds: number[],
  threshold: number = 0.95,
): DuplicateGroup[] {
  const n = scopeIds.length;
  if (n < 2) return [];

  // Retrieve embeddings.
  const vecs: (Float32Array | null)[] = new Array(n);
  for (let i = 0; i < n; i++) {
    vecs[i] = getEmbedding(embeddings, scopeIds[i]);
  }

  // Union-Find for grouping.
  const uf = new UnionFind(n);

  // Track per-pair similarities that exceed the threshold so we can compute
  // average similarity per group later.
  const edgeSims: { i: number; j: number; sim: number }[] = [];

  for (let i = 0; i < n; i++) {
    const vi = vecs[i];
    if (vi === null) continue;
    for (let j = i + 1; j < n; j++) {
      const vj = vecs[j];
      if (vj === null) continue;
      const sim = cosineSimilarity(vi, vj);
      if (sim >= threshold) {
        uf.union(i, j);
        edgeSims.push({ i, j, sim });
      }
    }
  }

  // Collect connected components (groups with more than one member).
  const groupMap = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = uf.find(i);
    let members = groupMap.get(root);
    if (!members) {
      members = [];
      groupMap.set(root, members);
    }
    members.push(i);
  }

  // Build result array, computing average intra-group similarity.
  const groups: DuplicateGroup[] = [];
  let nextGroupId = 0;

  groupMap.forEach((members) => {
    if (members.length < 2) return;

    // Average similarity: consider all pairs within the group.
    const memberSet = new Set(members);
    let simSum = 0;
    let simCount = 0;
    for (const edge of edgeSims) {
      if (memberSet.has(edge.i) && memberSet.has(edge.j)) {
        simSum += edge.sim;
        simCount++;
      }
    }

    groups.push({
      groupId: nextGroupId++,
      mediaIds: members.map((idx) => scopeIds[idx]),
      similarity: simCount > 0 ? simSum / simCount : threshold,
    });
  });

  // Sort by average similarity descending (most similar first).
  groups.sort((a, b) => b.similarity - a.similarity);
  return groups;
}

// ---------------------------------------------------------------------------
// 3. Centroid-distance "weirdness" score
// ---------------------------------------------------------------------------

/**
 * Rank items by cosine distance from the embedding centroid.
 *
 * This is a simpler and faster alternative to full LOF — useful as a quick
 * "weirdness" heuristic.  Items furthest from the mean are most unusual.
 *
 * @param embeddings  Cached embedding data.
 * @param scopeIds    Media IDs to consider.
 * @returns           Results sorted by distance descending.
 */
export function computeDistanceFromCentroid(
  embeddings: EmbeddingData,
  scopeIds: number[],
): OutlierResult[] {
  const n = scopeIds.length;
  if (n === 0) return [];

  // Gather embedding vectors.
  const vecs: Float32Array[] = [];
  const validIds: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = getEmbedding(embeddings, scopeIds[i]);
    if (v !== null) {
      vecs.push(v);
      validIds.push(scopeIds[i]);
    }
  }

  if (vecs.length === 0) return [];

  // Compute centroid.
  const center = centroid(vecs, embeddings.dimension);

  // Score each point by cosine distance from centroid.
  const results: OutlierResult[] = new Array(vecs.length);
  for (let i = 0; i < vecs.length; i++) {
    const dist = 1 - cosineSimilarity(vecs[i], center);
    results[i] = { mediaId: validIds[i], score: dist };
  }

  // Sort by distance descending (furthest from center = weirdest).
  results.sort((a, b) => b.score - a.score);
  return results;
}
