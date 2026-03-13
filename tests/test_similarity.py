"""Tests for the similarity search feature.

Covers: Config, validation, storage, query setup (HNSW + brute-force fallback),
and the FastAPI endpoint.
"""

import numpy as np
import pandas as pd
import pyarrow.parquet as pq
import pytest
from fastapi.testclient import TestClient

import clusterfun.storage.backends as backends_module
from clusterfun.config import Config
from clusterfun.storage.backends.local import LocalBackend
from clusterfun.storage.local.helpers import get_columns_for_db
from clusterfun.storage.local.storer import LocalStorer
from clusterfun.storage.query import ensure_embeddings_table, invalidate_cache
from clusterfun.validation import ColumnNotFoundException, validate


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_df(n: int = 100, dim: int = 32, seed: int = 42) -> pd.DataFrame:
    """Create a DataFrame with random embeddings."""
    rng = np.random.RandomState(seed)
    df = pd.DataFrame(
        {
            "x": rng.randn(n),
            "y": rng.randn(n),
            "image": [f"https://example.com/img_{i}.jpg" for i in range(n)],
            "emb": [rng.randn(dim).tolist() for _ in range(n)],
        }
    )
    # Make items 0 and 1 nearly identical for assertion
    df.at[1, "emb"] = [v + 1e-4 for v in df.at[0, "emb"]]
    return df


@pytest.fixture()
def backend(tmp_path):
    backend = LocalBackend(cache_dir=tmp_path)
    backends_module._backend = backend
    yield backend
    invalidate_cache()
    backends_module._backend = None


@pytest.fixture()
def saved_plot(backend):
    """Save a scatter plot with embeddings, return (uuid, backend, df)."""
    df = _make_df()
    uuid = "test-similarity"
    cfg = Config(
        type="scatter",
        x="x",
        y="y",
        media="image",
        columns=get_columns_for_db(df, "image", "scatter", "x", "y", embeddings="emb"),
        embeddings="emb",
    )
    LocalStorer(backend=backend).save(uuid, df, cfg)
    return uuid, backend, df


# ---------------------------------------------------------------------------
# Config & validation
# ---------------------------------------------------------------------------


class TestEmbeddingsConfig:
    def test_embeddings_field_default_none(self):
        cfg = Config(type="grid", media="img", columns=["id", "img"])
        assert cfg.embeddings is None

    def test_embeddings_field_set(self):
        cfg = Config(type="grid", media="img", columns=["id", "img"], embeddings="emb")
        assert cfg.embeddings == "emb"


class TestEmbeddingsValidation:
    def test_missing_column_raises(self):
        df = pd.DataFrame({"x": [1], "image": ["a.jpg"]})
        cfg = Config(
            type="grid", media="image", columns=["id", "image"], embeddings="emb"
        )
        with pytest.raises(ColumnNotFoundException):
            validate(df, cfg)

    def test_non_array_column_raises(self):
        df = pd.DataFrame({"image": ["a.jpg"], "emb": ["not_a_list"]})
        cfg = Config(
            type="grid", media="image", columns=["id", "image"], embeddings="emb"
        )
        with pytest.raises(ValueError, match="list or array"):
            validate(df, cfg)

    def test_valid_list_column_passes(self):
        df = pd.DataFrame({"image": ["a.jpg"], "emb": [[1.0, 2.0, 3.0]]})
        cfg = Config(
            type="grid", media="image", columns=["id", "image"], embeddings="emb"
        )
        validate(df, cfg)

    def test_valid_numpy_column_passes(self):
        df = pd.DataFrame({"image": ["a.jpg"], "emb": [np.array([1.0, 2.0])]})
        cfg = Config(
            type="grid", media="image", columns=["id", "image"], embeddings="emb"
        )
        validate(df, cfg)


# ---------------------------------------------------------------------------
# Column exclusion
# ---------------------------------------------------------------------------


class TestColumnsExclusion:
    def test_embeddings_excluded_from_columns(self):
        df = pd.DataFrame(
            {"image": ["a.jpg"], "x": [1.0], "y": [2.0], "emb": [[0.1, 0.2]]}
        )
        cols = get_columns_for_db(df, "image", "scatter", "x", "y", embeddings="emb")
        assert "emb" not in cols
        assert "image" in cols

    def test_without_embeddings_includes_all(self):
        df = pd.DataFrame(
            {"image": ["a.jpg"], "x": [1.0], "y": [2.0], "emb": [[0.1, 0.2]]}
        )
        cols = get_columns_for_db(df, "image", "scatter", "x", "y")
        assert "emb" in cols


# ---------------------------------------------------------------------------
# Storage: embeddings.parquet written separately
# ---------------------------------------------------------------------------


class TestEmbeddingsStorage:
    def test_embeddings_parquet_created(self, saved_plot):
        uuid, backend, _ = saved_plot
        path = backend.cache_dir / uuid / "embeddings.parquet"
        assert path.exists()

    def test_embeddings_parquet_has_id_and_emb(self, saved_plot):
        uuid, backend, _ = saved_plot
        table = pq.read_table(backend.cache_dir / uuid / "embeddings.parquet")
        assert "id" in table.column_names
        assert "emb" in table.column_names
        assert len(table) == 100

    def test_data_parquet_excludes_embeddings(self, saved_plot):
        uuid, backend, _ = saved_plot
        table = pq.read_table(backend.cache_dir / uuid / "data.parquet")
        assert "emb" not in table.column_names

    def test_config_json_has_embeddings_field(self, saved_plot):
        uuid, backend, _ = saved_plot
        config_data = backend.load_json(uuid, "config.json")
        assert config_data["embeddings"] == "emb"

    def test_no_embeddings_parquet_when_not_set(self, backend):
        df = pd.DataFrame({"image": ["a.jpg"], "x": [1.0], "y": [2.0]})
        uuid = "no-emb"
        cfg = Config(
            type="scatter",
            x="x",
            y="y",
            media="image",
            columns=get_columns_for_db(df, "image", "scatter", "x", "y"),
        )
        LocalStorer(backend=backend).save(uuid, df, cfg)
        assert not (backend.cache_dir / uuid / "embeddings.parquet").exists()


# ---------------------------------------------------------------------------
# Query: ensure_embeddings_table (HNSW or brute-force)
# ---------------------------------------------------------------------------


class TestEnsureEmbeddingsTable:
    def test_creates_embeddings_object(self, saved_plot):
        uuid, backend, _ = saved_plot
        con = ensure_embeddings_table(uuid, backend, "emb")
        # Should be queryable
        row = con.execute("SELECT count(*) FROM embeddings").fetchone()
        assert row[0] == 100

    def test_idempotent(self, saved_plot):
        """Calling twice returns the same connection without error."""
        uuid, backend, _ = saved_plot
        con1 = ensure_embeddings_table(uuid, backend, "emb")
        con2 = ensure_embeddings_table(uuid, backend, "emb")
        assert con1 is con2

    def test_cosine_similarity_query(self, saved_plot):
        """Item 1 should be most similar to item 0."""
        uuid, backend, _ = saved_plot
        con = ensure_embeddings_table(uuid, backend, "emb")

        query_emb = con.execute(
            "SELECT emb FROM embeddings WHERE id = ?", [0]
        ).fetchone()[0]

        # Try HNSW path
        dim = len(query_emb)
        try:
            rows = con.execute(
                f"SELECT id, array_cosine_similarity(emb, ?::FLOAT[{dim}]) AS sim "
                f"FROM embeddings "
                f"ORDER BY array_cosine_distance(emb, ?::FLOAT[{dim}]) "
                f"LIMIT 6",
                [list(query_emb), list(query_emb)],
            ).fetchall()
            results = [(r[0], r[1]) for r in rows if r[0] != 0]
        except Exception:
            # Brute-force fallback
            rows = con.execute(
                "WITH q AS (SELECT emb AS emb FROM embeddings WHERE id = ?) "
                "SELECT e.id, list_cosine_similarity(e.emb, q.emb) AS sim "
                "FROM embeddings e, q WHERE e.id != ? "
                "ORDER BY sim DESC LIMIT 5",
                [0, 0],
            ).fetchall()
            results = [(r[0], r[1]) for r in rows]

        assert results[0][0] == 1
        assert results[0][1] > 0.99


# ---------------------------------------------------------------------------
# FastAPI endpoint
# ---------------------------------------------------------------------------


class TestSimilarityEndpoint:
    @pytest.fixture()
    def client(self, saved_plot):
        uuid, backend, _ = saved_plot
        from clusterfun.main import APP

        return TestClient(APP)

    def test_find_similar_returns_results(self, client, saved_plot):
        uuid, _, _ = saved_plot
        resp = client.post(
            f"/api/views/{uuid}/similar",
            json={"media_id": 0, "n": 5},
        )
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) == 5
        assert results[0]["media_id"] == 1
        assert results[0]["similarity"] > 0.99

    def test_find_similar_respects_n(self, client, saved_plot):
        uuid, _, _ = saved_plot
        resp = client.post(
            f"/api/views/{uuid}/similar",
            json={"media_id": 0, "n": 3},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_find_similar_excludes_query_item(self, client, saved_plot):
        uuid, _, _ = saved_plot
        resp = client.post(
            f"/api/views/{uuid}/similar",
            json={"media_id": 0, "n": 10},
        )
        ids = [r["media_id"] for r in resp.json()]
        assert 0 not in ids

    def test_find_similar_results_sorted_descending(self, client, saved_plot):
        uuid, _, _ = saved_plot
        resp = client.post(
            f"/api/views/{uuid}/similar",
            json={"media_id": 0, "n": 10},
        )
        similarities = [r["similarity"] for r in resp.json()]
        assert similarities == sorted(similarities, reverse=True)

    def test_find_similar_no_embeddings_returns_empty(self, backend):
        """Plot without embeddings should return empty list."""
        df = pd.DataFrame(
            {"image": ["https://example.com/a.jpg"], "x": [1.0], "y": [2.0]}
        )
        uuid = "no-emb"
        cfg = Config(
            type="scatter",
            x="x",
            y="y",
            media="image",
            columns=get_columns_for_db(df, "image", "scatter", "x", "y"),
        )
        LocalStorer(backend=backend).save(uuid, df, cfg)

        from clusterfun.main import APP

        client = TestClient(APP)
        resp = client.post(
            f"/api/views/{uuid}/similar",
            json={"media_id": 0, "n": 5},
        )
        assert resp.status_code == 200
        assert resp.json() == []


# ---------------------------------------------------------------------------
# Vector search endpoint
# ---------------------------------------------------------------------------


class TestVectorSearchEndpoint:
    @pytest.fixture()
    def client(self, saved_plot):
        from clusterfun.main import APP

        return TestClient(APP)

    def test_vector_search_returns_results(self, client, saved_plot):
        uuid, _, df = saved_plot
        query_emb = df.at[0, "emb"]
        resp = client.post(
            f"/api/views/{uuid}/similar-vector",
            json={"embedding": query_emb, "n": 5},
        )
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) == 5
        assert results[0]["media_id"] == 0
        assert results[0]["similarity"] > 0.99

    def test_vector_search_respects_n(self, client, saved_plot):
        uuid, _, df = saved_plot
        query_emb = df.at[0, "emb"]
        resp = client.post(
            f"/api/views/{uuid}/similar-vector",
            json={"embedding": query_emb, "n": 3},
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_load_more_returns_superset(self, client, saved_plot):
        """Requesting a larger n returns more results that include the previous ones."""
        uuid, _, df = saved_plot
        query_emb = df.at[0, "emb"]

        resp_small = client.post(
            f"/api/views/{uuid}/similar-vector",
            json={"embedding": query_emb, "n": 5},
        )
        resp_large = client.post(
            f"/api/views/{uuid}/similar-vector",
            json={"embedding": query_emb, "n": 20},
        )
        small_ids = [r["media_id"] for r in resp_small.json()]
        large_ids = [r["media_id"] for r in resp_large.json()]
        assert len(large_ids) == 20
        assert len(small_ids) == 5
        # The first 5 results should be identical
        assert small_ids == large_ids[:5]

    def test_similar_load_more_returns_superset(self, client, saved_plot):
        """Same test for the /similar endpoint (image-based)."""
        uuid, _, _ = saved_plot
        resp_small = client.post(
            f"/api/views/{uuid}/similar",
            json={"media_id": 0, "n": 5},
        )
        resp_large = client.post(
            f"/api/views/{uuid}/similar",
            json={"media_id": 0, "n": 20},
        )
        small_ids = [r["media_id"] for r in resp_small.json()]
        large_ids = [r["media_id"] for r in resp_large.json()]
        assert len(large_ids) == 20
        assert len(small_ids) == 5
        assert small_ids == large_ids[:5]

    def test_vector_search_no_embeddings_returns_empty(self, client, backend):
        df = pd.DataFrame(
            {"image": ["https://example.com/a.jpg"], "x": [1.0], "y": [2.0]}
        )
        uuid = "no-emb-vec"
        cfg = Config(
            type="scatter",
            x="x",
            y="y",
            media="image",
            columns=get_columns_for_db(df, "image", "scatter", "x", "y"),
        )
        LocalStorer(backend=backend).save(uuid, df, cfg)
        resp = client.post(
            f"/api/views/{uuid}/similar-vector",
            json={"embedding": [0.1, 0.2, 0.3], "n": 5},
        )
        assert resp.status_code == 200
        assert resp.json() == []


# ---------------------------------------------------------------------------
# Plot type functions accept embeddings parameter
# ---------------------------------------------------------------------------


class TestPlotTypesEmbeddingsParam:
    """Ensure all plot type functions accept the embeddings kwarg without error."""

    @pytest.fixture(autouse=True)
    def _setup(self, backend):
        self.backend = backend

    def _base_df(self):
        rng = np.random.RandomState(0)
        return pd.DataFrame(
            {
                "x": rng.randn(20),
                "y": rng.randn(20),
                "image": [f"https://example.com/img_{i}.jpg" for i in range(20)],
                "color": ["a", "b"] * 10,
                "emb": [rng.randn(8).tolist() for _ in range(20)],
            }
        )

    def test_scatter(self):
        import clusterfun as clt

        df = self._base_df()
        clt.scatter(df, x="x", y="y", media="image", embeddings="emb", show=False)

    def test_grid(self):
        import clusterfun as clt

        df = self._base_df()
        clt.grid(df, media="image", embeddings="emb", show=False)

    def test_histogram(self):
        import clusterfun as clt

        df = self._base_df()
        clt.histogram(df, x="x", media="image", embeddings="emb", show=False)

    def test_violin(self):
        import clusterfun as clt

        df = self._base_df()
        clt.violin(df, y="y", media="image", embeddings="emb", show=False)

    def test_bar_chart(self):
        import clusterfun as clt

        df = self._base_df()
        clt.bar_chart(df, x="color", media="image", embeddings="emb", show=False)

    def test_pie_chart(self):
        import clusterfun as clt

        df = self._base_df()
        clt.pie_chart(df, color="color", media="image", embeddings="emb", show=False)

    def test_confusion_matrix(self):
        import clusterfun as clt

        df = self._base_df()
        df["pred"] = df["color"].sample(frac=1, random_state=0).values
        clt.confusion_matrix(
            df,
            y_true="color",
            y_pred="pred",
            media="image",
            embeddings="emb",
            show=False,
        )
