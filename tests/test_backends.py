"""Parametrized backend interface tests.

These tests run the same logic against Local, S3 (LocalStack), and GCS (fake-gcs-server).
S3/GCS tests skip gracefully when Docker services aren't running.
"""

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from clusterfun.config import Config
from clusterfun.storage.data_loader import DataLoader
from clusterfun.storage.local.storer import LocalStorer
from clusterfun.storage.query import get_connection, invalidate_cache, run_query


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
