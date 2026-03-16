"""Tests for HuggingFace dataset integration.

Tests cover:
- Parquet URL discovery with config auto-resolution
- Dataset-not-found error with suggestions
- Split/config mismatch errors
- Image column auto-detection
- ClassLabel resolution
- End-to-end metadata ingestion
- Image bytes endpoint (fetch + cache)
- DataLoader src rewriting for HF views
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import clusterfun.storage.backends as backends_module
from clusterfun.config import Config
from clusterfun.huggingface import (
    _detect_image_column,
    _discover_parquet_urls,
    _read_metadata,
    _resolve_labels,
    from_huggingface,
    search_datasets,
)
from clusterfun.main import APP
from clusterfun.routes.huggingface import (
    _detect_content_type,
    _detect_extension,
    get_hf_image_bytes,
)
from clusterfun.storage.backends.local import LocalBackend
from clusterfun.storage.data_loader import DataLoader, _config_cache
from clusterfun.storage.local.storer import LocalStorer
from clusterfun.storage.query import invalidate_cache


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def local_backend(tmp_path, monkeypatch):
    monkeypatch.setenv("CLUSTERFUN_CACHE_DIR", str(tmp_path))
    backend = LocalBackend(cache_dir=tmp_path)
    backends_module._backend = backend
    yield backend
    invalidate_cache()
    backends_module._backend = None
    _config_cache.clear()


@pytest.fixture()
def client():
    return TestClient(APP)


def _make_parquet_response(configs_splits):
    """Build a mock HF /parquet response.

    configs_splits: list of (config, split) tuples
    """
    files = []
    for config, split in configs_splits:
        files.append(
            {
                "dataset": "test/dataset",
                "config": config,
                "split": split,
                "url": f"https://huggingface.co/datasets/test/dataset/resolve/parquet/{config}/{split}/0000.parquet",
                "filename": "0000.parquet",
                "size": 1000,
            }
        )
    return {"parquet_files": files, "pending": [], "failed": []}


# ---------------------------------------------------------------------------
# Unit tests: URL discovery
# ---------------------------------------------------------------------------


class TestDiscoverParquetUrls:
    def test_default_config_found(self):
        """When config='default' exists, use it directly."""
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = _make_parquet_response(
            [("default", "train"), ("default", "test")]
        )
        with patch("clusterfun.huggingface.requests.get", return_value=resp):
            urls, config = _discover_parquet_urls("test/dataset", "train", "default")
        assert len(urls) == 1
        assert config == "default"
        assert "default/train" in urls[0]

    def test_config_auto_resolved(self):
        """When config='default' is missing but only one config exists, auto-resolve."""
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = _make_parquet_response(
            [("cifar100", "train"), ("cifar100", "test")]
        )
        with patch("clusterfun.huggingface.requests.get", return_value=resp):
            urls, config = _discover_parquet_urls("test/dataset", "train", "default")
        assert len(urls) == 1
        assert config == "cifar100"

    def test_explicit_config(self):
        """When user passes an explicit config, use it."""
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = _make_parquet_response(
            [("configA", "train"), ("configB", "train")]
        )
        with patch("clusterfun.huggingface.requests.get", return_value=resp):
            urls, config = _discover_parquet_urls("test/dataset", "train", "configB")
        assert len(urls) == 1
        assert config == "configB"

    def test_404_with_suggestions(self):
        """When dataset not found, error includes search suggestions."""
        resp_404 = MagicMock()
        resp_404.status_code = 404

        search_resp = MagicMock()
        search_resp.status_code = 200
        search_resp.json.return_value = [
            {"id": "org/dataset1"},
            {"id": "org/dataset2"},
        ]

        with patch(
            "clusterfun.huggingface.requests.get",
            side_effect=[resp_404, search_resp],
        ):
            with pytest.raises(ValueError, match="Did you mean"):
                _discover_parquet_urls("bad_name", "train", "default")

    def test_404_without_suggestions(self):
        """When dataset not found and search fails, still gives useful error."""
        resp_404 = MagicMock()
        resp_404.status_code = 404

        search_resp = MagicMock()
        search_resp.status_code = 200
        search_resp.json.return_value = []

        with patch(
            "clusterfun.huggingface.requests.get",
            side_effect=[resp_404, search_resp],
        ):
            with pytest.raises(ValueError, match="not found"):
                _discover_parquet_urls("bad_name", "train", "default")

    def test_wrong_split_error(self):
        """When split doesn't exist for resolved config, show available splits."""
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = _make_parquet_response(
            [("default", "train"), ("default", "validation")]
        )
        with patch("clusterfun.huggingface.requests.get", return_value=resp):
            with pytest.raises(ValueError, match="Split 'test' not found"):
                _discover_parquet_urls("test/dataset", "test", "default")

    def test_multi_config_no_auto_resolve(self):
        """When multiple configs exist and default is missing, don't auto-resolve."""
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = _make_parquet_response(
            [("configA", "train"), ("configB", "train")]
        )
        with patch("clusterfun.huggingface.requests.get", return_value=resp):
            with pytest.raises(ValueError, match="configs"):
                _discover_parquet_urls("test/dataset", "train", "default")


# ---------------------------------------------------------------------------
# Unit tests: search_datasets
# ---------------------------------------------------------------------------


class TestSearchDatasets:
    def test_returns_ids(self):
        resp = MagicMock()
        resp.status_code = 200
        resp.json.return_value = [{"id": "a/b"}, {"id": "c/d"}]
        resp.raise_for_status = MagicMock()
        with patch("clusterfun.huggingface.requests.get", return_value=resp):
            results = search_datasets("test")
        assert results == ["a/b", "c/d"]


# ---------------------------------------------------------------------------
# Unit tests: image column detection
# ---------------------------------------------------------------------------


class TestDetectImageColumn:
    def test_struct_with_bytes(self):
        """Detects struct column with 'bytes' field."""
        con = MagicMock()
        con.execute.return_value.fetchall.return_value = [
            ("label", "BIGINT", None, None, None, None),
            ("img", "STRUCT(bytes BLOB, path VARCHAR)", None, None, None, None),
        ]
        with patch("clusterfun.huggingface.duckdb.connect", return_value=con):
            result = _detect_image_column(["https://example.com/data.parquet"])
        assert result == "img"

    def test_fallback_to_common_names(self):
        """Falls back to 'image' column name when no struct found."""
        con = MagicMock()
        con.execute.return_value.fetchall.return_value = [
            ("image", "VARCHAR", None, None, None, None),
            ("label", "BIGINT", None, None, None, None),
        ]
        with patch("clusterfun.huggingface.duckdb.connect", return_value=con):
            result = _detect_image_column(["https://example.com/data.parquet"])
        assert result == "image"

    def test_raises_when_not_found(self):
        con = MagicMock()
        con.execute.return_value.fetchall.return_value = [
            ("text", "VARCHAR", None, None, None, None),
            ("label", "BIGINT", None, None, None, None),
        ]
        with patch("clusterfun.huggingface.duckdb.connect", return_value=con):
            with pytest.raises(ValueError, match="Could not auto-detect"):
                _detect_image_column(["https://example.com/data.parquet"])


# ---------------------------------------------------------------------------
# Unit tests: label resolution
# ---------------------------------------------------------------------------


class TestResolveLabels:
    def test_classlabel_mapping(self):
        resp = MagicMock()
        resp.status_code = 200
        resp.raise_for_status = MagicMock()
        resp.json.return_value = {
            "dataset_info": {
                "features": {
                    "label": {
                        "_type": "ClassLabel",
                        "names": ["cat", "dog", "bird"],
                    },
                    "image": {"_type": "Image"},
                }
            }
        }
        with patch("clusterfun.huggingface.requests.get", return_value=resp):
            result = _resolve_labels("test/ds", "default")
        assert result == {"label": {0: "cat", 1: "dog", 2: "bird"}}

    def test_no_classlabel(self):
        resp = MagicMock()
        resp.status_code = 200
        resp.raise_for_status = MagicMock()
        resp.json.return_value = {
            "dataset_info": {
                "features": {
                    "image": {"_type": "Image"},
                    "caption": {"_type": "Value", "dtype": "string"},
                }
            }
        }
        with patch("clusterfun.huggingface.requests.get", return_value=resp):
            result = _resolve_labels("test/ds", "default")
        assert result is None

    def test_request_failure_returns_none(self):
        with patch(
            "clusterfun.huggingface.requests.get",
            side_effect=Exception("network error"),
        ):
            result = _resolve_labels("test/ds", "default")
        assert result is None


# ---------------------------------------------------------------------------
# Unit tests: content type detection
# ---------------------------------------------------------------------------


class TestContentTypeDetection:
    def test_png(self):
        assert _detect_content_type(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100) == "image/png"

    def test_jpeg(self):
        assert _detect_content_type(b"\xff\xd8\xff\xe0" + b"\x00" * 100) == "image/jpeg"

    def test_webp(self):
        assert _detect_content_type(b"RIFF\x00\x00\x00\x00WEBP") == "image/webp"

    def test_gif(self):
        assert _detect_content_type(b"GIF89a" + b"\x00" * 100) == "image/gif"

    def test_unknown_defaults_to_jpeg(self):
        assert _detect_content_type(b"\x00\x00\x00\x00") == "image/jpeg"

    def test_extension_mapping(self):
        assert _detect_extension("image/png") == ".png"
        assert _detect_extension("image/jpeg") == ".jpg"
        assert _detect_extension("image/webp") == ".webp"
        assert _detect_extension("unknown") == ".jpg"


# ---------------------------------------------------------------------------
# Unit tests: Config HF fields
# ---------------------------------------------------------------------------


class TestConfigHfFields:
    def test_config_with_hf_fields(self):
        cfg = Config(
            type="grid",
            media="image",
            columns=["id", "image"],
            hf_parquet_urls=["https://example.com/data.parquet"],
            hf_image_column="img",
        )
        assert cfg.hf_parquet_urls == ["https://example.com/data.parquet"]
        assert cfg.hf_image_column == "img"

    def test_config_without_hf_fields(self):
        cfg = Config(type="grid", media="image", columns=["id", "image"])
        assert cfg.hf_parquet_urls is None
        assert cfg.hf_image_column is None


# ---------------------------------------------------------------------------
# Integration tests: DataLoader src rewriting
# ---------------------------------------------------------------------------


class TestDataLoaderHfSrc:
    def _save_hf_view(self, backend, uuid="test-hf-uuid"):
        """Save a mock HF view to the backend."""
        df = pd.DataFrame(
            {
                "image": ["0", "1", "2"],
                "label": ["cat", "dog", "bird"],
            }
        )
        cfg = Config(
            type="grid",
            media="image",
            columns=["id", "image", "label"],
            hf_parquet_urls=["https://example.com/data.parquet"],
            hf_image_column="img",
        )
        storer = LocalStorer(backend=backend)
        storer.save(uuid, df, cfg)
        return uuid

    def test_get_row_returns_hf_bytes_url(self, local_backend):
        uuid = self._save_hf_view(local_backend)
        loader = DataLoader(uuid, local_backend)
        item = loader.get_row(0)
        assert item.src == f"/api/views/{uuid}/hf-bytes/0"

    def test_get_rows_returns_hf_bytes_urls(self, local_backend):
        from clusterfun.models.media_indices import MediaIndices

        uuid = self._save_hf_view(local_backend)
        loader = DataLoader(uuid, local_backend)
        items = loader.get_rows(MediaIndices(media_ids=[0, 1, 2], page=0))
        for i, item in enumerate(items):
            assert item.src == f"/api/views/{uuid}/hf-bytes/{i}"

    def test_non_hf_view_unchanged(self, local_backend):
        """Non-HF views should not get hf-bytes URLs."""
        uuid = "test-normal-uuid"
        df = pd.DataFrame(
            {
                "image": ["/path/to/a.jpg", "/path/to/b.jpg"],
                "label": ["cat", "dog"],
            }
        )
        cfg = Config(
            type="grid",
            media="image",
            columns=["id", "image", "label"],
        )
        storer = LocalStorer(backend=local_backend)
        storer.save(uuid, df, cfg)
        loader = DataLoader(uuid, local_backend)
        item = loader.get_row(0)
        assert "/hf-bytes/" not in item.src


# ---------------------------------------------------------------------------
# Integration tests: HF bytes endpoint
# ---------------------------------------------------------------------------


class TestHfBytesEndpoint:
    def _save_hf_view(self, backend, uuid="test-hf-endpoint"):
        df = pd.DataFrame(
            {
                "image": ["0", "1", "2"],
                "label": ["cat", "dog", "bird"],
            }
        )
        cfg = Config(
            type="grid",
            media="image",
            columns=["id", "image", "label"],
            hf_parquet_urls=["https://example.com/data.parquet"],
            hf_image_column="img",
        )
        storer = LocalStorer(backend=backend)
        storer.save(uuid, df, cfg)
        return uuid

    def test_cache_hit(self, local_backend, client):
        """When image is in cache, serve it without remote fetch."""
        uuid = self._save_hf_view(local_backend)
        # Pre-populate cache
        cache_dir = local_backend.cache_dir / uuid / "hf_image_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        # Write a minimal valid PNG
        png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
        (cache_dir / "0.png").write_bytes(png_bytes)

        resp = client.get(f"/api/views/{uuid}/hf-bytes/0")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/png"
        assert resp.content == png_bytes

    def test_cache_hit_jpeg(self, local_backend, client):
        uuid = self._save_hf_view(local_backend)
        cache_dir = local_backend.cache_dir / uuid / "hf_image_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        jpeg_bytes = b"\xff\xd8\xff\xe0" + b"\x00" * 50
        (cache_dir / "1.jpg").write_bytes(jpeg_bytes)

        resp = client.get(f"/api/views/{uuid}/hf-bytes/1")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/jpeg"

    def test_404_for_non_hf_view(self, local_backend, client):
        """Non-HF views should return 404."""
        uuid = "test-normal-view"
        df = pd.DataFrame({"image": ["/a.jpg"], "label": ["x"]})
        cfg = Config(type="grid", media="image", columns=["id", "image", "label"])
        LocalStorer(backend=local_backend).save(uuid, df, cfg)

        resp = client.get(f"/api/views/{uuid}/hf-bytes/0")
        assert resp.status_code == 404

    def test_remote_fetch_and_cache(self, local_backend, client):
        """When not cached, fetch from remote and cache result."""
        uuid = self._save_hf_view(local_backend)

        fake_png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        mock_con = MagicMock()
        mock_con.execute.return_value.fetchone.return_value = (fake_png,)

        with patch(
            "clusterfun.routes.huggingface.duckdb.connect", return_value=mock_con
        ):
            resp = client.get(f"/api/views/{uuid}/hf-bytes/0")

        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/png"
        assert resp.content == fake_png

        # Verify it was cached
        cache_dir = local_backend.cache_dir / uuid / "hf_image_cache"
        assert (cache_dir / "0.png").exists()
        assert (cache_dir / "0.png").read_bytes() == fake_png

    def test_remote_fetch_uses_correct_offset(self, local_backend, client):
        """Verify the SQL uses OFFSET based on the row index from local parquet."""
        uuid = self._save_hf_view(local_backend)

        # Look up what row index id=1 maps to in the local parquet
        from clusterfun.storage.query import get_connection

        con = get_connection(uuid, local_backend)
        row = con.execute("SELECT image FROM database WHERE id = 1").fetchone()
        expected_offset = int(row[0])

        fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100
        mock_con = MagicMock()
        mock_con.execute.return_value.fetchone.return_value = (fake_jpeg,)

        with patch(
            "clusterfun.routes.huggingface.duckdb.connect", return_value=mock_con
        ):
            resp = client.get(f"/api/views/{uuid}/hf-bytes/1")

        assert resp.status_code == 200
        # Check that the SQL contained the correct OFFSET
        sql_calls = [
            str(call) for call in mock_con.execute.call_args_list
        ]
        sql_text = " ".join(sql_calls)
        assert f"OFFSET {expected_offset}" in sql_text

    def test_immutable_cache_header(self, local_backend, client):
        uuid = self._save_hf_view(local_backend)
        cache_dir = local_backend.cache_dir / uuid / "hf_image_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        (cache_dir / "0.jpg").write_bytes(b"\xff\xd8" + b"\x00" * 10)

        resp = client.get(f"/api/views/{uuid}/hf-bytes/0")
        assert "immutable" in resp.headers.get("cache-control", "")


# ---------------------------------------------------------------------------
# Integration test: from_huggingface end-to-end (mocked network)
# ---------------------------------------------------------------------------


class TestFromHuggingfaceEndToEnd:
    def test_full_pipeline(self, local_backend):
        """Test the full pipeline with mocked HF API and DuckDB.

        We mock duckdb only for the HF metadata reads (_detect_image_column
        and the metadata query in from_huggingface), not for LocalStorer.save
        which uses its own real duckdb connection.
        """
        parquet_resp = MagicMock()
        parquet_resp.status_code = 200
        parquet_resp.json.return_value = _make_parquet_response(
            [("default", "train")]
        )

        info_resp = MagicMock()
        info_resp.status_code = 200
        info_resp.raise_for_status = MagicMock()
        info_resp.json.return_value = {
            "dataset_info": {
                "features": {
                    "label": {
                        "_type": "ClassLabel",
                        "names": ["cat", "dog"],
                    },
                    "image": {"_type": "Image"},
                }
            }
        }

        mock_requests_get = MagicMock(side_effect=[parquet_resp, info_resp])

        # Mock metadata reading (avoids needing to mock DuckDB which leaks into LocalStorer)
        metadata_df = pd.DataFrame(
            {"image": ["0", "1", "2"], "label": [0, 1, 0]}
        )
        other_columns = ["label"]

        with (
            patch("clusterfun.huggingface.requests.get", mock_requests_get),
            patch(
                "clusterfun.huggingface._detect_image_column",
                return_value="image",
            ),
            patch(
                "clusterfun.huggingface._read_metadata",
                return_value=(metadata_df, other_columns),
            ),
        ):
            path = from_huggingface("test/dataset", show=False)

        assert path.exists()
        assert (path / "config.json").exists()
        assert (path / "data.parquet").exists()

        # Verify config
        cfg_data = local_backend.load_json(path.name, "config.json")
        assert cfg_data["type"] == "grid"
        assert cfg_data["hf_image_column"] == "image"
        assert len(cfg_data["hf_parquet_urls"]) == 1
        assert cfg_data["media"] == "image"

        # Verify data has label names resolved
        from clusterfun.storage.query import get_connection

        con = get_connection(path.name, local_backend)
        rows = con.execute("SELECT * FROM database ORDER BY id").fetchall()
        assert len(rows) == 3
        # Labels should be resolved: 0 -> "cat", 1 -> "dog"
        assert rows[0][2] == "cat"
        assert rows[1][2] == "dog"
        assert rows[2][2] == "cat"
