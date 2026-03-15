"""Active learning routes: fit a linear probe on labeled embeddings."""

import heapq
from typing import Dict, List, Optional

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


def _centroid_search(
    labeled_ids: List[int],
    label_class: str,
    con,
    emb_col: str,
    scope_ids: List[int],
    limit: int = 5000,
) -> List[PredictionItem]:
    """Single-class: rank by cosine similarity to centroid, chunked."""
    id_to_emb = _fetch_labeled_embeddings(con, emb_col, labeled_ids)
    train_ids = [mid for mid in labeled_ids if mid in id_to_emb]
    if not train_ids:
        return []

    labeled_embs = np.array([id_to_emb[mid] for mid in train_ids], dtype=np.float32)
    centroid = labeled_embs.mean(axis=0)
    centroid_norm = centroid / (np.linalg.norm(centroid) + 1e-8)

    labeled_set = set(labeled_ids)
    query, params = _scope_query(emb_col, scope_ids)

    # Min-heap of (score, seq) — seq breaks ties and avoids comparison issues
    heap: list = []
    heap_data: dict = {}
    seq = 0

    result = con.execute(query, params)
    while True:
        chunk = result.fetchmany(CHUNK_SIZE)
        if not chunk:
            break

        chunk_ids = []
        chunk_embs = []
        for r in chunk:
            if r[0] not in labeled_set:
                chunk_ids.append(r[0])
                chunk_embs.append(r[1])
        if not chunk_ids:
            continue

        X = np.array(chunk_embs, dtype=np.float32)
        norms = np.linalg.norm(X, axis=1, keepdims=True)
        norms = np.maximum(norms, 1e-8)
        sims = (X / norms) @ centroid_norm

        for i, mid in enumerate(chunk_ids):
            score = max(0.0, float(sims[i]))
            seq += 1
            if len(heap) < limit:
                heapq.heappush(heap, (score, seq))
                heap_data[seq] = (mid, score)
            elif score > heap[0][0]:
                _, old_seq = heapq.heapreplace(heap, (score, seq))
                del heap_data[old_seq]
                heap_data[seq] = (mid, score)

    # Build predictions sorted descending
    entries = sorted(heap_data.values(), key=lambda x: x[1], reverse=True)
    return [
        PredictionItem(
            media_id=mid,
            predicted_class=label_class,
            uncertainty=1.0 - score,
            probabilities={label_class: score},
            score=score,
        )
        for mid, score in entries
    ]


def _classifier_search(
    labeled: Dict[int, str],
    label_classes: List[str],
    con,
    emb_col: str,
    scope_ids: List[int],
    limit: int = 5000,
) -> List[PredictionItem]:
    """Multi-class: logistic regression, chunked scoring."""
    from sklearn.linear_model import LogisticRegression

    labeled_ids = list(labeled.keys())
    id_to_emb = _fetch_labeled_embeddings(con, emb_col, labeled_ids)
    train_ids = [mid for mid in labeled_ids if mid in id_to_emb]
    if not train_ids:
        return []

    X_train = np.array([id_to_emb[mid] for mid in train_ids], dtype=np.float32)
    y_train = [labeled[mid] for mid in train_ids]

    clf = LogisticRegression(
        max_iter=200, class_weight="balanced", solver="lbfgs", C=1.0,
    )
    clf.fit(X_train, y_train)
    classes = list(clf.classes_)
    positive_indices = [i for i, cls in enumerate(classes) if cls != EXCLUDE_LABEL]

    labeled_set = set(labeled_ids)
    query, params = _scope_query(emb_col, scope_ids)

    heap: list = []
    heap_data: dict = {}
    seq = 0

    result = con.execute(query, params)
    while True:
        chunk = result.fetchmany(CHUNK_SIZE)
        if not chunk:
            break

        chunk_ids = []
        chunk_embs = []
        for r in chunk:
            if r[0] not in labeled_set:
                chunk_ids.append(r[0])
                chunk_embs.append(r[1])
        if not chunk_ids:
            continue

        X = np.array(chunk_embs, dtype=np.float32)
        probas = clf.predict_proba(X)

        for i, mid in enumerate(chunk_ids):
            proba = probas[i]
            max_idx = int(np.argmax(proba))
            pos_score = (
                float(sum(proba[j] for j in positive_indices))
                if positive_indices
                else float(proba[max_idx])
            )
            seq += 1
            if len(heap) < limit:
                heapq.heappush(heap, (pos_score, seq))
                heap_data[seq] = (mid, max_idx, proba)
            elif pos_score > heap[0][0]:
                _, old_seq = heapq.heapreplace(heap, (pos_score, seq))
                del heap_data[old_seq]
                heap_data[seq] = (mid, max_idx, proba)

    # Build predictions sorted descending
    entries = sorted(heap_data.values(), key=lambda x: -_pos_score(x[2], positive_indices))
    return [
        PredictionItem(
            media_id=mid,
            predicted_class=classes[max_idx],
            uncertainty=float(1.0 - proba[max_idx]),
            probabilities={cls: float(proba[j]) for j, cls in enumerate(classes)},
            score=_pos_score(proba, positive_indices),
        )
        for mid, max_idx, proba in entries
    ]


def _pos_score(proba: np.ndarray, positive_indices: List[int]) -> float:
    if positive_indices:
        return float(sum(proba[j] for j in positive_indices))
    return float(proba[int(np.argmax(proba))])


@router.post("/api/views/{view_uuid}/active-learning/probe")
def fit_probe(view_uuid: str, request: ProbeRequest) -> ProbeResponse:
    """Fit a probe on labeled embeddings and return predictions.

    Scales to millions of items: only labeled embeddings are loaded into
    memory for training; unlabeled items are scored in streaming chunks.
    """
    backend = get_backend()
    loader = DataLoader(view_uuid, backend)
    config = loader.load_config()

    if config.embeddings is None:
        raise HTTPException(
            status_code=400, detail="No embeddings configured for this view"
        )

    # Read labels
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

    if n_classes == 1:
        train_ids = list(labeled.keys())
        predictions = _centroid_search(
            train_ids, label_classes[0], con, emb_col, scope_ids, request.limit,
        )
    elif n_classes >= 2:
        try:
            from sklearn.linear_model import LogisticRegression  # noqa: F401
        except ImportError:
            raise HTTPException(
                status_code=501,
                detail="Install scikit-learn for multi-class active learning: pip install scikit-learn",
            )
        predictions = _classifier_search(
            labeled, label_classes, con, emb_col, scope_ids, request.limit,
        )
    else:
        predictions = []

    if request.sort_by == "uncertainty":
        predictions.sort(key=lambda p: p.uncertainty, reverse=True)

    return ProbeResponse(
        predictions=predictions,
        label_classes=label_classes,
        n_labeled=len(labeled),
    )
