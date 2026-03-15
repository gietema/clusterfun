"""Active learning routes: fit a linear probe on labeled embeddings."""

from typing import Dict, List

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from clusterfun.storage.backends import get_backend
from clusterfun.storage.data_loader import DataLoader
from clusterfun.storage.query import ensure_embeddings_table

router = APIRouter()


class ProbeRequest(BaseModel):
    media_ids: List[int] = []
    sort_by: str = "confidence"  # "confidence" (best matches first) or "uncertainty" (most uncertain first)


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


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """Cosine similarity between two vectors."""
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def _centroid_search(
    labeled_ids: List[int],
    label_class: str,
    id_to_emb: Dict[int, np.ndarray],
    scope_ids: List[int],
) -> List[PredictionItem]:
    """Single-class mode: rank all items by cosine similarity to the labeled centroid."""
    labeled_embs = np.array([id_to_emb[mid] for mid in labeled_ids])
    centroid = labeled_embs.mean(axis=0)

    predict_ids = [mid for mid in scope_ids if mid in id_to_emb and mid not in labeled_ids]
    if not predict_ids:
        return []

    X_predict = np.array([id_to_emb[mid] for mid in predict_ids])

    # Batch cosine similarity: normalize centroid once, then dot product
    centroid_norm = centroid / (np.linalg.norm(centroid) + 1e-8)
    norms = np.linalg.norm(X_predict, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-8)
    X_normed = X_predict / norms
    similarities = X_normed @ centroid_norm

    predictions = []
    for i, mid in enumerate(predict_ids):
        sim = float(similarities[i])
        predictions.append(
            PredictionItem(
                media_id=mid,
                predicted_class=label_class,
                uncertainty=1.0 - max(0.0, sim),
                probabilities={label_class: max(0.0, sim)},
                score=max(0.0, sim),
            )
        )

    # Default sort: most similar first
    predictions.sort(key=lambda p: p.score, reverse=True)
    return predictions


EXCLUDE_LABEL = "exclude"


def _classifier_search(
    labeled: Dict[int, str],
    label_classes: List[str],
    id_to_emb: Dict[int, np.ndarray],
    scope_ids: List[int],
) -> List[PredictionItem]:
    """Multi-class mode: fit logistic regression, rank by confidence in positive classes."""
    from sklearn.linear_model import LogisticRegression

    train_ids = [mid for mid in labeled if mid in id_to_emb]
    X_train = np.array([id_to_emb[mid] for mid in train_ids])
    y_train = [labeled[mid] for mid in train_ids]

    clf = LogisticRegression(
        max_iter=200,
        class_weight="balanced",
        solver="lbfgs",
        C=1.0,
    )
    clf.fit(X_train, y_train)
    classes = list(clf.classes_)

    predict_ids = [mid for mid in scope_ids if mid in id_to_emb]
    if not predict_ids:
        return []

    X_predict = np.array([id_to_emb[mid] for mid in predict_ids])
    probas = clf.predict_proba(X_predict)

    # Positive classes = everything except "exclude"
    positive_indices = [i for i, cls in enumerate(classes) if cls != EXCLUDE_LABEL]

    predictions = []
    for i, mid in enumerate(predict_ids):
        proba = probas[i]
        max_idx = int(np.argmax(proba))
        # Score = sum of probabilities for positive (non-exclude) classes
        positive_score = float(sum(proba[j] for j in positive_indices)) if positive_indices else float(proba[max_idx])
        predictions.append(
            PredictionItem(
                media_id=mid,
                predicted_class=classes[max_idx],
                uncertainty=float(1.0 - proba[max_idx]),
                probabilities={cls: float(proba[j]) for j, cls in enumerate(classes)},
                score=positive_score,
            )
        )

    # Sort by positive score descending — best matches first
    predictions.sort(key=lambda p: p.score, reverse=True)
    return predictions


@router.post("/api/views/{view_uuid}/active-learning/probe")
def fit_probe(view_uuid: str, request: ProbeRequest) -> ProbeResponse:
    """Fit a probe on labeled embeddings and return predictions.

    Single class: ranks by cosine similarity to the labeled centroid.
    Multi-class (2+): fits logistic regression, ranks by uncertainty.
    """
    backend = get_backend()
    loader = DataLoader(view_uuid, backend)
    config = loader.load_config()

    if config.embeddings is None:
        raise HTTPException(
            status_code=400, detail="No embeddings configured for this view"
        )

    # Read labels: {media_id_str: [label_str, ...]}
    labels_data = loader.label_manager.read_labels()
    if not labels_data:
        raise HTTPException(status_code=400, detail="No labels found")

    # Build label mapping: media_id -> first label
    labeled: Dict[int, str] = {}
    for media_id_str, label_list in labels_data.items():
        if label_list:
            labeled[int(media_id_str)] = label_list[0]

    if not labeled:
        raise HTTPException(status_code=400, detail="No labels found")

    label_classes = sorted(set(labeled.values()))

    # Load embeddings
    emb_col = config.embeddings
    con = ensure_embeddings_table(
        view_uuid, backend, emb_col,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )

    # Determine scope
    if request.media_ids:
        scope_ids = request.media_ids
    else:
        rows = con.execute("SELECT id FROM embeddings").fetchall()
        scope_ids = [r[0] for r in rows]

    # Fetch all embeddings
    all_rows = con.execute(f'SELECT id, "{emb_col}" FROM embeddings').fetchall()
    id_to_emb = {r[0]: np.array(r[1], dtype=np.float32) for r in all_rows}

    # Filter to labeled items that have embeddings
    train_ids = [mid for mid in labeled if mid in id_to_emb]
    if not train_ids:
        raise HTTPException(
            status_code=400, detail="No labeled items with embeddings found"
        )

    n_classes = len(set(labeled[mid] for mid in train_ids))

    if n_classes == 1:
        # Single class: centroid similarity search
        predictions = _centroid_search(
            train_ids, label_classes[0], id_to_emb, scope_ids,
        )
    elif n_classes >= 2:
        # Multi-class: logistic regression
        try:
            from sklearn.linear_model import LogisticRegression  # noqa: F401
        except ImportError:
            raise HTTPException(
                status_code=501,
                detail="Install scikit-learn for multi-class active learning: pip install scikit-learn",
            )
        predictions = _classifier_search(labeled, label_classes, id_to_emb, scope_ids)

    # Apply requested sort order
    if request.sort_by == "uncertainty":
        predictions.sort(key=lambda p: p.uncertainty, reverse=True)
    else:
        predictions.sort(key=lambda p: p.score, reverse=True)

    return ProbeResponse(
        predictions=predictions,
        label_classes=label_classes,
        n_labeled=len(train_ids),
    )
