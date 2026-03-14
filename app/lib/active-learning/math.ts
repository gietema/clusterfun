/**
 * Math utilities for browser-based active learning.
 * All operations work on flat Float32Arrays for performance.
 */

import type { EmbeddingData } from "./types";

/** Get embedding for a media ID as a subarray view (zero-copy). */
export function getEmbedding(
  data: EmbeddingData,
  mediaId: number,
): Float32Array | null {
  const idx = data.idToIndex.get(mediaId);
  if (idx === undefined) return null;
  const start = idx * data.dimension;
  return data.embeddings.subarray(start, start + data.dimension);
}

/** Cosine similarity between two vectors of equal length. */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/** Dot product of two vectors. */
export function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/** L2 (Euclidean) norm of a vector. */
export function norm(v: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

/** Return a normalized copy of the vector. */
export function normalize(v: Float32Array): Float32Array {
  const n = norm(v);
  if (n === 0) return new Float32Array(v.length);
  const result = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) result[i] = v[i] / n;
  return result;
}

/** Compute the centroid (mean) of a list of vectors. */
export function centroid(vectors: Float32Array[], dim: number): Float32Array {
  const result = new Float32Array(dim);
  if (vectors.length === 0) return result;
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) result[i] += v[i];
  }
  const n = vectors.length;
  for (let i = 0; i < dim; i++) result[i] /= n;
  return result;
}

/** Softmax over an array of logits. Returns probabilities summing to 1. */
export function softmax(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/** Squared Euclidean distance between two vectors. */
export function squaredDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

/**
 * Adam optimizer update step (in-place).
 * Updates params, m (first moment), v (second moment).
 */
export function adamUpdate(
  params: Float32Array,
  grads: Float32Array,
  m: Float32Array,
  v: Float32Array,
  lr: number,
  beta1: number,
  beta2: number,
  eps: number,
  t: number,
): void {
  const bc1 = 1 - Math.pow(beta1, t);
  const bc2 = 1 - Math.pow(beta2, t);
  for (let i = 0; i < params.length; i++) {
    m[i] = beta1 * m[i] + (1 - beta1) * grads[i];
    v[i] = beta2 * v[i] + (1 - beta2) * grads[i] * grads[i];
    params[i] -= (lr * (m[i] / bc1)) / (Math.sqrt(v[i] / bc2) + eps);
  }
}
