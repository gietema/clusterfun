"""Classification folder structure export.

Produces a mapping of destination paths to source paths for copying
media files into label-named folders.
"""

import os
from typing import Dict, List

from clusterfun.export.base import ExportItem


def build_classification_mapping(items: List[ExportItem]) -> Dict[str, str]:
    """Build a mapping of destination_path -> source_path for classification folders.

    Items without labels are placed in an "_unlabeled" folder.
    Items with multiple labels appear in each label's folder.

    Returns
    -------
    dict mapping dest_path (e.g. "cat/image_42.jpg") -> source media_path
    """
    mapping: Dict[str, str] = {}

    for item in items:
        ext = os.path.splitext(item.media_path)[1] or ".jpg"
        basename = f"{os.path.splitext(os.path.basename(item.media_path))[0]}_{item.media_id}{ext}"

        if item.labels:
            for label in item.labels:
                # Sanitize label for use as directory name
                safe_label = label.replace("/", "_").replace("\\", "_").strip()
                if not safe_label:
                    safe_label = "_unlabeled"
                dest = f"{safe_label}/{basename}"
                mapping[dest] = item.media_path
        else:
            mapping[f"_unlabeled/{basename}"] = item.media_path

    return mapping
