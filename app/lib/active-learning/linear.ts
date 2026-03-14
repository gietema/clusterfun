/**
 * Method 3: Linear Classifier (Logistic Regression)
 *
 * Trains a linear model (weight matrix + bias) via gradient descent
 * with softmax cross-entropy loss and L2 regularization.
 * Requires 2+ classes. Fast to train in the browser.
 */

import type { PredictionItem } from "@/app/types";
import type { ALMethod, FitParams, FitResult } from "./types";
import { EXCLUDE_LABEL } from "./types";
import { softmax, getEmbedding } from "./math";

function fit(params: FitParams): FitResult {
  const { embeddings, labels, scopeIds, sortBy } = params;
  const dim = embeddings.dimension;

  // Collect labeled data
  const labeledItems: { emb: Float32Array; classIdx: number }[] = [];
  const labeledSet = new Set<number>();

  const labelClasses = [...new Set(labels.values())].sort();
  const nClasses = labelClasses.length;
  const classIndex = new Map(labelClasses.map((c, i) => [c, i]));

  for (const [mediaId, label] of labels) {
    const emb = getEmbedding(embeddings, mediaId);
    if (!emb) continue;
    labeledSet.add(mediaId);
    labeledItems.push({ emb, classIdx: classIndex.get(label)! });
  }

  if (labeledItems.length === 0 || nClasses < 2) {
    return { predictions: [], label_classes: labelClasses, n_labeled: labeledSet.size };
  }

  // Initialize weights (Xavier)
  const scale = Math.sqrt(2 / (dim + nClasses));
  const W = new Float32Array(dim * nClasses);
  const b = new Float32Array(nClasses);
  for (let i = 0; i < W.length; i++) W[i] = (Math.random() - 0.5) * 2 * scale;

  // Training hyperparameters
  const nIter = 300;
  const lambda = 0.01;
  const n = labeledItems.length;

  // Adaptive learning rate
  let lr = 0.1;

  for (let iter = 0; iter < nIter; iter++) {
    const dW = new Float32Array(dim * nClasses);
    const db = new Float32Array(nClasses);

    for (const { emb, classIdx } of labeledItems) {
      // Forward: logits = emb @ W + b
      const logits = new Array(nClasses);
      for (let c = 0; c < nClasses; c++) {
        let sum = b[c];
        for (let d = 0; d < dim; d++) sum += emb[d] * W[d * nClasses + c];
        logits[c] = sum;
      }

      const probs = softmax(logits);

      // Gradient: (probs - onehot) / n
      for (let c = 0; c < nClasses; c++) {
        const grad = (probs[c] - (c === classIdx ? 1 : 0)) / n;
        db[c] += grad;
        for (let d = 0; d < dim; d++) {
          dW[d * nClasses + c] += emb[d] * grad;
        }
      }
    }

    // Update with L2 regularization
    for (let i = 0; i < W.length; i++) W[i] -= lr * (dW[i] + lambda * W[i]);
    for (let c = 0; c < nClasses; c++) b[c] -= lr * db[c];

    // Decay learning rate
    if (iter === 100) lr *= 0.5;
    if (iter === 200) lr *= 0.5;
  }

  // Predict
  const positiveClasses = labelClasses.filter((c) => c !== EXCLUDE_LABEL);
  const positiveIndices = positiveClasses.map((c) => classIndex.get(c)!);
  const unlabeledIds = scopeIds.filter((id) => !labeledSet.has(id));
  const predictions: PredictionItem[] = [];

  for (const mediaId of unlabeledIds) {
    const emb = getEmbedding(embeddings, mediaId);
    if (!emb) continue;

    const logits = new Array(nClasses);
    for (let c = 0; c < nClasses; c++) {
      let sum = b[c];
      for (let d = 0; d < dim; d++) sum += emb[d] * W[d * nClasses + c];
      logits[c] = sum;
    }

    const probs = softmax(logits);

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

export const linearMethod: ALMethod = {
  id: "linear",
  name: "Linear classifier",
  description: "Train a linear decision boundary",
  minClasses: 2,
  fit,
};
