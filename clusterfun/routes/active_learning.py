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


class PredictionItem(BaseModel):
    media_id: int
    predicted_class: str
    uncertainty: float
    probabilities: Dict[str, float]


class ProbeResponse(BaseModel):
    predictions: List[PredictionItem]
    label_classes: List[str]
    n_labeled: int


@router.post("/api/views/{view_uuid}/active-learning/probe")
def fit_probe(view_uuid: str, request: ProbeRequest) -> ProbeResponse:
    """Fit a logistic regression on labeled embeddings and return predictions."""
    try:
        from sklearn.linear_model import LogisticRegression
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Install scikit-learn to use active learning: pip install scikit-learn",
        )

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

    label_classes = sorted(set(labeled.values()))
    if len(label_classes) < 2:
        raise HTTPException(
            status_code=400, detail="Need at least 2 distinct label classes"
        )

    # Load embeddings
    emb_col = config.embeddings
    con = ensure_embeddings_table(view_uuid, backend, emb_col)

    # Determine which media IDs to predict on
    if request.media_ids:
        scope_ids = request.media_ids
    else:
        rows = con.execute("SELECT id FROM embeddings").fetchall()
        scope_ids = [r[0] for r in rows]

    # Fetch all embeddings in scope
    all_rows = con.execute(f'SELECT id, "{emb_col}" FROM embeddings').fetchall()
    id_to_emb = {r[0]: np.array(r[1], dtype=np.float32) for r in all_rows}

    # Build training data from labeled items that have embeddings
    train_ids = [mid for mid in labeled if mid in id_to_emb]
    if len(train_ids) < 2:
        raise HTTPException(
            status_code=400, detail="Not enough labeled items with embeddings"
        )

    X_train = np.array([id_to_emb[mid] for mid in train_ids])
    y_train = [labeled[mid] for mid in train_ids]

    # Check we still have 2+ classes after filtering
    if len(set(y_train)) < 2:
        raise HTTPException(
            status_code=400,
            detail="Need at least 2 distinct label classes with embeddings",
        )

    # Fit logistic regression — fast on pre-computed embeddings
    clf = LogisticRegression(
        max_iter=200,
        class_weight="balanced",
        solver="lbfgs",
        C=1.0,
    )
    clf.fit(X_train, y_train)
    classes = list(clf.classes_)

    # Predict on all items in scope
    predict_ids = [mid for mid in scope_ids if mid in id_to_emb]
    if not predict_ids:
        return ProbeResponse(
            predictions=[], label_classes=label_classes, n_labeled=len(train_ids)
        )

    X_predict = np.array([id_to_emb[mid] for mid in predict_ids])
    probas = clf.predict_proba(X_predict)

    predictions = []
    for i, mid in enumerate(predict_ids):
        proba = probas[i]
        max_idx = int(np.argmax(proba))
        uncertainty = float(1.0 - proba[max_idx])
        predictions.append(
            PredictionItem(
                media_id=mid,
                predicted_class=classes[max_idx],
                uncertainty=uncertainty,
                probabilities={cls: float(proba[j]) for j, cls in enumerate(classes)},
            )
        )

    # Sort by uncertainty descending (most uncertain first)
    predictions.sort(key=lambda p: p.uncertainty, reverse=True)

    return ProbeResponse(
        predictions=predictions,
        label_classes=label_classes,
        n_labeled=len(train_ids),
    )
