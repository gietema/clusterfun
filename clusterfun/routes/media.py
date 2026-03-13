"""Media routes for retrieving media items and metadata."""

from typing import Any, Dict, List

from fastapi import APIRouter

from clusterfun.models.media_indices import MediaIndices
from clusterfun.models.media_item import MediaItem
from clusterfun.storage.local.loader import LocalLoader

router = APIRouter()


@router.get("/api/views/{view_uuid}/media/{media_id}")
def read_media(view_uuid: str, media_id: int, as_base64: bool = False) -> MediaItem:
    """Retrieve a media item associated with a specific plot by its UUID and media ID."""
    return LocalLoader(view_uuid).get_row(media_id, as_base64=as_base64)


@router.post("/api/views/{view_uuid}/media")
def read_medias(view_uuid: str, media_ids: MediaIndices) -> List[MediaItem]:
    """Retrieve multiple media items associated with a specific plot by their UUID and media IDs."""
    return LocalLoader(view_uuid).get_rows(media_ids)


@router.post("/api/views/{view_uuid}/media-metadata")
def read_media_metadata(view_uuid: str, media_ids: MediaIndices) -> List[Dict[str, Any]]:
    """Retrieve metadata for media items associated with a specific plot by their UUID and media IDs."""
    return LocalLoader(view_uuid).get_rows_metadata(media_ids)
