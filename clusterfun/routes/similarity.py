"""Similarity search routes (by image and by text)."""

from typing import List

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel

from clusterfun.faiss_index import get_or_load_index
from clusterfun.storage.backends import get_backend
from clusterfun.storage.data_loader import DataLoader
from clusterfun.storage.query import ensure_embeddings_table

router = APIRouter()


class SimilarityRequest(BaseModel):
    media_id: int


class VectorSearchRequest(BaseModel):
    embedding: List[float]


class SimilarityResult(BaseModel):
    media_id: int
    similarity: float


def _search_by_vector(
    index,
    ids: np.ndarray,
    query_emb: list,
    exclude_id: int | None = None,
    limit: int = 1000,
) -> List[SimilarityResult]:
    """Search embeddings using FAISS. Returns top results sorted by similarity."""
    query = np.array([query_emb], dtype=np.float32)
    # L2-normalize for cosine similarity via inner product
    norm = np.linalg.norm(query)
    if norm > 0:
        query /= norm

    # Search for extra results to account for excluding the query item
    k = min(limit + (1 if exclude_id is not None else 0), index.ntotal)
    sims, idx = index.search(query, k)

    results = []
    for sim, pos in zip(sims[0], idx[0]):
        if pos < 0:
            continue
        media_id = int(ids[pos])
        if media_id == exclude_id:
            continue
        results.append(SimilarityResult(media_id=media_id, similarity=float(sim)))
        if len(results) >= limit:
            break

    return results


@router.post("/api/views/{view_uuid}/similar")
def find_similar(view_uuid: str, request: SimilarityRequest) -> List[SimilarityResult]:
    backend = get_backend()
    loader = DataLoader(view_uuid, backend)
    config = loader.load_config()

    if config.embeddings is None:
        return []

    emb_col = config.embeddings

    # Still need DuckDB embeddings table to look up the query vector by ID
    con = ensure_embeddings_table(
        view_uuid, backend, emb_col,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )

    query_emb = con.execute(
        f'SELECT "{emb_col}" FROM embeddings WHERE id = ?',
        [request.media_id],
    ).fetchone()[0]

    index, ids = get_or_load_index(
        view_uuid, emb_col,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )

    return _search_by_vector(index, ids, list(query_emb), exclude_id=request.media_id)


@router.post("/api/views/{view_uuid}/similar-vector")
def find_similar_vector(
    view_uuid: str, request: VectorSearchRequest
) -> List[SimilarityResult]:
    """Search by a pre-computed embedding vector (e.g. from browser-side CLIP encoding)."""
    backend = get_backend()
    loader = DataLoader(view_uuid, backend)
    config = loader.load_config()

    if config.embeddings is None:
        return []

    emb_col = config.embeddings

    # Ensure embeddings are loaded (needed for FAISS index build)
    ensure_embeddings_table(
        view_uuid, backend, emb_col,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )

    index, ids = get_or_load_index(
        view_uuid, emb_col,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )

    return _search_by_vector(index, ids, request.embedding)
