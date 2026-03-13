"""Label routes for saving, deleting, downloading, and counting labels."""

from typing import Any, Dict, List

import pandas as pd
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from clusterfun.models.media_indices import MediaIndices
from clusterfun.models.media_item import Label
from clusterfun.plot_types.grid import grid
from clusterfun.storage.local.label_manager import count_labels
from clusterfun.storage.local.loader import LocalLoader

router = APIRouter()


@router.post("/api/views/{view_uuid}/label")
def save_labels(
    view_uuid: str,
    label: Label,
    media_indices: MediaIndices,
) -> str:
    """Save a label for a media item."""
    loader = LocalLoader(view_uuid)
    loader.label_manager.save_label(label.title, media_indices.media_ids)
    return "OK"


@router.delete("/api/views/{view_uuid}/label")
def delete_labels(
    view_uuid: str,
    label: Label,
    media_indices: MediaIndices,
) -> str:
    """Delete a label for a media item."""
    loader = LocalLoader(view_uuid)
    loader.label_manager.delete_label(label.title, media_indices.media_ids)
    return "OK"


@router.post("/api/views/{view_uuid}/label-download")
def download_labels(
    view_uuid: str,
    label: Label,
    media_indices: MediaIndices,
) -> StreamingResponse:
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


@router.post("/api/views/{view_uuid}/labels-count")
def count(view_uuid: str, media_indices: MediaIndices) -> List[Dict[str, Any]]:
    """Count the number of labels for the given view."""
    loader = LocalLoader(view_uuid)
    labels = loader.label_manager.read_labels()
    return count_labels(labels, media_indices.media_ids)


@router.post("/api/views/{view_uuid}/label-to-grid")
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
