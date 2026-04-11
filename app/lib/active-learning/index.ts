/**
 * Active learning method registry.
 *
 * Exports all 5 methods in order of increasing complexity:
 * 1. Centroid Search — similarity to labeled centroid (1+ class)
 * 2. KNN — nearest neighbor voting (1+ class)
 * 3. Linear Classifier — logistic regression (2+ classes)
 * 4. Prototype Network — class prototypes + temperature (2+ classes)
 * 5. Neural Network (MLP) — 2-layer NN (2+ classes)
 */

export type { ALMethod, FitParams, FitResult, EmbeddingData } from "./types";
export { EXCLUDE_LABEL } from "./types";

import { centroidMethod } from "./centroid";
import { knnMethod } from "./knn";
import { linearMethod } from "./linear";
import { prototypeMethod } from "./prototype";
import { mlpMethod } from "./mlp";
import type { ALMethod } from "./types";

/** All methods in order of increasing complexity. */
export const AL_METHODS: ALMethod[] = [
  centroidMethod,
  knnMethod,
  linearMethod,
  prototypeMethod,
  mlpMethod,
];

/** Lookup a method by ID. Falls back to centroid if not found. */
export function getMethod(id: string): ALMethod {
  return AL_METHODS.find((m) => m.id === id) ?? centroidMethod;
}
