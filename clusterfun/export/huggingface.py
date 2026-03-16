"""HuggingFace Datasets (imagefolder) export."""

import json
from typing import Dict, List

from clusterfun.export.base import ExportItem


def build_huggingface(items: List[ExportItem]) -> Dict[str, str]:
    """Build HuggingFace imagefolder format files.

    Produces a metadata.jsonl file compatible with
    ``datasets.load_dataset("imagefolder", data_dir=...)``.

    Returns
    -------
    dict mapping filename -> content string
    """
    lines: List[str] = []

    for item in items:
        entry = {
            "file_name": item.media_path,
        }

        # Primary label (first one) for classification
        if item.labels:
            entry["label"] = item.labels[0]
            if len(item.labels) > 1:
                entry["labels"] = item.labels

        # Annotations if present
        if item.annotations:
            entry["annotations"] = item.annotations

        lines.append(json.dumps(entry, ensure_ascii=False))

    files = {
        "metadata.jsonl": "\n".join(lines),
    }
    return files
