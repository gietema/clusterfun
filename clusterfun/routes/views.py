"""View and plot data routes."""

import dataclasses
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from pydantic import BaseModel

from clusterfun.plot import Plot
from clusterfun.models.media_indices import MediaIndices
from clusterfun.storage.factory import get_loader

router = APIRouter()


class SaveViewRequest(BaseModel):
    media_ids: List[int]
    title: Optional[str] = None


@router.get("/api/views/{view_uuid}")
def read_view(view_uuid: str) -> Dict[str, Any]:
    """Retrieve plot data for its UUID."""
    return Plot.load(view_uuid).as_json()


@router.get("/api/uuid")
def get_recent_uuid() -> str:
    """Retrieve the most recent plot UUID as stored in the cache directory."""
    return get_loader("recent").uuid


@router.get("/api/views/{view_uuid}/config")
def read_config(view_uuid: str) -> Dict[str, Any]:
    """Retrieve the configuration for a specific plot by its UUID."""
    return dataclasses.asdict(get_loader(view_uuid).load_config())


@router.post("/api/views/{view_uuid}/save-view")
def save_view(view_uuid: str, req: SaveViewRequest) -> Dict[str, str]:
    """Save a subset of media items as a new grid view."""
    from uuid import uuid4

    from clusterfun.config import Config
    from clusterfun.storage.backends import get_backend
    from clusterfun.storage.local.helpers import get_columns_for_db
    from clusterfun.storage.local.storer import LocalStorer

    loader = get_loader(view_uuid)
    source_cfg = loader.load_config()
    backend = get_backend()
    df = loader.get_dataframe(MediaIndices(media_ids=req.media_ids))
    df = df.drop(columns=["id"], errors="ignore")

    title = req.title or f"Selection ({len(req.media_ids)} items)"

    # For embeddings, reference the source view instead of copying.
    # The source itself may already be a reference — follow the chain.
    emb_source = None
    if source_cfg.embeddings:
        emb_source = source_cfg.embeddings_source or view_uuid

    cfg = Config(
        type="grid",
        media=source_cfg.media,
        columns=get_columns_for_db(df, source_cfg.media, "grid"),
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
    LocalStorer(backend=backend).save(new_uuid, df, cfg)

    if cfg.project:
        from clusterfun.plot import _register_view_with_project
        _register_view_with_project(new_uuid, cfg, backend)

    return {"uuid": new_uuid}
