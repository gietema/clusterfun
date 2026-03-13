"""MediaItem model."""

import dataclasses
from typing import Any, Dict, List, Optional

from pydantic import BaseModel


@dataclasses.dataclass
class MediaItem:
    """MediaItem model.

    Parameters
    ----------
    index : int
        The index of the media item.
    src : str
        The source of the media item.
        This can be a path to a local file or a url.
    information : Optional[Dict[str, Any]], optional
        Column name to value mapping for sidebar display.
    width : Optional[int], optional
        The width of the media item, by default None
        Used for plotting a single image in a plotly figure.
    height : Optional[int], optional
        The height of the media item, by default None
        Used for plotting a single image in a plotly figure.
    labels: Optional[List[str]], optional
        The labels of the media item.
    """

    index: int
    src: str
    information: Optional[Dict[str, Any]] = None
    width: Optional[int] = None
    height: Optional[int] = None
    labels: Optional[List[str]] = None


class Label(BaseModel):
    """Simple label model."""

    title: str
