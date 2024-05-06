"""Utilities for working with http path."""

from io import BytesIO
from typing import Optional, Union

import requests

from clusterfun.storage.client.base import BaseStorageClient


class HttpStorageClient(BaseStorageClient):
    def __init__(self, common_media_path: Optional[str]) -> None:
        super().__init__(common_media_path)

    def get_media(self, uri: str) -> str:
        return uri

    def get_media_to_local(self, url: str) -> Union[BytesIO, str]:
        """Get media to local storage, in this case download media bytes locally.

        Args:
            uri (str): media uri

        Returns:
            Union[BytesIO, str]: media bytes
        """
        response = requests.get(url, timeout=60)
        return BytesIO(response.content)
