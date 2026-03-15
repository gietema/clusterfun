"""View and plot data routes."""

import dataclasses
import os
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from clusterfun.app import APP
from clusterfun.plot import Plot
from clusterfun.models.media_indices import MediaIndices
from clusterfun.storage.factory import get_loader

router = APIRouter()

# Track whether /media has been mounted to avoid duplicate mounts.
_media_mounted = False


def _ensure_media_mount(common_media_path: Optional[str]) -> None:
    """Mount /media static files route if not already mounted."""
    global _media_mounted
    if _media_mounted or not common_media_path:
        return
    if os.path.isdir(common_media_path):
        APP.mount("/media", StaticFiles(directory=common_media_path), name="media")
        _media_mounted = True


class SaveViewRequest(BaseModel):
    media_ids: List[int]
    title: Optional[str] = None


@router.get("/api/views/{view_uuid}")
def read_view(view_uuid: str) -> Dict[str, Any]:
    """Retrieve plot data for its UUID."""
    plot = Plot.load(view_uuid)
    _ensure_media_mount(plot.cfg.common_media_path)
    return plot.as_json()


@router.get("/api/uuid")
def get_recent_uuid() -> str:
    """Retrieve the most recent plot UUID as stored in the cache directory."""
    return get_loader("recent").uuid


@router.get("/api/views/{view_uuid}/config")
def read_config(view_uuid: str) -> Dict[str, Any]:
    """Retrieve the configuration for a specific plot by its UUID."""
    config = get_loader(view_uuid).load_config()
    _ensure_media_mount(config.common_media_path)
    return dataclasses.asdict(config)


@router.post("/api/views/{view_uuid}/save-view")
def save_view(view_uuid: str, req: SaveViewRequest) -> Dict[str, str]:
    """Save a subset of media items as a new grid view."""
    from uuid import uuid4

    import duckdb

    from clusterfun.config import Config
    from clusterfun.storage.backends import get_backend
    from clusterfun.storage.query import get_connection

    loader = get_loader(view_uuid)
    source_cfg = loader.load_config()
    backend = get_backend()

    title = req.title or f"Selection ({len(req.media_ids)} items)"

    # For embeddings, reference the source view instead of copying.
    emb_source = None
    if source_cfg.embeddings:
        emb_source = source_cfg.embeddings_source or view_uuid

    # Build column list from source config, excluding embeddings
    columns = [c for c in source_cfg.columns if c != source_cfg.embeddings]

    cfg = Config(
        type="grid",
        media=source_cfg.media,
        columns=columns,
        title=title,
        display=source_cfg.display if isinstance(source_cfg.display, list) else (
            [source_cfg.display] if source_cfg.display else None
        ),
        bounding_box=source_cfg.bounding_box,
        project=source_cfg.project,
        common_media_path=source_cfg.common_media_path,
        embeddings=source_cfg.embeddings,
        embeddings_model=source_cfg.embeddings_model,
        embeddings_source=emb_source,
    )

    new_uuid = str(uuid4())

    # Write parquet directly via DuckDB COPY
    source_uri = backend.get_parquet_uri(view_uuid)
    dest_uri = backend.get_parquet_uri(new_uuid)

    # Ensure destination directory exists (for local backend)
    import os
    dest_dir = os.path.dirname(dest_uri)
    if dest_dir and not dest_uri.startswith(("s3://", "gs://")):
        os.makedirs(dest_dir, exist_ok=True)

    con = duckdb.connect()
    try:
        backend.configure_duckdb(con)

        # Quote column names for the SELECT
        col_select = ", ".join(f'"{c}"' for c in columns)

        if len(req.media_ids) > 100_000:
            # Use a temp table to avoid huge IN clauses
            con.execute("CREATE TEMP TABLE _sel_ids (id BIGINT)")
            # Insert in batches
            for i in range(0, len(req.media_ids), 10_000):
                batch = req.media_ids[i : i + 10_000]
                placeholders = ",".join(f"({mid})" for mid in batch)
                con.execute(f"INSERT INTO _sel_ids VALUES {placeholders}")
            # Re-assign IDs starting from 0
            con.execute(
                f"COPY (SELECT ROW_NUMBER() OVER () - 1 AS id, {', '.join(f's.\"{c}\"' for c in columns[1:])} "
                f"FROM read_parquet('{source_uri}') s "
                f"JOIN _sel_ids t ON s.id = t.id) "
                f"TO '{dest_uri}' (FORMAT PARQUET)"
            )
        else:
            placeholders = ",".join("?" for _ in req.media_ids)
            con.execute(
                f"COPY (SELECT ROW_NUMBER() OVER () - 1 AS id, {', '.join(f'\"{c}\"' for c in columns[1:])} "
                f"FROM read_parquet('{source_uri}') "
                f"WHERE id IN ({placeholders})) "
                f"TO '{dest_uri}' (FORMAT PARQUET)",
                list(req.media_ids),
            )
    finally:
        con.close()

    # Save config and data JSON
    count = len(req.media_ids)
    backend.save_json(new_uuid, "config.json", dataclasses.asdict(cfg))
    backend.save_json(new_uuid, "data.json", [{"count": count}])

    if cfg.project:
        from clusterfun.plot import _register_view_with_project
        _register_view_with_project(new_uuid, cfg, backend)

    return {"uuid": new_uuid}
