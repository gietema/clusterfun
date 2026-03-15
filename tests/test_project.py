"""Tests for the project system — project-level labels, ProjectLabelManager, serve_cli resolution."""

import json

import numpy as np
import pandas as pd
import pytest

from clusterfun.plot_types.scatter import scatter
from clusterfun.project import get_labels, get_labels_df, list_projects
from clusterfun.storage.backends import get_backend
from clusterfun.storage.factory import get_loader


def _make_df(n=100):
    df = pd.DataFrame()
    df["x"] = np.random.uniform(size=n)
    df["y"] = np.random.uniform(size=n)
    df["media"] = [f"https://example.com/img_{i}.jpg" for i in range(n)]
    return df


class TestProjectSave:
    """Test that saving a plot with project= registers the project correctly."""

    def test_save_creates_project_manifest(self, cache_dir):
        df = _make_df()
        scatter(df, x="x", y="y", media="media", project="test-project", show=False)

        backend = get_backend()
        assert backend.project_json_exists("test-project", "project.json")
        manifest = backend.load_project_json("test-project", "project.json")
        assert manifest["name"] == "test-project"
        assert len(manifest["views"]) == 1
        assert manifest["views"][0]["type"] == "scatter"

    def test_save_creates_id_to_path_mapping(self, cache_dir):
        df = _make_df(10)
        cache_path = scatter(
            df, x="x", y="y", media="media", project="test-project", show=False
        )
        uuid = cache_path.stem

        backend = get_backend()
        assert backend.json_exists(uuid, "id_to_path.json")
        mapping = backend.load_json(uuid, "id_to_path.json")
        assert len(mapping) == 10
        # All values should be the original URLs
        for path in mapping.values():
            assert path.startswith("https://example.com/img_")

    def test_multiple_views_same_project(self, cache_dir):
        df = _make_df(20)
        scatter(df, x="x", y="y", media="media", project="multi", show=False)
        scatter(df, x="x", y="y", media="media", project="multi", show=False)

        backend = get_backend()
        manifest = backend.load_project_json("multi", "project.json")
        assert len(manifest["views"]) == 2

    def test_save_without_project_no_manifest(self, cache_dir):
        df = _make_df(10)
        scatter(df, x="x", y="y", media="media", show=False)

        backend = get_backend()
        assert backend.list_projects() == []


class TestProjectLabelManager:
    """Test ProjectLabelManager CRUD through the DataLoader."""

    def test_save_and_read_labels(self, cache_dir):
        df = _make_df(10)
        cache_path = scatter(
            df, x="x", y="y", media="media", project="label-test", show=False
        )
        uuid = cache_path.stem

        loader = get_loader(uuid)
        lm = loader.label_manager

        # Initially empty
        assert lm.read_labels() == {}

        # Save a label for items 0 and 1
        lm.save_label("good", [0, 1])
        labels = lm.read_labels()
        assert "0" in labels
        assert "1" in labels
        assert labels["0"] == ["good"]
        assert labels["1"] == ["good"]

    def test_labels_keyed_by_media_path(self, cache_dir):
        df = _make_df(10)
        cache_path = scatter(
            df, x="x", y="y", media="media", project="path-key-test", show=False
        )
        uuid = cache_path.stem

        loader = get_loader(uuid)
        lm = loader.label_manager
        lm.save_label("cat", [3])

        # Check project-level storage is keyed by path
        backend = get_backend()
        project_labels = backend.load_project_json("path-key-test", "labels.json")
        paths = list(project_labels.keys())
        assert len(paths) == 1
        assert "img_3" in paths[0]  # original media path

    def test_delete_label(self, cache_dir):
        df = _make_df(10)
        cache_path = scatter(
            df, x="x", y="y", media="media", project="del-test", show=False
        )
        uuid = cache_path.stem

        loader = get_loader(uuid)
        lm = loader.label_manager
        lm.save_label("good", [0, 1])
        lm.delete_label("good", [0])

        labels = lm.read_labels()
        assert "0" not in labels
        assert "1" in labels

    def test_multi_label(self, cache_dir):
        df = _make_df(10)
        cache_path = scatter(
            df, x="x", y="y", media="media", project="multi-label", show=False
        )
        uuid = cache_path.stem

        loader = get_loader(uuid)
        lm = loader.label_manager
        lm.save_label("good", [0])
        lm.save_label("sharp", [0])

        labels = lm.read_labels()
        assert sorted(labels["0"]) == ["good", "sharp"]

    def test_duplicate_label_not_added(self, cache_dir):
        df = _make_df(10)
        cache_path = scatter(
            df, x="x", y="y", media="media", project="dup-test", show=False
        )
        uuid = cache_path.stem

        loader = get_loader(uuid)
        lm = loader.label_manager
        lm.save_label("good", [0])
        lm.save_label("good", [0])

        labels = lm.read_labels()
        assert labels["0"] == ["good"]

    def test_labels_shared_across_views(self, cache_dir):
        df = _make_df(10)
        path1 = scatter(
            df, x="x", y="y", media="media", project="shared", show=False
        )
        path2 = scatter(
            df, x="x", y="y", media="media", project="shared", show=False
        )

        # Label via view 1
        loader1 = get_loader(path1.stem)
        loader1.label_manager.save_label("good", [5])

        # Read from view 2 — should see the label
        loader2 = get_loader(path2.stem)
        labels = loader2.label_manager.read_labels()
        assert "5" in labels
        assert labels["5"] == ["good"]

    def test_get_dataframe(self, cache_dir):
        df = _make_df(10)
        cache_path = scatter(
            df, x="x", y="y", media="media", project="df-test", show=False
        )
        uuid = cache_path.stem

        loader = get_loader(uuid)
        lm = loader.label_manager
        lm.save_label("good", [0, 1])
        lm.save_label("bad", [1])

        result = lm.get_dataframe()
        assert "media_id" in result.columns
        assert "good" in result.columns
        assert "bad" in result.columns
        assert len(result) == 2

    def test_config_includes_labels(self, cache_dir):
        df = _make_df(10)
        cache_path = scatter(
            df, x="x", y="y", media="media", project="cfg-labels", show=False
        )
        uuid = cache_path.stem

        loader = get_loader(uuid)
        loader.label_manager.save_label("good", [0])
        loader.label_manager.save_label("bad", [1])

        config = loader.load_config()
        assert sorted(config.labels) == ["bad", "good"]


class TestPublicAPI:
    """Test the public Python API in clusterfun.project."""

    def test_list_projects_empty(self, cache_dir):
        assert list_projects() == []

    def test_list_projects(self, cache_dir):
        df = _make_df(10)
        scatter(df, x="x", y="y", media="media", project="proj-a", show=False)
        scatter(df, x="x", y="y", media="media", project="proj-b", show=False)

        projects = list_projects()
        assert sorted(projects) == ["proj-a", "proj-b"]

    def test_get_labels_empty(self, cache_dir):
        df = _make_df(10)
        scatter(df, x="x", y="y", media="media", project="empty-labels", show=False)
        assert get_labels("empty-labels") == {}

    def test_get_labels(self, cache_dir):
        df = _make_df(10)
        cache_path = scatter(
            df, x="x", y="y", media="media", project="api-labels", show=False
        )
        loader = get_loader(cache_path.stem)
        loader.label_manager.save_label("good", [0, 2])

        labels = get_labels("api-labels")
        assert len(labels) == 2
        for path, label_list in labels.items():
            assert "good" in label_list

    def test_get_labels_df(self, cache_dir):
        df = _make_df(10)
        cache_path = scatter(
            df, x="x", y="y", media="media", project="api-df", show=False
        )
        loader = get_loader(cache_path.stem)
        loader.label_manager.save_label("good", [0])
        loader.label_manager.save_label("bad", [0])

        result = get_labels_df("api-df")
        assert "media_path" in result.columns
        assert "good" in result.columns
        assert "bad" in result.columns
        assert len(result) == 1

    def test_get_labels_df_filtered(self, cache_dir):
        df = _make_df(10)
        cache_path = scatter(
            df, x="x", y="y", media="media", project="api-filter", show=False
        )
        loader = get_loader(cache_path.stem)
        loader.label_manager.save_label("good", [0, 1])
        loader.label_manager.save_label("bad", [2])

        good_only = get_labels_df("api-filter", label="good")
        assert len(good_only) == 2

        bad_only = get_labels_df("api-filter", label="bad")
        assert len(bad_only) == 1


class TestServeCLIProjectResolution:
    """Test project name resolution in serve_cli."""

    def test_resolve_project_uuid(self, cache_dir):
        from clusterfun.serve_cli import _resolve_project_uuid

        df = _make_df(10)
        cache_path = scatter(
            df, x="x", y="y", media="media", project="cli-test", show=False
        )
        expected_uuid = cache_path.stem

        backend = get_backend()
        resolved = _resolve_project_uuid(backend, "cli-test")
        assert resolved == expected_uuid

    def test_resolve_project_most_recent_view(self, cache_dir):
        from clusterfun.serve_cli import _resolve_project_uuid

        df = _make_df(10)
        scatter(df, x="x", y="y", media="media", project="multi-view", show=False)
        path2 = scatter(
            df, x="x", y="y", media="media", project="multi-view", show=False
        )

        backend = get_backend()
        resolved = _resolve_project_uuid(backend, "multi-view")
        assert resolved == path2.stem  # most recent

    def test_resolve_nonexistent_project(self, cache_dir):
        from clusterfun.serve_cli import _resolve_project_uuid

        backend = get_backend()
        with pytest.raises(FileNotFoundError, match="No project found"):
            _resolve_project_uuid(backend, "nonexistent")
