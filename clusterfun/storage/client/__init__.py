"""Storage client module."""
from typing import Optional, TypeVar, cast

from clusterfun.storage.client.base import BaseStorageClient
from clusterfun.storage.client.http import HttpStorageClient
from clusterfun.storage.client.local import LocalStorageClient
from clusterfun.storage.client.s3 import S3StorageClient

T = TypeVar("T", bound=BaseStorageClient)

CLIENT_REGISTRY = {
    "s3": S3StorageClient,
    "http": HttpStorageClient,
    "https": HttpStorageClient,
    "local": LocalStorageClient,
}


def get_storage_client(uri: str, common_media_path: Optional[str]) -> BaseStorageClient:
    """Get storage client from start of URI, default to LocalStorageClient.

    Args:
        uri (str): input uri.
        common_media_path (str): local prefix for media.

    Returns:
        storage client

    """
    start_uri = uri.split(":")[0]
    storage_client = CLIENT_REGISTRY.get(start_uri, LocalStorageClient)(common_media_path)
    return cast(BaseStorageClient, storage_client)
