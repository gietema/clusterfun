"""Annotation routes for saving, loading, deleting, and exporting annotations."""

from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from clusterfun.models.annotation import AnnotationPayload
from clusterfun.storage.factory import get_loader

router = APIRouter()


@router.get("/api/views/{view_uuid}/annotations/{media_id}")
def get_annotations(view_uuid: str, media_id: int) -> List[Dict[str, Any]]:
    """Get all annotations for a single media item."""
    loader = get_loader(view_uuid)
    return loader.annotation_manager.get_annotations(media_id)


@router.post("/api/views/{view_uuid}/annotations")
def save_annotations(view_uuid: str, payload: AnnotationPayload) -> str:
    """Save (replace) all annotations for a single media item."""
    loader = get_loader(view_uuid)
    annotations = [a.model_dump() for a in payload.annotations]
    loader.annotation_manager.save_annotations(payload.media_id, annotations)
    return "OK"


class DeleteAnnotationPayload(BaseModel):
    media_id: int
    annotation_id: str


@router.delete("/api/views/{view_uuid}/annotations")
def delete_annotation(view_uuid: str, payload: DeleteAnnotationPayload) -> str:
    """Delete a single annotation."""
    loader = get_loader(view_uuid)
    loader.annotation_manager.delete_annotation(payload.media_id, payload.annotation_id)
    return "OK"


class ExportPayload(BaseModel):
    media_ids: Optional[List[int]] = None


@router.post("/api/views/{view_uuid}/annotations/export")
def export_annotations(view_uuid: str, payload: ExportPayload) -> JSONResponse:
    """Export all annotations as a flat JSON list."""
    loader = get_loader(view_uuid)
    data = loader.annotation_manager.export(payload.media_ids)
    return JSONResponse(content=data)
