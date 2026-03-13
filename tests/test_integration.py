"""Integration tests for the full clusterfun pipeline.

Tests plot creation, grid browsing, filtering, media loading,
label management, column stats, and CSV download — all via the FastAPI test client.
"""

import csv
import io

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

import clusterfun.storage.backends as backends_module
from clusterfun.config import Config
from clusterfun.main import APP
from clusterfun.models.media_indices import MediaIndices
from clusterfun.plot_types.grid import grid
from clusterfun.plot_types.histogram import histogram
from clusterfun.plot_types.scatter import scatter
from clusterfun.storage.backends.local import LocalBackend
from clusterfun.storage.data_loader import DataLoader
from clusterfun.storage.local.storer import LocalStorer
from clusterfun.storage.query import invalidate_cache


@pytest.fixture()
def local_backend(tmp_path, monkeypatch):
    monkeypatch.setenv("CLUSTERFUN_CACHE_DIR", str(tmp_path))
    backend = LocalBackend(cache_dir=tmp_path)
    backends_module._backend = backend
    yield backend
    invalidate_cache()
    backends_module._backend = None
    # Clear filter validation caches to prevent stale data between tests
    from clusterfun.models.filter import _column_values_cache
    _column_values_cache.clear()
    from clusterfun.storage.data_loader import _config_cache
    _config_cache.clear()


@pytest.fixture()
def client():
    return TestClient(APP)


def _save_scatter(backend, uuid=None, n=50):
    if uuid is None:
        import uuid as _uuid
        uuid = str(_uuid.uuid4())
    """Helper: save a scatter plot with numeric + categorical columns."""
    np.random.seed(42)
    df = pd.DataFrame({
        "img_path": [f"https://example.com/img_{i}.jpg" for i in range(n)],
        "x_val": np.random.uniform(0, 100, n).tolist(),
        "y_val": np.random.uniform(0, 100, n).tolist(),
        "category": np.random.choice(["cat", "dog", "bird"], n).tolist(),
        "score": np.random.uniform(0, 1, n).tolist(),
    })
    cfg = Config(
        type="scatter",
        media="img_path",
        columns=["id", "img_path", "x_val", "y_val", "category", "score"],
        x="x_val",
        y="y_val",
    )
    storer = LocalStorer(backend=backend)
    storer.save(uuid, df, cfg)
    return uuid, df


# ---------------------------------------------------------------------------
# Plot creation — verify artifacts
# ---------------------------------------------------------------------------


class TestPlotCreation:
    def test_scatter_creates_parquet(self, local_backend):
        path = scatter(
            pd.DataFrame({
                "x": [1.0, 2.0, 3.0],
                "y": [4.0, 5.0, 6.0],
                "media": ["https://example.com/a.jpg", "https://example.com/b.jpg", "https://example.com/c.jpg"],
            }),
            x="x", y="y", media="media", show=False,
        )
        assert (path / "data.parquet").exists()
        assert (path / "config.json").exists()
        assert (path / "data.json").exists()

    def test_grid_creates_parquet(self, local_backend):
        path = grid(
            pd.DataFrame({"media": ["https://example.com/a.jpg", "https://example.com/b.jpg", "https://example.com/c.jpg"]}),
            media="media", show=False,
        )
        assert (path / "data.parquet").exists()
        assert (path / "config.json").exists()
        assert (path / "data.json").exists()

    def test_histogram_creates_parquet(self, local_backend):
        path = histogram(
            pd.DataFrame({
                "x": np.random.normal(size=100).tolist(),
                "media": [f"https://example.com/img_{i}.jpg" for i in range(100)],
            }),
            x="x", media="media", show=False,
        )
        assert (path / "data.parquet").exists()
        assert (path / "config.json").exists()
        assert (path / "data.json").exists()

    def test_scatter_with_color(self, local_backend):
        df = pd.DataFrame({
            "x": [1.0, 2.0, 3.0, 4.0],
            "y": [4.0, 5.0, 6.0, 7.0],
            "color": ["a", "b", "a", "b"],
            "media": ["https://example.com/a.jpg", "https://example.com/b.jpg", "https://example.com/c.jpg", "https://example.com/d.jpg"],
        })
        path = scatter(df, x="x", y="y", media="media", color="color", show=False)
        assert (path / "data.parquet").exists()


# ---------------------------------------------------------------------------
# Grid browsing — fetch media items and pagination
# ---------------------------------------------------------------------------


class TestGridBrowsing:
    def test_get_rows_returns_items(self, local_backend):
        uuid, df = _save_scatter(local_backend, n=20)
        loader = DataLoader(uuid, local_backend)
        indices = MediaIndices(media_ids=list(range(20)), page=0)
        items = loader.get_rows(indices)
        assert len(items) > 0
        assert items[0].index is not None
        assert items[0].src is not None
        assert isinstance(items[0].information, dict)

    def test_pagination(self, local_backend):
        uuid, df = _save_scatter(local_backend, n=100)
        loader = DataLoader(uuid, local_backend)
        all_ids = list(range(100))

        page0 = loader.get_rows(MediaIndices(media_ids=all_ids, page=0))
        page1 = loader.get_rows(MediaIndices(media_ids=all_ids, page=1))

        assert len(page0) == 50  # default page size
        assert len(page1) == 50
        page0_ids = {item.index for item in page0}
        page1_ids = {item.index for item in page1}
        assert page0_ids.isdisjoint(page1_ids)

    def test_get_single_row(self, local_backend):
        uuid, df = _save_scatter(local_backend, n=10)
        loader = DataLoader(uuid, local_backend)
        item = loader.get_row(0)
        assert item.index == 0
        assert item.src == "https://example.com/img_0.jpg"
        assert isinstance(item.information, dict)
        assert "x_val" in item.information

    def test_empty_media_ids(self, local_backend):
        uuid, _ = _save_scatter(local_backend, n=10)
        loader = DataLoader(uuid, local_backend)
        items = loader.get_rows(MediaIndices(media_ids=[]))
        assert items == []

    def test_get_rows_metadata(self, local_backend):
        uuid, _ = _save_scatter(local_backend, n=10)
        loader = DataLoader(uuid, local_backend)
        meta = loader.get_rows_metadata(MediaIndices(media_ids=[0, 1, 2]))
        assert len(meta) == 3
        assert "index" in meta[0]
        assert "information" in meta[0]
        assert isinstance(meta[0]["information"], dict)

    def test_sorted_grid(self, local_backend):
        uuid, _ = _save_scatter(local_backend, n=20)
        loader = DataLoader(uuid, local_backend)
        indices = MediaIndices(
            media_ids=list(range(20)),
            page=0,
            sort_column="x_val",
            ascending=True,
        )
        items = loader.get_rows(indices)
        x_vals = [item.information["x_val"] for item in items]
        assert x_vals == sorted(x_vals)


# ---------------------------------------------------------------------------
# Filtering
# ---------------------------------------------------------------------------


class TestFiltering:
    def test_numeric_filter(self, local_backend):
        uuid, df = _save_scatter(local_backend, n=50)
        loader = DataLoader(uuid, local_backend)
        from clusterfun.models.filter import Filter

        result = loader.filter([Filter(column="x_val", comparison=">", values=[50.0])])
        assert isinstance(result, list)
        # result is plot trace data — each trace has an 'id' list
        all_ids = []
        for trace in result:
            all_ids.extend(trace.get("id", []))
        # Should match rows where x_val > 50
        expected = df[df["x_val"] > 50]
        assert len(all_ids) == len(expected)

    def test_categorical_filter(self, local_backend):
        uuid, df = _save_scatter(local_backend, n=50)
        loader = DataLoader(uuid, local_backend)
        from clusterfun.models.filter import Filter

        result = loader.filter([Filter(column="category", comparison="=", values=["cat"])])
        all_ids = []
        for trace in result:
            all_ids.extend(trace.get("id", []))
        expected = df[df["category"] == "cat"]
        assert len(all_ids) == len(expected)

    def test_filter_via_api(self, local_backend, client):
        uuid, df = _save_scatter(local_backend, n=50)
        resp = client.post(
            f"/api/views/{uuid}/filter",
            json=[{"column": "x_val", "comparison": ">", "values": [50.0]}],
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


# ---------------------------------------------------------------------------
# Media loading via API
# ---------------------------------------------------------------------------


class TestMediaAPI:
    def test_read_single_media(self, local_backend, client):
        uuid, _ = _save_scatter(local_backend, n=10)
        resp = client.get(f"/api/views/{uuid}/media/0")
        assert resp.status_code == 200
        item = resp.json()
        assert item["index"] == 0
        assert "src" in item

    def test_read_multiple_media(self, local_backend, client):
        uuid, _ = _save_scatter(local_backend, n=10)
        resp = client.post(
            f"/api/views/{uuid}/media",
            json={"media_ids": [0, 1, 2], "page": 0},
        )
        assert resp.status_code == 200
        items = resp.json()
        assert len(items) == 3

    def test_read_media_metadata(self, local_backend, client):
        uuid, _ = _save_scatter(local_backend, n=10)
        resp = client.post(
            f"/api/views/{uuid}/media-metadata",
            json={"media_ids": [0, 1, 2]},
        )
        assert resp.status_code == 200
        meta = resp.json()
        assert len(meta) == 3
        assert "information" in meta[0]


# ---------------------------------------------------------------------------
# Labels: save, delete, count, download
# ---------------------------------------------------------------------------


class TestLabels:
    def test_save_and_read_labels(self, local_backend, client):
        uuid, _ = _save_scatter(local_backend, n=10)
        # Save label
        resp = client.post(
            f"/api/views/{uuid}/label",
            json={"title": "good"},
            params={"media_indices": ""},  # not used this way
        )
        # The endpoint expects both label and media_indices as JSON body
        # Let's use the loader directly for label operations
        loader = DataLoader(uuid, local_backend)
        loader.label_manager.save_label("good", [0, 1, 2])

        labels = loader.label_manager.read_labels()
        assert "0" in labels
        assert "good" in labels["0"]
        assert len(labels) == 3

    def test_delete_label(self, local_backend):
        uuid, _ = _save_scatter(local_backend, n=10)
        loader = DataLoader(uuid, local_backend)
        loader.label_manager.save_label("good", [0, 1, 2])
        loader.label_manager.delete_label("good", [1])

        labels = loader.label_manager.read_labels()
        assert "0" in labels
        assert "1" not in labels  # deleted
        assert "2" in labels

    def test_label_counts(self, local_backend):
        uuid, _ = _save_scatter(local_backend, n=10)
        loader = DataLoader(uuid, local_backend)
        loader.label_manager.save_label("good", [0, 1, 2])
        loader.label_manager.save_label("bad", [3, 4])

        from clusterfun.storage.local.label_manager import count_labels

        labels = loader.label_manager.read_labels()
        counts = count_labels(labels, [0, 1, 2, 3])
        count_dict = {c["label"]: c for c in counts}

        assert count_dict["good"]["inCurrentSelection"] == 3
        assert count_dict["good"]["inEntireDataset"] == 3
        assert count_dict["bad"]["inCurrentSelection"] == 1
        assert count_dict["bad"]["inEntireDataset"] == 2

    def test_label_counts_via_api(self, local_backend, client):
        uuid, _ = _save_scatter(local_backend, n=10)
        loader = DataLoader(uuid, local_backend)
        loader.label_manager.save_label("positive", [0, 1])

        resp = client.post(
            f"/api/views/{uuid}/labels-count",
            json={"media_ids": [0, 1, 2]},
        )
        assert resp.status_code == 200
        counts = resp.json()
        assert len(counts) == 1
        assert counts[0]["label"] == "positive"
        assert counts[0]["inCurrentSelection"] == 2

    def test_label_appears_in_config(self, local_backend):
        uuid, _ = _save_scatter(local_backend, n=10)
        loader = DataLoader(uuid, local_backend)
        loader.label_manager.save_label("verified", [0])

        config = loader.load_config()
        assert "verified" in config.labels

    def test_label_download(self, local_backend, client):
        uuid, _ = _save_scatter(local_backend, n=10)
        loader = DataLoader(uuid, local_backend)
        loader.label_manager.save_label("good", [0, 1])
        loader.label_manager.save_label("bad", [2])

        resp = client.post(
            f"/api/views/{uuid}/label-download",
            json={"label": {"title": "good"}, "media_indices": {"media_ids": []}},
        )
        assert resp.status_code == 200
        assert resp.headers["content-type"] == "text/csv; charset=utf-8"
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) >= 2  # header + at least 1 data row
        header = rows[0]
        assert "media_id" in header
        assert "good" in header


# ---------------------------------------------------------------------------
# Column stats and values
# ---------------------------------------------------------------------------


class TestColumnStats:
    def test_columns_endpoint(self, local_backend, client):
        uuid, _ = _save_scatter(local_backend, n=10)
        resp = client.get(f"/api/views/{uuid}/columns")
        assert resp.status_code == 200
        cols = resp.json()
        col_names = [c["name"] for c in cols]
        assert "id" in col_names
        assert "x_val" in col_names
        assert "category" in col_names

    def test_numeric_column_stats(self, local_backend, client):
        uuid, _ = _save_scatter(local_backend, n=50)
        resp = client.post(
            f"/api/views/{uuid}/column-stats",
            json={"media_ids": list(range(50)), "column": "x_val"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "numeric"
        assert len(data["bins"]) > 0
        assert len(data["counts"]) > 0
        assert data["min"] < data["max"]

    def test_categorical_column_stats(self, local_backend, client):
        uuid, _ = _save_scatter(local_backend, n=50)
        resp = client.post(
            f"/api/views/{uuid}/column-stats",
            json={"media_ids": list(range(50)), "column": "category"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "categorical"
        labels = [d["label"] for d in data["data"]]
        assert set(labels) == {"cat", "dog", "bird"}
        total = sum(d["count"] for d in data["data"])
        assert total == 50

    def test_column_values(self, local_backend, client):
        uuid, _ = _save_scatter(local_backend, n=20)
        resp = client.post(
            f"/api/views/{uuid}/columns/category/values",
            json={"media_ids": list(range(20))},
        )
        assert resp.status_code == 200
        values = resp.json()
        labels = [v["label"] for v in values]
        for label in labels:
            assert label in ["cat", "dog", "bird"]

    def test_nonexistent_column_stats(self, local_backend, client):
        uuid, _ = _save_scatter(local_backend, n=10)
        resp = client.post(
            f"/api/views/{uuid}/column-stats",
            json={"media_ids": list(range(10)), "column": "nonexistent"},
        )
        assert resp.status_code == 200
        assert resp.json()["type"] == "empty"


# ---------------------------------------------------------------------------
# CSV download
# ---------------------------------------------------------------------------


class TestCSVDownload:
    def test_download_grid_csv(self, local_backend, client):
        uuid, df = _save_scatter(local_backend, n=20)
        resp = client.post(
            f"/api/views/{uuid}/download-grid",
            json={"media_ids": [0, 1, 2, 3, 4]},
        )
        assert resp.status_code == 200
        assert "text/csv" in resp.headers["content-type"]
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        header = rows[0]
        assert "id" in header
        assert "img_path" in header
        assert len(rows) == 6  # header + 5 data rows

    def test_download_all_data(self, local_backend, client):
        uuid, df = _save_scatter(local_backend, n=15)
        resp = client.post(
            f"/api/views/{uuid}/download-grid",
            json={"media_ids": list(range(15))},
        )
        assert resp.status_code == 200
        reader = csv.reader(io.StringIO(resp.text))
        rows = list(reader)
        assert len(rows) == 16  # header + 15 data rows


# ---------------------------------------------------------------------------
# View and config API
# ---------------------------------------------------------------------------


class TestViewAPI:
    def test_read_view(self, local_backend, client):
        uuid, _ = _save_scatter(local_backend, n=10)
        resp = client.get(f"/api/views/{uuid}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["uuid"] == uuid
        assert "data" in data
        assert "config" in data
        assert data["config"]["type"] == "scatter"

    def test_read_config(self, local_backend, client):
        uuid, _ = _save_scatter(local_backend, n=10)
        resp = client.get(f"/api/views/{uuid}/config")
        assert resp.status_code == 200
        cfg = resp.json()
        assert cfg["type"] == "scatter"
        assert cfg["x"] == "x_val"
        assert cfg["y"] == "y_val"

    def test_get_dataframe(self, local_backend):
        uuid, original_df = _save_scatter(local_backend, n=20)
        loader = DataLoader(uuid, local_backend)
        df = loader.get_dataframe()
        assert len(df) == 20
        assert "id" in df.columns
        assert "x_val" in df.columns

    def test_get_dataframe_with_selection(self, local_backend):
        uuid, _ = _save_scatter(local_backend, n=20)
        loader = DataLoader(uuid, local_backend)
        df = loader.get_dataframe(media_indices=MediaIndices(media_ids=[0, 1, 2]))
        assert len(df) == 3
