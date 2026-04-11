import os
import socket

import pytest

import clusterfun.storage.backends as backends_module
from clusterfun.storage import label_db


@pytest.fixture()
def cache_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("CLUSTERFUN_CACHE_DIR", str(tmp_path))
    # Reset the global backend so each test gets a fresh LocalBackend with the tmp_path
    backends_module._backend = None
    # Reset label DB so each test gets a fresh SQLite database
    label_db.reset()
    return tmp_path


def _port_open(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _make_local_backend(tmp_path):
    from clusterfun.storage.backends.local import LocalBackend

    return LocalBackend(cache_dir=tmp_path)


def _make_s3_backend(tmp_path):
    """Create an S3Backend pointed at LocalStack. Creates a fresh bucket per test."""
    import boto3
    from botocore.client import Config as BotoConfig

    endpoint = "http://localhost:4566"
    bucket = f"test-{os.urandom(4).hex()}"

    s3 = boto3.client(
        "s3",
        endpoint_url=endpoint,
        aws_access_key_id="test",
        aws_secret_access_key="test",
        region_name="us-east-1",
        config=BotoConfig(signature_version="s3v4"),
    )
    s3.create_bucket(Bucket=bucket)

    from clusterfun.storage.backends.s3 import S3Backend

    return S3Backend(bucket=bucket, prefix="test-prefix", endpoint_url=endpoint)


def _make_gcs_backend(tmp_path):
    """Create a GCSBackend pointed at fake-gcs-server. Creates a fresh bucket per test."""
    import requests

    endpoint = "http://localhost:4443"
    bucket = f"test-{os.urandom(4).hex()}"

    # fake-gcs-server requires bucket creation via its HTTP API
    requests.post(f"{endpoint}/storage/v1/b", json={"name": bucket})

    from clusterfun.storage.backends.gcs import GCSBackend

    return GCSBackend(bucket=bucket, prefix="test-prefix", endpoint_url=endpoint)


_BACKEND_FACTORIES = {
    "local": _make_local_backend,
    "s3": _make_s3_backend,
    "gcs": _make_gcs_backend,
}

_SERVICE_CHECKS = {
    "local": lambda: True,
    "s3": lambda: _port_open("localhost", 4566),
    "gcs": lambda: _port_open("localhost", 4443),
}


@pytest.fixture(params=["local", "s3", "gcs"])
def backend(request, tmp_path, monkeypatch):
    """Parametrized fixture that yields a StorageBackend for each backend type.

    S3/GCS tests are skipped when the corresponding Docker service isn't running.
    """
    name = request.param
    if not _SERVICE_CHECKS[name]():
        pytest.skip(
            f"{name} service not available (start with: docker compose -f docker-compose.test.yml up -d)"
        )

    if name == "s3":
        monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
        monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
        monkeypatch.setenv("AWS_REGION", "us-east-1")

    from clusterfun.storage.query import invalidate_cache

    label_db.reset()
    backend = _BACKEND_FACTORIES[name](tmp_path)
    backends_module._backend = backend
    yield backend
    invalidate_cache()
    label_db.reset()
    backends_module._backend = None
