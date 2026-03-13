"""Parametrized backend interface tests.

These tests run the same logic against Local, S3 (LocalStack), and GCS (fake-gcs-server).
S3/GCS tests skip gracefully when Docker services aren't running.
"""

import socket
import threading

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pytest

import clusterfun.storage.backends as backends_module
from clusterfun.config import Config
from clusterfun.storage.backends import create_backend, get_backend, set_backend
from clusterfun.storage.backends.local import LocalBackend
from clusterfun.storage.data_loader import DataLoader, _config_cache
from clusterfun.storage.local.storer import LocalStorer
from clusterfun.storage.query import _local, get_connection, invalidate_cache, run_query


# ---------------------------------------------------------------------------
# Layer 1: Backend interface tests (save/load/exists)
# ---------------------------------------------------------------------------


class TestBackendInterface:
    """Test every StorageBackend method — runs against all backends."""

    def test_json_roundtrip(self, backend):
        data = {"key": "value", "numbers": [1, 2, 3]}
        backend.save_json("test-uuid", "test.json", data)
        loaded = backend.load_json("test-uuid", "test.json")
        assert loaded == data

    def test_json_exists(self, backend):
        assert not backend.json_exists("test-uuid", "nope.json")
        backend.save_json("test-uuid", "nope.json", {"x": 1})
        assert backend.json_exists("test-uuid", "nope.json")

    def test_parquet_roundtrip(self, backend):
        table = pa.table({"id": [0, 1, 2], "value": [10.0, 20.0, 30.0]})
        backend.save_parquet("test-uuid", table)

        uri = backend.get_parquet_uri("test-uuid")
        assert "test-uuid" in uri
        assert uri.endswith("data.parquet")

    def test_exists(self, backend):
        assert not backend.exists("nonexistent")
        backend.save_json("existing-uuid", "config.json", {"type": "scatter"})
        assert backend.exists("existing-uuid")

    def test_list_uuids(self, backend):
        assert backend.list_uuids() == []
        backend.save_json("uuid-a", "config.json", {})
        backend.save_json("uuid-b", "config.json", {})
        uuids = sorted(backend.list_uuids())
        assert uuids == ["uuid-a", "uuid-b"]


# ---------------------------------------------------------------------------
# Layer 2: DuckDB round-trip smoke test (save → DuckDB view → query)
# ---------------------------------------------------------------------------


class TestDuckDBRoundTrip:
    """Save Parquet via backend, then query it through DuckDB to verify
    URI generation and DuckDB configuration are correct end-to-end."""

    def test_query_parquet_via_duckdb(self, backend):
        table = pa.table({
            "id": [0, 1, 2, 3, 4],
            "name": ["alice", "bob", "carol", "dave", "eve"],
            "score": [90.0, 85.0, 92.0, 78.0, 95.0],
        })
        backend.save_parquet("duckdb-test", table)

        try:
            con = get_connection("duckdb-test", backend)

            # Full scan
            rows = con.execute("SELECT * FROM database ORDER BY id").fetchall()
            assert len(rows) == 5
            assert rows[0] == (0, "alice", 90.0)

            # Predicate pushdown
            rows = con.execute("SELECT name FROM database WHERE score > 90").fetchall()
            names = sorted(r[0] for r in rows)
            assert names == ["carol", "eve"]

            # Aggregation
            result = con.execute("SELECT COUNT(*), AVG(score) FROM database").fetchone()
            assert result[0] == 5
            assert abs(result[1] - 88.0) < 0.01
        finally:
            invalidate_cache("duckdb-test")

    def test_run_query_with_params(self, backend):
        table = pa.table({"id": [0, 1, 2], "val": [10, 20, 30]})
        backend.save_parquet("param-test", table)

        try:
            rows = run_query("param-test", backend, "SELECT val FROM database WHERE id = ?", params=[1], fetch_one=True)
            assert rows == [20]
        finally:
            invalidate_cache("param-test")


# ---------------------------------------------------------------------------
# Layer 3: Full storer → loader integration (local only, DuckDB is backend-agnostic)
# ---------------------------------------------------------------------------


class TestStorerLoaderIntegration:
    """Full save → load → query flow using the LocalStorer and DataLoader."""

    def test_full_round_trip(self, backend):
        df = pd.DataFrame({
            "img_path": ["a.jpg", "b.jpg", "c.jpg"],
            "x_val": [1.0, 2.0, 3.0],
            "y_val": [10.0, 20.0, 30.0],
        })
        cfg = Config(
            type="scatter",
            media="img_path",
            columns=["id", "img_path", "x_val", "y_val"],
            x="x_val",
            y="y_val",
        )

        storer = LocalStorer(backend=backend)
        storer.save("integration-uuid", df, cfg)

        # Verify artifacts exist
        assert backend.exists("integration-uuid")
        assert backend.json_exists("integration-uuid", "config.json")
        assert backend.json_exists("integration-uuid", "data.json")

        # Load via DataLoader
        loader = DataLoader("integration-uuid", backend)
        uuid, data, loaded_cfg = loader.load()
        assert uuid == "integration-uuid"
        assert loaded_cfg.type == "scatter"
        assert loaded_cfg.x == "x_val"
        assert loaded_cfg.y == "y_val"
        assert isinstance(data, (dict, list))

    def test_query_after_save(self, backend):
        df = pd.DataFrame({
            "img_path": ["a.jpg", "b.jpg", "c.jpg", "d.jpg"],
            "category": ["cat", "dog", "cat", "dog"],
            "score": [0.9, 0.8, 0.7, 0.6],
        })
        cfg = Config(
            type="scatter",
            media="img_path",
            columns=["id", "img_path", "category", "score"],
            x="score",
            y="score",
        )

        storer = LocalStorer(backend=backend)
        storer.save("query-uuid", df, cfg)

        try:
            rows = run_query(
                "query-uuid", backend,
                "SELECT * FROM database WHERE score > ? ORDER BY id",
                params=[0.75],
            )
            assert len(rows) == 2
            # id 0 has score 0.9, id 1 has score 0.8
            assert rows[0][0] == 0
            assert rows[1][0] == 1
        finally:
            invalidate_cache("query-uuid")

    def test_labels_round_trip(self, backend):
        df = pd.DataFrame({
            "img_path": ["a.jpg", "b.jpg"],
            "val": [1, 2],
        })
        cfg = Config(
            type="histogram",
            media="img_path",
            columns=["id", "img_path", "val"],
            x="val",
        )

        storer = LocalStorer(backend=backend)
        storer.save("label-uuid", df, cfg)

        loader = DataLoader("label-uuid", backend)
        loader.label_manager.save_label("positive", [0])
        loader.label_manager.save_label("negative", [1])

        labels = loader.label_manager.read_labels()
        assert labels["0"] == ["positive"]
        assert labels["1"] == ["negative"]

        config = loader.load_config()
        assert set(config.labels) == {"positive", "negative"}


# ---------------------------------------------------------------------------
# Layer 4: Backend registry tests (create_backend / set_backend / get_backend)
# ---------------------------------------------------------------------------


class TestBackendRegistry:
    """Test the backend registry helpers — no parametrized fixture needed."""

    def test_create_backend_local(self):
        b = create_backend("local")
        assert isinstance(b, LocalBackend)

    def test_create_backend_s3_url(self):
        boto3 = pytest.importorskip("boto3")  # noqa: F841 — skip if not installed
        from clusterfun.storage.backends.s3 import S3Backend

        # S3Backend.__init__ calls boto3.client which needs real or fake creds;
        # we only test URL parsing via from_url, which is called by create_backend.
        # Constructing the backend requires a reachable endpoint so we skip if
        # LocalStack is not running.
        if not _port_open("localhost", 4566):
            pytest.skip("S3 service not available")
        b = create_backend("s3://my-bucket/some/prefix")
        assert isinstance(b, S3Backend)
        assert b.bucket == "my-bucket"
        assert b.prefix == "some/prefix"

    def test_create_backend_gcs_url(self):
        pytest.importorskip("google.cloud.storage")
        from clusterfun.storage.backends.gcs import GCSBackend

        if not _port_open("localhost", 4443):
            pytest.skip("GCS service not available")
        b = create_backend("gs://my-bucket/some/prefix")
        assert isinstance(b, GCSBackend)
        assert b.bucket_name == "my-bucket"
        assert b.prefix == "some/prefix"

    def test_create_backend_unknown_raises(self):
        with pytest.raises(ValueError, match="Unknown backend"):
            create_backend("ftp://x")

    def test_set_backend_with_string(self, tmp_path, monkeypatch):
        monkeypatch.setenv("CLUSTERFUN_CACHE_DIR", str(tmp_path))
        original = backends_module._backend
        try:
            set_backend("local")
            b = get_backend()
            assert isinstance(b, LocalBackend)
        finally:
            backends_module._backend = original

    def test_set_backend_with_instance(self, tmp_path):
        original = backends_module._backend
        try:
            instance = LocalBackend(cache_dir=tmp_path)
            set_backend(instance)
            assert get_backend() is instance
        finally:
            backends_module._backend = original

    def test_get_backend_from_env(self, monkeypatch, tmp_path):
        monkeypatch.setenv("CLUSTERFUN_BACKEND", "local")
        monkeypatch.setenv("CLUSTERFUN_CACHE_DIR", str(tmp_path))
        backends_module._backend = None
        try:
            b = get_backend()
            assert isinstance(b, LocalBackend)
        finally:
            backends_module._backend = None


# ---------------------------------------------------------------------------
# Layer 5: DuckDB query edge cases
# ---------------------------------------------------------------------------


class TestDuckDBQueryEdgeCases:
    """Edge cases for run_query / get_connection error handling."""

    def test_run_query_no_results_raises(self, backend):
        table = pa.table({"id": [0, 1, 2], "val": [10, 20, 30]})
        backend.save_parquet("edge-no-results", table)
        try:
            with pytest.raises(ValueError, match="no results"):
                run_query(
                    "edge-no-results",
                    backend,
                    "SELECT val FROM database WHERE val > 999",
                )
        finally:
            invalidate_cache("edge-no-results")

    def test_run_query_fetch_one_no_results_raises(self, backend):
        table = pa.table({"id": [0, 1], "val": [1, 2]})
        backend.save_parquet("edge-fetch-one-empty", table)
        try:
            with pytest.raises(ValueError, match="no results"):
                run_query(
                    "edge-fetch-one-empty",
                    backend,
                    "SELECT val FROM database WHERE val > 999",
                    fetch_one=True,
                )
        finally:
            invalidate_cache("edge-fetch-one-empty")

    def test_null_handling_in_aggregations(self, backend):
        # val has a NULL; COUNT(*) counts all rows, AVG ignores NULLs
        table = pa.table(
            {
                "id": pa.array([0, 1, 2], type=pa.int64()),
                "val": pa.array([10.0, None, 30.0], type=pa.float64()),
            }
        )
        backend.save_parquet("edge-nulls", table)
        try:
            row = run_query(
                "edge-nulls",
                backend,
                "SELECT COUNT(*), AVG(val) FROM database",
                fetch_one=True,
            )
            assert row[0] == 3          # COUNT(*) includes NULL row
            assert abs(row[1] - 20.0) < 0.01  # AVG of 10 and 30
        finally:
            invalidate_cache("edge-nulls")

    def test_query_with_special_column_names(self, backend):
        # Column name with a space — DuckDB allows querying via double-quoted identifier
        table = pa.table(
            {
                "id": pa.array([0, 1], type=pa.int64()),
                "my column": pa.array([100, 200], type=pa.int64()),
            }
        )
        backend.save_parquet("edge-special-cols", table)
        try:
            rows = run_query(
                "edge-special-cols",
                backend,
                'SELECT "my column" FROM database ORDER BY id',
            )
            assert rows == [(100,), (200,)]
        finally:
            invalidate_cache("edge-special-cols")


# ---------------------------------------------------------------------------
# Layer 6: Cache invalidation tests
# ---------------------------------------------------------------------------


class TestCacheInvalidation:
    """Tests for connection caching and invalidation logic in query.py."""

    def test_invalidate_single_uuid(self, backend):
        table_a = pa.table({"id": [0], "v": [1]})
        table_b = pa.table({"id": [0], "v": [2]})
        backend.save_parquet("cache-uuid-a", table_a)
        backend.save_parquet("cache-uuid-b", table_b)

        try:
            # Warm both connections
            get_connection("cache-uuid-a", backend)
            get_connection("cache-uuid-b", backend)

            # Invalidate only uuid-a
            invalidate_cache("cache-uuid-a")

            # uuid-b connection must still be alive and queryable
            rows = run_query("cache-uuid-b", backend, "SELECT v FROM database")
            assert rows == [(2,)]
        finally:
            invalidate_cache("cache-uuid-a")
            invalidate_cache("cache-uuid-b")

    def test_invalidate_all_bumps_generation(self, backend):
        import clusterfun.storage.query as query_module

        table = pa.table({"id": [0], "v": [99]})
        backend.save_parquet("cache-gen-test", table)

        try:
            get_connection("cache-gen-test", backend)
            before = query_module._generation
            invalidate_cache()
            after = query_module._generation
            assert after == before + 1
        finally:
            invalidate_cache("cache-gen-test")

    def test_connection_reuse(self, backend):
        table = pa.table({"id": [0], "v": [7]})
        backend.save_parquet("cache-reuse", table)

        try:
            con1 = get_connection("cache-reuse", backend)
            con2 = get_connection("cache-reuse", backend)
            assert con1 is con2
        finally:
            invalidate_cache("cache-reuse")

    def test_stale_generation_recreates(self, backend):
        """After a global invalidate_cache(), a worker thread's get_connection
        detects the stale generation and creates a fresh connection."""
        table = pa.table({"id": [0], "v": [42]})
        backend.save_parquet("cache-stale-gen", table)

        results = {}

        def worker():
            # Warm the connection inside the thread
            con_before = get_connection("cache-stale-gen", backend)
            results["before"] = id(con_before)

            # Signal main thread to bump the generation
            results["ready"] = True
            # Wait until main has invalidated
            while not results.get("invalidated"):
                pass

            # Now get_connection must detect the stale generation and recreate
            con_after = get_connection("cache-stale-gen", backend)
            results["after"] = id(con_after)

        t = threading.Thread(target=worker)
        t.start()

        # Wait until worker has warmed its connection
        import time
        while not results.get("ready"):
            time.sleep(0.001)

        invalidate_cache()  # bumps global _generation
        results["invalidated"] = True

        t.join(timeout=5)

        # The worker must have created a new connection object
        assert results["before"] != results["after"]
        invalidate_cache("cache-stale-gen")


# ---------------------------------------------------------------------------
# Layer 7: DataLoader edge cases
# ---------------------------------------------------------------------------


class TestDataLoaderEdgeCases:
    """Edge-case tests for DataLoader methods."""

    def setup_method(self):
        # Clear the module-level config cache before each test to avoid
        # cross-test pollution.
        _config_cache.clear()

    def test_load_nonexistent_uuid_raises(self, backend):
        loader = DataLoader("does-not-exist", backend)
        with pytest.raises(FileNotFoundError):
            loader.load()

    def test_config_cache_hit(self, backend):
        df = pd.DataFrame({"img_path": ["a.jpg"], "score": [1.0]})
        cfg = Config(
            type="scatter",
            media="img_path",
            columns=["id", "img_path", "score"],
            x="score",
            y="score",
        )
        storer = LocalStorer(backend=backend)
        storer.save("cache-hit-uuid", df, cfg)

        loader = DataLoader("cache-hit-uuid", backend)
        first = loader._load_base_config()
        second = loader._load_base_config()
        # Same object from the cache — identity check
        assert first is second

    def test_empty_dataset(self, backend):
        # Zero-row DataFrame with explicit dtypes so PyArrow can infer the schema
        df = pd.DataFrame(
            {"img_path": pd.Series([], dtype=str), "score": pd.Series([], dtype=float)}
        )
        cfg = Config(
            type="scatter",
            media="img_path",
            columns=["id", "img_path", "score"],
            x="score",
            y="score",
        )
        storer = LocalStorer(backend=backend)
        storer.save("empty-uuid", df, cfg)

        try:
            loader = DataLoader("empty-uuid", backend)
            result_df = loader.get_dataframe()
            assert list(result_df.columns) == ["id", "img_path", "score"]
            assert len(result_df) == 0
        finally:
            invalidate_cache("empty-uuid")

    def test_single_row_dataset(self, backend):
        df = pd.DataFrame({"img_path": ["only.jpg"], "score": [3.14]})
        cfg = Config(
            type="scatter",
            media="img_path",
            columns=["id", "img_path", "score"],
            x="score",
            y="score",
        )
        storer = LocalStorer(backend=backend)
        storer.save("single-row-uuid", df, cfg)

        try:
            loader = DataLoader("single-row-uuid", backend)

            # get_row
            item = loader.get_row(0)
            assert item.index == 0
            assert item.src == "only.jpg"

            # get_dataframe
            result_df = loader.get_dataframe()
            assert len(result_df) == 1
            assert result_df.iloc[0]["img_path"] == "only.jpg"
        finally:
            invalidate_cache("single-row-uuid")


# ---------------------------------------------------------------------------
# Layer 8: Label edge cases
# ---------------------------------------------------------------------------


class TestLabelEdgeCases:
    """Edge cases for LabelManager CRUD operations."""

    def _make_label_manager(self, backend, uuid="label-edge-uuid"):
        from clusterfun.storage.local.label_manager import LabelManager

        # Ensure the uuid directory exists (backend needs at least one save)
        backend.save_json(uuid, "config.json", {"type": "scatter"})
        return LabelManager(uuid, backend)

    def test_read_labels_when_none_exist(self, backend):
        lm = self._make_label_manager(backend, "lm-empty")
        assert lm.read_labels() == {}

    def test_save_duplicate_label(self, backend):
        lm = self._make_label_manager(backend, "lm-dup")
        lm.save_label("good", [0])
        lm.save_label("good", [0])  # duplicate — should be ignored
        labels = lm.read_labels()
        assert labels["0"].count("good") == 1

    def test_delete_nonexistent_label(self, backend):
        lm = self._make_label_manager(backend, "lm-del-noexist")
        lm.save_label("keep", [0])
        # Deleting a label that was never saved must not raise and must not
        # remove other labels.
        lm.delete_label("ghost", [0])
        labels = lm.read_labels()
        assert labels["0"] == ["keep"]

    def test_delete_label_from_nonexistent_media(self, backend):
        lm = self._make_label_manager(backend, "lm-del-media-noexist")
        # No labels at all yet — deleting from a missing media_id must be a no-op
        lm.delete_label("whatever", [99])
        assert lm.read_labels() == {}

    def test_multiple_labels_per_item(self, backend):
        lm = self._make_label_manager(backend, "lm-multi")
        lm.save_label("alpha", [0])
        lm.save_label("beta", [0])
        lm.save_label("gamma", [0])
        labels = lm.read_labels()
        assert set(labels["0"]) == {"alpha", "beta", "gamma"}

    def test_label_dataframe(self, backend):
        lm = self._make_label_manager(backend, "lm-df")
        lm.save_label("positive", [0, 2])
        lm.save_label("negative", [1])

        df = lm.get_dataframe()
        # Should have a row per labeled media item
        assert len(df) == 3
        assert "positive" in df.columns
        assert "negative" in df.columns

        positive_ids = set(df[df["positive"] == 1]["media_id"].tolist())
        assert positive_ids == {0, 2}

        negative_ids = set(df[df["negative"] == 1]["media_id"].tolist())
        assert negative_ids == {1}


# ---------------------------------------------------------------------------
# Layer 9: S3 backend-specific tests
# ---------------------------------------------------------------------------


def _port_open(host: str, port: int, timeout: float = 1.0) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


_s3_available = _port_open("localhost", 4566)
_gcs_available = _port_open("localhost", 4443)


@pytest.mark.skipif(not _s3_available, reason="S3/LocalStack service not available")
class TestS3BackendSpecific:
    """S3-specific tests — only run when LocalStack is reachable."""

    def _make_s3_backend(self, monkeypatch):
        pytest.importorskip("boto3")
        import boto3
        from botocore.client import Config as BotoConfig

        monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
        monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
        monkeypatch.setenv("AWS_REGION", "us-east-1")

        from clusterfun.storage.backends.s3 import S3Backend

        endpoint = "http://localhost:4566"
        import os
        bucket = f"test-s3spec-{os.urandom(4).hex()}"
        s3 = boto3.client(
            "s3",
            endpoint_url=endpoint,
            aws_access_key_id="test",
            aws_secret_access_key="test",
            region_name="us-east-1",
            config=BotoConfig(signature_version="s3v4"),
        )
        s3.create_bucket(Bucket=bucket)
        return S3Backend(bucket=bucket, prefix="", endpoint_url=endpoint)

    def test_configure_duckdb_installs_httpfs(self, monkeypatch):
        import duckdb

        backend = self._make_s3_backend(monkeypatch)
        con = duckdb.connect()
        backend.configure_duckdb(con)
        # Verify httpfs extension is loaded — querying the loaded_extensions table
        rows = con.execute(
            "SELECT extension_name FROM duckdb_extensions() WHERE loaded = true AND extension_name = 'httpfs'"
        ).fetchall()
        assert len(rows) == 1
        con.close()

    def test_from_url_parsing(self, monkeypatch):
        monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
        monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
        monkeypatch.setenv("AWS_REGION", "us-east-1")
        pytest.importorskip("boto3")
        from clusterfun.storage.backends.s3 import S3Backend

        b = S3Backend.from_url("s3://bucket/path/to/prefix")
        assert b.bucket == "bucket"
        assert b.prefix == "path/to/prefix"

    def test_from_url_no_prefix(self, monkeypatch):
        monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
        monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
        monkeypatch.setenv("AWS_REGION", "us-east-1")
        pytest.importorskip("boto3")
        from clusterfun.storage.backends.s3 import S3Backend

        b = S3Backend.from_url("s3://bucket")
        assert b.bucket == "bucket"
        assert b.prefix == ""


# ---------------------------------------------------------------------------
# Layer 10: GCS backend-specific tests
# ---------------------------------------------------------------------------


@pytest.mark.skipif(not _gcs_available, reason="GCS/fake-gcs-server service not available")
class TestGCSBackendSpecific:
    """GCS-specific tests — only run when fake-gcs-server is reachable."""

    def test_from_url_parsing(self, monkeypatch):
        monkeypatch.setenv("STORAGE_EMULATOR_HOST", "http://localhost:4443")
        pytest.importorskip("google.cloud.storage")
        from clusterfun.storage.backends.gcs import GCSBackend

        b = GCSBackend.from_url("gs://bucket/path/to/prefix")
        assert b.bucket_name == "bucket"
        assert b.prefix == "path/to/prefix"

    def test_from_url_no_prefix(self, monkeypatch):
        monkeypatch.setenv("STORAGE_EMULATOR_HOST", "http://localhost:4443")
        pytest.importorskip("google.cloud.storage")
        from clusterfun.storage.backends.gcs import GCSBackend

        b = GCSBackend.from_url("gs://bucket")
        assert b.bucket_name == "bucket"
        assert b.prefix == ""
