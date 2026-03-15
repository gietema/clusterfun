"""Tests for insights endpoints: outliers, duplicates, centroid distance.

Covers both ungrouped and grouped outlier detection.
"""

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


def _make_df(n: int = 100, dim: int = 32, seed: int = 42) -> pd.DataFrame:
    """Create a DataFrame with embeddings and a categorical column for grouping.

    Embeds 3 tight clusters (A, B, C) with one planted outlier per cluster.
    """
    rng = np.random.RandomState(seed)
    per_group = n // 3
    remainder = n - 3 * per_group

    groups = []
    embs = []
    for gi, label in enumerate(["A", "B", "C"]):
        center = rng.randn(dim).astype(np.float32)
        center /= np.linalg.norm(center)
        count = per_group + (1 if gi < remainder else 0)
        for i in range(count):
            if i == 0:
                # Plant an outlier: opposite direction
                emb = -center + rng.randn(dim).astype(np.float32) * 0.05
            else:
                emb = center + rng.randn(dim).astype(np.float32) * 0.05
            embs.append(emb.tolist())
            groups.append(label)

    df = pd.DataFrame({
        "image": [f"https://example.com/img_{i}.jpg" for i in range(n)],
        "emb": embs,
        "category": groups,
    })
    return df


@pytest.fixture()
def backend(tmp_path):
    backend = LocalBackend(cache_dir=tmp_path)
    backends_module._backend = backend
    yield backend
    invalidate_cache()
    backends_module._backend = None


@pytest.fixture()
def saved_view(backend):
    df = _make_df()
    uuid = "test-insights"
    cfg = Config(
        type="grid",
        media="image",
        columns=get_columns_for_db(df, "image", "grid", embeddings="emb"),
        embeddings="emb",
    )
    LocalStorer(backend=backend).save(uuid, df, cfg)
    return uuid, backend, df


@pytest.fixture()
def client(saved_view):
    from clusterfun.main import APP
    return TestClient(APP)


class TestOutlierDetection:
    def test_ungrouped_returns_outliers(self, client, saved_view):
        uuid, _, _ = saved_view
        resp = client.post(
            f"/api/views/{uuid}/outliers",
            json={"k": 10, "threshold": 1.2},
        )
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) > 0
        # All results should have score > threshold
        for r in results:
            assert r["score"] > 1.2

    def test_grouped_returns_outliers(self, client, saved_view):
        """Grouped outlier detection must find outliers within each group."""
        uuid, _, _ = saved_view
        resp = client.post(
            f"/api/views/{uuid}/outliers",
            json={"k": 10, "threshold": 1.2, "group_by": "category"},
        )
        assert resp.status_code == 200
        results = resp.json()
        # Must find at least one outlier (we planted one per group)
        assert len(results) > 0, "Grouped outlier detection returned no results"
        # Each result should have a group label
        for r in results:
            assert r["group"] in ("A", "B", "C")
            assert r["score"] > 1.2

    def test_grouped_finds_outliers_in_multiple_groups(self, client, saved_view):
        """Should find outliers in more than one group."""
        uuid, _, _ = saved_view
        resp = client.post(
            f"/api/views/{uuid}/outliers",
            json={"k": 5, "threshold": 1.1, "group_by": "category"},
        )
        results = resp.json()
        groups_with_outliers = {r["group"] for r in results}
        assert len(groups_with_outliers) >= 2, (
            f"Expected outliers in multiple groups, got: {groups_with_outliers}"
        )

    def test_grouped_works_with_overlapping_embeddings(self, backend):
        """Groups that overlap in embedding space should still detect outliers.

        This tests the realistic case where groups share similar embeddings
        (e.g., different labels but similar images). Global k-NN post-filtering
        would fail here because most neighbors are from other groups.
        """
        rng = np.random.RandomState(99)
        n = 200
        dim = 16
        # All items share the same rough region in embedding space
        base = rng.randn(dim).astype(np.float32)
        base /= np.linalg.norm(base)
        embs = []
        groups = []
        for i in range(n):
            group = ["X", "Y"][i % 2]
            if i < 2:
                # Plant 1 outlier per group — far from the shared region
                emb = -base + rng.randn(dim).astype(np.float32) * 0.01
            else:
                emb = base + rng.randn(dim).astype(np.float32) * 0.1
            embs.append(emb.tolist())
            groups.append(group)

        df = pd.DataFrame({
            "image": [f"https://example.com/img_{i}.jpg" for i in range(n)],
            "emb": embs,
            "label": groups,
        })
        uuid = "test-overlap"
        cfg = Config(
            type="grid", media="image",
            columns=get_columns_for_db(df, "image", "grid", embeddings="emb"),
            embeddings="emb",
        )
        LocalStorer(backend=backend).save(uuid, df, cfg)

        from clusterfun.main import APP
        client = TestClient(APP)
        resp = client.post(
            f"/api/views/{uuid}/outliers",
            json={"k": 10, "threshold": 1.2, "group_by": "label"},
        )
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) > 0, (
            "Grouped outlier detection found no outliers with overlapping groups"
        )

    def test_grouped_many_small_groups(self, backend):
        """Many small groups (~10 items each) in a shared embedding region.

        With k=10 and 20 groups of 10 items, global k-NN returns ~0.5
        same-group neighbors on average — too few for LOF.
        """
        rng = np.random.RandomState(77)
        n_groups = 20
        per_group = 10
        n = n_groups * per_group
        dim = 16
        base = rng.randn(dim).astype(np.float32)
        base /= np.linalg.norm(base)

        embs = []
        groups = []
        for gi in range(n_groups):
            for j in range(per_group):
                if j == 0:
                    emb = -base + rng.randn(dim).astype(np.float32) * 0.01
                else:
                    emb = base + rng.randn(dim).astype(np.float32) * 0.1
                embs.append(emb.tolist())
                groups.append(f"G{gi}")

        df = pd.DataFrame({
            "image": [f"https://example.com/img_{i}.jpg" for i in range(n)],
            "emb": embs,
            "group": groups,
        })
        uuid = "test-many-groups"
        cfg = Config(
            type="grid", media="image",
            columns=get_columns_for_db(df, "image", "grid", embeddings="emb"),
            embeddings="emb",
        )
        LocalStorer(backend=backend).save(uuid, df, cfg)

        from clusterfun.main import APP
        client = TestClient(APP)
        resp = client.post(
            f"/api/views/{uuid}/outliers",
            json={"k": 5, "threshold": 1.2, "group_by": "group"},
        )
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) > 0, (
            "Grouped outlier detection found no outliers with many small groups"
        )


class TestDuplicateDetection:
    def test_returns_duplicate_groups(self, client, saved_view):
        uuid, _, _ = saved_view
        resp = client.post(
            f"/api/views/{uuid}/duplicates",
            json={"threshold": 0.90, "limit": 50},
        )
        assert resp.status_code == 200
        results = resp.json()
        # Within-cluster items are very similar, should find some groups
        assert len(results) > 0
        for g in results:
            assert len(g["media_ids"]) >= 2
            assert g["similarity"] >= 0.90


class TestCentroidDistance:
    def test_returns_ranked_items(self, client, saved_view):
        uuid, _, _ = saved_view
        resp = client.post(
            f"/api/views/{uuid}/centroid-distance",
            json={"limit": 10},
        )
        assert resp.status_code == 200
        results = resp.json()
        assert len(results) == 10
        # Should be sorted by distance descending
        distances = [r["distance"] for r in results]
        assert distances == sorted(distances, reverse=True)

    def test_no_embeddings_returns_empty(self, backend):
        df = pd.DataFrame({"image": ["https://example.com/a.jpg"]})
        uuid = "no-emb-centroid"
        cfg = Config(
            type="grid",
            media="image",
            columns=get_columns_for_db(df, "image", "grid"),
        )
        LocalStorer(backend=backend).save(uuid, df, cfg)
        from clusterfun.main import APP
        client = TestClient(APP)
        resp = client.post(
            f"/api/views/{uuid}/centroid-distance",
            json={"limit": 10},
        )
        assert resp.status_code == 200
        assert resp.json() == []
