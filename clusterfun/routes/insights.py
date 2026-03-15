"""Outlier detection, duplicate finding, and centroid distance routes.

Uses FAISS for scalable k-NN queries, replacing O(n^2) pairwise distance
computation. Small datasets (n <= 10K) return results synchronously;
larger datasets run in a background thread with progress polling.
"""

import threading
import uuid as uuid_mod
from typing import Any, Dict, List, Optional, Union

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel

from clusterfun.faiss_index import (
    get_or_load_index,
    knn_search,
    _load_all_embeddings,
    _normalize_vectors,
)
from clusterfun.storage.backends import get_backend
from clusterfun.storage.data_loader import DataLoader
from clusterfun.storage.query import ensure_embeddings_table, get_connection

router = APIRouter()

# Threshold for sync vs async processing
_SYNC_LIMIT = 10_000


# ── Request / Response models ──

class OutlierRequest(BaseModel):
    media_ids: List[int] = []
    k: int = 20
    limit: int = 0  # 0 = no limit (return all above threshold)
    threshold: float = 1.5  # LOF scores above this are considered outliers
    group_by: str | None = None


class OutlierResult(BaseModel):
    media_id: int
    score: float
    group: str | None = None
    group_total: int | None = None  # total items in the group (when group_by is used)


class DuplicateRequest(BaseModel):
    media_ids: List[int] = []
    threshold: float = 0.95
    limit: int = 100


class DuplicateGroup(BaseModel):
    group_id: int
    media_ids: List[int]
    similarity: float


class CentroidDistanceRequest(BaseModel):
    media_ids: List[int] = []
    limit: int = 200


class CentroidDistanceResult(BaseModel):
    media_id: int
    distance: float


class InsightsTaskResponse(BaseModel):
    """Returned when computation runs in background."""
    task_id: str
    status: str = "running"


class InsightsStatusResponse(BaseModel):
    status: str  # "running" | "done" | "error"
    progress: float = 0
    phase: str = ""
    results: Optional[Any] = None
    error: Optional[str] = None


# ── Background task tracking ──

_insights_tasks: Dict[str, Dict[str, Any]] = {}
_insights_lock = threading.Lock()


def _update_task(task_id: str, **kwargs):
    with _insights_lock:
        if task_id in _insights_tasks:
            _insights_tasks[task_id].update(kwargs)


def _progress_cb_for_task(task_id: str):
    def cb(phase: str, progress: float):
        _update_task(task_id, phase=phase, progress=progress)
    return cb


# ── Embedding loading ──

def _load_embeddings_subset(
    view_uuid: str,
    emb_col: str,
    media_ids: List[int],
    embeddings_source: str | None = None,
    media_col: str | None = None,
) -> tuple[np.ndarray, np.ndarray]:
    """Load embeddings for a specific subset of media IDs."""
    backend = get_backend()
    con = ensure_embeddings_table(
        view_uuid, backend, emb_col,
        embeddings_source=embeddings_source,
        media_col=media_col,
    )
    safe_col = '"' + emb_col.replace('"', '""') + '"'

    placeholders = ", ".join("?" for _ in media_ids)
    rows = con.execute(
        f"SELECT id, {safe_col} FROM embeddings WHERE id IN ({placeholders})",
        media_ids,
    ).fetchall()

    if not rows:
        return np.array([], dtype=np.int64), np.array([]).reshape(0, 0)

    ids = np.array([r[0] for r in rows], dtype=np.int64)
    vectors = np.array([list(r[1]) for r in rows], dtype=np.float32)
    return ids, vectors


def _get_embedding_count(
    view_uuid: str,
    emb_col: str,
    embeddings_source: str | None = None,
    media_col: str | None = None,
) -> int:
    """Get total number of embeddings without loading them."""
    backend = get_backend()
    con = ensure_embeddings_table(
        view_uuid, backend, emb_col,
        embeddings_source=embeddings_source,
        media_col=media_col,
    )
    return con.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0]


# ── LOF from k-NN results ──

def _compute_lof_from_knn(
    knn_sims: np.ndarray,
    knn_indices: np.ndarray,
    k: int,
) -> np.ndarray:
    """Compute LOF scores from sparse k-NN arrays.

    Parameters
    ----------
    knn_sims : (n, k) inner-product similarities
    knn_indices : (n, k) position indices of neighbors
    k : number of neighbors

    Returns
    -------
    LOF scores of shape (n,)
    """
    n = knn_sims.shape[0]
    actual_k = min(k, knn_sims.shape[1])
    if actual_k < 1:
        return np.ones(n, dtype=np.float64)

    # Convert similarity to distance: dist = 1 - sim
    knn_dists = 1.0 - knn_sims[:, :actual_k]
    knn_idx = knn_indices[:, :actual_k]

    # k-distance: distance to the k-th nearest neighbor
    k_dist = knn_dists[:, -1]  # shape (n,)

    # Reachability distance: max(k_dist[neighbor], actual_dist)
    neighbor_k_dists = k_dist[knn_idx]  # shape (n, k)
    reach_dists = np.maximum(neighbor_k_dists, knn_dists)

    # Local reachability density
    mean_reach = np.mean(reach_dists, axis=1)
    mean_reach = np.maximum(mean_reach, 1e-10)
    lrd = 1.0 / mean_reach

    # LOF: average ratio of neighbor LRDs to own LRD
    neighbor_lrds = lrd[knn_idx]
    lof = np.mean(neighbor_lrds, axis=1) / np.maximum(lrd, 1e-10)

    return lof


# ── Group helpers ──

def _load_group_labels(
    view_uuid: str, media_ids: np.ndarray, column: str
) -> dict[str, list[int]]:
    """Load column values and group media_ids by label."""
    backend = get_backend()
    con = get_connection(view_uuid, backend)
    safe_col = '"' + column.replace('"', '""') + '"'
    id_list = [int(i) for i in media_ids]
    placeholders = ",".join("?" for _ in id_list)
    rows = con.execute(
        f"SELECT id, {safe_col} FROM database WHERE id IN ({placeholders})",
        id_list,
    ).fetchall()
    groups: dict[str, list[int]] = {}
    for row_id, label in rows:
        key = str(label) if label is not None else "(null)"
        groups.setdefault(key, []).append(int(row_id))
    return groups


# ── Union-find ──

def _union_find_groups(pairs: List[tuple], all_ids: set) -> List[set]:
    """Group IDs into connected components using union-find."""
    parent = {i: i for i in all_ids}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
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

    return [g for g in groups.values() if len(g) > 1]


# ── Core algorithm implementations ──

def _run_outlier_detection(
    view_uuid: str,
    config,
    request: OutlierRequest,
    progress_cb=None,
) -> List[dict]:
    """Run LOF outlier detection using FAISS k-NN."""
    # Get or build the FAISS index
    index, all_ids = get_or_load_index(
        view_uuid, config.embeddings,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
        progress_cb=progress_cb,
    )

    if len(all_ids) < 2:
        return []

    # If specific media_ids requested, filter
    if request.media_ids:
        id_set = set(request.media_ids)
        mask = np.array([mid in id_set for mid in all_ids])
        if not np.any(mask):
            return []
    else:
        mask = None

    # Load all vectors for k-NN query (they were normalized when building index)
    ids, vectors = _load_all_embeddings(
        view_uuid, config.embeddings,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )
    vectors = _normalize_vectors(vectors)

    if mask is not None:
        # We query only the subset but against the full index
        query_indices = np.where(mask)[0]
        query_vectors = vectors[query_indices]
        query_ids = ids[query_indices]
    else:
        query_indices = np.arange(len(ids))
        query_vectors = vectors
        query_ids = ids

    n = len(query_ids)
    k = min(request.k, n - 1)
    if k < 1:
        return []

    # When querying a subset, build a local index so k-NN indices are
    # self-consistent (all positions within 0..n-1 of the subset).
    # The full index would return positions in 0..N-1 which causes
    # out-of-bounds errors in LOF computation.
    if mask is not None:
        import faiss as _faiss
        dim = query_vectors.shape[1]
        local_index = _faiss.IndexFlatIP(dim)
        local_index.add(query_vectors)
        knn_sims, knn_idx = knn_search(
            local_index, query_ids, query_vectors, k,
            progress_cb=progress_cb,
        )
    else:
        knn_sims, knn_idx = knn_search(
            index, all_ids, query_vectors, k,
            progress_cb=progress_cb,
        )

    if request.group_by:
        # Grouped LOF: run per-group k-NN search for accurate within-group LOF.
        # Post-filtering global k-NN fails when groups are small relative to
        # the dataset because most global neighbors belong to other groups.
        group_labels = _load_group_labels(view_uuid, query_ids, request.group_by)
        id_to_pos = {int(mid): i for i, mid in enumerate(query_ids)}

        results = []
        for label, group_media_ids in group_labels.items():
            group_positions = [id_to_pos[mid] for mid in group_media_ids if mid in id_to_pos]
            if len(group_positions) < 2:
                continue

            g_positions = np.array(group_positions)
            g_vecs = query_vectors[g_positions]
            g_k = min(k, len(group_positions) - 1)

            # Build a small per-group FAISS index for accurate within-group k-NN
            import faiss
            dim = g_vecs.shape[1]
            g_index = faiss.IndexFlatIP(dim)
            g_index.add(g_vecs)

            g_sims, g_idx = g_index.search(g_vecs, g_k + 1)
            # Strip self (position 0 in results)
            local_sims = np.empty((len(group_positions), g_k), dtype=np.float32)
            local_idx = np.empty((len(group_positions), g_k), dtype=np.int64)
            for li in range(len(group_positions)):
                mask = g_idx[li] != li
                fsims = g_sims[li][mask][:g_k]
                fidx = g_idx[li][mask][:g_k]
                actual = len(fsims)
                if actual < g_k:
                    fsims = np.pad(fsims, (0, g_k - actual), constant_values=0)
                    fidx = np.pad(fidx, (0, g_k - actual), constant_values=0)
                local_sims[li] = fsims
                local_idx[li] = fidx

            lof_scores = _compute_lof_from_knn(local_sims, local_idx, g_k)

            group_size = len(group_positions)
            for li, gp in enumerate(group_positions):
                if lof_scores[li] > request.threshold:
                    results.append({
                        "media_id": int(query_ids[gp]),
                        "score": float(lof_scores[li]),
                        "group": label,
                        "group_total": group_size,
                    })

        results.sort(key=lambda r: r["score"], reverse=True)
        if request.limit > 0:
            results = results[:request.limit]
        return results

    # Ungrouped LOF
    lof_scores = _compute_lof_from_knn(knn_sims, knn_idx, k)

    if progress_cb:
        progress_cb("Finalizing", 97)

    ranked = np.argsort(lof_scores)[::-1]
    results = []
    for i in ranked:
        if lof_scores[i] > request.threshold:
            results.append({
                "media_id": int(query_ids[i]),
                "score": float(lof_scores[i]),
                "group": None,
            })
    if request.limit > 0:
        results = results[:request.limit]
    return results


def _run_duplicate_detection(
    view_uuid: str,
    config,
    request: DuplicateRequest,
    progress_cb=None,
) -> List[dict]:
    """Find near-duplicate groups using FAISS k-NN."""
    index, all_ids = get_or_load_index(
        view_uuid, config.embeddings,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
        progress_cb=progress_cb,
    )

    if len(all_ids) < 2:
        return []

    # Load vectors
    ids, vectors = _load_all_embeddings(
        view_uuid, config.embeddings,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )
    vectors = _normalize_vectors(vectors)

    if request.media_ids:
        id_set = set(request.media_ids)
        mask = np.array([mid in id_set for mid in ids])
        query_vectors = vectors[mask]
        query_ids = ids[mask]
    else:
        query_vectors = vectors
        query_ids = ids

    n = len(query_ids)
    if n < 2:
        return []

    # k-NN with k=20 to find potential duplicates
    k = min(20, n - 1)
    knn_sims, knn_idx = knn_search(
        index, all_ids, query_vectors, k,
        batch_size=50_000,
        progress_cb=progress_cb,
    )

    if progress_cb:
        progress_cb("Grouping duplicates", 96)

    # Collect pairs above threshold
    pairs = []
    pair_sims_map = {}
    for i in range(n):
        mid_i = int(query_ids[i])
        for j_pos in range(knn_sims.shape[1]):
            sim = float(knn_sims[i, j_pos])
            if sim < request.threshold:
                continue
            neighbor_idx = int(knn_idx[i, j_pos])
            if neighbor_idx < 0 or neighbor_idx >= len(all_ids):
                continue
            mid_j = int(all_ids[neighbor_idx])
            if mid_j <= mid_i:
                continue  # upper triangle only
            pairs.append((mid_i, mid_j))
            key = (min(mid_i, mid_j), max(mid_i, mid_j))
            pair_sims_map[key] = max(pair_sims_map.get(key, 0), sim)

    if not pairs:
        return []

    # Union-find grouping
    all_ids_in_pairs = set()
    for a, b in pairs:
        all_ids_in_pairs.add(a)
        all_ids_in_pairs.add(b)
    groups = _union_find_groups(pairs, all_ids_in_pairs)

    # Build result
    results = []
    for group_id, group in enumerate(groups):
        members = sorted(group)
        sim_values = []
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                key = (min(a, b), max(a, b))
                if key in pair_sims_map:
                    sim_values.append(pair_sims_map[key])
        avg_sim = float(np.mean(sim_values)) if sim_values else request.threshold
        results.append({
            "group_id": group_id,
            "media_ids": members,
            "similarity": avg_sim,
        })

    results.sort(key=lambda g: g["similarity"], reverse=True)

    if progress_cb:
        progress_cb("Finalizing", 100)

    return results[:request.limit]


def _run_centroid_distance(
    view_uuid: str,
    config,
    media_ids: List[int],
    limit: int = 200,
    progress_cb=None,
) -> List[dict]:
    """Compute distance from centroid using streaming — no FAISS needed."""
    backend = get_backend()
    con = ensure_embeddings_table(
        view_uuid, backend, config.embeddings,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )
    safe_col = '"' + config.embeddings.replace('"', '""') + '"'

    # First pass: compute centroid by streaming
    if progress_cb:
        progress_cb("Computing centroid", 10)

    if media_ids:
        placeholders = ", ".join("?" for _ in media_ids)
        total = con.execute(
            f"SELECT COUNT(*) FROM embeddings WHERE id IN ({placeholders})",
            media_ids,
        ).fetchone()[0]
        result = con.execute(
            f"SELECT id, {safe_col} FROM embeddings WHERE id IN ({placeholders})",
            media_ids,
        )
    else:
        total = con.execute("SELECT COUNT(*) FROM embeddings").fetchone()[0]
        result = con.execute(f"SELECT id, {safe_col} FROM embeddings")

    if total == 0:
        return []

    centroid = None
    all_ids_list = []
    all_vecs = []
    batch_size = 100_000
    loaded = 0

    while True:
        batch = result.fetchmany(batch_size)
        if not batch:
            break
        for row in batch:
            vec = np.array(list(row[1]), dtype=np.float32)
            all_ids_list.append(row[0])
            all_vecs.append(vec)
            if centroid is None:
                centroid = vec.copy()
            else:
                centroid += vec
        loaded += len(batch)
        if progress_cb:
            progress_cb("Computing centroid", 10 + (loaded / total) * 40)

    if centroid is None:
        return []

    centroid /= total

    # Normalize centroid
    centroid_norm = np.linalg.norm(centroid)
    if centroid_norm > 1e-10:
        centroid /= centroid_norm

    if progress_cb:
        progress_cb("Scoring items", 55)

    # Second pass: compute distances
    results = []
    for i, (mid, vec) in enumerate(zip(all_ids_list, all_vecs)):
        vec_norm = np.linalg.norm(vec)
        if vec_norm > 1e-10:
            vec = vec / vec_norm
        sim = float(np.dot(vec, centroid))
        dist = 1.0 - sim
        results.append({"media_id": int(mid), "distance": float(dist)})

        if progress_cb and i % 10_000 == 0:
            progress_cb("Scoring items", 55 + (i / total) * 40)

    results.sort(key=lambda r: r["distance"], reverse=True)

    if progress_cb:
        progress_cb("Finalizing", 100)

    return results[:limit] if limit > 0 else results


# ── Route handlers ──

@router.post("/api/views/{view_uuid}/outliers")
def find_outliers(
    view_uuid: str, request: OutlierRequest,
) -> Union[List[OutlierResult], InsightsTaskResponse]:
    """Detect outliers using Local Outlier Factor (LOF).

    Returns results directly for small datasets, or a task_id for polling.
    """
    backend = get_backend()
    loader = DataLoader(view_uuid, backend)
    config = loader.load_config()

    if config.embeddings is None:
        return []

    n = _get_embedding_count(
        view_uuid, config.embeddings,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )

    if request.media_ids:
        n = min(n, len(request.media_ids))

    if n <= _SYNC_LIMIT:
        # Synchronous path
        results = _run_outlier_detection(view_uuid, config, request)
        return [OutlierResult(**r) for r in results]

    # Async path — start background task
    task_id = str(uuid_mod.uuid4())
    with _insights_lock:
        _insights_tasks[task_id] = {
            "status": "running",
            "progress": 0,
            "phase": "Starting",
            "type": "outliers",
            "view_uuid": view_uuid,
        }

    def worker():
        try:
            results = _run_outlier_detection(
                view_uuid, config, request,
                progress_cb=_progress_cb_for_task(task_id),
            )
            _update_task(task_id, status="done", progress=100, phase="Done", results=results)
        except Exception as e:
            _update_task(task_id, status="error", error=str(e))

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    return InsightsTaskResponse(task_id=task_id)


@router.post("/api/views/{view_uuid}/duplicates")
def find_duplicates(
    view_uuid: str, request: DuplicateRequest,
) -> Union[List[DuplicateGroup], InsightsTaskResponse]:
    """Find near-duplicate groups using cosine similarity."""
    backend = get_backend()
    loader = DataLoader(view_uuid, backend)
    config = loader.load_config()

    if config.embeddings is None:
        return []

    n = _get_embedding_count(
        view_uuid, config.embeddings,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )

    if request.media_ids:
        n = min(n, len(request.media_ids))

    if n <= _SYNC_LIMIT:
        results = _run_duplicate_detection(view_uuid, config, request)
        return [DuplicateGroup(**r) for r in results]

    task_id = str(uuid_mod.uuid4())
    with _insights_lock:
        _insights_tasks[task_id] = {
            "status": "running",
            "progress": 0,
            "phase": "Starting",
            "type": "duplicates",
            "view_uuid": view_uuid,
        }

    def worker():
        try:
            results = _run_duplicate_detection(
                view_uuid, config, request,
                progress_cb=_progress_cb_for_task(task_id),
            )
            _update_task(task_id, status="done", progress=100, phase="Done", results=results)
        except Exception as e:
            _update_task(task_id, status="error", error=str(e))

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    return InsightsTaskResponse(task_id=task_id)


@router.post("/api/views/{view_uuid}/centroid-distance")
def centroid_distance(
    view_uuid: str, request: CentroidDistanceRequest,
) -> Union[List[CentroidDistanceResult], InsightsTaskResponse]:
    """Compute distance of each item from the dataset centroid."""
    backend = get_backend()
    loader = DataLoader(view_uuid, backend)
    config = loader.load_config()

    if config.embeddings is None:
        return []

    n = _get_embedding_count(
        view_uuid, config.embeddings,
        embeddings_source=config.embeddings_source,
        media_col=config.media,
    )

    if request.media_ids:
        n = min(n, len(request.media_ids))

    if n <= _SYNC_LIMIT:
        results = _run_centroid_distance(
            view_uuid, config, request.media_ids, request.limit,
        )
        return [CentroidDistanceResult(**r) for r in results]

    task_id = str(uuid_mod.uuid4())
    with _insights_lock:
        _insights_tasks[task_id] = {
            "status": "running",
            "progress": 0,
            "phase": "Starting",
            "type": "centroid_distance",
            "view_uuid": view_uuid,
        }

    def worker():
        try:
            results = _run_centroid_distance(
                view_uuid, config, request.media_ids, request.limit,
                progress_cb=_progress_cb_for_task(task_id),
            )
            _update_task(task_id, status="done", progress=100, phase="Done", results=results)
        except Exception as e:
            _update_task(task_id, status="error", error=str(e))

    thread = threading.Thread(target=worker, daemon=True)
    thread.start()
    return InsightsTaskResponse(task_id=task_id)


@router.get("/api/views/{view_uuid}/insights/status/{task_id}")
def insights_status(view_uuid: str, task_id: str) -> InsightsStatusResponse:
    """Poll the status of a background insights task."""
    with _insights_lock:
        task = _insights_tasks.get(task_id)
        if task is None:
            return InsightsStatusResponse(status="error", error="Task not found")
        return InsightsStatusResponse(
            status=task["status"],
            progress=task.get("progress", 0),
            phase=task.get("phase", ""),
            results=task.get("results"),
            error=task.get("error"),
        )
