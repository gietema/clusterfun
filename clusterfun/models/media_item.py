"""MediaItem model."""

import dataclasses
from typing import Any, List, Optional

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
    information : Optional[List[Any]], optional
        The information of the media item, by default None
        Used for showing information in the sidebar.
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
    information: Optional[List[Any]] = None
    width: Optional[int] = None
    height: Optional[int] = None
    labels: Optional[List[str]] = None


class Label(BaseModel):
    """Simple label model."""

    title: str
