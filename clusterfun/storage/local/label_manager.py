"""Label manager for CRUD label management.

Uses SQLite for atomic read/write operations. Automatically migrates
existing labels.json files on first access.
"""

from collections import Counter
from typing import Any, Dict, List, Optional

import pandas as pd

from clusterfun.storage.backends.base import StorageBackend
from clusterfun.storage.label_db import (
    migrate_view_labels,
    read_view_labels,
    save_view_labels,
    delete_view_labels,
)


class LabelManager:
    """CRUD for labels, backed by SQLite."""

    def __init__(self, uuid: str, backend: StorageBackend):
        self.uuid = uuid
        self.backend = backend
        self._migrated = False

    def _ensure_migrated(self) -> None:
        if not self._migrated:
            migrate_view_labels(self.uuid, self.backend)
            self._migrated = True

    def read_labels(self) -> Dict[str, List[str]]:
        """Read all labels for this view."""
        self._ensure_migrated()
        return read_view_labels(self.uuid)

    def save_label(self, label: str, media_indices: List[int]) -> None:
        """Add a label to media items (atomic, no race conditions)."""
        self._ensure_migrated()
        save_view_labels(self.uuid, label, media_indices)

    def delete_label(self, label: str, media_indices: List[int]) -> None:
        """Remove a label from media items (atomic)."""
        self._ensure_migrated()
        delete_view_labels(self.uuid, label, media_indices)

    def get_dataframe(self, label: Optional[str] = None) -> pd.DataFrame:
        """Get labels as a one-hot encoded DataFrame."""
        labels = self.read_labels()
        if not labels:
            return pd.DataFrame(columns=["media_id"])
        df = pd.DataFrame(labels.items(), columns=["media_id", "_labels"])
        df["_labels"] = df["_labels"].apply("|".join)
        df = df.join(df["_labels"].str.get_dummies(sep="|"))
        df = df.drop("_labels", axis=1)
        df["media_id"] = df["media_id"].astype(int)
        if label:
            df = df[df[label] == 1]
        return df


def count_labels(
    data: Dict[int, List[str]], selection: List[int]
) -> List[Dict[str, Any]]:
    """Count labels in entire dataset and current selection."""
    all_labels = []
    for labels in data.values():
        all_labels.extend(labels)
    selected_labels = []
    for media_id in selection:
        if str(media_id) in data:
            selected_labels.extend(data[str(media_id)])
    total_counter = Counter(all_labels)
    selection_counter = Counter(selected_labels)
    result = []
    all_unique_labels = set(total_counter.keys()).union(set(selection_counter.keys()))
    for label in all_unique_labels:
        result.append(
            {
                "label": label,
                "inCurrentSelection": selection_counter[label],
                "inEntireDataset": total_counter[label],
            }
        )
    return result
