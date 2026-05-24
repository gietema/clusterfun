# Active Learning Methods

Clusterfun ships five active learning methods that run **entirely in the browser**.
Pre-computed embeddings are fetched from the backend once and cached; all training
and inference happens on the client using typed arrays and plain JavaScript math.
This keeps the backend lightweight and lets the UI stay responsive.

## How it works

1. Label a few items in the grid using the labelling panel.
2. Pick a method from the dropdown (default: **Similar search**).
3. Choose a sort order: *most similar first* or *most uncertain first*.
4. Click **Suggest next** (first time) or **Refit** (subsequent times).
5. The grid reorders so the most relevant items appear first.

After fitting, each item in the grid gets a **prediction badge**:

| Badge colour | Meaning |
|---|---|
| Emerald | Confident prediction (uncertainty ≤ 30%) |
| Amber | Uncertain prediction (uncertainty > 30%) |

The badge shows the predicted class name and a confidence percentage, e.g. `cat 92%`.

Items with the special `exclude` label show a dark overlay with an "excluded" tag.
You can exclude items by pressing **x** or clicking the red X button that appears on
hover while active learning is active.

### Sort modes

| Option | Description |
|---|---|
| **Most similar first** | Sort by *score* descending. Items the model thinks are most likely to be positive appear first. Use this to quickly find more of a class you are building. |
| **Most uncertain first** | Sort by *uncertainty* descending. Items the model is least sure about appear first. Use this to refine a decision boundary by labelling the hardest examples. |

### Fallback behaviour

Methods 3–5 require two or more labelled classes. If you have only one class, the
system silently falls back to **Similar search** regardless of which method is selected.

---

## Method 1 — Similar search (Centroid)

**Complexity:** Lowest
**Minimum classes:** 1
**Training:** None — pure vector math

### Algorithm

1. Group all labelled embeddings by class.
2. Compute the **centroid** (element-wise mean) of each class and L2-normalise it.
3. For every unlabelled item, compute the cosine similarity to each centroid.
4. The predicted class is the centroid with the highest similarity.
5. Probabilities are the positive-clipped similarities divided by their sum.

### Score and uncertainty

| Field | Formula |
|---|---|
| `uncertainty` | `1 − max(0, best_similarity)` |
| `score` | Mean of `max(0, similarity)` over all positive (non-exclude) centroids |

### When to use

You have a single class and want to find more items like the ones you labelled.
This is the fastest method and a good starting point.

---

## Method 2 — Neighbor voting (KNN)

**Complexity:** Low
**Minimum classes:** 1
**Training:** None — distance computation only

### Algorithm

1. Normalise all labelled embeddings once.
2. For each unlabelled item, compute cosine similarity to every labelled item.
3. Take the **K = min(5, n_labelled)** nearest neighbours.
4. Weighted vote: each neighbour votes for its class, weighted by `max(0, similarity)`.
5. Probabilities = `vote(class) / total_weight`.

### Score and uncertainty

| Field | Formula |
|---|---|
| `uncertainty` | `1 − max_probability` |
| `score` | Sum of probabilities for positive (non-exclude) classes |

### When to use

You have a few labelled examples from multiple classes and want a non-parametric
classifier. KNN handles noisy labels gracefully because outlier labels get
outvoted by nearby items.

---

## Method 3 — Linear classifier (Logistic Regression)

**Complexity:** Medium
**Minimum classes:** 2
**Training:** Gradient descent, ~300 iterations

### Architecture

A single linear layer:

```
logits = embedding @ W + b        (W: dim × n_classes, b: n_classes)
probs  = softmax(logits)
```

### Training process

| Parameter | Value |
|---|---|
| Initialisation | Xavier: `U(−scale, scale)`, scale = `√(2 / (dim + n_classes))` |
| Loss | Softmax cross-entropy |
| Regularisation | L2 on weights, λ = 0.01 |
| Learning rate | 0.1, halved at iteration 100 and 200 |
| Iterations | 300 (full batch) |

**Gradient step:**

```
grad     = (predicted_prob − one_hot) / n_samples
dW      += embedding ⊗ grad
W       −= lr × (dW + λ·W)
b       −= lr × db
```

### Score and uncertainty

| Field | Formula |
|---|---|
| `uncertainty` | `1 − max(softmax_probability)` |
| `score` | Sum of softmax probabilities for positive classes |

### When to use

You have two or more classes and expect a roughly linear boundary in embedding
space. Fast to train and produces calibrated probabilities.

---

## Method 4 — Prototype matching (Prototype Network)

**Complexity:** Medium-high
**Minimum classes:** 2
**Training:** Temperature optimisation, ~100 iterations

### Algorithm

1. Compute the **prototype** (raw centroid, not normalised) for each class.
2. For every item, compute **negative squared Euclidean distance** to each prototype.
3. Scale distances by a learned **temperature τ**: `logit(c) = −‖x − p_c‖² / τ`.
4. Apply softmax to get class probabilities.

### Temperature learning

The temperature controls how peaked or flat the probability distribution is.
It is optimised by gradient descent on the cross-entropy loss of the training data.

| Parameter | Value |
|---|---|
| Initial temperature | 1.0 |
| Learning rate | 0.05 |
| Iterations | 100 |
| Minimum temperature | 0.01 (clamped) |

**Gradient of τ:**

```
For each training sample and each class c:
  gradτ += (dist² / τ²) × (predicted_prob − target)

τ −= lr × gradτ / n_labelled
```

A small temperature means the model is very decisive (high confidence near
prototypes, low confidence far away). A large temperature makes predictions
more uniform.

### Score and uncertainty

| Field | Formula |
|---|---|
| `uncertainty` | `1 − max(softmax_probability)` |
| `score` | Sum of softmax probabilities for positive classes |

### When to use

You want something more principled than raw centroid similarity but lighter
than a full classifier. Prototype networks are a classic few-shot learning
technique and perform well with very few labels.

---

## Method 5 — Neural network (MLP)

**Complexity:** Highest
**Minimum classes:** 2
**Training:** Adam optimiser, 500–1000 iterations (scales with depth)

### Architecture

A multi-layer fully-connected network with **configurable depth** (1–3 hidden layers).
Each hidden layer uses ReLU activation; the output uses softmax.

```
1 layer:   h₁ = ReLU(x @ W₁ + b₁)                              → softmax(h₁ @ Wₒ + bₒ)
2 layers:  h₁ = ReLU(x @ W₁ + b₁), h₂ = ReLU(h₁ @ W₂ + b₂)   → softmax(h₂ @ Wₒ + bₒ)
3 layers:  h₁ → h₂ → h₃                                         → softmax(h₃ @ Wₒ + bₒ)
```

Hidden layer sizes taper toward the output:

| Layers | Sizes |
|---|---|
| 1 | 64 |
| 2 | 64 → 32 |
| 3 | 64 → 32 → 16 |

(All sizes are capped at the embedding dimension.)

### Configuring depth

In the label panel, select **Neural network** from the method dropdown. A **1L / 2L / 3L**
toggle appears to the right, letting you choose 1, 2, or 3 hidden layers. More layers
can capture more complex decision boundaries but take longer to train.

### Training process

| Parameter | Value |
|---|---|
| Initialisation | Xavier with seeded random (seed 42 for reproducibility) |
| Loss | Softmax cross-entropy |
| Regularisation | L2 on all weight matrices, λ = 0.001 |
| Optimiser | Adam (β₁ = 0.9, β₂ = 0.999, ε = 10⁻⁸) |
| Learning rate | 0.001 |
| Iterations | 500 (1L), 750 (2L), 1000 (3L) |

**Backpropagation:**

1. **Output layer:** standard softmax cross-entropy gradient.
2. **Hidden layers:** gradients are propagated through each layer in reverse, gated by ReLU (gradients are zero where the activation was ≤ 0).
3. L2 penalty is added to weight gradients before the Adam update.

Adam maintains per-parameter first and second moment estimates with bias
correction, giving adaptive per-weight learning rates.

### Score and uncertainty

| Field | Formula |
|---|---|
| `uncertainty` | `1 − max(softmax_probability)` |
| `score` | Sum of softmax probabilities for positive classes |

### When to use

You have enough labels (10+) across two or more classes and suspect the decision
boundary is non-linear in embedding space. The MLP can capture interactions
between embedding dimensions that a linear classifier cannot. It takes slightly
longer to fit but is still sub-second for typical dataset sizes.

---

## The exclude label

All five methods treat `exclude` as a special class:

- **Labelling:** Press `x` or click the red X button on hover to mark an item as excluded.
- **Scoring:** The `score` field sums probabilities over *positive* classes only — exclude is filtered out. This means "most similar first" sorting pushes genuinely positive items to the top, not items the model thinks should be excluded.
- **Training:** Excluded items participate in training normally (they form a negative class). This makes the model better at separating what you want from what you don't.

---

## What the grid shows after fitting

After clicking **Suggest next** or **Refit**, the grid updates as follows:

1. **Reordered items.** The grid is re-sorted according to the selected sort mode. Labelled items that already have predictions are pushed to the end. The grid resets to page 1.
2. **Prediction badges.** Each item shows its predicted class and confidence percentage in an emerald (confident) or amber (uncertain) strip below the media.
3. **Exclude overlays.** Items labelled as "exclude" show a dark semi-transparent overlay with a red "excluded" badge.
4. **Exclude buttons.** While active learning is active, hovering an item reveals a small red X button in the top-right corner to quickly exclude it.

The grid does **not** automatically refit when you label more items. Label as many
items as you want, then click **Refit** when you're ready to see updated suggestions.
This keeps the grid stable while you work through a batch.

---

## Performance

All methods operate on `Float32Array` typed arrays with zero-copy subarray views
for individual embeddings. Typical timings on a modern browser:

| Method | 1 000 items × 512d | 10 000 items × 512d |
|---|---|---|
| Centroid | < 5 ms | < 20 ms |
| KNN | < 10 ms | < 100 ms |
| Linear | < 50 ms | < 200 ms |
| Prototype | < 20 ms | < 100 ms |
| MLP (1L) | < 100 ms | < 500 ms |
| MLP (2L) | < 150 ms | < 750 ms |
| MLP (3L) | < 200 ms | < 1000 ms |

Embeddings are fetched from the backend once and cached in memory for the duration
of the session.
