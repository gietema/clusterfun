"""FAISS index lifecycle manager for scalable nearest neighbor search.

Builds, caches, and persists FAISS indexes used by insight algorithms
(outlier detection, duplicate finding, centroid distance).

Index type tiers (auto-selected based on n):
- n <= 50K:  IndexFlatIP — exact, builds instantly
- 50K < n <= 1M: IndexIVFFlat — exact within clusters
- n > 1M:   IndexIVFScalarQuantizer(SQ8) — 4x compression
"""

import os
import threading
import time
from pathlib import Path
from typing import Callable, Optional, Tuple

import faiss
import numpy as np

from clusterfun.storage.backends import get_backend
from clusterfun.storage.query import ensure_embeddings_table, get_connection

# In-memory cache: view_uuid -> (index, id_array, mtime)
_index_cache: dict[str, Tuple[faiss.Index, np.ndarray, float]] = {}
_cache_lock = threading.Lock()

# IVF parameters
_NLIST = 4096
_NPROBE = 64
_TRAIN_SAMPLE = 500_000

# Cache directory
_CACHE_DIR = Path(os.environ.get("CLUSTERFUN_CACHE_DIR", Path.home() / ".cache" / "clusterfun"))


def _get_index_dir(view_uuid: str) -> Path:
    d = _CACHE_DIR / view_uuid
    d.mkdir(parents=True, exist_ok=True)
    return d


def _get_embeddings_mtime(view_uuid: str) -> float:
    """Get mtime of the embeddings parquet file for staleness detection."""
    backend = get_backend()
    try:
        uri = backend.get_parquet_uri_named(view_uuid, "embeddings.parquet")
        if os.path.exists(uri):
            return os.path.getmtime(uri)
    except Exception:
        pass
    return 0.0


def _load_all_embeddings(
    view_uuid: str,
    emb_col: str,
    embeddings_source: Optional[str] = None,
    media_col: Optional[str] = None,
    progress_cb: Optional[Callable[[str, float], None]] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    """Stream all embeddings from DuckDB, returning (ids, vectors).

    Uses fetchmany to limit peak memory during loading.
    """
    backend = get_backend()
    con = ensure_embeddings_table(
        view_uuid, backend, emb_col,
        embeddings_source=embeddings_source,
        media_col=media_col,
    )
    safe_col = '"' + emb_col.replace('"', '""') + '"'

    # Get total count
    total = con.execute(f"SELECT COUNT(*) FROM embeddings").fetchone()[0]
    if total == 0:
        return np.array([], dtype=np.int64), np.array([]).reshape(0, 0)

    # Stream in batches
    batch_size = 100_000
    all_ids = []
    all_vecs = []
    loaded = 0

    result = con.execute(f"SELECT id, {safe_col} FROM embeddings")
    while True:
        batch = result.fetchmany(batch_size)
        if not batch:
            break
        ids_batch = [r[0] for r in batch]
        vecs_batch = [list(r[1]) for r in batch]
        all_ids.extend(ids_batch)
        all_vecs.extend(vecs_batch)
        loaded += len(batch)
        if progress_cb:
            progress_cb("Loading embeddings", min(loaded / total * 30, 30))

    ids = np.array(all_ids, dtype=np.int64)
    vectors = np.array(all_vecs, dtype=np.float32)
    return ids, vectors


def _normalize_vectors(vectors: np.ndarray) -> np.ndarray:
    """L2-normalize vectors in place for cosine similarity via inner product."""
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    norms = np.maximum(norms, 1e-10)
    vectors /= norms
    return vectors


def _build_index(
    vectors: np.ndarray,
    progress_cb: Optional[Callable[[str, float], None]] = None,
) -> faiss.Index:
    """Build a FAISS index with auto-selected type based on dataset size."""
    n, d = vectors.shape

    if n <= 50_000:
        # Exact search — IndexFlatIP
        index = faiss.IndexFlatIP(d)
        index.add(vectors)
        if progress_cb:
            progress_cb("Building index", 70)
        return index

    if n <= 1_000_000:
        # IVFFlat — exact within clusters
        nlist = min(_NLIST, n // 39 + 1)  # ensure enough training points
        quantizer = faiss.IndexFlatIP(d)
        index = faiss.IndexIVFFlat(quantizer, d, nlist, faiss.METRIC_INNER_PRODUCT)
    else:
        # IVFScalarQuantizer — 4x compression
        nlist = min(_NLIST, n // 39 + 1)
        quantizer = faiss.IndexFlatIP(d)
        index = faiss.IndexIVFScalarQuantizer(
            quantizer, d, nlist, faiss.ScalarQuantizer.QT_8bit,
            faiss.METRIC_INNER_PRODUCT,
        )

    # Train on a sample
    if progress_cb:
        progress_cb("Training index", 35)
    train_n = min(_TRAIN_SAMPLE, n)
    if train_n < n:
        indices = np.random.choice(n, train_n, replace=False)
        train_data = vectors[indices]
    else:
        train_data = vectors
    index.train(train_data)

    # Add vectors in batches
    add_batch = 100_000
    for start in range(0, n, add_batch):
        end = min(start + add_batch, n)
        index.add(vectors[start:end])
        if progress_cb:
            frac = end / n
            progress_cb("Building index", 35 + frac * 35)

    index.nprobe = min(_NPROBE, nlist)
    return index


def build_faiss_index(
    view_uuid: str,
    emb_col: str,
    embeddings_source: Optional[str] = None,
    media_col: Optional[str] = None,
    progress_cb: Optional[Callable[[str, float], None]] = None,
) -> Tuple[faiss.Index, np.ndarray]:
    """Build a FAISS index from embeddings, with disk persistence.

    Returns (index, id_array).
    """
    ids, vectors = _load_all_embeddings(
        view_uuid, emb_col,
        embeddings_source=embeddings_source,
        media_col=media_col,
        progress_cb=progress_cb,
    )
    if len(ids) == 0:
        index = faiss.IndexFlatIP(1)
        return index, ids

    vectors = _normalize_vectors(vectors)
    index = _build_index(vectors, progress_cb=progress_cb)

    # Persist to disk
    index_dir = _get_index_dir(view_uuid)
    faiss.write_index(index, str(index_dir / "faiss_index.bin"))
    np.save(str(index_dir / "faiss_ids.npy"), ids)

    # Cache in memory
    mtime = _get_embeddings_mtime(view_uuid)
    with _cache_lock:
        _index_cache[view_uuid] = (index, ids, mtime)

    return index, ids


def get_or_load_index(
    view_uuid: str,
    emb_col: str,
    embeddings_source: Optional[str] = None,
    media_col: Optional[str] = None,
    progress_cb: Optional[Callable[[str, float], None]] = None,
) -> Tuple[faiss.Index, np.ndarray]:
    """Get index from cache, disk, or build from scratch.

    Returns (index, id_array).
    """
    mtime = _get_embeddings_mtime(view_uuid)

    # Check in-memory cache
    with _cache_lock:
        if view_uuid in _index_cache:
            cached_index, cached_ids, cached_mtime = _index_cache[view_uuid]
            if mtime == 0 or cached_mtime >= mtime:
                if progress_cb:
                    progress_cb("Index cached", 70)
                return cached_index, cached_ids

    # Check disk
    index_dir = _get_index_dir(view_uuid)
    index_path = index_dir / "faiss_index.bin"
    ids_path = index_dir / "faiss_ids.npy"

    if index_path.exists() and ids_path.exists():
        disk_mtime = index_path.stat().st_mtime
        if mtime == 0 or disk_mtime >= mtime:
            if progress_cb:
                progress_cb("Loading index from disk", 40)
            index = faiss.read_index(str(index_path))
            ids = np.load(str(ids_path))
            # Set nprobe if IVF
            if hasattr(index, "nprobe"):
                index.nprobe = _NPROBE
            with _cache_lock:
                _index_cache[view_uuid] = (index, ids, disk_mtime)
            if progress_cb:
                progress_cb("Index loaded", 70)
            return index, ids

    # Build from scratch
    return build_faiss_index(
        view_uuid, emb_col,
        embeddings_source=embeddings_source,
        media_col=media_col,
        progress_cb=progress_cb,
    )


def invalidate_index(view_uuid: Optional[str] = None) -> None:
    """Remove cached FAISS indexes. Called when embeddings change."""
    with _cache_lock:
        if view_uuid:
            _index_cache.pop(view_uuid, None)
        else:
            _index_cache.clear()

    # Also remove disk cache
    if view_uuid:
        index_dir = _get_index_dir(view_uuid)
        for f in ["faiss_index.bin", "faiss_ids.npy"]:
            p = index_dir / f
            if p.exists():
                p.unlink()
    else:
        # Clear all disk caches
        if _CACHE_DIR.exists():
            for d in _CACHE_DIR.iterdir():
                if d.is_dir():
                    for f in ["faiss_index.bin", "faiss_ids.npy"]:
                        p = d / f
                        if p.exists():
                            p.unlink()


def knn_search(
    index: faiss.Index,
    ids: np.ndarray,
    vectors: np.ndarray,
    k: int,
    batch_size: int = 10_000,
    progress_cb: Optional[Callable[[str, float], None]] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    """Batched k-NN search returning (distances, neighbor_indices) in id-space.

    Parameters
    ----------
    index : faiss.Index
        The FAISS index (inner product on normalized vectors).
    ids : np.ndarray
        The id array that maps index positions to media IDs.
    vectors : np.ndarray
        Query vectors (L2-normalized). Shape (n, d).
    k : int
        Number of neighbors to retrieve.
    batch_size : int
        Batch size for search queries.
    progress_cb : optional callback
        Reports (phase, progress_pct).

    Returns
    -------
    knn_sims : np.ndarray
        Inner product similarities. Shape (n, k). Excludes self.
    knn_indices : np.ndarray
        Position indices of neighbors. Shape (n, k). Excludes self.
    """
    n = len(vectors)
    k_query = min(k + 1, index.ntotal)  # +1 to exclude self

    all_sims = np.empty((n, k), dtype=np.float32)
    all_indices = np.empty((n, k), dtype=np.int64)

    for start in range(0, n, batch_size):
        end = min(start + batch_size, n)
        sims, idx = index.search(vectors[start:end], k_query)

        # Strip self-neighbor (typically position 0 with sim ~1.0)
        for i in range(end - start):
            global_i = start + i
            row_sims = sims[i]
            row_idx = idx[i]
            # Remove self
            mask = row_idx != global_i
            filtered_sims = row_sims[mask][:k]
            filtered_idx = row_idx[mask][:k]
            # Pad if needed (edge case: fewer than k neighbors)
            actual_k = len(filtered_sims)
            if actual_k < k:
                pad = k - actual_k
                filtered_sims = np.pad(filtered_sims, (0, pad), constant_values=0)
                filtered_idx = np.pad(filtered_idx, (0, pad), constant_values=0)
            all_sims[global_i] = filtered_sims
            all_indices[global_i] = filtered_idx

        if progress_cb:
            frac = end / n
            progress_cb("Running analysis", 70 + frac * 25)

    return all_sims, all_indices
