/**
 * Method 1: Centroid Search (simplest)
 *
 * Computes the centroid (mean embedding) of each labeled class and ranks
 * unlabeled items by cosine similarity to the positive centroids.
 * Works with 1+ classes. No training needed — pure vector math.
 */

import type { PredictionItem } from "@/app/types";
import type { ALMethod, FitParams, FitResult } from "./types";
import { EXCLUDE_LABEL } from "./types";
import { centroid, normalize, dot, getEmbedding } from "./math";

function fit(params: FitParams): FitResult {
  const { embeddings, labels, scopeIds, sortBy } = params;
  const dim = embeddings.dimension;

  // Group labeled embeddings by class
  const classEmbs = new Map<string, Float32Array[]>();
  const labeledSet = new Set<number>();

  for (const [mediaId, label] of labels) {
    const emb = getEmbedding(embeddings, mediaId);
    if (!emb) continue;
    labeledSet.add(mediaId);
    if (!classEmbs.has(label)) classEmbs.set(label, []);
    classEmbs.get(label)!.push(emb);
  }

  if (labeledSet.size === 0) {
    return { predictions: [], label_classes: [], n_labeled: 0 };
  }

  const labelClasses = [...classEmbs.keys()].sort();
  const positiveClasses = labelClasses.filter((c) => c !== EXCLUDE_LABEL);

  // Compute normalized centroids per class
  const centroids = new Map<string, Float32Array>();
  for (const [cls, embs] of classEmbs) {
    centroids.set(cls, normalize(centroid(embs, dim)));
  }

  // Score every unlabeled item
  const unlabeledIds = scopeIds.filter((id) => !labeledSet.has(id));
  const predictions: PredictionItem[] = [];

  for (const mediaId of unlabeledIds) {
    const emb = getEmbedding(embeddings, mediaId);
    if (!emb) continue;

    const normEmb = normalize(emb);
    const sims: Record<string, number> = {};

    for (const [cls, cent] of centroids) {
      sims[cls] = dot(normEmb, cent);
    }

    // Best matching class
    let bestClass = positiveClasses[0] || labelClasses[0];
    let bestSim = -Infinity;
    for (const cls of labelClasses) {
      if ((sims[cls] ?? -Infinity) > bestSim) {
        bestSim = sims[cls];
        bestClass = cls;
      }
    }

    // Score = average similarity to positive centroids
    const positiveScore =
      positiveClasses.length > 0
        ? positiveClasses.reduce((s, c) => s + Math.max(0, sims[c] ?? 0), 0) /
          positiveClasses.length
        : Math.max(0, bestSim);

    // Similarities → probabilities (normalize positive parts)
    const total =
      Object.values(sims).reduce((s, v) => s + Math.max(0, v), 0) || 1;
    const probabilities: Record<string, number> = {};
    for (const cls of labelClasses) {
      probabilities[cls] = Math.max(0, sims[cls] ?? 0) / total;
    }

    predictions.push({
      media_id: mediaId,
      predicted_class: bestClass,
      uncertainty: 1 - Math.max(0, bestSim),
      probabilities,
      score: positiveScore,
    });
  }

  if (sortBy === "uncertainty") {
    predictions.sort((a, b) => b.uncertainty - a.uncertainty);
  } else {
    predictions.sort((a, b) => b.score - a.score);
  }

  return { predictions, label_classes: labelClasses, n_labeled: labeledSet.size };
}

export const centroidMethod: ALMethod = {
  id: "centroid",
  name: "Similar search",
  description: "Rank by similarity to labeled examples",
  minClasses: 1,
  fit,
};
