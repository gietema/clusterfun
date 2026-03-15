"""Image statistics computation routes.

Computes per-image statistics (brightness, contrast, sharpness, etc.) and
adds them as new columns to the view's parquet file. Once computed, the stats
appear as regular columns in plots, filters, and insights.
"""

import math
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq
from fastapi import APIRouter
from PIL import Image, ImageFilter
from pydantic import BaseModel

from clusterfun.storage.backends import get_backend
from clusterfun.storage.client import get_storage_client
from clusterfun.storage.data_loader import _config_cache
from clusterfun.storage.factory import get_loader
from clusterfun.storage.query import get_connection, invalidate_cache

router = APIRouter()

# ── In-memory progress tracking ──

_progress: Dict[str, Dict[str, Any]] = {}
_progress_lock = threading.Lock()

STAT_COLUMNS = [
    "img_brightness",
    "img_contrast",
    "img_sharpness",
    "img_colorfulness",
    "img_saturation",
    "img_aspect_ratio",
    "img_width",
    "img_height",
]

MAX_THUMB = 128  # resize to this for stat computation — fast enough for 100K


def _compute_image_stats(image: Image.Image) -> Dict[str, float]:
    """Compute all stats for a single PIL image."""
    width, height = image.size

    # Resize for fast stat computation
    thumb = image.copy()
    thumb.thumbnail((MAX_THUMB, MAX_THUMB))

    # Convert to RGB if needed
    if thumb.mode != "RGB":
        thumb = thumb.convert("RGB")

    pixels = np.array(thumb, dtype=np.float32)  # (H, W, 3)

    # Grayscale using luminance weights
    gray = 0.299 * pixels[:, :, 0] + 0.587 * pixels[:, :, 1] + 0.114 * pixels[:, :, 2]

    brightness = float(np.mean(gray) / 255.0)
    contrast = float(np.std(gray) / 255.0)

    # Sharpness: variance of Laplacian (log scale for better distribution)
    gray_img = thumb.convert("L")
    laplacian = gray_img.filter(ImageFilter.Kernel(
        size=(3, 3),
        kernel=[-1, -1, -1, -1, 8, -1, -1, -1, -1],
        scale=1,
        offset=128,
    ))
    lap_arr = np.array(laplacian, dtype=np.float32) - 128.0
    sharpness = float(np.log1p(np.var(lap_arr)))

    # Colorfulness: Hasler & Süsstrunk metric
    r, g, b = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    rg = r - g
    yb = 0.5 * (r + g) - b
    colorfulness = float(
        math.sqrt(float(np.std(rg)) ** 2 + float(np.std(yb)) ** 2)
        + 0.3 * math.sqrt(float(np.mean(rg)) ** 2 + float(np.mean(yb)) ** 2)
    ) / 255.0

    # Saturation: mean S in HSV
    hsv = thumb.convert("HSV")
    s_channel = np.array(hsv)[:, :, 1]
    saturation = float(np.mean(s_channel) / 255.0)

    aspect_ratio = round(width / max(height, 1), 3)

    return {
        "img_brightness": round(brightness, 4),
        "img_contrast": round(contrast, 4),
        "img_sharpness": round(sharpness, 4),
        "img_colorfulness": round(colorfulness, 4),
        "img_saturation": round(saturation, 4),
        "img_aspect_ratio": aspect_ratio,
        "img_width": float(width),
        "img_height": float(height),
    }


def _load_and_compute(
    media_path: str,
    common_media_path: Optional[str],
) -> Optional[Dict[str, float]]:
    """Load a single image and compute its stats."""
    try:
        client = get_storage_client(media_path, common_media_path)
        url = client.get_media(media_path)
        data = client.get_media_to_local(url)
        image = Image.open(data)
        return _compute_image_stats(image)
    except Exception:
        return None


def _run_computation(view_uuid: str) -> None:
    """Background worker: compute stats for all images and merge into parquet."""
    backend = get_backend()
    loader = get_loader(view_uuid)
    config = loader.load_config()
    media_col = config.media
    common_media_path = config.common_media_path

    # Read all media paths
    con = get_connection(view_uuid, backend)
    rows = con.execute(f'SELECT id, "{media_col}" FROM database').fetchall()
    total = len(rows)

    with _progress_lock:
        _progress[view_uuid] = {
            "status": "computing",
            "progress": 0,
            "total": total,
            "done": 0,
        }

    # Compute stats in parallel, batched to limit memory
    results: Dict[int, Dict[str, float]] = {}
    done_count = 0
    CHUNK_SIZE = 1000

    with ThreadPoolExecutor(max_workers=8) as pool:
        for chunk_start in range(0, total, CHUNK_SIZE):
            chunk = rows[chunk_start : chunk_start + CHUNK_SIZE]
            futures = {
                pool.submit(_load_and_compute, row[1], common_media_path): row[0]
                for row in chunk
            }
            for future in as_completed(futures):
                media_id = futures[future]
                stats = future.result()
                if stats is not None:
                    results[media_id] = stats
                done_count += 1
                if done_count % 100 == 0 or done_count == total:
                    with _progress_lock:
                        _progress[view_uuid]["done"] = done_count
                        _progress[view_uuid]["progress"] = round(
                            done_count / total * 100
                        )

    # Build arrays aligned with the existing parquet row order
    existing_table = pq.read_table(backend.get_parquet_uri(view_uuid))
    ids = existing_table.column("id").to_pylist()

    # Default values for images that failed to load
    defaults = {col: float("nan") for col in STAT_COLUMNS}

    stat_arrays: Dict[str, List[float]] = {col: [] for col in STAT_COLUMNS}
    for media_id in ids:
        row_stats = results.get(media_id, defaults)
        for col in STAT_COLUMNS:
            stat_arrays[col].append(row_stats.get(col, float("nan")))

    # Remove old stat columns if they exist (re-computation)
    cols_to_keep = [
        i for i, name in enumerate(existing_table.column_names)
        if name not in set(STAT_COLUMNS)
    ]
    new_table = existing_table.select(cols_to_keep)

    # Append new stat columns
    for col in STAT_COLUMNS:
        new_table = new_table.append_column(col, pa.array(stat_arrays[col], type=pa.float64()))

    # Write back
    backend.save_parquet(view_uuid, new_table)

    # Update config to include new columns
    config_data = backend.load_json(view_uuid, "config.json")
    existing_cols = config_data.get("columns", [])
    for col in STAT_COLUMNS:
        if col not in existing_cols:
            existing_cols.append(col)
    config_data["columns"] = existing_cols
    backend.save_json(view_uuid, "config.json", config_data)

    # Clear caches so new columns are visible
    invalidate_cache()
    # Clear config cache
    keys_to_remove = [k for k in _config_cache if k.endswith(f":{view_uuid}")]
    for k in keys_to_remove:
        del _config_cache[k]

    with _progress_lock:
        _progress[view_uuid] = {
            "status": "done",
            "progress": 100,
            "total": total,
            "done": total,
            "columns": STAT_COLUMNS,
        }


class ImageStatsResponse(BaseModel):
    status: str  # "idle" | "computing" | "done" | "already_computed"
    progress: int = 0
    total: int = 0
    done: int = 0
    columns: List[str] = []


@router.post("/api/views/{view_uuid}/image-stats/compute")
def compute_image_stats(view_uuid: str) -> ImageStatsResponse:
    """Start computing image statistics in a background thread."""
    # Check if already computing
    with _progress_lock:
        if view_uuid in _progress and _progress[view_uuid]["status"] == "computing":
            p = _progress[view_uuid]
            return ImageStatsResponse(
                status="computing",
                progress=p["progress"],
                total=p["total"],
                done=p["done"],
            )

    # Check if stats are already in the parquet
    backend = get_backend()
    con = get_connection(view_uuid, backend)
    try:
        col_names = [desc[0] for desc in con.execute("SELECT * FROM database LIMIT 0").description]
        if all(col in col_names for col in STAT_COLUMNS):
            return ImageStatsResponse(
                status="already_computed",
                progress=100,
                columns=STAT_COLUMNS,
            )
    except Exception:
        pass

    # Start background computation
    thread = threading.Thread(target=_run_computation, args=(view_uuid,), daemon=True)
    thread.start()

    return ImageStatsResponse(status="computing", progress=0)


@router.get("/api/views/{view_uuid}/image-stats/status")
def image_stats_status(view_uuid: str) -> ImageStatsResponse:
    """Check the status of image stats computation."""
    with _progress_lock:
        if view_uuid in _progress:
            p = _progress[view_uuid]
            return ImageStatsResponse(
                status=p["status"],
                progress=p.get("progress", 0),
                total=p.get("total", 0),
                done=p.get("done", 0),
                columns=p.get("columns", []),
            )

    # Check if stats exist in parquet
    backend = get_backend()
    try:
        con = get_connection(view_uuid, backend)
        col_names = [desc[0] for desc in con.execute("SELECT * FROM database LIMIT 0").description]
        if all(col in col_names for col in STAT_COLUMNS):
            return ImageStatsResponse(
                status="done",
                progress=100,
                columns=STAT_COLUMNS,
            )
    except Exception:
        pass

    return ImageStatsResponse(status="idle")
