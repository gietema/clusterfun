import type { PredictionItem, ProbeSortBy } from "@/app/types";

export const EXCLUDE_LABEL = "exclude";

export interface EmbeddingData {
  dimension: number;
  /** Flat Float32Array: embeddings[i * dimension + d] = embedding i, dimension d */
  embeddings: Float32Array;
  /** Ordered list of media IDs (index matches row in embeddings) */
  mediaIds: number[];
  /** Fast lookup: mediaId -> row index */
  idToIndex: Map<number, number>;
}

export interface FitParams {
  embeddings: EmbeddingData;
  /** mediaId -> label string */
  labels: Map<number, string>;
  /** IDs to generate predictions for */
  scopeIds: number[];
  sortBy: ProbeSortBy;
  /** Method-specific options (e.g. { mlpLayers: 2 }) */
  options?: Record<string, unknown>;
}

export interface FitResult {
  predictions: PredictionItem[];
  label_classes: string[];
  n_labeled: number;
}

export interface ALMethod {
  id: string;
  name: string;
  description: string;
  /** Minimum number of distinct classes needed */
  minClasses: number;
  fit(params: FitParams): FitResult;
}
