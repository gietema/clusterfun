"""Tests for the embeddings and labels endpoints."""

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

import clusterfun.storage.backends as backends_module
from clusterfun.config import Config
from clusterfun.storage.backends.local import LocalBackend
from clusterfun.storage.local.helpers import get_columns_for_db
from clusterfun.storage.local.storer import LocalStorer
from clusterfun.storage.query import invalidate_cache


@pytest.fixture()
def backend(tmp_path):
    backend = LocalBackend(cache_dir=tmp_path)
    backends_module._backend = backend
    yield backend
    invalidate_cache()
    backends_module._backend = None


@pytest.fixture()
def saved_plot(backend):
    """Save a scatter plot with embeddings."""
    rng = np.random.RandomState(42)
    n = 20
    dim = 8
    df = pd.DataFrame(
        {
            "x": rng.randn(n),
            "y": rng.randn(n),
            "image": [f"https://example.com/img_{i}.jpg" for i in range(n)],
            "emb": [rng.randn(dim).tolist() for _ in range(n)],
        }
    )
    uuid = "test-embeddings"
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


@pytest.fixture()
def client(saved_plot):
    from clusterfun.main import APP

    return TestClient(APP)


class TestEmbeddingsEndpoint:
    def test_returns_all_embeddings(self, client, saved_plot):
        uuid, _, df = saved_plot
        resp = client.post(f"/api/views/{uuid}/embeddings", json={"media_ids": []})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["media_ids"]) == 20
        assert len(data["embeddings"]) == 20
        assert data["dimension"] == 8
        # Each embedding should have correct dimension
        for emb in data["embeddings"]:
            assert len(emb) == 8

    def test_returns_subset_by_ids(self, client, saved_plot):
        uuid, _, _ = saved_plot
        resp = client.post(
            f"/api/views/{uuid}/embeddings", json={"media_ids": [0, 1, 5]}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert set(data["media_ids"]) == {0, 1, 5}
        assert len(data["embeddings"]) == 3

    def test_returns_correct_values(self, client, saved_plot):
        uuid, _, df = saved_plot
        resp = client.post(
            f"/api/views/{uuid}/embeddings", json={"media_ids": [0]}
        )
        data = resp.json()
        expected = df.at[0, "emb"]
        returned = data["embeddings"][0]
        for a, b in zip(expected, returned):
            assert abs(a - b) < 1e-4

    def test_no_embeddings_returns_400(self, backend):
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
        resp = client.post(f"/api/views/{uuid}/embeddings", json={"media_ids": []})
        assert resp.status_code == 400

    def test_empty_result_for_nonexistent_ids(self, client, saved_plot):
        uuid, _, _ = saved_plot
        resp = client.post(
            f"/api/views/{uuid}/embeddings", json={"media_ids": [9999]}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["media_ids"]) == 0


class TestAllLabelsEndpoint:
    def test_returns_empty_when_no_labels(self, client, saved_plot):
        uuid, _, _ = saved_plot
        resp = client.get(f"/api/views/{uuid}/all-labels")
        assert resp.status_code == 200
        data = resp.json()
        assert data["labels"] == {}

    def test_returns_labels_after_labeling(self, client, saved_plot):
        uuid, _, _ = saved_plot
        # Add some labels
        client.post(
            f"/api/views/{uuid}/label",
            json={
                "label": {"title": "good"},
                "media_indices": {"media_ids": [0, 1]},
            },
        )
        client.post(
            f"/api/views/{uuid}/label",
            json={
                "label": {"title": "bad"},
                "media_indices": {"media_ids": [2]},
            },
        )

        resp = client.get(f"/api/views/{uuid}/all-labels")
        assert resp.status_code == 200
        data = resp.json()
        labels = data["labels"]
        assert "0" in labels
        assert "good" in labels["0"]
        assert "1" in labels
        assert "good" in labels["1"]
        assert "2" in labels
        assert "bad" in labels["2"]
