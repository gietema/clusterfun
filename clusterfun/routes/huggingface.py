"""HuggingFace image bytes endpoint.

Fetches image bytes from remote HF parquet files on demand,
with local disk caching for subsequent requests.
"""

import threading
from pathlib import Path
from typing import Optional

import duckdb
from fastapi import APIRouter
from fastapi.responses import Response

from clusterfun.storage.backends import get_backend
from clusterfun.storage.backends.local import LocalBackend
from clusterfun.storage.factory import get_loader
from clusterfun.storage.query import run_query

router = APIRouter()

# Single reusable DuckDB connection for HF fetches (with lock for thread safety)
_hf_con: Optional[duckdb.DuckDBPyConnection] = None
_hf_con_lock = threading.Lock()


def _get_hf_connection() -> duckdb.DuckDBPyConnection:
    """Get or create a persistent DuckDB connection with httpfs loaded."""
    global _hf_con
    if _hf_con is None:
        _hf_con = duckdb.connect()
        _hf_con.execute("INSTALL httpfs; LOAD httpfs;")
    return _hf_con


def _reset_hf_connection() -> None:
    """Reset the connection after an error."""
    global _hf_con
    try:
        if _hf_con is not None:
            _hf_con.close()
    except Exception:
        pass
    _hf_con = None


def _get_cache_dir(view_uuid: str) -> Path:
    """Get the HF image cache directory for a view."""
    backend = get_backend()
    if isinstance(backend, LocalBackend):
        cache_dir = backend.cache_dir / view_uuid / "hf_image_cache"
    else:
        cache_dir = Path.home() / ".cache" / "clusterfun" / view_uuid / "hf_image_cache"
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir


def _detect_content_type(data: bytes) -> str:
    """Detect image content type from magic bytes."""
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:2] == b"\xff\xd8":
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return "image/jpeg"


def _detect_extension(content_type: str) -> str:
    """Get file extension from content type."""
    return {
        "image/png": ".png",
        "image/jpeg": ".jpg",
        "image/webp": ".webp",
        "image/gif": ".gif",
    }.get(content_type, ".jpg")


def _fetch_hf_bytes(urls: list, hf_col: str, row_idx: int) -> Optional[bytes]:
    """Fetch image bytes from HF parquet using the persistent connection.

    Uses a lock to serialize access and retries once on connection error.
    """
    url_list = ", ".join(f"'{u}'" for u in urls)
    query = (
        f'SELECT "{hf_col}".bytes '
        f"FROM read_parquet([{url_list}]) "
        f"LIMIT 1 OFFSET {row_idx}"
    )

    with _hf_con_lock:
        for attempt in range(2):
            try:
                con = _get_hf_connection()
                result = con.execute(query).fetchone()
                if result and result[0]:
                    return bytes(result[0])
                return None
            except duckdb.Error:
                _reset_hf_connection()
                if attempt == 0:
                    continue
                return None
    return None


@router.get("/api/views/{view_uuid}/hf-bytes/{media_id}")
def get_hf_image_bytes(view_uuid: str, media_id: int, col: Optional[str] = None) -> Response:
    """Fetch image bytes from HuggingFace parquet files.

    The local parquet stores a row index (as the image column) that maps to the
    position in the remote parquet files. We use LIMIT 1 OFFSET <row_idx> to
    fetch exactly that row's image bytes.

    Parameters
    ----------
    col : str, optional
        Image column name for multi-image datasets (e.g. "image_2").
        Must be listed in config.hf_extra_image_columns. When None, uses
        the primary image column.

    Checks local disk cache first, falls back to remote fetch via DuckDB httpfs.
    """
    cache_dir = _get_cache_dir(view_uuid)

    # Cache key includes column name for extra images
    cache_prefix = f"{media_id}_{col}" if col else str(media_id)

    # Check disk cache (try common extensions)
    for ext in (".jpg", ".png", ".webp", ".gif"):
        cached = cache_dir / f"{cache_prefix}{ext}"
        if cached.exists():
            content_type = {
                ".jpg": "image/jpeg",
                ".png": "image/png",
                ".webp": "image/webp",
                ".gif": "image/gif",
            }[ext]
            return Response(
                content=cached.read_bytes(),
                media_type=content_type,
                headers={"Cache-Control": "public, max-age=86400, immutable"},
            )

    # Load config to get HF parquet URLs and image column
    loader = get_loader(view_uuid)
    config = loader._load_base_config()

    if not config.hf_parquet_urls or not config.hf_image_column:
        return Response(status_code=404)

    # Validate the requested column
    if col is not None:
        allowed = config.hf_extra_image_columns or []
        if col not in allowed:
            return Response(status_code=404)

    # Look up the HF row index from local parquet
    backend = get_backend()
    rows = run_query(
        view_uuid,
        backend,
        "SELECT image FROM database WHERE id = ?",
        params=[media_id],
    )
    if not rows:
        return Response(status_code=404)

    hf_row_idx = int(rows[0][0])
    hf_col = col if col else config.hf_image_column

    image_bytes = _fetch_hf_bytes(config.hf_parquet_urls, hf_col, hf_row_idx)
    if not image_bytes:
        return Response(status_code=404)

    content_type = _detect_content_type(image_bytes)
    ext = _detect_extension(content_type)

    # Cache to disk
    cache_path = cache_dir / f"{cache_prefix}{ext}"
    cache_path.write_bytes(image_bytes)

    return Response(
        content=image_bytes,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400, immutable"},
    )
