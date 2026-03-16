"""Project-level label manager — labels keyed by media path, shared across views.

Uses SQLite for atomic read/write operations. Automatically migrates
existing project labels.json files on first access.
"""

from typing import Dict, List, Optional

import pandas as pd

from clusterfun.storage.backends.base import StorageBackend
from clusterfun.storage.label_db import (
    migrate_project_labels,
    read_project_labels,
    save_project_labels,
    delete_project_labels,
)
from clusterfun.storage.query import run_query


class ProjectLabelManager:
    """CRUD for project-level labels, keyed by original media path."""

    def __init__(
        self,
        uuid: str,
        project: str,
        backend: StorageBackend,
        media_column: str,
        common_media_path: Optional[str] = None,
    ):
        self.uuid = uuid
        self.project = project
        self.backend = backend
        self.media_column = media_column
        self.common_media_path = common_media_path
        self._id_to_path: Optional[Dict[int, str]] = None
        self._path_to_id: Optional[Dict[str, int]] = None
        self._migrated = False

    def _ensure_migrated(self) -> None:
        if not self._migrated:
            migrate_project_labels(self.project, self.backend)
            self._migrated = True

    # ── Internal: index <-> path mapping ──

    def _ensure_mapping(self) -> None:
        if self._id_to_path is not None:
            return

        if self.backend.json_exists(self.uuid, "id_to_path.json"):
            # Legacy JSON format
            raw = self.backend.load_json(self.uuid, "id_to_path.json")
            self._id_to_path = {int(k): v for k, v in raw.items()}
        elif self._try_load_parquet_mapping():
            pass  # loaded from Parquet
        else:
            # Fallback: query the database directly
            rows = run_query(
                self.uuid,
                self.backend,
                f"SELECT id, {self.media_column} FROM database",
            )
            self._id_to_path = {}
            for row in rows:
                media_id, src = row[0], row[1]
                self._id_to_path[media_id] = self._to_original_path(str(src))

        self._path_to_id = {v: k for k, v in self._id_to_path.items()}

    def _try_load_parquet_mapping(self) -> bool:
        """Try to load id-to-path mapping from Parquet file."""
        try:
            import pyarrow.parquet as pq

            uri = self.backend.get_parquet_uri_named(self.uuid, "id_to_path.parquet")
            import os
            if not os.path.exists(uri):
                return False
            table = pq.read_table(uri)
            ids = table.column("id").to_pylist()
            paths = table.column("path").to_pylist()
            self._id_to_path = dict(zip(ids, paths))
            return True
        except Exception:
            return False

    def _to_original_path(self, src: str) -> str:
        if self.common_media_path and src.startswith("/media"):
            return src.replace("/media", self.common_media_path, 1)
        return src

    def _ids_to_paths(self, media_indices: List[int]) -> List[str]:
        self._ensure_mapping()
        assert self._id_to_path is not None
        return [self._id_to_path[i] for i in media_indices if i in self._id_to_path]

    # ── Public interface (same as LabelManager) ──

    def read_labels(self) -> Dict[str, List[str]]:
        """Read project labels, returned as {str(media_index): [labels]} for this view."""
        self._ensure_migrated()
        self._ensure_mapping()
        assert self._path_to_id is not None
        project_labels = read_project_labels(self.project)

        result: Dict[str, List[str]] = {}
        for path, label_list in project_labels.items():
            if path in self._path_to_id:
                result[str(self._path_to_id[path])] = label_list
        return result

    def save_label(self, label: str, media_indices: List[int]) -> None:
        self._ensure_migrated()
        paths = self._ids_to_paths(media_indices)
        save_project_labels(self.project, label, paths)

    def delete_label(self, label: str, media_indices: List[int]) -> None:
        self._ensure_migrated()
        paths = self._ids_to_paths(media_indices)
        delete_project_labels(self.project, label, paths)

    def get_dataframe(self, label: Optional[str] = None) -> pd.DataFrame:
        """Get labels as a DataFrame with media_id and per-label columns."""
        index_labels = self.read_labels()
        if not index_labels:
            return pd.DataFrame(columns=["media_id"])
        df = pd.DataFrame(index_labels.items(), columns=["media_id", "_labels"])
        df["_labels"] = df["_labels"].apply("|".join)
        df = df.join(df["_labels"].str.get_dummies(sep="|"))
        df = df.drop("_labels", axis=1)
        df["media_id"] = df["media_id"].astype(int)
        if label:
            df = df[df[label] == 1]
        return df
