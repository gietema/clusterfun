"""Utilities for working with local path."""

from io import BytesIO
from typing import Optional, Union

from clusterfun.storage.client.base import BaseStorageClient


class LocalStorageClient(BaseStorageClient):
    """Utilities for working with local path."""

    def __init__(self, common_media_path: Optional[str]) -> None:
        super().__init__(common_media_path)
        if self.common_media_path is None:
            raise ValueError("In case of Local storage the common media path should be defined")

    def get_media(self, uri: str) -> str:
        """Get media URL from URI.

        Args:
            uri (str): media uri

        Returns:
            str: media URL
        """
        return uri

    def get_media_to_local(self, url: str) -> Union[BytesIO, str]:
        """Get media local storage path.

        Args:
            uri (str): media uri

        Returns:
            Union[BytesIO, str]: media local path
        """
        assert self.common_media_path is not None  # MyPy
        return url.replace("/media", self.common_media_path)
