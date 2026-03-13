"""Backend registry for clusterfun storage."""

import os
from typing import Optional, Union

from clusterfun.storage.backends.base import StorageBackend

_backend: Optional[StorageBackend] = None


def get_backend() -> StorageBackend:
    """Get the current storage backend, creating one if needed."""
    global _backend
    if _backend is None:
        _backend = create_backend(os.environ.get("CLUSTERFUN_BACKEND", "local"))
    return _backend


def set_backend(backend: Union[str, StorageBackend]) -> None:
    """Set the storage backend."""
    global _backend
    _backend = backend if isinstance(backend, StorageBackend) else create_backend(backend)


def create_backend(url: str) -> StorageBackend:
    """Create a backend from a URL string."""
    if url == "local":
        from clusterfun.storage.backends.local import LocalBackend

        return LocalBackend()
    if url.startswith("s3://"):
        from clusterfun.storage.backends.s3 import S3Backend

        return S3Backend.from_url(url)
    if url.startswith("gs://"):
        from clusterfun.storage.backends.gcs import GCSBackend

        return GCSBackend.from_url(url)
    raise ValueError(f"Unknown backend: {url}")
