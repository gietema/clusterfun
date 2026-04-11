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

    # ── Project-level storage ──

    def save_project_json(self, project: str, filename: str, data: Any) -> None:
        """Save a JSON artifact at the project level."""
        raise NotImplementedError

    def load_project_json(self, project: str, filename: str) -> Any:
        """Load a JSON artifact from the project level."""
        raise NotImplementedError

    def project_json_exists(self, project: str, filename: str) -> bool:
        """Check if a project-level JSON artifact exists."""
        raise NotImplementedError

    def list_projects(self) -> List[str]:
        """List available project names."""
        raise NotImplementedError
