"""Media routes for retrieving media items and metadata."""

from functools import lru_cache
from io import BytesIO
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from fastapi.responses import Response
from PIL import Image

from clusterfun.models.media_indices import MediaIndices
from clusterfun.models.media_item import MediaItem
from clusterfun.storage.backends import get_backend
from clusterfun.storage.factory import get_loader
from clusterfun.storage.storer import load_media
from clusterfun.storage.query import run_query
from clusterfun.storage.client import get_storage_client

router = APIRouter()


def _get_media_path(view_uuid: str, media_id: int) -> tuple[str, Optional[str]]:
    """Look up the raw media path and common_media_path for a media id."""
    loader = get_loader(view_uuid)
    config = loader.load_config()
    backend = get_backend()
    rows = run_query(
        view_uuid,
        backend,
        f'SELECT "{config.media}" FROM database WHERE id = ?',
        params=[media_id],
    )
    if not rows:
        return "", config.common_media_path
    return rows[0][0], config.common_media_path


@lru_cache(maxsize=4096)
def _generate_thumbnail_bytes(media_path: str, common_media_path: Optional[str], size: int) -> Optional[bytes]:
    """Load image, resize to thumbnail, return JPEG bytes. Cached."""
    try:
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


@router.post("/api/views/{view_uuid}/media-srcs")
def get_media_srcs(
    view_uuid: str, req: MediaIndices
) -> List[Dict[str, Any]]:
    """Return {id, src} pairs as base64 data URIs for embedding map thumbnails."""
    if not req.media_ids:
        return []
    loader = get_loader(view_uuid)
    config = loader.load_config()
    backend = get_backend()
    media_col = config.media
    placeholders = ",".join("?" for _ in req.media_ids)
    rows = run_query(
        view_uuid,
        backend,
        f'SELECT id, "{media_col}" FROM database WHERE id IN ({placeholders})',
        params=list(req.media_ids),
    )
    results = []
    for row in rows:
        try:
            src, _, _ = load_media(
                row[1], as_base64=True, common_media_path=config.common_media_path
            )
        except Exception:
            continue
        results.append({"id": row[0], "src": src})
    return results
