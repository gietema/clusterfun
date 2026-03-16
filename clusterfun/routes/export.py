"""Export routes for downloading data in ML training formats."""

import io
import os
import zipfile
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image
from pydantic import BaseModel

from clusterfun.export.base import ExportItem, gather_export_items
from clusterfun.export.coco import build_coco
from clusterfun.export.yolo import build_yolo
from clusterfun.export.huggingface import build_huggingface
from clusterfun.export.classification import build_classification_mapping
from clusterfun.storage.client import get_storage_client
from clusterfun.storage.factory import get_loader

router = APIRouter()

_FORMATS = {"coco", "yolo", "huggingface", "classification"}
_dim_pool = ThreadPoolExecutor(max_workers=8)


class ExportRequest(BaseModel):
    format: str  # "coco", "yolo", "huggingface", "classification"
    media_ids: Optional[List[int]] = None
    label_filter: Optional[str] = None


def _get_image_dimensions(
    media_path: str, common_media_path: Optional[str],
) -> Optional[Tuple[int, int]]:
    """Get (width, height) for an image via the storage client."""
    try:
        storage_client = get_storage_client(media_path, common_media_path)
        url = storage_client.get_media(media_path)
        image_data = storage_client.get_media_to_local(url)
        image = Image.open(image_data)
        return image.width, image.height
    except Exception:
        return None


def _load_dimensions(
    items: List[ExportItem], common_media_path: Optional[str],
) -> Dict[int, Tuple[int, int]]:
    """Load image dimensions for all items in parallel."""
    futures = {}
    for item in items:
        futures[item.media_id] = _dim_pool.submit(
            _get_image_dimensions, item.media_path, common_media_path,
        )
    dims: Dict[int, Tuple[int, int]] = {}
    for mid, fut in futures.items():
        result = fut.result()
        if result:
            dims[mid] = result
    return dims


def _read_media_bytes(
    media_path: str, common_media_path: Optional[str],
) -> Optional[bytes]:
    """Read raw media file bytes via the storage client."""
    try:
        storage_client = get_storage_client(media_path, common_media_path)
        url = storage_client.get_media(media_path)
        data = storage_client.get_media_to_local(url)
        if isinstance(data, bytes):
            return data
        if hasattr(data, "read"):
            return data.read()
        # It's a local file path
        with open(str(data), "rb") as f:
            return f.read()
    except Exception:
        return None


def _filter_by_label(
    items: List[ExportItem], label_filter: str,
) -> List[ExportItem]:
    """Keep only items that have a specific label."""
    return [item for item in items if label_filter in item.labels]


def _build_zip(files: Dict[str, str | bytes]) -> bytes:
    """Build an in-memory zip from a dict of path -> content."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, content in files.items():
            if isinstance(content, str):
                zf.writestr(path, content)
            else:
                zf.writestr(path, content)
    return buf.getvalue()


@router.post("/api/views/{view_uuid}/export")
def export_data(view_uuid: str, request: ExportRequest):
    """Export view data in an ML training format.

    Returns a zip file as a streaming download.
    """
    if request.format not in _FORMATS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown format '{request.format}'. Must be one of: {', '.join(sorted(_FORMATS))}",
        )

    loader = get_loader(view_uuid)
    config = loader.load_config()
    items = gather_export_items(loader, request.media_ids)

    if request.label_filter:
        items = _filter_by_label(items, request.label_filter)

    if not items:
        raise HTTPException(status_code=400, detail="No items to export.")

    fmt = request.format
    filename = f"{view_uuid}_{fmt}"

    if fmt == "coco":
        coco_json = build_coco(items)
        files: Dict[str, str | bytes] = {"annotations.json": coco_json}
        zip_bytes = _build_zip(files)

    elif fmt == "yolo":
        dims = _load_dimensions(items, config.common_media_path)
        yolo_files = build_yolo(items, dims)
        zip_bytes = _build_zip(yolo_files)

    elif fmt == "huggingface":
        hf_files = build_huggingface(items)
        zip_bytes = _build_zip(hf_files)

    elif fmt == "classification":
        mapping = build_classification_mapping(items)
        # For classification, include actual media files in the zip
        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for dest_path, src_path in mapping.items():
                media_bytes = _read_media_bytes(src_path, config.common_media_path)
                if media_bytes:
                    zf.writestr(dest_path, media_bytes)
        zip_bytes = zip_buf.getvalue()

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {fmt}")

    return StreamingResponse(
        iter([zip_bytes]),
        media_type="application/zip",
        headers={
            "Content-Disposition": f"attachment; filename={filename}.zip",
        },
    )
