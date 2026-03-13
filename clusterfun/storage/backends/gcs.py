"""Google Cloud Storage backend."""

import os
from typing import Any, List, Optional

import orjson
import pyarrow as pa
import pyarrow.parquet as pq

from clusterfun.storage.backends.base import StorageBackend


class GCSBackend(StorageBackend):
    """Stores data on Google Cloud Storage."""

    def __init__(
        self, bucket: str, prefix: str = "", endpoint_url: Optional[str] = None
    ):
        from google.cloud import storage

        self.bucket_name = bucket
        self.prefix = prefix.strip("/")
        self.endpoint_url = endpoint_url

        client_kwargs = {}
        if endpoint_url:
            # fake-gcs-server: set STORAGE_EMULATOR_HOST so the client skips auth
            os.environ["STORAGE_EMULATOR_HOST"] = endpoint_url
            client_kwargs["project"] = "test-project"
        self.client = storage.Client(**client_kwargs)
        self.bucket_obj = self.client.bucket(bucket)

    @classmethod
    def from_url(cls, url: str) -> "GCSBackend":
        """Create from gs://bucket/prefix URL."""
        path = url.replace("gs://", "")
        parts = path.split("/", 1)
        bucket = parts[0]
        prefix = parts[1].rstrip("/") if len(parts) > 1 else ""
        return cls(bucket, prefix)

    def _key(self, uuid: str, filename: str) -> str:
        if self.prefix:
            return f"{self.prefix}/{uuid}/{filename}"
        return f"{uuid}/{filename}"

    def get_parquet_uri(self, uuid: str) -> str:
        return f"gs://{self.bucket_name}/{self._key(uuid, 'data.parquet')}"

    def configure_duckdb(self, con: Any) -> None:
        con.execute("INSTALL httpfs; LOAD httpfs;")
        con.execute("CREATE SECRET IF NOT EXISTS (TYPE gcs, PROVIDER credential_chain)")

    def save_parquet(self, uuid: str, table: Any) -> None:
        gcsfs = pa.fs.GcsFileSystem()
        path = f"{self.bucket_name}/{self._key(uuid, 'data.parquet')}"
        pq.write_table(
            table, path, filesystem=gcsfs, row_group_size=10_000, compression="snappy"
        )

    def save_json(self, uuid: str, filename: str, data: Any) -> None:
        blob = self.bucket_obj.blob(self._key(uuid, filename))
        blob.upload_from_string(
            orjson.dumps(data, option=orjson.OPT_NAIVE_UTC | orjson.OPT_SERIALIZE_NUMPY)
        )

    def load_json(self, uuid: str, filename: str) -> Any:
        blob = self.bucket_obj.blob(self._key(uuid, filename))
        return orjson.loads(blob.download_as_bytes())

    def json_exists(self, uuid: str, filename: str) -> bool:
        return self.bucket_obj.blob(self._key(uuid, filename)).exists()

    def exists(self, uuid: str) -> bool:
        return self.bucket_obj.blob(self._key(uuid, "config.json")).exists()

    def list_uuids(self) -> List[str]:
        prefix = f"{self.prefix}/" if self.prefix else ""
        blobs = self.client.list_blobs(self.bucket_name, prefix=prefix, delimiter="/")
        # Must iterate blobs to populate prefixes
        list(blobs)
        return [p.rstrip("/").split("/")[-1] for p in blobs.prefixes]

    def save_parquet_named(self, uuid: str, filename: str, table: Any) -> None:
        gcsfs = pa.fs.GcsFileSystem()
        path = f"{self.bucket_name}/{self._key(uuid, filename)}"
        pq.write_table(
            table, path, filesystem=gcsfs, row_group_size=10_000, compression="snappy"
        )

    def get_parquet_uri_named(self, uuid: str, filename: str) -> str:
        return f"gs://{self.bucket_name}/{self._key(uuid, filename)}"
