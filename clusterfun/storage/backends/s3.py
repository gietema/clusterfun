"""S3 storage backend."""

import os
from typing import Any, List, Optional
from urllib.parse import urlparse

import orjson
import pyarrow as pa
import pyarrow.parquet as pq

from clusterfun.storage.backends.base import StorageBackend


class S3Backend(StorageBackend):
    """Stores data on Amazon S3."""

    def __init__(self, bucket: str, prefix: str = "", endpoint_url: Optional[str] = None):
        import boto3
        from botocore.client import Config as BotoConfig

        self.bucket = bucket
        self.prefix = prefix.strip("/")
        self.endpoint_url = endpoint_url

        client_kwargs = {
            "region_name": os.environ.get("AWS_REGION", "us-east-1"),
            "config": BotoConfig(
                region_name=os.environ.get("AWS_REGION", "us-east-1"),
                signature_version="s3v4",
            ),
        }
        if endpoint_url:
            client_kwargs["endpoint_url"] = endpoint_url
            client_kwargs["aws_access_key_id"] = os.environ.get("AWS_ACCESS_KEY_ID", "test")
            client_kwargs["aws_secret_access_key"] = os.environ.get("AWS_SECRET_ACCESS_KEY", "test")
        self.s3 = boto3.client("s3", **client_kwargs)

    @classmethod
    def from_url(cls, url: str) -> "S3Backend":
        """Create from s3://bucket/prefix URL."""
        path = url.replace("s3://", "")
        parts = path.split("/", 1)
        bucket = parts[0]
        prefix = parts[1].rstrip("/") if len(parts) > 1 else ""
        return cls(bucket, prefix)

    def _key(self, uuid: str, filename: str) -> str:
        if self.prefix:
            return f"{self.prefix}/{uuid}/{filename}"
        return f"{uuid}/{filename}"

    def get_parquet_uri(self, uuid: str) -> str:
        return f"s3://{self.bucket}/{self._key(uuid, 'data.parquet')}"

    def configure_duckdb(self, con: Any) -> None:
        con.execute("INSTALL httpfs; LOAD httpfs;")
        if self.endpoint_url:
            parsed = urlparse(self.endpoint_url)
            con.execute(f"SET s3_endpoint='{parsed.hostname}:{parsed.port}'")
            con.execute("SET s3_use_ssl=false")
            con.execute("SET s3_url_style='path'")
            con.execute(f"SET s3_access_key_id='{os.environ.get('AWS_ACCESS_KEY_ID', 'test')}'")
            con.execute(f"SET s3_secret_access_key='{os.environ.get('AWS_SECRET_ACCESS_KEY', 'test')}'")
            con.execute(f"SET s3_region='{os.environ.get('AWS_REGION', 'us-east-1')}'")
        else:
            con.execute("CREATE SECRET IF NOT EXISTS (TYPE s3, PROVIDER credential_chain)")

    def save_parquet(self, uuid: str, table: Any) -> None:
        if self.endpoint_url:
            # PyArrow S3FileSystem with custom endpoint
            parsed = urlparse(self.endpoint_url)
            s3fs = pa.fs.S3FileSystem(
                endpoint_override=f"{parsed.hostname}:{parsed.port}",
                scheme="http",
                access_key=os.environ.get("AWS_ACCESS_KEY_ID", "test"),
                secret_key=os.environ.get("AWS_SECRET_ACCESS_KEY", "test"),
                region=os.environ.get("AWS_REGION", "us-east-1"),
            )
        else:
            s3fs = pa.fs.S3FileSystem()
        path = f"{self.bucket}/{self._key(uuid, 'data.parquet')}"
        pq.write_table(table, path, filesystem=s3fs, row_group_size=10_000, compression="snappy")

    def save_json(self, uuid: str, filename: str, data: Any) -> None:
        self.s3.put_object(
            Bucket=self.bucket,
            Key=self._key(uuid, filename),
            Body=orjson.dumps(data, option=orjson.OPT_NAIVE_UTC | orjson.OPT_SERIALIZE_NUMPY),
        )

    def load_json(self, uuid: str, filename: str) -> Any:
        resp = self.s3.get_object(Bucket=self.bucket, Key=self._key(uuid, filename))
        return orjson.loads(resp["Body"].read())

    def json_exists(self, uuid: str, filename: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self.s3.head_object(Bucket=self.bucket, Key=self._key(uuid, filename))
            return True
        except ClientError:
            return False

    def exists(self, uuid: str) -> bool:
        from botocore.exceptions import ClientError

        try:
            self.s3.head_object(Bucket=self.bucket, Key=self._key(uuid, "config.json"))
            return True
        except ClientError:
            return False

    def list_uuids(self) -> List[str]:
        prefix = f"{self.prefix}/" if self.prefix else ""
        resp = self.s3.list_objects_v2(Bucket=self.bucket, Prefix=prefix, Delimiter="/")
        return [p["Prefix"].rstrip("/").split("/")[-1] for p in resp.get("CommonPrefixes", [])]

    def save_parquet_named(self, uuid: str, filename: str, table: Any) -> None:
        if self.endpoint_url:
            parsed = urlparse(self.endpoint_url)
            s3fs = pa.fs.S3FileSystem(
                endpoint_override=f"{parsed.hostname}:{parsed.port}",
                scheme="http",
                access_key=os.environ.get("AWS_ACCESS_KEY_ID", "test"),
                secret_key=os.environ.get("AWS_SECRET_ACCESS_KEY", "test"),
                region=os.environ.get("AWS_REGION", "us-east-1"),
            )
        else:
            s3fs = pa.fs.S3FileSystem()
        path = f"{self.bucket}/{self._key(uuid, filename)}"
        pq.write_table(table, path, filesystem=s3fs, row_group_size=10_000, compression="snappy")

    def get_parquet_uri_named(self, uuid: str, filename: str) -> str:
        return f"s3://{self.bucket}/{self._key(uuid, filename)}"
