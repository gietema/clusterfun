from dataclasses import dataclass
from io import BytesIO
from unittest.mock import patch

import pytest

from clusterfun.storage.client import get_storage_client
from clusterfun.storage.client.http import HttpStorageClient
from clusterfun.storage.client.local import LocalStorageClient
from clusterfun.storage.client.s3 import S3StorageClient


@dataclass
class MockResponse:
    content: bytes


def test_get_storage_client_local() -> None:
    fake_path = "/media/fake_path"
    client = get_storage_client(fake_path, "/fake/path")
    assert isinstance(client, LocalStorageClient)

    url = client.get_media(fake_path)
    assert url == fake_path

    local_url = client.get_media_to_local(url)
    assert local_url == "/fake/path/fake_path"


def test_local_client_error() -> None:
    fake_path = "/media/fake_path"
    with pytest.raises(ValueError, match="In case of Local storage the common media path should be defined"):
        get_storage_client(fake_path, None)


def test_get_http_storage_client() -> None:
    mock_bytes = b"test"
    fake_path = "http://fake_path"
    with patch("requests.get") as mock_request:
        mock_request.return_value = MockResponse(b"test")
        client = get_storage_client(fake_path, None)
        assert isinstance(client, HttpStorageClient)

        url = client.get_media(fake_path)
        assert url == fake_path

        local_bytes = client.get_media_to_local(url)
        assert isinstance(local_bytes, BytesIO)
        assert local_bytes.read() == mock_bytes

        mock_request.assert_called_once()


def test_get_s3_storage_client() -> None:
    mock_bytes = b"test"
    fake_path = "s3://fake_path"
    fake_url = "http://fake_path"
    with patch("requests.get") as mock_request:
        mock_request.return_value = MockResponse(b"test")
        client = get_storage_client(fake_path, None)
        assert isinstance(client, S3StorageClient)

        local_bytes = client.get_media_to_local(fake_url)
        assert isinstance(local_bytes, BytesIO)
        assert local_bytes.read() == mock_bytes

        mock_request.assert_called_once()
