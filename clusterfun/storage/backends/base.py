"""Abstract base class for storage backends."""

from abc import ABC, abstractmethod
from typing import Any, List


class StorageBackend(ABC):
    """Abstract storage backend for clusterfun data."""

    @abstractmethod
    def get_parquet_uri(self, uuid: str) -> str:
        """Return URI that DuckDB can query directly.
        Local: '/path/to/data.parquet'
        S3:    's3://bucket/prefix/{uuid}/data.parquet'
        GCS:   'gs://bucket/prefix/{uuid}/data.parquet'
        """

    @abstractmethod
    def configure_duckdb(self, con: Any) -> None:
        """Configure DuckDB connection for this backend (e.g. S3/GCS credentials)."""

    @abstractmethod
    def save_parquet(self, uuid: str, table: Any) -> None:
        """Write a PyArrow Table as Parquet to this backend."""

    @abstractmethod
    def save_json(self, uuid: str, filename: str, data: Any) -> None:
        """Save a JSON artifact."""

    @abstractmethod
    def load_json(self, uuid: str, filename: str) -> Any:
        """Load a JSON artifact."""

    @abstractmethod
    def json_exists(self, uuid: str, filename: str) -> bool:
        """Check if a JSON artifact exists."""

    @abstractmethod
    def exists(self, uuid: str) -> bool:
        """Check if a plot exists."""

    @abstractmethod
    def list_uuids(self) -> List[str]:
        """List available plot UUIDs."""

    def save_parquet_named(self, uuid: str, filename: str, table: Any) -> None:
        """Write a PyArrow Table as Parquet with a custom filename."""
        raise NotImplementedError

    def get_parquet_uri_named(self, uuid: str, filename: str) -> str:
        """Return URI for a named Parquet file."""
        raise NotImplementedError
