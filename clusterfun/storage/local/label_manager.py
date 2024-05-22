"""Label storer for CRUD label management"""
import json
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional

import pandas as pd


class LabelManager:
    """CRUD for labels"""

    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir

    def _get_labels_key(self) -> str:
        """Constructs the key for the labels JSON file."""
        return f"{self.cache_dir}/labels.json"

    def read_labels(self) -> Dict[str, List[str]]:
        """Reads the labels from the S3 bucket."""
        labels_file = self.cache_dir / "labels.json"
        if not labels_file.exists():
            return {}
        with open(labels_file, "r", encoding="utf-8") as file_content:
            return json.loads(file_content.read())

    def _write_labels(self, labels: Dict[str, List[str]]):
        """Writes the labels to the S3 bucket."""
        with open(self.cache_dir / "labels.json", "w", encoding="utf-8") as file_content_writer:
            file_content_writer.write(json.dumps(labels))

    def save_label(self, label: str, media_indices: List[int]):
        """Saves the label to the database."""
        labels = self.read_labels()
        for media_id in media_indices:
            labels.setdefault(str(media_id), [])
            if label not in labels[str(media_id)]:
                labels[str(media_id)].append(label)
        self._write_labels(labels)

    def delete_label(self, label: str, media_indices: List[int]):
        """Deletes the label from the database."""
        labels = self.read_labels()
        for media_id in media_indices:
            if str(media_id) in labels and label in labels[str(media_id)]:
                labels[str(media_id)].remove(label)
                if len(labels[str(media_id)]) == 0:
                    del labels[str(media_id)]
        self._write_labels(labels)

    def get_dataframe(self, label: Optional[str] = None) -> pd.DataFrame:
        """Get the dataframe including the labels"""
        labels: Dict[str, List[str]] = self.read_labels()
        df = pd.DataFrame(labels.items(), columns=["media_id", "_labels"])
        # convert labels to column per label with 0 or 1 if labeled or not
        df["_labels"] = df["_labels"].apply("|".join)
        df = df.join(df["_labels"].str.get_dummies(sep="|"))
        df = df.drop("_labels", axis=1)
        # convert to int so it has the same data type as the main dataframe
        df["media_id"] = df["media_id"].astype(int)

        if label:
            df = df[df[label] == 1]
        return df


def count_labels(data: Dict[int, List[str]], selection: List[int]) -> List[Dict[str, Any]]:
    """Count labels

    Params
    ------
    data: Dict[int, List[str]]
        int: media_id
        List[str]: labels
    selection: List[str]
        An optional selection of labels

    Returns
    -------
    List[Dict[str, Any]]
        For each label, return a dictionary with:
            - the label
            - the count of the label for the current selection
            - the count of the label for all data
    """
    # Flatten the labels for the entire dataset
    all_labels = []
    for labels in data.values():
        all_labels.extend(labels)
    # Flatten the labels for the selected ids
    selected_labels = []
    for media_id in selection:
        if str(media_id) in data:
            selected_labels.extend(data[str(media_id)])
    # Count labels in the entire dataset
    total_counter = Counter(all_labels)
    # Count labels in the selection
    selection_counter = Counter(selected_labels)
    # Combine the results into a list of dictionaries
    result = []
    all_unique_labels = set(total_counter.keys()).union(set(selection_counter.keys()))
    for label in all_unique_labels:
        result.append(
            {"label": label, "inCurrentSelection": selection_counter[label], "inEntireDataset": total_counter[label]}
        )
    return result
