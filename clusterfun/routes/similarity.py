"""Similarity search routes (by image and by text)."""

from typing import List

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from clusterfun.storage.backends import get_backend
from clusterfun.storage.data_loader import DataLoader
from clusterfun.storage.query import ensure_embeddings_table

router = APIRouter()


class SimilarityRequest(BaseModel):
    media_id: int
    n: int = 20


class VectorSearchRequest(BaseModel):
    embedding: List[float]
    n: int = 20


class SimilarityResult(BaseModel):
    media_id: int
    similarity: float


def _search_by_vector(
    con, emb_col: str, query_emb: list, n: int, exclude_id: int | None = None,
) -> List[SimilarityResult]:
    """Search embeddings by a query vector. Tries HNSW, falls back to brute-force."""
    dim = len(query_emb)

    # Try HNSW-accelerated search (requires vss extension + FLOAT[N] arrays)
    try:
        rows = con.execute(
            f'SELECT id, '
            f'array_cosine_similarity("{emb_col}", ?::FLOAT[{dim}]) AS similarity '
            f'FROM embeddings '
            f'ORDER BY array_cosine_distance("{emb_col}", ?::FLOAT[{dim}]) '
            f'LIMIT {n + (1 if exclude_id is not None else 0)}',
            [list(query_emb), list(query_emb)],
        ).fetchall()
        results = [
            SimilarityResult(media_id=r[0], similarity=r[1])
            for r in rows
            if r[0] != exclude_id
        ]
        return results[:n]
    except Exception:
        pass

    # Fallback: brute-force scan using list_cosine_similarity
    if exclude_id is not None:
        rows = con.execute(
            f'WITH query_emb AS (SELECT ?::FLOAT[] AS emb) '
            f'SELECT e.id, list_cosine_similarity(e."{emb_col}", q.emb) AS similarity '
            f'FROM embeddings e, query_emb q '
            f'WHERE e.id != ? '
            f'ORDER BY similarity DESC '
            f'LIMIT {n}',
            [list(query_emb), exclude_id],
        ).fetchall()
    else:
        rows = con.execute(
            f'WITH query_emb AS (SELECT ?::FLOAT[] AS emb) '
            f'SELECT e.id, list_cosine_similarity(e."{emb_col}", q.emb) AS similarity '
            f'FROM embeddings e, query_emb q '
            f'ORDER BY similarity DESC '
            f'LIMIT {n}',
            [list(query_emb)],
        ).fetchall()
    return [SimilarityResult(media_id=r[0], similarity=r[1]) for r in rows]


@router.post("/api/views/{view_uuid}/similar")
def find_similar(view_uuid: str, request: SimilarityRequest) -> List[SimilarityResult]:
    backend = get_backend()
    loader = DataLoader(view_uuid, backend)
    config = loader.load_config()

    if config.embeddings is None:
        return []

    emb_col = config.embeddings
    con = ensure_embeddings_table(view_uuid, backend, emb_col)

    # Fetch the query embedding from the database
    query_emb = con.execute(
        f'SELECT "{emb_col}" FROM embeddings WHERE id = ?',
        [request.media_id],
    ).fetchone()[0]

    return _search_by_vector(con, emb_col, query_emb, request.n, exclude_id=request.media_id)


@router.post("/api/views/{view_uuid}/similar-vector")
def find_similar_vector(view_uuid: str, request: VectorSearchRequest) -> List[SimilarityResult]:
    """Search by a pre-computed embedding vector (e.g. from browser-side CLIP encoding)."""
    backend = get_backend()
    loader = DataLoader(view_uuid, backend)
    config = loader.load_config()

    if config.embeddings is None:
        return []

    emb_col = config.embeddings
    con = ensure_embeddings_table(view_uuid, backend, emb_col)

    return _search_by_vector(con, emb_col, request.embedding, request.n)
