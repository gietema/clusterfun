"""HuggingFace image bytes endpoint.

Fetches image bytes from remote HF parquet files on demand,
with local disk caching for subsequent requests.
"""

from pathlib import Path

import duckdb
from fastapi import APIRouter
from fastapi.responses import Response

from clusterfun.storage.backends import get_backend
from clusterfun.storage.backends.local import LocalBackend
from clusterfun.storage.factory import get_loader
from clusterfun.storage.query import run_query

router = APIRouter()


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


@router.get("/api/views/{view_uuid}/hf-bytes/{media_id}")
def get_hf_image_bytes(view_uuid: str, media_id: int) -> Response:
    """Fetch image bytes from HuggingFace parquet files.

    The local parquet stores a row index (as the image column) that maps to the
    position in the remote parquet files. We use LIMIT 1 OFFSET <row_idx> to
    fetch exactly that row's image bytes.

    Checks local disk cache first, falls back to remote fetch via DuckDB httpfs.
    """
    cache_dir = _get_cache_dir(view_uuid)

    # Check disk cache (try common extensions)
    for ext in (".jpg", ".png", ".webp", ".gif"):
        cached = cache_dir / f"{media_id}{ext}"
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

    # Fetch bytes from remote HF parquet via DuckDB httpfs
    hf_col = config.hf_image_column
    url_list = ", ".join(f"'{u}'" for u in config.hf_parquet_urls)

    con = duckdb.connect()
    try:
        con.execute("INSTALL httpfs; LOAD httpfs;")
        result = con.execute(
            f'SELECT "{hf_col}".bytes '
            f"FROM read_parquet([{url_list}]) "
            f"LIMIT 1 OFFSET {hf_row_idx}",
        ).fetchone()
    finally:
        con.close()

    if not result or not result[0]:
        return Response(status_code=404)

    image_bytes = bytes(result[0])
    content_type = _detect_content_type(image_bytes)
    ext = _detect_extension(content_type)

    # Cache to disk
    cache_path = cache_dir / f"{media_id}{ext}"
    cache_path.write_bytes(image_bytes)

    return Response(
        content=image_bytes,
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=86400, immutable"},
    )
