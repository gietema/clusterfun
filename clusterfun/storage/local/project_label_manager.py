"""Project-level label manager — labels keyed by media path, shared across views."""

from typing import Any, Dict, List, Optional

import pandas as pd

from clusterfun.storage.backends.base import StorageBackend
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

    # ── Internal: index ↔ path mapping ──

    def _ensure_mapping(self) -> None:
        """Build the id ↔ original-media-path mapping (lazy, cached per instance)."""
        if self._id_to_path is not None:
            return

        # Try precomputed mapping first (written at save time)
        if self.backend.json_exists(self.uuid, "id_to_path.json"):
            raw = self.backend.load_json(self.uuid, "id_to_path.json")
            self._id_to_path = {int(k): v for k, v in raw.items()}
        else:
            # Fallback: query DB for id + media column
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

    def _to_original_path(self, src: str) -> str:
        """Convert a stored /media/... path back to the original absolute path."""
        if self.common_media_path and src.startswith("/media"):
            return src.replace("/media", self.common_media_path, 1)
        return src

    def _ids_to_paths(self, media_indices: List[int]) -> List[str]:
        self._ensure_mapping()
        assert self._id_to_path is not None
        return [self._id_to_path[i] for i in media_indices if i in self._id_to_path]

    # ── Project-level label storage ──

    def _read_project_labels(self) -> Dict[str, List[str]]:
        """Read labels from project store (keyed by media path)."""
        if not self.backend.project_json_exists(self.project, "labels.json"):
            return {}
        return self.backend.load_project_json(self.project, "labels.json")

    def _write_project_labels(self, labels: Dict[str, List[str]]) -> None:
        self.backend.save_project_json(self.project, "labels.json", labels)

    # ── Public interface (same as LabelManager) ──

    def read_labels(self) -> Dict[str, List[str]]:
        """Read project labels, returned as {str(media_index): [labels]} for this view."""
        self._ensure_mapping()
        assert self._path_to_id is not None
        project_labels = self._read_project_labels()

        result: Dict[str, List[str]] = {}
        for path, label_list in project_labels.items():
            if path in self._path_to_id:
                result[str(self._path_to_id[path])] = label_list
        return result

    def save_label(self, label: str, media_indices: List[int]) -> None:
        paths = self._ids_to_paths(media_indices)
        labels = self._read_project_labels()
        for path in paths:
            labels.setdefault(path, [])
            if label not in labels[path]:
                labels[path].append(label)
        self._write_project_labels(labels)

    def delete_label(self, label: str, media_indices: List[int]) -> None:
        paths = self._ids_to_paths(media_indices)
        labels = self._read_project_labels()
        for path in paths:
            if path in labels and label in labels[path]:
                labels[path].remove(label)
                if not labels[path]:
                    del labels[path]
        self._write_project_labels(labels)

    def get_dataframe(self, label: Optional[str] = None) -> pd.DataFrame:
        """Get labels as a DataFrame with media_id and per-label columns."""
        # Use index-based view for compatibility with existing code
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
