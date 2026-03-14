/**
 * Method 5: Neural Classifier (MLP)
 *
 * Multi-layer neural network with configurable depth (1–3 hidden layers).
 * Each hidden layer uses ReLU activation; the output uses softmax.
 * Trained with Adam optimizer, L2 regularization.
 * Training iterations and hidden sizes scale with depth.
 * Requires 2+ classes.
 */

import type { PredictionItem } from "@/app/types";
import type { ALMethod, FitParams, FitResult } from "./types";
import { EXCLUDE_LABEL } from "./types";
import { softmax, adamUpdate, getEmbedding } from "./math";

/** Seeded random for reproducible weight initialization. */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

/** Compute hidden layer sizes that taper toward the output. */
function layerSizes(dim: number, numLayers: number): number[] {
  const first = Math.min(64, dim);
  if (numLayers === 1) return [first];
  if (numLayers === 2) return [first, Math.max(16, Math.floor(first / 2))];
  return [first, Math.max(16, Math.floor(first / 2)), Math.max(8, Math.floor(first / 4))];
}

interface Layer {
  W: Float32Array;
  b: Float32Array;
  mW: Float32Array;
  vW: Float32Array;
  mb: Float32Array;
  vb: Float32Array;
  inSize: number;
  outSize: number;
}

function createLayer(inSize: number, outSize: number, rng: () => number): Layer {
  const scale = Math.sqrt(2 / (inSize + outSize));
  const W = new Float32Array(inSize * outSize);
  const b = new Float32Array(outSize);
  for (let i = 0; i < W.length; i++) W[i] = (rng() - 0.5) * 2 * scale;
  return {
    W, b, inSize, outSize,
    mW: new Float32Array(W.length),
    vW: new Float32Array(W.length),
    mb: new Float32Array(outSize),
    vb: new Float32Array(outSize),
  };
}

/** Forward pass through one linear layer: out = in @ W + b */
function linearForward(input: Float32Array, layer: Layer): Float32Array {
  const out = new Float32Array(layer.outSize);
  for (let o = 0; o < layer.outSize; o++) {
    let sum = layer.b[o];
    for (let i = 0; i < layer.inSize; i++) {
      sum += input[i] * layer.W[i * layer.outSize + o];
    }
    out[o] = sum;
  }
  return out;
}

/** ReLU in-place, returns the same array. */
function relu(v: Float32Array): Float32Array {
  for (let i = 0; i < v.length; i++) if (v[i] < 0) v[i] = 0;
  return v;
}

function fit(params: FitParams): FitResult {
  const { embeddings, labels, scopeIds, sortBy, options } = params;
  const dim = embeddings.dimension;
  const numLayers = Math.min(3, Math.max(1, (options?.mlpLayers as number) || 1));

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

  // Build network layers
  const rng = seededRandom(42);
  const hiddenSizes = layerSizes(dim, numLayers);
  const allLayers: Layer[] = [];

  // Hidden layers
  let prevSize = dim;
  for (const hs of hiddenSizes) {
    allLayers.push(createLayer(prevSize, hs, rng));
    prevSize = hs;
  }
  // Output layer
  allLayers.push(createLayer(prevSize, nClasses, rng));

  const nHidden = allLayers.length - 1; // number of hidden (ReLU) layers
  const n = labeledItems.length;

  // Training hyperparameters — scale with depth
  const nIter = 500 + (numLayers - 1) * 250; // 500 / 750 / 1000
  const lr = 0.001;
  const lambda = 0.001;
  const beta1 = 0.9, beta2 = 0.999, eps = 1e-8;

  for (let iter = 0; iter < nIter; iter++) {
    // Zero gradients
    const dW: Float32Array[] = allLayers.map((l) => new Float32Array(l.W.length));
    const db: Float32Array[] = allLayers.map((l) => new Float32Array(l.b.length));

    for (const { emb, classIdx } of labeledItems) {
      // ── Forward ──
      const activations: Float32Array[] = [emb]; // activations[0] = input
      for (let l = 0; l < allLayers.length; l++) {
        let out = linearForward(activations[l], allLayers[l]);
        if (l < nHidden) out = relu(out); // ReLU on hidden layers only
        activations.push(out);
      }
      const logits = activations[activations.length - 1];
      const probs = softmax(Array.from(logits));

      // ── Backward ──
      // Start with output gradient: (probs - onehot) / n
      let delta = new Float32Array(nClasses);
      for (let c = 0; c < nClasses; c++) {
        delta[c] = (probs[c] - (c === classIdx ? 1 : 0)) / n;
      }

      // Backprop through layers in reverse
      for (let l = allLayers.length - 1; l >= 0; l--) {
        const input = activations[l];
        const layer = allLayers[l];

        // Accumulate weight and bias gradients
        for (let o = 0; o < layer.outSize; o++) {
          db[l][o] += delta[o];
          for (let i = 0; i < layer.inSize; i++) {
            dW[l][i * layer.outSize + o] += input[i] * delta[o];
          }
        }

        // Propagate delta to previous layer (skip for first layer)
        if (l > 0) {
          const prevDelta = new Float32Array(layer.inSize);
          const prevAct = activations[l]; // post-ReLU activation
          for (let i = 0; i < layer.inSize; i++) {
            if (prevAct[i] <= 0) continue; // ReLU gate
            let sum = 0;
            for (let o = 0; o < layer.outSize; o++) {
              sum += layer.W[i * layer.outSize + o] * delta[o];
            }
            prevDelta[i] = sum;
          }
          delta = prevDelta;
        }
      }
    }

    // L2 regularization + Adam update
    const t = iter + 1;
    for (let l = 0; l < allLayers.length; l++) {
      const layer = allLayers[l];
      // L2 on weights only
      for (let i = 0; i < layer.W.length; i++) dW[l][i] += lambda * layer.W[i];
      adamUpdate(layer.W, dW[l], layer.mW, layer.vW, lr, beta1, beta2, eps, t);
      adamUpdate(layer.b, db[l], layer.mb, layer.vb, lr, beta1, beta2, eps, t);
    }
  }

  // ── Predict ──
  const positiveClasses = labelClasses.filter((c) => c !== EXCLUDE_LABEL);
  const positiveIndices = positiveClasses.map((c) => classIndex.get(c)!);
  const unlabeledIds = scopeIds.filter((id) => !labeledSet.has(id));
  const predictions: PredictionItem[] = [];

  for (const mediaId of unlabeledIds) {
    const emb = getEmbedding(embeddings, mediaId);
    if (!emb) continue;

    // Forward pass
    let act: Float32Array = emb;
    for (let l = 0; l < allLayers.length; l++) {
      act = linearForward(act, allLayers[l]);
      if (l < nHidden) act = relu(act);
    }
    const probs = softmax(Array.from(act));

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

export const mlpMethod: ALMethod = {
  id: "mlp",
  name: "Neural network",
  description: "Train a small neural network classifier",
  minClasses: 2,
  fit,
};
