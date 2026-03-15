"""Serve raw embeddings and labels to the frontend for browser-side ML."""

from typing import Dict, List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from clusterfun.storage.backends import get_backend
from clusterfun.storage.data_loader import DataLoader
from clusterfun.storage.query import ensure_embeddings_table

router = APIRouter()


class EmbeddingsRequest(BaseModel):
    media_ids: List[int] = []


class EmbeddingsResponse(BaseModel):
    media_ids: List[int]
    embeddings: List[List[float]]
    dimension: int


@router.post("/api/views/{view_uuid}/embeddings")
def get_embeddings(
    view_uuid: str, request: EmbeddingsRequest
) -> EmbeddingsResponse:
    """Return raw embedding vectors for browser-side active learning."""
    backend = get_backend()
    loader = DataLoader(view_uuid, backend)
    config = loader.load_config()

    if config.embeddings is None:
        raise HTTPException(status_code=400, detail="No embeddings configured")

    emb_col = config.embeddings
    con = ensure_embeddings_table(
        view_uuid, backend, emb_col,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )

    if request.media_ids:
        placeholders = ",".join("?" for _ in request.media_ids)
        rows = con.execute(
            f'SELECT id, "{emb_col}" FROM embeddings WHERE id IN ({placeholders})',
            request.media_ids,
        ).fetchall()
    else:
        rows = con.execute(f'SELECT id, "{emb_col}" FROM embeddings').fetchall()

    if not rows:
        return EmbeddingsResponse(media_ids=[], embeddings=[], dimension=0)

    dim = len(rows[0][1])
    return EmbeddingsResponse(
        media_ids=[r[0] for r in rows],
        embeddings=[[float(x) for x in r[1]] for r in rows],
        dimension=dim,
    )


class LabelsResponse(BaseModel):
    labels: Dict[str, List[str]]


@router.get("/api/views/{view_uuid}/all-labels")
def get_all_labels(view_uuid: str) -> LabelsResponse:
    """Return all labels for all media items."""
    backend = get_backend()
    loader = DataLoader(view_uuid, backend)
    labels_data = loader.label_manager.read_labels()
    return LabelsResponse(labels=labels_data if labels_data else {})
