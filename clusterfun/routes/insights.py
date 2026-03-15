"""Outlier detection and duplicate finding routes."""

from typing import List

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel

from clusterfun.storage.backends import get_backend
from clusterfun.storage.data_loader import DataLoader
from clusterfun.storage.query import ensure_embeddings_table

router = APIRouter()

# Cap the number of embeddings to prevent memory issues with O(n^2) operations.
MAX_EMBEDDINGS = 10_000


class OutlierRequest(BaseModel):
    media_ids: List[int] = []
    k: int = 20
    limit: int = 100


class OutlierResult(BaseModel):
    media_id: int
    score: float


class DuplicateRequest(BaseModel):
    media_ids: List[int] = []
    threshold: float = 0.95
    limit: int = 100


class DuplicateGroup(BaseModel):
    group_id: int
    media_ids: List[int]
    similarity: float


def _load_embeddings(
    view_uuid: str,
    emb_col: str,
    media_ids: List[int],
    embeddings_source: str | None = None,
    media_col: str | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Load embeddings from DuckDB, returning (ids, vectors) arrays.

    Caps results at MAX_EMBEDDINGS to prevent memory issues.
    """
    backend = get_backend()
    con = ensure_embeddings_table(
        view_uuid, backend, emb_col,
        embeddings_source=embeddings_source,
        media_col=media_col,
    )

    # Escape column name for safe use in SQL identifiers
    safe_col = '"' + emb_col.replace('"', '""') + '"'

    if media_ids:
        placeholders = ", ".join("?" for _ in media_ids)
        rows = con.execute(
            f"SELECT id, {safe_col} FROM embeddings WHERE id IN ({placeholders}) "
            f"LIMIT {MAX_EMBEDDINGS}",
            media_ids,
        ).fetchall()
    else:
        rows = con.execute(
            f"SELECT id, {safe_col} FROM embeddings LIMIT {MAX_EMBEDDINGS}"
        ).fetchall()

    if not rows:
        return np.array([], dtype=np.int64), np.array([]).reshape(0, 0)

    ids = np.array([r[0] for r in rows], dtype=np.int64)
    vectors = np.array([list(r[1]) for r in rows], dtype=np.float32)
    return ids, vectors


def _cosine_distance_matrix(vectors: np.ndarray) -> np.ndarray:
    """Compute pairwise cosine distance matrix (1 - cosine_similarity).

    Uses batched matrix multiplication on L2-normalized vectors.
    """
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-10)  # avoid division by zero
    normed = vectors / norms
    # Similarity matrix via dot product of normalized vectors
    similarity = normed @ normed.T
    # Clip to [-1, 1] to avoid floating point issues
    np.clip(similarity, -1.0, 1.0, out=similarity)
    return 1.0 - similarity


def _compute_lof_scores(distances: np.ndarray, k: int) -> np.ndarray:
    """Compute Local Outlier Factor scores from a distance matrix.

    Parameters
    ----------
    distances : np.ndarray
        Pairwise cosine distance matrix of shape (n, n).
    k : int
        Number of neighbors for LOF.

    Returns
    -------
    np.ndarray
        LOF scores of shape (n,). Values > 1 indicate outlier-like points.
    """
    n = distances.shape[0]
    # Clamp k to at most n-1 (cannot have more neighbors than other points)
    k = min(k, n - 1)
    if k < 1:
        return np.ones(n, dtype=np.float64)

    # For each point, sort distances and pick k nearest (exclude self at index 0)
    sorted_dists = np.sort(distances, axis=1)
    # sorted_dists[:, 0] is always 0 (distance to self), so neighbors start at [:, 1:]
    knn_dists = sorted_dists[:, 1 : k + 1]  # shape (n, k)

    # k-distance: distance to the k-th nearest neighbor
    k_dist = knn_dists[:, -1]  # shape (n,)

    # Find k-nearest neighbor indices for each point
    knn_indices = np.argsort(distances, axis=1)[:, 1 : k + 1]  # shape (n, k)

    # Reachability distance: max(k_dist(neighbor), dist(p, neighbor))
    # For each point p and each of its neighbors o:
    #   reach_dist(p, o) = max(k_dist[o], distances[p, o])
    neighbor_k_dists = k_dist[knn_indices]  # shape (n, k)
    actual_dists = np.take_along_axis(distances, knn_indices, axis=1)  # shape (n, k)
    reach_dists = np.maximum(neighbor_k_dists, actual_dists)  # shape (n, k)

    # Local reachability density: inverse of mean reachability distance
    mean_reach = np.mean(reach_dists, axis=1)  # shape (n,)
    mean_reach = np.maximum(mean_reach, 1e-10)  # avoid division by zero
    lrd = 1.0 / mean_reach  # shape (n,)

    # LOF: average ratio of neighbor LRDs to own LRD
    neighbor_lrds = lrd[knn_indices]  # shape (n, k)
    lof = np.mean(neighbor_lrds, axis=1) / np.maximum(lrd, 1e-10)  # shape (n,)

    return lof


@router.post("/api/views/{view_uuid}/outliers")
def find_outliers(view_uuid: str, request: OutlierRequest) -> List[OutlierResult]:
    """Detect outliers using Local Outlier Factor (LOF)."""
    backend = get_backend()
    loader = DataLoader(view_uuid, backend)
    config = loader.load_config()

    if config.embeddings is None:
        return []

    ids, vectors = _load_embeddings(
        view_uuid, config.embeddings, request.media_ids,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )
    if len(ids) < 2:
        return []

    distances = _cosine_distance_matrix(vectors)
    lof_scores = _compute_lof_scores(distances, k=request.k)

    # Sort by LOF score descending and return top results
    ranked_indices = np.argsort(lof_scores)[::-1]
    limit = min(request.limit, len(ranked_indices))
    results = [
        OutlierResult(media_id=int(ids[i]), score=float(lof_scores[i]))
        for i in ranked_indices[:limit]
    ]
    return results


def _union_find_groups(pairs: List[tuple], all_ids: set) -> List[set]:
    """Group IDs into connected components using union-find."""
    parent = {i: i for i in all_ids}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]  # path compression
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    for a, b in pairs:
        union(a, b)

    groups: dict[int, set] = {}
    for i in all_ids:
        root = find(i)
        groups.setdefault(root, set()).add(i)

    # Only return groups with more than one member
    return [g for g in groups.values() if len(g) > 1]


@router.post("/api/views/{view_uuid}/duplicates")
def find_duplicates(view_uuid: str, request: DuplicateRequest) -> List[DuplicateGroup]:
    """Find near-duplicate groups using cosine similarity."""
    backend = get_backend()
    loader = DataLoader(view_uuid, backend)
    config = loader.load_config()

    if config.embeddings is None:
        return []

    ids, vectors = _load_embeddings(
        view_uuid, config.embeddings, request.media_ids,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )
    if len(ids) < 2:
        return []

    # Normalize vectors for cosine similarity
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-10)
    normed = vectors / norms

    # Compute pairwise cosine similarity via batched matrix multiplication
    n = len(ids)
    batch_size = 1000
    pairs: List[tuple] = []
    pair_sims: List[float] = []

    for start in range(0, n, batch_size):
        end = min(start + batch_size, n)
        # Similarities between batch rows and all rows
        sim_block = normed[start:end] @ normed.T  # shape (batch, n)

        # Find pairs above threshold (only upper triangle to avoid duplicates)
        for local_i in range(end - start):
            global_i = start + local_i
            # Only look at j > global_i to avoid duplicate pairs
            j_start = max(global_i + 1, 0)
            sims_row = sim_block[local_i, j_start:]
            above = np.where(sims_row >= request.threshold)[0]
            for offset in above:
                j = j_start + offset
                pairs.append((int(ids[global_i]), int(ids[j])))
                pair_sims.append(float(sims_row[offset]))

    if not pairs:
        return []

    # Build a lookup for pair similarities
    pair_sim_map = {}
    for (a, b), sim in zip(pairs, pair_sims):
        pair_sim_map[(min(a, b), max(a, b))] = sim

    # Group into connected components
    all_ids_in_pairs = set()
    for a, b in pairs:
        all_ids_in_pairs.add(a)
        all_ids_in_pairs.add(b)
    groups = _union_find_groups(pairs, all_ids_in_pairs)

    # Compute average similarity for each group
    results = []
    for group_id, group in enumerate(groups):
        members = sorted(group)
        # Average similarity across all pairs in the group
        sim_values = []
        for i, a in enumerate(members):
            for b in members[i + 1 :]:
                key = (min(a, b), max(a, b))
                if key in pair_sim_map:
                    sim_values.append(pair_sim_map[key])
        avg_sim = float(np.mean(sim_values)) if sim_values else request.threshold
        results.append(
            DuplicateGroup(group_id=group_id, media_ids=members, similarity=avg_sim)
        )

    # Sort by average similarity descending and limit
    results.sort(key=lambda g: g.similarity, reverse=True)
    return results[: request.limit]
