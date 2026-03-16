"""Media routes for retrieving media items and metadata."""

import base64
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional

import os
import tempfile

import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from PIL import Image
from pydantic import BaseModel

from clusterfun.models.media_indices import MediaIndices
from clusterfun.models.media_item import MediaItem
from clusterfun.storage.backends import get_backend
from clusterfun.storage.data_loader import _config_cache
from clusterfun.storage.factory import get_loader
from clusterfun.storage.storer import load_media
from clusterfun.storage.query import invalidate_cache, run_query
from clusterfun.storage.client import get_storage_client

router = APIRouter()

_thumb_pool = ThreadPoolExecutor(max_workers=8)


@lru_cache(maxsize=32)
def _get_view_media_config(view_uuid: str) -> tuple[str, Optional[str], bool]:
    """Cache media column name, common_media_path, and HF status for a view."""
    loader = get_loader(view_uuid)
    config = loader.load_config()
    is_hf = bool(config.hf_parquet_urls)
    return config.media, config.common_media_path, is_hf


def _ensure_hf_cached(view_uuid: str, media_id: int) -> Optional[str]:
    """Ensure an HF image is in the local cache, fetching if needed.

    Returns the cached file path, or None on failure.
    """
    from clusterfun.storage.backends.local import LocalBackend
    backend = get_backend()
    if not isinstance(backend, LocalBackend):
        return None
    cache_dir = backend.cache_dir / view_uuid / "hf_image_cache"
    for ext in (".jpg", ".png", ".webp", ".gif"):
        cached = cache_dir / f"{media_id}{ext}"
        if cached.exists():
            return str(cached)

    # Not cached — fetch via hf-bytes endpoint to populate cache
    from clusterfun.routes.huggingface import get_hf_image_bytes
    resp = get_hf_image_bytes(view_uuid, media_id)
    if resp.status_code == 200:
        # Re-check cache (get_hf_image_bytes writes it)
        for ext in (".jpg", ".png", ".webp", ".gif"):
            cached = cache_dir / f"{media_id}{ext}"
            if cached.exists():
                return str(cached)
    return None


def _get_media_path(view_uuid: str, media_id: int) -> tuple[str, Optional[str]]:
    """Look up the raw media path and common_media_path for a media id."""
    media_col, common_media_path, is_hf = _get_view_media_config(view_uuid)

    # For HF views, ensure image is cached then return path
    if is_hf:
        cached = _ensure_hf_cached(view_uuid, media_id)
        return (cached or ""), None

    backend = get_backend()
    rows = run_query(
        view_uuid,
        backend,
        f'SELECT "{media_col}" FROM database WHERE id = ?',
        params=[media_id],
    )
    if not rows:
        return "", common_media_path
    return rows[0][0], common_media_path


@lru_cache(maxsize=4096)
def _generate_thumbnail_bytes(media_path: str, common_media_path: Optional[str], size: int) -> Optional[bytes]:
    """Load image, resize to thumbnail, return JPEG bytes. Cached."""
    try:
        path = Path(media_path)
        if path.is_absolute() and path.exists():
            # Direct file path (e.g. HF cached image)
            image = Image.open(path)
        else:
            storage_client = get_storage_client(media_path, common_media_path)
            url = storage_client.get_media(media_path)
            image_data = storage_client.get_media_to_local(url)
            image = Image.open(image_data)
        if image.mode != "RGB":
            image = image.convert("RGB")
        image.thumbnail((size, size))
        buf = BytesIO()
        image.save(buf, format="JPEG", quality=60)
        return buf.getvalue()
    except Exception:
        return None


@router.get("/api/views/{view_uuid}/media/{media_id}")
def read_media(view_uuid: str, media_id: int, as_base64: bool = False) -> MediaItem:
    """Retrieve a media item associated with a specific plot by its UUID and media ID."""
    return get_loader(view_uuid).get_row(media_id, as_base64=as_base64)


@router.get("/api/views/{view_uuid}/media/{media_id}/thumbnail")
def read_media_thumbnail(view_uuid: str, media_id: int, size: int = 64) -> Response:
    """Return a small JPEG thumbnail for a media item. Browser-cacheable."""
    media_path, common_media_path = _get_media_path(view_uuid, media_id)
    if not media_path:
        return Response(status_code=404)
    data = _generate_thumbnail_bytes(media_path, common_media_path, size)
    if data is None:
        return Response(status_code=404)
    return Response(
        content=data,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400, immutable"},
    )


@router.post("/api/views/{view_uuid}/media")
def read_medias(view_uuid: str, media_ids: MediaIndices) -> List[MediaItem]:
    """Retrieve multiple media items associated with a specific plot by their UUID and media IDs."""
    return get_loader(view_uuid).get_rows(media_ids)


@router.post("/api/views/{view_uuid}/media-metadata")
def read_media_metadata(
    view_uuid: str, media_ids: MediaIndices
) -> List[Dict[str, Any]]:
    """Retrieve metadata for media items associated with a specific plot by their UUID and media IDs."""
    return get_loader(view_uuid).get_rows_metadata(media_ids)


class ThumbnailBatchRequest(BaseModel):
    media_ids: List[int]
    max_size: int = 64


@router.post("/api/views/{view_uuid}/media-thumbnails")
def get_media_thumbnails(
    view_uuid: str, req: ThumbnailBatchRequest
) -> List[Dict[str, Any]]:
    """Return {id, src} pairs as small JPEG base64 data URIs. Batch endpoint."""
    if not req.media_ids:
        return []
    loader = get_loader(view_uuid)
    config = loader.load_config()
    backend = get_backend()
    media_col = config.media
    max_size = req.max_size
    common_media_path = config.common_media_path

    is_hf = bool(config.hf_parquet_urls)

    placeholders = ",".join("?" for _ in req.media_ids)
    rows = run_query(
        view_uuid,
        backend,
        f'SELECT id, "{media_col}" FROM database WHERE id IN ({placeholders})',
        params=list(req.media_ids),
    )

    def process_row(row: tuple) -> Optional[Dict[str, Any]]:
        media_path = row[1]
        cmp = common_media_path
        if is_hf:
            cached = _ensure_hf_cached(view_uuid, row[0])
            if not cached:
                return None
            media_path = cached
            cmp = None
        data = _generate_thumbnail_bytes(media_path, cmp, max_size)
        if data is None:
            return None
        src = f"data:image/jpeg;base64,{base64.b64encode(data).decode('ascii')}"
        return {"id": row[0], "src": src}

    if is_hf:
        # Sequential for HF views to avoid hammering remote with concurrent connections
        results = [process_row(row) for row in rows]
    else:
        results = list(_thumb_pool.map(process_row, rows))
    return [r for r in results if r is not None]


class MetadataUpdate(BaseModel):
    media_ids: List[int]
    column: str
    value: Any = None


class AddColumnRequest(BaseModel):
    column: str


def _coerce_value(value: Any, col_type: pa.DataType) -> Any:
    """Coerce a value to match a PyArrow column type."""
    if value is None:
        return None
    try:
        if pa.types.is_integer(col_type):
            return int(value)
        if pa.types.is_floating(col_type):
            return float(value)
        if pa.types.is_boolean(col_type):
            if isinstance(value, str):
                return value.lower() in ("true", "1", "yes")
            return bool(value)
    except (ValueError, TypeError):
        pass
    return value


def _clear_caches(view_uuid: str) -> None:
    """Clear DuckDB and config caches for a view."""
    invalidate_cache()
    keys_to_remove = [k for k in _config_cache if k.endswith(f":{view_uuid}")]
    for k in keys_to_remove:
        del _config_cache[k]
    _get_view_media_config.cache_clear()


@router.patch("/api/views/{view_uuid}/metadata")
def update_metadata(view_uuid: str, update: MetadataUpdate) -> Dict[str, str]:
    """Update a metadata column value for one or more media items."""
    backend = get_backend()
    loader = get_loader(view_uuid)
    config = loader._load_base_config()

    if update.column not in config.columns:
        raise HTTPException(status_code=400, detail=f"Column '{update.column}' not found")
    if update.column in ("id", config.columns[1]):
        raise HTTPException(status_code=400, detail=f"Cannot edit column '{update.column}'")

    parquet_uri = backend.get_parquet_uri(view_uuid)

    # Read schema to determine column type for coercion
    schema = pq.read_schema(parquet_uri)
    col_idx = schema.get_field_index(update.column)
    col_type = schema.field(col_idx).type
    coerced = _coerce_value(update.value, col_type)

    # Build column list: replace target column with CASE expression
    col_name = update.column.replace('"', '""')
    placeholders = ",".join("?" for _ in update.media_ids)
    select_cols = []
    for c in config.columns:
        escaped = c.replace('"', '""')
        if c == update.column:
            select_cols.append(
                f'CASE WHEN id IN ({placeholders}) THEN ? ELSE "{escaped}" END AS "{escaped}"'
            )
        else:
            select_cols.append(f'"{escaped}"')

    params: list = list(update.media_ids) + [coerced]

    con = duckdb.connect()
    try:
        backend.configure_duckdb(con)
        temp_dir = os.path.dirname(parquet_uri) if not parquet_uri.startswith(("s3://", "gs://")) else None
        if temp_dir:
            fd, temp_path = tempfile.mkstemp(suffix=".parquet", dir=temp_dir)
            os.close(fd)
        else:
            fd, temp_path = tempfile.mkstemp(suffix=".parquet")
            os.close(fd)

        query = (
            f"COPY (SELECT {', '.join(select_cols)} "
            f"FROM read_parquet('{parquet_uri}')) "
            f"TO '{temp_path}' (FORMAT PARQUET)"
        )
        con.execute(query, params)
    finally:
        con.close()

    # Atomic rename (local only; for S3/GCS the backend.save_parquet path handles it)
    if not parquet_uri.startswith(("s3://", "gs://")):
        os.replace(temp_path, parquet_uri)
    else:
        # For remote backends, read the temp file and save through the backend
        table = pq.read_table(temp_path)
        backend.save_parquet(view_uuid, table)
        os.unlink(temp_path)

    _clear_caches(view_uuid)
    return {"status": "ok"}


@router.post("/api/views/{view_uuid}/add-column")
def add_column(view_uuid: str, req: AddColumnRequest) -> Dict[str, str]:
    """Add a new metadata column with null values."""
    backend = get_backend()
    loader = get_loader(view_uuid)
    config = loader._load_base_config()

    if req.column in config.columns:
        raise HTTPException(status_code=400, detail=f"Column '{req.column}' already exists")

    parquet_uri = backend.get_parquet_uri(view_uuid)
    escaped = req.column.replace('"', '""')

    con = duckdb.connect()
    try:
        backend.configure_duckdb(con)
        temp_dir = os.path.dirname(parquet_uri) if not parquet_uri.startswith(("s3://", "gs://")) else None
        if temp_dir:
            fd, temp_path = tempfile.mkstemp(suffix=".parquet", dir=temp_dir)
            os.close(fd)
        else:
            fd, temp_path = tempfile.mkstemp(suffix=".parquet")
            os.close(fd)

        query = (
            f'COPY (SELECT *, NULL::VARCHAR AS "{escaped}" '
            f"FROM read_parquet('{parquet_uri}')) "
            f"TO '{temp_path}' (FORMAT PARQUET)"
        )
        con.execute(query)
    finally:
        con.close()

    if not parquet_uri.startswith(("s3://", "gs://")):
        os.replace(temp_path, parquet_uri)
    else:
        table = pq.read_table(temp_path)
        backend.save_parquet(view_uuid, table)
        os.unlink(temp_path)

    # Update config columns
    config_data = backend.load_json(view_uuid, "config.json")
    config_data["columns"].append(req.column)
    backend.save_json(view_uuid, "config.json", config_data)

    _clear_caches(view_uuid)
    return {"status": "ok"}
