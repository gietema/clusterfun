"""YOLO format export."""

import json
import os
from typing import Dict, List, Tuple

from clusterfun.export.base import ExportItem


def _polygon_to_bbox(points: List[List[float]]) -> Tuple[float, float, float, float]:
    """Convert polygon points to (xmin, ymin, xmax, ymax)."""
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return min(xs), min(ys), max(xs), max(ys)


def build_yolo(
    items: List[ExportItem],
    image_dimensions: Dict[int, Tuple[int, int]],
) -> Dict[str, str]:
    """Build YOLO format files.

    Parameters
    ----------
    items : list of ExportItem
    image_dimensions : dict mapping media_id -> (width, height)

    Returns
    -------
    dict mapping filename -> content string
        Keys are relative paths like "labels/image_001.txt" and "data.yaml".
    """
    class_set: Dict[str, int] = {}

    def _get_class_id(name: str) -> int:
        if name not in class_set:
            class_set[name] = len(class_set)
        return class_set[name]

    files: Dict[str, str] = {}

    for item in items:
        dims = image_dimensions.get(item.media_id)
        if not dims:
            continue
        img_w, img_h = dims
        if img_w <= 0 or img_h <= 0:
            continue

        lines: List[str] = []

        for ann in item.annotations:
            ann_type = ann.get("type", "")
            data = ann.get("data", {})
            label = ann.get("label", "object")
            class_id = _get_class_id(label)

            if ann_type == "rectangle":
                xmin = data.get("xmin", 0)
                ymin = data.get("ymin", 0)
                xmax = data.get("xmax", 0)
                ymax = data.get("ymax", 0)
            elif ann_type == "polygon":
                points = data.get("points", [])
                if not points:
                    continue
                xmin, ymin, xmax, ymax = _polygon_to_bbox(points)
            else:
                continue

            # Normalize to 0-1 and convert to center format
            x_center = ((xmin + xmax) / 2) / img_w
            y_center = ((ymin + ymax) / 2) / img_h
            w = (xmax - xmin) / img_w
            h = (ymax - ymin) / img_h

            # Clamp to [0, 1]
            x_center = max(0.0, min(1.0, x_center))
            y_center = max(0.0, min(1.0, y_center))
            w = max(0.0, min(1.0, w))
            h = max(0.0, min(1.0, h))

            lines.append(f"{class_id} {x_center:.6f} {y_center:.6f} {w:.6f} {h:.6f}")

        # Also handle classification labels as annotations with no bbox
        if not item.annotations and item.labels:
            for label in item.labels:
                class_id = _get_class_id(label)
                lines.append(f"{class_id}")

        basename = os.path.splitext(os.path.basename(item.media_path))[0]
        # Deduplicate filenames by appending media_id
        filename = f"{basename}_{item.media_id}.txt"
        files[f"labels/{filename}"] = "\n".join(lines)

    # data.yaml — write manually to avoid PyYAML dependency
    names = {v: k for k, v in class_set.items()}
    names_list = [names[i] for i in range(len(names))]
    data_yaml_lines = [
        f"nc: {len(class_set)}",
        f"names: {json.dumps(names_list)}",
    ]
    files["data.yaml"] = "\n".join(data_yaml_lines) + "\n"

    return files
