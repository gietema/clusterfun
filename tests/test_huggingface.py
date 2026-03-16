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
    _detect_all_image_columns,
    _detect_image_column,
    _detect_vqa_columns,
    _discover_parquet_urls,
    _read_metadata,
    _resolve_labels,
    _synthesize_mmbench_choices,
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

        with patch(
            "clusterfun.routes.huggingface._fetch_hf_bytes", return_value=fake_png
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
        """Verify _fetch_hf_bytes is called with the correct row index."""
        uuid = self._save_hf_view(local_backend)

        # Look up what row index id=1 maps to in the local parquet
        from clusterfun.storage.query import get_connection

        con = get_connection(uuid, local_backend)
        row = con.execute("SELECT image FROM database WHERE id = 1").fetchone()
        expected_offset = int(row[0])

        fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 100

        with patch(
            "clusterfun.routes.huggingface._fetch_hf_bytes", return_value=fake_jpeg
        ) as mock_fetch:
            resp = client.get(f"/api/views/{uuid}/hf-bytes/1")

        assert resp.status_code == 200
        # Verify the row index passed to _fetch_hf_bytes
        mock_fetch.assert_called_once()
        call_args = mock_fetch.call_args
        assert call_args[0][2] == expected_offset  # 3rd positional arg is row_idx

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

        schema = [
            ("image", "STRUCT(bytes BLOB, path VARCHAR)", None, None, None, None),
            ("label", "BIGINT", None, None, None, None),
        ]

        with (
            patch("clusterfun.huggingface.requests.get", mock_requests_get),
            patch("clusterfun.huggingface._get_schema", return_value=schema),
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


# ---------------------------------------------------------------------------
# Unit tests: VQA column detection
# ---------------------------------------------------------------------------


class TestDetectVqaColumns:
    def test_mmmu_schema(self):
        """MMMU has question, answer, options, explanation."""
        cols = ["question", "options", "answer", "explanation", "img_type", "topic_difficulty"]
        result = _detect_vqa_columns(cols)
        assert result == {
            "question": "question",
            "answer": "answer",
            "choices": "options",
            "explanation": "explanation",
        }

    def test_mmbench_schema(self):
        """MMBench has question, answer, A, B, C, D."""
        cols = ["question", "A", "B", "C", "D", "answer", "category", "hint"]
        result = _detect_vqa_columns(cols)
        assert result is not None
        assert result["question"] == "question"
        assert result["answer"] == "answer"
        assert result["choices"] == "_choices"

    def test_chartqa_schema(self):
        """ChartQA uses 'query' and 'label' instead of 'question' and 'answer'."""
        cols = ["query", "label", "human_or_machine"]
        result = _detect_vqa_columns(cols)
        assert result is not None
        assert result["question"] == "query"
        assert result["answer"] == "label"
        assert "choices" not in result

    def test_vqav2_schema(self):
        """VQAv2 has question and multiple_choice_answer."""
        cols = ["question", "multiple_choice_answer", "answers", "question_type"]
        result = _detect_vqa_columns(cols)
        assert result is not None
        assert result["question"] == "question"
        # Should pick 'multiple_choice_answer' before 'answers' since it comes first
        # Actually the order is: answer, answers, multiple_choice_answer, label
        # So 'answers' wins
        assert result["answer"] == "answers"

    def test_docvqa_schema(self):
        """DocVQA has question and answers (list)."""
        cols = ["question", "answers", "questionId", "question_types"]
        result = _detect_vqa_columns(cols)
        assert result is not None
        assert result["question"] == "question"
        assert result["answer"] == "answers"

    def test_scienceqa_with_solution(self):
        """ScienceQA has question, answer, choices, and solution."""
        cols = ["question", "choices", "answer", "hint", "task", "grade", "solution"]
        result = _detect_vqa_columns(cols)
        assert result is not None
        assert result["question"] == "question"
        assert result["answer"] == "answer"
        assert result["choices"] == "choices"
        assert result["explanation"] == "solution"

    def test_classification_no_false_positive(self):
        """Classification datasets (image + label) should NOT be detected as VQA."""
        cols = ["label", "split"]
        result = _detect_vqa_columns(cols)
        assert result is None

    def test_no_question_returns_none(self):
        """Without a question column, returns None."""
        cols = ["answer", "text", "summary"]
        result = _detect_vqa_columns(cols)
        assert result is None


# ---------------------------------------------------------------------------
# Unit tests: multi-image detection
# ---------------------------------------------------------------------------


class TestDetectAllImageColumns:
    def test_single_image(self):
        schema = [
            ("image", "STRUCT(bytes BLOB, path VARCHAR)", None, None, None, None),
            ("label", "BIGINT", None, None, None, None),
        ]
        result = _detect_all_image_columns(schema)
        assert result == ["image"]

    def test_multiple_images_mmmu(self):
        """MMMU-style image_1 through image_7."""
        schema = [
            ("id", "VARCHAR", None, None, None, None),
            ("question", "VARCHAR", None, None, None, None),
            ("image_1", "STRUCT(bytes BLOB, path VARCHAR)", None, None, None, None),
            ("image_2", "STRUCT(bytes BLOB, path VARCHAR)", None, None, None, None),
            ("image_3", "STRUCT(bytes BLOB, path VARCHAR)", None, None, None, None),
            ("answer", "VARCHAR", None, None, None, None),
        ]
        result = _detect_all_image_columns(schema)
        assert result == ["image_1", "image_2", "image_3"]

    def test_no_images(self):
        schema = [
            ("text", "VARCHAR", None, None, None, None),
            ("label", "BIGINT", None, None, None, None),
        ]
        result = _detect_all_image_columns(schema)
        assert result == []

    def test_mixed_structs(self):
        """Only struct columns with 'bytes' are image columns."""
        schema = [
            ("image", "STRUCT(bytes BLOB, path VARCHAR)", None, None, None, None),
            ("metadata", "STRUCT(key VARCHAR, value VARCHAR)", None, None, None, None),
        ]
        result = _detect_all_image_columns(schema)
        assert result == ["image"]


# ---------------------------------------------------------------------------
# Unit tests: MMBench choice synthesis
# ---------------------------------------------------------------------------


class TestSynthesizeMmbenchChoices:
    def test_combines_abcd(self):
        df = pd.DataFrame({
            "question": ["What is this?"],
            "A": ["cat"], "B": ["dog"], "C": ["bird"], "D": ["fish"],
            "answer": ["A"],
        })
        result = _synthesize_mmbench_choices(df)
        assert "_choices" in result.columns
        choices = json.loads(result["_choices"].iloc[0])
        assert choices == ["cat", "dog", "bird", "fish"]

    def test_handles_nan(self):
        df = pd.DataFrame({
            "question": ["What?"],
            "A": ["yes"], "B": ["no"], "C": [None], "D": [None],
            "answer": ["A"],
        })
        result = _synthesize_mmbench_choices(df)
        choices = json.loads(result["_choices"].iloc[0])
        assert choices == ["yes", "no"]

    def test_noop_without_abcd(self):
        df = pd.DataFrame({"question": ["What?"], "answer": ["yes"]})
        result = _synthesize_mmbench_choices(df)
        assert "_choices" not in result.columns


# ---------------------------------------------------------------------------
# Unit tests: Config VQA fields
# ---------------------------------------------------------------------------


class TestConfigVqaFields:
    def test_config_with_vqa(self):
        cfg = Config(
            type="grid",
            media="image",
            columns=["id", "image", "question", "answer"],
            vqa={"question": "question", "answer": "answer"},
            hf_extra_image_columns=["image_2", "image_3"],
        )
        assert cfg.vqa == {"question": "question", "answer": "answer"}
        assert cfg.hf_extra_image_columns == ["image_2", "image_3"]

    def test_config_without_vqa(self):
        cfg = Config(type="grid", media="image", columns=["id", "image"])
        assert cfg.vqa is None
        assert cfg.hf_extra_image_columns is None


# ---------------------------------------------------------------------------
# Integration: HF bytes with extra image column
# ---------------------------------------------------------------------------


class TestHfBytesExtraCol:
    def _save_hf_view_with_extras(self, backend, uuid="test-hf-extra"):
        df = pd.DataFrame({
            "image": ["0", "1"],
            "question": ["What?", "Who?"],
        })
        cfg = Config(
            type="grid",
            media="image",
            columns=["id", "image", "question"],
            hf_parquet_urls=["https://example.com/data.parquet"],
            hf_image_column="image_1",
            hf_extra_image_columns=["image_2", "image_3"],
        )
        LocalStorer(backend=backend).save(uuid, df, cfg)
        return uuid

    def test_extra_col_cache_hit(self, local_backend, client):
        uuid = self._save_hf_view_with_extras(local_backend)
        cache_dir = local_backend.cache_dir / uuid / "hf_image_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 50
        (cache_dir / "0_image_2.png").write_bytes(png_bytes)

        resp = client.get(f"/api/views/{uuid}/hf-bytes/0?col=image_2")
        assert resp.status_code == 200
        assert resp.content == png_bytes

    def test_invalid_col_rejected(self, local_backend, client):
        uuid = self._save_hf_view_with_extras(local_backend)
        resp = client.get(f"/api/views/{uuid}/hf-bytes/0?col=malicious_col")
        assert resp.status_code == 404

    def test_extra_col_remote_fetch(self, local_backend, client):
        uuid = self._save_hf_view_with_extras(local_backend)
        fake_png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100

        with patch(
            "clusterfun.routes.huggingface._fetch_hf_bytes", return_value=fake_png
        ):
            resp = client.get(f"/api/views/{uuid}/hf-bytes/0?col=image_2")

        assert resp.status_code == 200
        # Verify cache uses col-namespaced key
        cache_dir = local_backend.cache_dir / uuid / "hf_image_cache"
        assert (cache_dir / "0_image_2.png").exists()


# ---------------------------------------------------------------------------
# Integration: from_huggingface with VQA detection
# ---------------------------------------------------------------------------


class TestHfThumbnailAutoFetch:
    """Thumbnails should auto-fetch from HF when not cached."""

    def _save_hf_view(self, backend, uuid="test-hf-thumb"):
        df = pd.DataFrame({
            "image": ["0", "1"],
            "label": ["cat", "dog"],
        })
        cfg = Config(
            type="grid",
            media="image",
            columns=["id", "image", "label"],
            hf_parquet_urls=["https://example.com/data.parquet"],
            hf_image_column="img",
        )
        LocalStorer(backend=backend).save(uuid, df, cfg)
        return uuid

    def test_thumbnail_fetches_uncached_image(self, local_backend, client):
        """When thumbnail is requested but image not cached, it should fetch from HF."""
        from io import BytesIO
        from PIL import Image as PILImage

        uuid = self._save_hf_view(local_backend)

        # Create a valid PNG in memory
        img = PILImage.new("RGB", (10, 10), color="blue")
        buf = BytesIO()
        img.save(buf, format="PNG")
        valid_png = buf.getvalue()

        with patch(
            "clusterfun.routes.huggingface._fetch_hf_bytes", return_value=valid_png
        ):
            resp = client.get(f"/api/views/{uuid}/media/0/thumbnail?size=64")

        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/jpeg"

        # Image should now be cached
        cache_dir = local_backend.cache_dir / uuid / "hf_image_cache"
        assert (cache_dir / "0.png").exists()

    def test_thumbnail_uses_existing_cache(self, local_backend, client):
        """When image is already cached, thumbnail should not trigger a fetch."""
        from io import BytesIO
        from PIL import Image as PILImage

        uuid = self._save_hf_view(local_backend)

        cache_dir = local_backend.cache_dir / uuid / "hf_image_cache"
        cache_dir.mkdir(parents=True, exist_ok=True)
        img = PILImage.new("RGB", (10, 10), color="red")
        buf = BytesIO()
        img.save(buf, format="PNG")
        (cache_dir / "0.png").write_bytes(buf.getvalue())

        # Should work without any DuckDB mock (no remote fetch needed)
        resp = client.get(f"/api/views/{uuid}/media/0/thumbnail?size=64")
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "image/jpeg"


class TestFromHuggingfaceVqa:
    def test_vqa_pipeline(self, local_backend):
        """VQA columns are detected and config.vqa + config.display are set."""
        parquet_resp = MagicMock()
        parquet_resp.status_code = 200
        parquet_resp.json.return_value = _make_parquet_response(
            [("default", "train")]
        )

        info_resp = MagicMock()
        info_resp.status_code = 200
        info_resp.raise_for_status = MagicMock()
        info_resp.json.return_value = {
            "dataset_info": {"features": {"image": {"_type": "Image"}}}
        }

        mock_requests_get = MagicMock(side_effect=[parquet_resp, info_resp])

        schema = [
            ("image", "STRUCT(bytes BLOB, path VARCHAR)", None, None, None, None),
            ("question", "VARCHAR", None, None, None, None),
            ("answer", "VARCHAR", None, None, None, None),
            ("options", "VARCHAR", None, None, None, None),
        ]

        metadata_df = pd.DataFrame({
            "image": ["0", "1"],
            "question": ["What color?", "How many?"],
            "answer": ["A", "B"],
            "options": ['["red","blue"]', '["3","4"]'],
        })

        with (
            patch("clusterfun.huggingface.requests.get", mock_requests_get),
            patch("clusterfun.huggingface._get_schema", return_value=schema),
            patch(
                "clusterfun.huggingface._read_metadata",
                return_value=(metadata_df, ["question", "answer", "options"]),
            ),
        ):
            path = from_huggingface("test/vqa-dataset", show=False)

        cfg_data = local_backend.load_json(path.name, "config.json")
        assert cfg_data["vqa"] == {
            "question": "question",
            "answer": "answer",
            "choices": "options",
        }
        assert cfg_data["display"] == ["question"]

    def test_non_vqa_dataset_no_vqa_config(self, local_backend):
        """Classification datasets should not get vqa config."""
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
                    "label": {"_type": "ClassLabel", "names": ["cat", "dog"]},
                    "image": {"_type": "Image"},
                }
            }
        }

        mock_requests_get = MagicMock(side_effect=[parquet_resp, info_resp])
        schema = [
            ("image", "STRUCT(bytes BLOB, path VARCHAR)", None, None, None, None),
            ("label", "BIGINT", None, None, None, None),
        ]
        metadata_df = pd.DataFrame({"image": ["0", "1"], "label": [0, 1]})

        with (
            patch("clusterfun.huggingface.requests.get", mock_requests_get),
            patch("clusterfun.huggingface._get_schema", return_value=schema),
            patch(
                "clusterfun.huggingface._read_metadata",
                return_value=(metadata_df, ["label"]),
            ),
        ):
            path = from_huggingface("test/classification", show=False)

        cfg_data = local_backend.load_json(path.name, "config.json")
        assert cfg_data.get("vqa") is None
        assert cfg_data.get("display") is None
