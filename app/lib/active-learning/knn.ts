/**
 * Method 2: K-Nearest Neighbors
 *
 * For each unlabeled item, finds the K nearest labeled items (by cosine
 * similarity) and votes on class membership weighted by similarity.
 * Works with 1+ classes. No training — just distance computation.
 */

import type { PredictionItem } from "@/app/types";
import type { ALMethod, FitParams, FitResult } from "./types";
import { EXCLUDE_LABEL } from "./types";
import { normalize, dot, getEmbedding } from "./math";

interface LabeledItem {
  emb: Float32Array;
  label: string;
}

function fit(params: FitParams): FitResult {
  const { embeddings, labels, scopeIds, sortBy } = params;

  // Collect labeled items with normalized embeddings
  const labeledItems: LabeledItem[] = [];
  const labeledSet = new Set<number>();

  for (const [mediaId, label] of labels) {
    const emb = getEmbedding(embeddings, mediaId);
    if (!emb) continue;
    labeledSet.add(mediaId);
    labeledItems.push({ emb: normalize(emb), label });
  }

  if (labeledItems.length === 0) {
    return { predictions: [], label_classes: [], n_labeled: 0 };
  }

  const K = Math.min(5, labeledItems.length);
  const labelClasses = [...new Set(labels.values())].sort();
  const positiveClasses = labelClasses.filter((c) => c !== EXCLUDE_LABEL);

  const unlabeledIds = scopeIds.filter((id) => !labeledSet.has(id));
  const predictions: PredictionItem[] = [];

  for (const mediaId of unlabeledIds) {
    const emb = getEmbedding(embeddings, mediaId);
    if (!emb) continue;

    const normEmb = normalize(emb);

    // Compute similarity to every labeled item
    const sims: { label: string; sim: number }[] = labeledItems.map(
      (item) => ({
        label: item.label,
        sim: dot(normEmb, item.emb),
      }),
    );

    // Take top-K
    sims.sort((a, b) => b.sim - a.sim);
    const topK = sims.slice(0, K);

    // Weighted voting
    const votes: Record<string, number> = {};
    let totalWeight = 0;
    for (const { label, sim } of topK) {
      const w = Math.max(0, sim);
      votes[label] = (votes[label] || 0) + w;
      totalWeight += w;
    }

    // Probabilities
    const probabilities: Record<string, number> = {};
    for (const cls of labelClasses) {
      probabilities[cls] = totalWeight > 0 ? (votes[cls] || 0) / totalWeight : 0;
    }

    // Best class
    let bestClass = positiveClasses[0] || labelClasses[0];
    let bestProb = 0;
    for (const cls of labelClasses) {
      if ((probabilities[cls] ?? 0) > bestProb) {
        bestProb = probabilities[cls];
        bestClass = cls;
      }
    }

    const positiveScore =
      positiveClasses.length > 0
        ? positiveClasses.reduce((s, c) => s + (probabilities[c] || 0), 0)
        : bestProb;

    predictions.push({
      media_id: mediaId,
      predicted_class: bestClass,
      uncertainty: 1 - bestProb,
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

export const knnMethod: ALMethod = {
  id: "knn",
  name: "Neighbor voting",
  description: "Classify by nearest labeled neighbors",
  minClasses: 1,
  fit,
};
