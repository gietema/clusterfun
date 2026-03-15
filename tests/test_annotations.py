"""Tests for annotation management — storage manager and API routes."""

import pytest
from fastapi.testclient import TestClient

import numpy as np
import pandas as pd

import clusterfun.storage.backends as backends_module
from clusterfun.config import Config
from clusterfun.main import APP
from clusterfun.storage.backends.local import LocalBackend
from clusterfun.storage.data_loader import DataLoader
from clusterfun.storage.local.annotation_manager import AnnotationManager
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
    from clusterfun.models.filter import _column_values_cache

    _column_values_cache.clear()
    from clusterfun.storage.data_loader import _config_cache

    _config_cache.clear()


@pytest.fixture()
def client():
    return TestClient(APP)


def _save_scatter(backend, n=10):
    import uuid as _uuid

    uuid = str(_uuid.uuid4())
    np.random.seed(42)
    df = pd.DataFrame(
        {
            "img_path": [f"https://example.com/img_{i}.jpg" for i in range(n)],
            "x_val": np.random.uniform(0, 100, n).tolist(),
            "y_val": np.random.uniform(0, 100, n).tolist(),
        }
    )
    cfg = Config(
        type="scatter",
        media="img_path",
        columns=["id", "img_path", "x_val", "y_val"],
        x="x_val",
        y="y_val",
    )
    storer = LocalStorer(backend=backend)
    storer.save(uuid, df, cfg)
    return uuid


RECT_ANN = {
    "id": "ann_1",
    "type": "rectangle",
    "label": "car",
    "color": "#ff0000",
    "data": {"xmin": 10, "ymin": 20, "xmax": 100, "ymax": 200},
}

POLY_ANN = {
    "id": "ann_2",
    "type": "polygon",
    "label": "tree",
    "color": "#00ff00",
    "data": {"points": [[10, 10], [50, 10], [50, 50], [10, 50]]},
}


# ---------------------------------------------------------------------------
# AnnotationManager unit tests
# ---------------------------------------------------------------------------


class TestAnnotationManager:
    def _make_manager(self, backend, uuid="ann-test"):
        backend.save_json(uuid, "config.json", {"type": "scatter"})
        return AnnotationManager(uuid, backend)

    def test_read_empty(self, local_backend):
        am = self._make_manager(local_backend, "ann-empty")
        assert am.get_annotations(0) == []

    def test_save_and_read(self, local_backend):
        am = self._make_manager(local_backend, "ann-save")
        am.save_annotations(0, [RECT_ANN])
        result = am.get_annotations(0)
        assert len(result) == 1
        assert result[0]["id"] == "ann_1"
        assert result[0]["type"] == "rectangle"
        assert result[0]["data"]["xmin"] == 10

    def test_save_replaces_existing(self, local_backend):
        am = self._make_manager(local_backend, "ann-replace")
        am.save_annotations(0, [RECT_ANN])
        am.save_annotations(0, [POLY_ANN])
        result = am.get_annotations(0)
        assert len(result) == 1
        assert result[0]["id"] == "ann_2"

    def test_save_multiple_media_items(self, local_backend):
        am = self._make_manager(local_backend, "ann-multi")
        am.save_annotations(0, [RECT_ANN])
        am.save_annotations(1, [POLY_ANN])
        assert len(am.get_annotations(0)) == 1
        assert len(am.get_annotations(1)) == 1
        assert am.get_annotations(0)[0]["label"] == "car"
        assert am.get_annotations(1)[0]["label"] == "tree"

    def test_delete_single_annotation(self, local_backend):
        am = self._make_manager(local_backend, "ann-del")
        am.save_annotations(0, [RECT_ANN, POLY_ANN])
        am.delete_annotation(0, "ann_1")
        result = am.get_annotations(0)
        assert len(result) == 1
        assert result[0]["id"] == "ann_2"

    def test_delete_last_annotation_removes_key(self, local_backend):
        am = self._make_manager(local_backend, "ann-del-last")
        am.save_annotations(0, [RECT_ANN])
        am.delete_annotation(0, "ann_1")
        assert am.get_annotations(0) == []
        assert am.get_all_annotations() == {}

    def test_delete_nonexistent_annotation(self, local_backend):
        am = self._make_manager(local_backend, "ann-del-ghost")
        am.save_annotations(0, [RECT_ANN])
        am.delete_annotation(0, "ghost_id")  # should not raise
        assert len(am.get_annotations(0)) == 1

    def test_delete_from_nonexistent_media(self, local_backend):
        am = self._make_manager(local_backend, "ann-del-nomedia")
        am.delete_annotation(99, "ghost_id")  # no-op
        assert am.get_all_annotations() == {}

    def test_save_empty_list_removes_key(self, local_backend):
        am = self._make_manager(local_backend, "ann-empty-save")
        am.save_annotations(0, [RECT_ANN])
        am.save_annotations(0, [])
        assert am.get_all_annotations() == {}

    def test_get_all_annotations(self, local_backend):
        am = self._make_manager(local_backend, "ann-all")
        am.save_annotations(0, [RECT_ANN])
        am.save_annotations(5, [POLY_ANN])
        all_anns = am.get_all_annotations()
        assert len(all_anns) == 2
        assert "0" in all_anns
        assert "5" in all_anns

    def test_annotation_counts(self, local_backend):
        am = self._make_manager(local_backend, "ann-counts")
        am.save_annotations(0, [RECT_ANN, POLY_ANN])
        am.save_annotations(1, [RECT_ANN])
        counts = am.get_annotation_counts()
        assert counts["0"] == 2
        assert counts["1"] == 1

    def test_export_all(self, local_backend):
        am = self._make_manager(local_backend, "ann-export")
        am.save_annotations(0, [RECT_ANN])
        am.save_annotations(1, [POLY_ANN])
        exported = am.export()
        assert len(exported) == 2
        assert all("media_id" in e for e in exported)
        media_ids = {e["media_id"] for e in exported}
        assert media_ids == {0, 1}

    def test_export_filtered_by_media_ids(self, local_backend):
        am = self._make_manager(local_backend, "ann-export-filter")
        am.save_annotations(0, [RECT_ANN])
        am.save_annotations(1, [POLY_ANN])
        exported = am.export(media_ids=[0])
        assert len(exported) == 1
        assert exported[0]["media_id"] == 0


# ---------------------------------------------------------------------------
# DataLoader integration — annotation_manager property
# ---------------------------------------------------------------------------


class TestDataLoaderAnnotationManager:
    def test_annotation_manager_property(self, local_backend):
        uuid = _save_scatter(local_backend)
        loader = DataLoader(uuid, local_backend)
        am = loader.annotation_manager
        assert isinstance(am, AnnotationManager)
        # Same instance on second access
        assert loader.annotation_manager is am

    def test_annotation_manager_crud(self, local_backend):
        uuid = _save_scatter(local_backend)
        loader = DataLoader(uuid, local_backend)
        loader.annotation_manager.save_annotations(0, [RECT_ANN])
        result = loader.annotation_manager.get_annotations(0)
        assert len(result) == 1
        assert result[0]["label"] == "car"


# ---------------------------------------------------------------------------
# API route tests
# ---------------------------------------------------------------------------


class TestAnnotationAPI:
    def test_get_annotations_empty(self, local_backend, client):
        uuid = _save_scatter(local_backend)
        resp = client.get(f"/api/views/{uuid}/annotations/0")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_save_and_get_annotations(self, local_backend, client):
        uuid = _save_scatter(local_backend)
        resp = client.post(
            f"/api/views/{uuid}/annotations",
            json={"media_id": 0, "annotations": [RECT_ANN, POLY_ANN]},
        )
        assert resp.status_code == 200
        assert resp.json() == "OK"

        resp = client.get(f"/api/views/{uuid}/annotations/0")
        assert resp.status_code == 200
        anns = resp.json()
        assert len(anns) == 2
        assert anns[0]["id"] == "ann_1"
        assert anns[1]["id"] == "ann_2"

    def test_save_replaces_via_api(self, local_backend, client):
        uuid = _save_scatter(local_backend)
        client.post(
            f"/api/views/{uuid}/annotations",
            json={"media_id": 0, "annotations": [RECT_ANN, POLY_ANN]},
        )
        # Replace with only one
        client.post(
            f"/api/views/{uuid}/annotations",
            json={"media_id": 0, "annotations": [POLY_ANN]},
        )
        resp = client.get(f"/api/views/{uuid}/annotations/0")
        anns = resp.json()
        assert len(anns) == 1
        assert anns[0]["id"] == "ann_2"

    def test_delete_annotation_via_api(self, local_backend, client):
        uuid = _save_scatter(local_backend)
        client.post(
            f"/api/views/{uuid}/annotations",
            json={"media_id": 0, "annotations": [RECT_ANN, POLY_ANN]},
        )
        resp = client.request(
            "DELETE",
            f"/api/views/{uuid}/annotations",
            json={"media_id": 0, "annotation_id": "ann_1"},
        )
        assert resp.status_code == 200

        resp = client.get(f"/api/views/{uuid}/annotations/0")
        anns = resp.json()
        assert len(anns) == 1
        assert anns[0]["id"] == "ann_2"

    def test_export_annotations_via_api(self, local_backend, client):
        uuid = _save_scatter(local_backend)
        client.post(
            f"/api/views/{uuid}/annotations",
            json={"media_id": 0, "annotations": [RECT_ANN]},
        )
        client.post(
            f"/api/views/{uuid}/annotations",
            json={"media_id": 1, "annotations": [POLY_ANN]},
        )

        resp = client.post(
            f"/api/views/{uuid}/annotations/export",
            json={"media_ids": None},
        )
        assert resp.status_code == 200
        exported = resp.json()
        assert len(exported) == 2

    def test_export_filtered_via_api(self, local_backend, client):
        uuid = _save_scatter(local_backend)
        client.post(
            f"/api/views/{uuid}/annotations",
            json={"media_id": 0, "annotations": [RECT_ANN]},
        )
        client.post(
            f"/api/views/{uuid}/annotations",
            json={"media_id": 1, "annotations": [POLY_ANN]},
        )

        resp = client.post(
            f"/api/views/{uuid}/annotations/export",
            json={"media_ids": [1]},
        )
        assert resp.status_code == 200
        exported = resp.json()
        assert len(exported) == 1
        assert exported[0]["media_id"] == 1

    def test_annotation_data_integrity(self, local_backend, client):
        """Verify that annotation data round-trips correctly through the API."""
        uuid = _save_scatter(local_backend)
        client.post(
            f"/api/views/{uuid}/annotations",
            json={"media_id": 0, "annotations": [RECT_ANN]},
        )
        resp = client.get(f"/api/views/{uuid}/annotations/0")
        ann = resp.json()[0]
        assert ann["data"]["xmin"] == 10
        assert ann["data"]["ymin"] == 20
        assert ann["data"]["xmax"] == 100
        assert ann["data"]["ymax"] == 200
        assert ann["label"] == "car"
        assert ann["color"] == "#ff0000"

    def test_polygon_data_integrity(self, local_backend, client):
        """Verify polygon points round-trip correctly."""
        uuid = _save_scatter(local_backend)
        client.post(
            f"/api/views/{uuid}/annotations",
            json={"media_id": 0, "annotations": [POLY_ANN]},
        )
        resp = client.get(f"/api/views/{uuid}/annotations/0")
        ann = resp.json()[0]
        assert ann["data"]["points"] == [[10, 10], [50, 10], [50, 50], [10, 50]]
        assert ann["type"] == "polygon"
