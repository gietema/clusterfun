/**
 * Method 4: Prototype Network
 *
 * Computes class prototypes (centroids) and classifies using softmax
 * over negative squared distances with a learned temperature parameter.
 * More robust than simple centroid matching — temperature is optimized
 * via gradient descent on the training data to calibrate confidence.
 * Requires 2+ classes.
 */

import type { PredictionItem } from "@/app/types";
import type { ALMethod, FitParams, FitResult } from "./types";
import { EXCLUDE_LABEL } from "./types";
import { centroid, squaredDistance, softmax, getEmbedding } from "./math";

function fit(params: FitParams): FitResult {
  const { embeddings, labels, scopeIds, sortBy } = params;
  const dim = embeddings.dimension;

  // Group by class
  const classEmbs = new Map<string, Float32Array[]>();
  const labeledSet = new Set<number>();

  for (const [mediaId, label] of labels) {
    const emb = getEmbedding(embeddings, mediaId);
    if (!emb) continue;
    labeledSet.add(mediaId);
    if (!classEmbs.has(label)) classEmbs.set(label, []);
    classEmbs.get(label)!.push(emb);
  }

  const labelClasses = [...classEmbs.keys()].sort();
  const nClasses = labelClasses.length;

  if (labeledSet.size === 0 || nClasses < 2) {
    return { predictions: [], label_classes: labelClasses, n_labeled: labeledSet.size };
  }

  // Compute class prototypes
  const prototypes: Float32Array[] = labelClasses.map((cls) =>
    centroid(classEmbs.get(cls)!, dim),
  );

  // Learn temperature via gradient descent on training cross-entropy
  let temperature = 1.0;
  const lr = 0.05;
  const nIter = 100;

  for (let iter = 0; iter < nIter; iter++) {
    let gradT = 0;

    for (const [mediaId, label] of labels) {
      const emb = getEmbedding(embeddings, mediaId);
      if (!emb) continue;

      const trueIdx = labelClasses.indexOf(label);

      // Negative squared distances scaled by temperature
      const negDists = prototypes.map((proto) => {
        return -squaredDistance(emb, proto) / temperature;
      });

      const probs = softmax(negDists);

      // Gradient of temperature for cross-entropy loss
      for (let c = 0; c < nClasses; c++) {
        const rawDist = squaredDistance(emb, prototypes[c]);
        const target = c === trueIdx ? 1 : 0;
        gradT += (rawDist / (temperature * temperature)) * (probs[c] - target);
      }
    }

    temperature -= (lr * gradT) / labeledSet.size;
    temperature = Math.max(0.01, temperature); // Prevent collapse
  }

  // Predict
  const positiveClasses = labelClasses.filter((c) => c !== EXCLUDE_LABEL);
  const positiveIndices = positiveClasses.map((c) => labelClasses.indexOf(c));
  const unlabeledIds = scopeIds.filter((id) => !labeledSet.has(id));
  const predictions: PredictionItem[] = [];

  for (const mediaId of unlabeledIds) {
    const emb = getEmbedding(embeddings, mediaId);
    if (!emb) continue;

    const negDists = prototypes.map((proto) => {
      return -squaredDistance(emb, proto) / temperature;
    });

    const probs = softmax(negDists);

    let bestIdx = 0;
    for (let c = 1; c < nClasses; c++) {
      if (probs[c] > probs[bestIdx]) bestIdx = c;
    }

    const probabilities: Record<string, number> = {};
    for (let c = 0; c < nClasses; c++) probabilities[labelClasses[c]] = probs[c];

    const positiveScore =
      positiveIndices.length > 0
        ? positiveIndices.reduce((s, i) => s + probs[i], 0)
        : probs[bestIdx];

    predictions.push({
      media_id: mediaId,
      predicted_class: labelClasses[bestIdx],
      uncertainty: 1 - probs[bestIdx],
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

export const prototypeMethod: ALMethod = {
  id: "prototype",
  name: "Prototype matching",
  description: "Match items to learned class prototypes",
  minClasses: 2,
  fit,
};
