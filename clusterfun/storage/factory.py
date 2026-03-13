"""Factory for creating data loaders."""

from clusterfun.storage.backends import get_backend
from clusterfun.storage.backends.local import LocalBackend
from clusterfun.storage.data_loader import DataLoader
from clusterfun.storage.local.helpers import get_recent_dir


def get_loader(uuid: str) -> DataLoader:
    """Create a DataLoader for the given UUID."""
    backend = get_backend()
    if uuid == "recent":
        if isinstance(backend, LocalBackend):
            uuid = get_recent_dir(backend.cache_dir).stem
        else:
            raise ValueError("'recent' UUID is only supported with local backend")
    return DataLoader(uuid, backend)
