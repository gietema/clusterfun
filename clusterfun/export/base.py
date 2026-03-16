"""Shared data-gathering logic for all export formats."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from clusterfun.storage.data_loader import DataLoader


@dataclass
class ExportItem:
    """A single item ready for export."""

    media_id: int
    media_path: str
    labels: List[str] = field(default_factory=list)
    annotations: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


def gather_export_items(
    loader: DataLoader,
    media_ids: Optional[List[int]] = None,
) -> List[ExportItem]:
    """Collect items with their labels and annotations for export.

    Parameters
    ----------
    loader : DataLoader
        The data loader for the view.
    media_ids : list of int, optional
        If provided, only export these media IDs. Otherwise export all.

    Returns
    -------
    list of ExportItem
    """
    # Get all rows as a DataFrame
    df = loader.get_dataframe()

    if media_ids:
        df = df[df["id"].isin(media_ids)]

    if df.empty:
        return []

    # Load labels: {media_id_str: [label, ...]}
    all_labels = loader.label_manager.read_labels()

    # Load annotations: {media_id_str: [annotation, ...]}
    all_annotations = loader.annotation_manager.get_all_annotations()

    config = loader.load_config()
    media_col = config.columns[1]  # media column is always 2nd

    items: List[ExportItem] = []
    for _, row in df.iterrows():
        mid = int(row["id"])
        media_path = str(row[media_col]) if media_col in row else ""

        # Metadata: all columns except id and media
        metadata = {
            k: v for k, v in row.items() if k not in ("id", media_col)
        }

        items.append(
            ExportItem(
                media_id=mid,
                media_path=media_path,
                labels=all_labels.get(str(mid), []),
                annotations=all_annotations.get(str(mid), []),
                metadata=metadata,
            )
        )

    return items
