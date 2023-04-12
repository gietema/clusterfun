"""MediaItem model."""
import dataclasses
from typing import Any, List, Optional

from clusterfun.utils.s3 import get_presigned_url


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
    """

    index: int
    src: str
    information: Optional[List[Any]] = None
    width: Optional[int] = None
    height: Optional[int] = None

    def __post_init__(self):
        """Post init hook. This is used to get a presigned url if the src is a s3 url."""
        if self.src.startswith("s3://"):
            self.src = get_presigned_url(self.src)
