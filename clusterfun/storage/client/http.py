"""Utilities for working with http path."""

from io import BytesIO
from typing import Union

import requests

from clusterfun.storage.client.base import BaseStorageClient


class HttpStorageClient(BaseStorageClient):
    """Http storage client."""

    def get_media(self, uri: str) -> str:
        """Get media from storage.

        For example, for AWS S3, this could be a signed URL based on the URI.
        """
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
