"""Active learning routes: fit a probe on labeled embeddings.

Scales to millions of items via chunked scoring: only labeled embeddings
are loaded for training; unlabeled items stream through in 100K chunks.
"""

import heapq
from typing import Dict, List, Optional

import faiss
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from clusterfun.storage.backends import get_backend
from clusterfun.storage.data_loader import DataLoader
from clusterfun.storage.query import ensure_embeddings_table

router = APIRouter()

CHUNK_SIZE = 100_000
EXCLUDE_LABEL = "exclude"


class ProbeRequest(BaseModel):
    media_ids: List[int] = []
    sort_by: str = "confidence"
    limit: int = 5000
    focus_labels: Optional[List[str]] = None
    method: str = "auto"  # auto, centroid, knn, linear, prototype, mlp
    mlp_layers: int = 1


class PredictionItem(BaseModel):
    media_id: int
    predicted_class: str
    uncertainty: float
    probabilities: Dict[str, float]
    score: float = 0.0


class ProbeResponse(BaseModel):
    predictions: List[PredictionItem]
    label_classes: List[str]
    n_labeled: int


# ── Helpers ──


def _fetch_labeled_embeddings(
    con, emb_col: str, labeled_ids: List[int],
) -> Dict[int, np.ndarray]:
    """Fetch only labeled item embeddings — O(labeled) memory."""
    if not labeled_ids:
        return {}
    placeholders = ",".join("?" for _ in labeled_ids)
    rows = con.execute(
        f'SELECT id, "{emb_col}" FROM embeddings WHERE id IN ({placeholders})',
        labeled_ids,
    ).fetchall()
    return {r[0]: np.array(r[1], dtype=np.float32) for r in rows}


def _scope_query(emb_col: str, scope_ids: List[int]):
    """Build a SELECT query, optionally filtered to scope_ids."""
    if scope_ids:
        placeholders = ",".join("?" for _ in scope_ids)
        return (
            f'SELECT id, "{emb_col}" FROM embeddings WHERE id IN ({placeholders})',
            scope_ids,
        )
    return f'SELECT id, "{emb_col}" FROM embeddings', []


def _normalize(X: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(X, axis=1, keepdims=True)
    return X / np.maximum(norms, 1e-8)


def _softmax(logits: np.ndarray) -> np.ndarray:
    e = np.exp(logits - logits.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)


def _pos_score(proba: np.ndarray, positive_indices: List[int]) -> float:
    if positive_indices:
        return float(sum(proba[j] for j in positive_indices))
    return float(proba[int(np.argmax(proba))])


def _prepare_labeled(
    labeled: Dict[int, str], con, emb_col: str,
):
    """Fetch labeled embeddings and split into arrays."""
    labeled_ids = list(labeled.keys())
    id_to_emb = _fetch_labeled_embeddings(con, emb_col, labeled_ids)
    train_ids = [mid for mid in labeled_ids if mid in id_to_emb]
    if not train_ids:
        return None, None, None
    X = np.array([id_to_emb[mid] for mid in train_ids], dtype=np.float32)
    y = [labeled[mid] for mid in train_ids]
    return train_ids, X, y


class _TopK:
    """Min-heap that keeps the top-K (score, PredictionItem) pairs."""

    def __init__(self, limit: int):
        self.limit = limit
        self.heap: list = []
        self.data: dict = {}
        self.seq = 0

    def push(self, score: float, item: PredictionItem):
        self.seq += 1
        if len(self.heap) < self.limit:
            heapq.heappush(self.heap, (score, self.seq))
            self.data[self.seq] = item
        elif score > self.heap[0][0]:
            _, old = heapq.heapreplace(self.heap, (score, self.seq))
            del self.data[old]
            self.data[self.seq] = item

    def results(self) -> List[PredictionItem]:
        return sorted(self.data.values(), key=lambda p: p.score, reverse=True)


def _stream_chunks(con, emb_col: str, scope_ids: List[int], labeled_set: set):
    """Yield (chunk_ids, X_chunk) tuples, skipping labeled items."""
    query, params = _scope_query(emb_col, scope_ids)
    result = con.execute(query, params)
    while True:
        chunk = result.fetchmany(CHUNK_SIZE)
        if not chunk:
            break
        ids, embs = [], []
        for r in chunk:
            if r[0] not in labeled_set:
                ids.append(r[0])
                embs.append(r[1])
        if ids:
            yield ids, np.array(embs, dtype=np.float32)


# ── Methods ──


def _centroid_search(
    labeled_ids, label_class, con, emb_col, scope_ids, limit,
) -> List[PredictionItem]:
    """Single-class: cosine similarity to centroid."""
    id_to_emb = _fetch_labeled_embeddings(con, emb_col, labeled_ids)
    train_ids = [mid for mid in labeled_ids if mid in id_to_emb]
    if not train_ids:
        return []

    centroid = np.mean(
        [id_to_emb[mid] for mid in train_ids], axis=0,
    ).astype(np.float32)
    centroid /= np.linalg.norm(centroid) + 1e-8

    top = _TopK(limit)
    for chunk_ids, X in _stream_chunks(con, emb_col, scope_ids, set(labeled_ids)):
        sims = _normalize(X) @ centroid
        for i, mid in enumerate(chunk_ids):
            s = max(0.0, float(sims[i]))
            top.push(s, PredictionItem(
                media_id=mid, predicted_class=label_class,
                uncertainty=1.0 - s, probabilities={label_class: s}, score=s,
            ))
    return top.results()


def _classifier_search(
    labeled, label_classes, con, emb_col, scope_ids, limit,
) -> List[PredictionItem]:
    """Multi-class: sklearn logistic regression, chunked scoring."""
    from sklearn.linear_model import LogisticRegression

    train_ids, X_train, y_train = _prepare_labeled(labeled, con, emb_col)
    if train_ids is None:
        return []

    clf = LogisticRegression(
        max_iter=200, class_weight="balanced", solver="lbfgs", C=1.0,
    )
    clf.fit(X_train, y_train)
    classes = list(clf.classes_)
    pos_idx = [i for i, c in enumerate(classes) if c != EXCLUDE_LABEL]

    top = _TopK(limit)
    for chunk_ids, X in _stream_chunks(con, emb_col, scope_ids, set(labeled.keys())):
        probas = clf.predict_proba(X)
        for i, mid in enumerate(chunk_ids):
            p = probas[i]
            mx = int(np.argmax(p))
            s = _pos_score(p, pos_idx)
            top.push(s, PredictionItem(
                media_id=mid, predicted_class=classes[mx],
                uncertainty=float(1.0 - p[mx]),
                probabilities={c: float(p[j]) for j, c in enumerate(classes)},
                score=s,
            ))
    return top.results()


def _knn_search(
    labeled, label_classes, con, emb_col, scope_ids, limit, k=10,
) -> List[PredictionItem]:
    """KNN: build tiny faiss index of labeled items, batch-query unlabeled."""
    train_ids, X_train, y_train = _prepare_labeled(labeled, con, emb_col)
    if train_ids is None:
        return []

    X_train = _normalize(X_train)
    dim = X_train.shape[1]
    index = faiss.IndexFlatIP(dim)
    index.add(X_train)
    effective_k = min(k, len(train_ids))

    pos_idx = [i for i, c in enumerate(label_classes) if c != EXCLUDE_LABEL]

    top = _TopK(limit)
    for chunk_ids, X in _stream_chunks(con, emb_col, scope_ids, set(labeled.keys())):
        X = _normalize(X)
        sims, indices = index.search(X, effective_k)

        for i, mid in enumerate(chunk_ids):
            votes: Dict[str, float] = {}
            total = 0.0
            for j in range(effective_k):
                idx = int(indices[i][j])
                if idx < 0:
                    continue
                w = max(0.0, float(sims[i][j]))
                lbl = y_train[idx]
                votes[lbl] = votes.get(lbl, 0) + w
                total += w
            if total == 0:
                continue

            probs = {c: votes.get(c, 0) / total for c in label_classes}
            pred = max(probs, key=lambda c: probs[c])
            s = _pos_score(
                np.array([probs.get(c, 0) for c in label_classes]), pos_idx,
            )
            top.push(s, PredictionItem(
                media_id=mid, predicted_class=pred,
                uncertainty=1.0 - probs[pred],
                probabilities=probs, score=s,
            ))
    return top.results()


def _prototype_search(
    labeled, label_classes, con, emb_col, scope_ids, limit,
) -> List[PredictionItem]:
    """Prototype: per-class centroids, softmax scoring."""
    train_ids, X_train, y_train = _prepare_labeled(labeled, con, emb_col)
    if train_ids is None:
        return []

    # Compute normalized prototype per class
    proto_list = []
    for cls in label_classes:
        mask = [i for i, y in enumerate(y_train) if y == cls]
        if mask:
            proto = X_train[mask].mean(axis=0)
            proto /= np.linalg.norm(proto) + 1e-8
        else:
            proto = np.zeros(X_train.shape[1], dtype=np.float32)
        proto_list.append(proto)
    protos = np.array(proto_list, dtype=np.float32)  # (n_classes, dim)

    pos_idx = [i for i, c in enumerate(label_classes) if c != EXCLUDE_LABEL]

    top = _TopK(limit)
    for chunk_ids, X in _stream_chunks(con, emb_col, scope_ids, set(labeled.keys())):
        X = _normalize(X)
        logits = X @ protos.T  # (chunk, n_classes) — cosine similarities
        probas = _softmax(logits)

        for i, mid in enumerate(chunk_ids):
            p = probas[i]
            mx = int(np.argmax(p))
            s = _pos_score(p, pos_idx)
            top.push(s, PredictionItem(
                media_id=mid, predicted_class=label_classes[mx],
                uncertainty=float(1.0 - p[mx]),
                probabilities={c: float(p[j]) for j, c in enumerate(label_classes)},
                score=s,
            ))
    return top.results()


def _mlp_search(
    labeled, label_classes, con, emb_col, scope_ids, limit, n_layers=1,
) -> List[PredictionItem]:
    """MLP: sklearn MLPClassifier, chunked scoring."""
    from sklearn.neural_network import MLPClassifier

    train_ids, X_train, y_train = _prepare_labeled(labeled, con, emb_col)
    if train_ids is None:
        return []

    hidden = {1: (64,), 2: (64, 32), 3: (64, 32, 16)}
    use_early_stop = len(train_ids) >= 10
    clf = MLPClassifier(
        hidden_layer_sizes=hidden.get(n_layers, (64,)),
        max_iter=500,
        early_stopping=use_early_stop,
        validation_fraction=0.2 if use_early_stop else 0.0,
        solver="adam", learning_rate_init=0.001,
    )
    clf.fit(X_train, y_train)
    classes = list(clf.classes_)
    pos_idx = [i for i, c in enumerate(classes) if c != EXCLUDE_LABEL]

    top = _TopK(limit)
    for chunk_ids, X in _stream_chunks(con, emb_col, scope_ids, set(labeled.keys())):
        probas = clf.predict_proba(X)
        for i, mid in enumerate(chunk_ids):
            p = probas[i]
            mx = int(np.argmax(p))
            s = _pos_score(p, pos_idx)
            top.push(s, PredictionItem(
                media_id=mid, predicted_class=classes[mx],
                uncertainty=float(1.0 - p[mx]),
                probabilities={c: float(p[j]) for j, c in enumerate(classes)},
                score=s,
            ))
    return top.results()


# ── Route ──


@router.post("/api/views/{view_uuid}/active-learning/probe")
def fit_probe(view_uuid: str, request: ProbeRequest) -> ProbeResponse:
    """Fit a probe on labeled embeddings and return predictions."""
    backend = get_backend()
    loader = DataLoader(view_uuid, backend)
    config = loader.load_config()

    if config.embeddings is None:
        raise HTTPException(
            status_code=400, detail="No embeddings configured for this view"
        )

    labels_data = loader.label_manager.read_labels()
    if not labels_data:
        raise HTTPException(status_code=400, detail="No labels found")

    labeled: Dict[int, str] = {}
    focus_set = set(request.focus_labels) if request.focus_labels else None
    for media_id_str, label_list in labels_data.items():
        if label_list:
            label = label_list[0]
            if focus_set is None or label in focus_set:
                labeled[int(media_id_str)] = label

    if not labeled:
        raise HTTPException(status_code=400, detail="No labels found")

    label_classes = sorted(set(labeled.values()))

    emb_col = config.embeddings
    con = ensure_embeddings_table(
        view_uuid, backend, emb_col,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )

    scope_ids = request.media_ids or []
    n_classes = len(label_classes)

    # Resolve method
    method = request.method
    if method == "auto":
        method = "centroid" if n_classes == 1 else "linear"
    # Fallback: multi-class methods need 2+ classes
    if n_classes < 2 and method in ("knn", "linear", "prototype", "mlp"):
        method = "centroid"

    train_ids = list(labeled.keys())

    if method == "centroid":
        if n_classes == 1:
            predictions = _centroid_search(
                train_ids, label_classes[0], con, emb_col, scope_ids, request.limit,
            )
        else:
            predictions = _prototype_search(
                labeled, label_classes, con, emb_col, scope_ids, request.limit,
            )
    elif method == "knn":
        predictions = _knn_search(
            labeled, label_classes, con, emb_col, scope_ids, request.limit,
        )
    elif method == "linear":
        predictions = _classifier_search(
            labeled, label_classes, con, emb_col, scope_ids, request.limit,
        )
    elif method == "prototype":
        predictions = _prototype_search(
            labeled, label_classes, con, emb_col, scope_ids, request.limit,
        )
    elif method == "mlp":
        predictions = _mlp_search(
            labeled, label_classes, con, emb_col, scope_ids, request.limit,
            n_layers=request.mlp_layers,
        )
    else:
        raise HTTPException(status_code=400, detail=f"Unknown method: {method}")

    if request.sort_by == "uncertainty":
        predictions.sort(key=lambda p: p.uncertainty, reverse=True)

    return ProbeResponse(
        predictions=predictions,
        label_classes=label_classes,
        n_labeled=len(labeled),
    )
