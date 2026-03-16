"""Similarity search routes (by image and by text)."""

import threading
from typing import List, Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from clusterfun.faiss_index import get_or_load_index
from clusterfun.storage.backends import get_backend
from clusterfun.storage.data_loader import DataLoader
from clusterfun.storage.query import ensure_embeddings_table

router = APIRouter()

# Lazy-loaded text encoder for server-side text search
_text_encoder_lock = threading.Lock()
_text_encoder_cache: dict[str, dict] = {}  # model_name -> {"model", "tokenizer"}


class SimilarityRequest(BaseModel):
    media_id: int


class VectorSearchRequest(BaseModel):
    embedding: List[float]


class TextSearchRequest(BaseModel):
    query: str
    limit: int = 100


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


def _get_text_encoder(model_name: str) -> dict:
    """Lazily load a text encoder model + tokenizer, cached per model name."""
    if model_name in _text_encoder_cache:
        return _text_encoder_cache[model_name]

    with _text_encoder_lock:
        if model_name in _text_encoder_cache:
            return _text_encoder_cache[model_name]

        import torch
        from transformers import AutoModel, AutoTokenizer

        device = (
            "mps" if torch.backends.mps.is_available()
            else "cuda" if torch.cuda.is_available()
            else "cpu"
        )

        model = AutoModel.from_pretrained(model_name).to(device)
        tokenizer = AutoTokenizer.from_pretrained(model_name)
        model.eval()

        _text_encoder_cache[model_name] = {
            "model": model,
            "tokenizer": tokenizer,
            "device": device,
        }
        return _text_encoder_cache[model_name]


def _encode_text(model_name: str, text: str) -> list[float]:
    """Encode text into an embedding vector using the specified model."""
    import torch

    enc = _get_text_encoder(model_name)
    model, tokenizer, device = enc["model"], enc["tokenizer"], enc["device"]

    inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True)
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        features = model.get_text_features(**inputs)
        if not isinstance(features, torch.Tensor):
            features = features.pooler_output
        features = features / features.norm(dim=-1, keepdim=True)

    return features[0].cpu().tolist()


@router.post("/api/views/{view_uuid}/search-text")
def search_by_text(
    view_uuid: str, request: TextSearchRequest,
) -> List[SimilarityResult]:
    """Search by natural language query using server-side text encoding.

    Loads the embedding model's text encoder on demand (cached after first use).
    Works with any vision-language model (CLIP, SigLIP, etc.).
    """
    backend = get_backend()
    loader = DataLoader(view_uuid, backend)
    config = loader.load_config()

    if not config.embeddings or not config.embeddings_model:
        raise HTTPException(status_code=400, detail="No embeddings model configured")

    # Encode the text query server-side
    text_embedding = _encode_text(config.embeddings_model, request.query)

    # Search the FAISS index
    ensure_embeddings_table(
        view_uuid, backend, config.embeddings,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )
    index, ids = get_or_load_index(
        view_uuid, config.embeddings,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )

    return _search_by_vector(index, ids, text_embedding, limit=request.limit)
