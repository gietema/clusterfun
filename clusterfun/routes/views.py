"""View and plot data routes."""

import dataclasses
from typing import Any, Dict

from fastapi import APIRouter

from clusterfun.plot import Plot
from clusterfun.storage.local.loader import LocalLoader

router = APIRouter()


@router.get("/api/views/{view_uuid}")
def read_view(view_uuid: str) -> Dict[str, Any]:
    """Retrieve plot data for its UUID."""
    return Plot.load(view_uuid).as_json()


@router.get("/api/uuid")
def get_recent_uuid() -> str:
    """Retrieve the most recent plot UUID as stored in the cache directory."""
    return LocalLoader("recent").cache_dir.stem


@router.get("/api/views/{view_uuid}/config")
def read_config(view_uuid: str) -> Dict[str, Any]:
    """Retrieve the configuration for a specific plot by its UUID."""
    return dataclasses.asdict(LocalLoader(view_uuid).load_config())
