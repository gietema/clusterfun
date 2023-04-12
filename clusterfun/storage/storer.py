"""
Base class for storing plots.
"""
import abc
import base64
from io import BytesIO
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd
import requests
from PIL import Image

from clusterfun.config import Config
from clusterfun.utils.s3 import get_presigned_url


class Storer(abc.ABC):
    """Base class for storing plots."""

    @abc.abstractmethod
    def save(self, uuid: str, df: pd.DataFrame, cfg: Config):
        """Save a plot the plot. Should take care of:
        - saving the data in a minimal format for the plot. This should be
            a list of dictionaries, where each dictionary is a row in the
            DataFrame with just the values required for the plot.
        - saving the configuration object
        - Saving something that allows the data to be queried. This could
            be a database, or a file with the data in it.
        """

    @abc.abstractmethod
    def save_config(self, cfg: Config):
        """Save the configuration object for a plot."""

    @abc.abstractmethod
    def save_data(self, data: List[Dict[str, Any]]):
        """Save the data for a plot. This is the minimal data required for the plot."""


def image_to_base64(image: Image.Image) -> str:
    """Convert a Pillow image to a base64-encoded string."""
    buffered = BytesIO()
    if image.mode != "RGB":
        image = image.convert("RGB")
    image.save(buffered, format="PNG")
    return str(base64.b64encode(buffered.getvalue()).decode("utf-8"))


def load_media(
    url: str, as_base64: bool = False, common_media_path: Optional[str] = None
) -> Tuple[str, Optional[int], Optional[int]]:
    """Load media from a URL or S3 bucket.

    Parameters
    ----------
    url : str
        The URL or S3 bucket to load the media from.
    as_base64 : bool, optional
        Whether to return the media as a base64-encoded string, by default False
    common_media_path : Optional[str], optional
        The common path to the media, by default None
        This is used to determine the absolute path in case data is local

    Returns
    -------
    Tuple[str, Optional[int], Optional[int]]
        The media, the height of the image, and the width of the image.
        Height and width are only returned if as_base64 is True.
    """
    if url.startswith("s3://"):
        url = get_presigned_url(url)
    if as_base64:
        if url.startswith("http"):
            response = requests.get(url, timeout=60)
            url = BytesIO(response.content)
        else:
            # assume local file
            url = url.replace("/media", common_media_path)
        image = Image.open(url)
        return f"data:image/png;base64, {image_to_base64(image)}", image.height, image.width
    return url, None, None
