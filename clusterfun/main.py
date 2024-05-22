"""
main.py
======

This module provides a FastAPI implementation for serving plot views and media items,
allowing interaction with the underlying data storage, filtering, and retrieval of
configurations, media items, and plot data.

Routes
------
GET /
    Serve index.html as the default file.
GET /views/{view_uuid}
    Retrieve plot data for a specific view by its UUID.
GET /uuid
    Retrieve the most recent plot UUID.
GET /views/{view_uuid}/config
    Retrieve the configuration for a specific plot view by its UUID.
GET /views/{view_uuid}/media/{media_id}
    Retrieve a media item associated with a specific plot by its UUID and media ID.
POST /views/{view_uuid}/media
    Retrieve multiple media items associated with a specific plot by their UUID and media IDs.
POST /views/{view_uuid}/filter
    Filter plot based on a list of provided filters.

"""
import dataclasses
from typing import Any, Dict, List

import pandas as pd
from fastapi import Request
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse

from clusterfun.app import APP, FRONTEND_DIR
from clusterfun.models.filter import Filter
from clusterfun.models.media_indices import MediaIndices
from clusterfun.models.media_item import Label, MediaItem
from clusterfun.plot import Plot
from clusterfun.plot_types.grid import grid
from clusterfun.storage.local.label_manager import count_labels
from clusterfun.storage.local.loader import LocalLoader


@APP.get("/api/views/{view_uuid}")
def read_view(view_uuid: str) -> Dict[str, Any]:
    """Retrieve plot data for its UUID."""
    return Plot.load(view_uuid).as_json()


@APP.get("/api/uuid")
def get_recent_uuid() -> str:
    """Retrieve the most recent plot UUID as stored in the cache directory."""
    return LocalLoader("recent").cache_dir.stem


@APP.get("/api/views/{view_uuid}/config")
def read_config(view_uuid: str) -> Dict[str, Any]:
    """Retrieve the configuration for a specific plot by its UUID."""
    return dataclasses.asdict(LocalLoader(view_uuid).load_config())


@APP.get("/api/views/{view_uuid}/media/{media_id}")
def read_media(view_uuid: str, media_id: int, as_base64: bool = False) -> MediaItem:
    """Retrieve a media item associated with a specific plot by its UUID and media ID."""
    return LocalLoader(view_uuid).get_row(media_id, as_base64=as_base64)


@APP.post("/api/views/{view_uuid}/media")
def read_medias(view_uuid: str, media_ids: MediaIndices) -> List[MediaItem]:
    """Retrieve multiple media items associated with a specific plot by their UUID and media IDs."""
    return LocalLoader(view_uuid).get_rows(media_ids)


@APP.post("/api/views/{view_uuid}/filter")
def filter_view(view_uuid: str, filters: List[Filter]) -> List[Dict[str, Any]]:
    """Filter plot based on a list of provided filters."""
    return LocalLoader(view_uuid).filter(filters)


@APP.post("/api/views/{view_uuid}/media-metadata")
def read_media_metadata(view_uuid: str, media_ids: MediaIndices) -> List[Dict[str, Any]]:
    """Retrieve metadata for media items associated with a specific plot by their UUID and media IDs."""
    return LocalLoader(view_uuid).get_rows_metadata(media_ids)


@APP.post("/api/views/{view_uuid}/download-grid")
def download_grid(view_uuid: str, media_indices: MediaIndices) -> FileResponse:
    """Download the data selected in the grid"""
    loader = LocalLoader(view_uuid)
    df = loader.get_dataframe(media_indices=media_indices)
    # TODO:: include labels
    return StreamingResponse(
        iter([df.to_csv(index=False)]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=data.csv"},
    )


@APP.delete("/api/views/{view_uuid}/label")
def delete_labels(
    view_uuid: str,
    label: Label,
    media_indices: MediaIndices,
) -> str:
    """Delete a label for a media item."""
    loader = LocalLoader(view_uuid)
    loader.label_manager.delete_label(label.title, media_indices.media_ids)
    return "OK"


@APP.post("/api/views/{view_uuid}/label")
def save_labels(
    view_uuid: str,
    label: Label,
    media_indices: MediaIndices,
) -> str:
    """Save a label for a media item."""
    loader = LocalLoader(view_uuid)
    loader.label_manager.save_label(label.title, media_indices.media_ids)
    return "OK"


@APP.post("/api/views/{view_uuid}/label-download")
def download_labels(
    view_uuid: str,
    label: Label,
    media_indices: MediaIndices,
):
    """Download all labels for the given view as a csv file."""
    loader = LocalLoader(view_uuid)
    df = loader.label_manager.get_dataframe(label=label.title if label.title != "" else None)

    # limit to selection if media_indices is provided
    if len(media_indices.media_ids) > 0:
        df = df[df["media_id"].isin(media_indices.media_ids)]

    dff = loader.get_dataframe(MediaIndices(media_ids=df["media_id"].tolist()))
    df = pd.merge(df, dff, left_on="media_id", right_on="id")

    return StreamingResponse(
        iter([df.to_csv(index=False)]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={view_uuid}_labels.csv"},
    )


@APP.post("/api/views/{view_uuid}/labels-count")
def count(view_uuid: str, media_indices: MediaIndices) -> List[Dict[str, Any]]:
    """Count the number of labels for the given view."""
    loader = LocalLoader(view_uuid)
    labels = loader.label_manager.read_labels()
    return count_labels(labels, media_indices.media_ids)


@APP.post("/api/views/{view_uuid}/label-to-grid")
def to_grid(
    view_uuid: str,
    label: Label,
    media_indices: MediaIndices,
) -> str:
    """Saved all labeled items for a given label as a grid."""
    loader = LocalLoader(view_uuid)
    df = loader.label_manager.get_dataframe(label.title if label.title != "" else None)

    # limit to selection if media_indices is provided
    if len(media_indices.media_ids) > 0:
        df = df[df["media_id"].isin(media_indices.media_ids)]

    cfg = loader.load_config()
    dff = loader.get_dataframe(MediaIndices(media_ids=df["media_id"].tolist()))
    df = pd.merge(df, dff, left_on="media_id", right_on="id")

    url = grid(
        df.drop(columns=["id"]),
        media=cfg.media,
        show=False,
        title=f"Grid of {len(df)} {label.title} labeled items",
    )
    print(url)
    return str(url)


@APP.get("/{path:path}", response_class=HTMLResponse)
async def catch_all(request: Request, path: str):  # pylint: disable=unused-argument
    """Last catch all function to return index html of frontend.
    Used for routing all remaining URLs to the NextJS app"""
    with open(FRONTEND_DIR / "index.html", encoding="utf-8") as f:
        return f.read()
