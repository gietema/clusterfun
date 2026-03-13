"""Local filesystem storage backend."""

import os
from pathlib import Path
from typing import Any, List, Optional

import orjson
import pyarrow.parquet as pq

from clusterfun.storage.backends.base import StorageBackend


class LocalBackend(StorageBackend):
    """Stores data on the local filesystem."""

    def __init__(self, cache_dir: Optional[Path] = None):
        if cache_dir is None:
            cache_dir = Path(
                os.environ.get(
                    "CLUSTERFUN_CACHE_DIR", os.path.expanduser("~/.cache/clusterfun")
                )
            )
        self.cache_dir = cache_dir

    def get_parquet_uri(self, uuid: str) -> str:
        return str(self.cache_dir / uuid / "data.parquet")

    def configure_duckdb(self, con: Any) -> None:
        pass  # no special config needed for local

    def save_parquet(self, uuid: str, table: Any) -> None:
        path = self.cache_dir / uuid / "data.parquet"
        path.parent.mkdir(parents=True, exist_ok=True)
        pq.write_table(table, path, row_group_size=10_000, compression="snappy")

    def save_json(self, uuid: str, filename: str, data: Any) -> None:
        path = self.cache_dir / uuid / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "wb") as f:
            f.write(
                orjson.dumps(
                    data, option=orjson.OPT_NAIVE_UTC | orjson.OPT_SERIALIZE_NUMPY
                )
            )

    def load_json(self, uuid: str, filename: str) -> Any:
        with open(self.cache_dir / uuid / filename, "rb") as f:
            return orjson.loads(f.read())

    def json_exists(self, uuid: str, filename: str) -> bool:
        return (self.cache_dir / uuid / filename).exists()

    def exists(self, uuid: str) -> bool:
        return (self.cache_dir / uuid).exists()

    def list_uuids(self) -> List[str]:
        if not self.cache_dir.exists():
            return []
        return [d.name for d in self.cache_dir.iterdir() if d.is_dir()]

    def save_parquet_named(self, uuid: str, filename: str, table: Any) -> None:
        path = self.cache_dir / uuid / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        pq.write_table(table, path, row_group_size=10_000, compression="snappy")

    def get_parquet_uri_named(self, uuid: str, filename: str) -> str:
        return str(self.cache_dir / uuid / filename)
