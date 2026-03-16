"""COCO format export."""

import json
from typing import Any, Dict, List

from clusterfun.export.base import ExportItem


def _polygon_bbox(points: List[List[float]]) -> List[float]:
    """Compute [x, y, width, height] bounding box from polygon points."""
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x_min, y_min = min(xs), min(ys)
    return [x_min, y_min, max(xs) - x_min, max(ys) - y_min]


def _polygon_area(points: List[List[float]]) -> float:
    """Compute polygon area using the shoelace formula."""
    n = len(points)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += points[i][0] * points[j][1]
        area -= points[j][0] * points[i][1]
    return abs(area) / 2.0


def build_coco(items: List[ExportItem]) -> str:
    """Build a COCO-format JSON string.

    Supports both object detection annotations (rectangles/polygons)
    and image classification (labels without spatial annotations).
    """
    images: List[Dict[str, Any]] = []
    annotations: List[Dict[str, Any]] = []
    category_set: Dict[str, int] = {}

    def _get_cat_id(name: str) -> int:
        if name not in category_set:
            category_set[name] = len(category_set) + 1
        return category_set[name]

    ann_id = 1
    for item in items:
        img_entry: Dict[str, Any] = {
            "id": item.media_id,
            "file_name": item.media_path,
        }
        images.append(img_entry)

        # Spatial annotations (rectangles / polygons)
        for ann in item.annotations:
            ann_type = ann.get("type", "")
            data = ann.get("data", {})
            label = ann.get("label", "object")
            cat_id = _get_cat_id(label)

            if ann_type == "rectangle":
                x_min = data.get("xmin", 0)
                y_min = data.get("ymin", 0)
                w = data.get("xmax", 0) - x_min
                h = data.get("ymax", 0) - y_min
                annotations.append({
                    "id": ann_id,
                    "image_id": item.media_id,
                    "category_id": cat_id,
                    "bbox": [x_min, y_min, w, h],
                    "area": w * h,
                    "iscrowd": 0,
                })
            elif ann_type == "polygon":
                points = data.get("points", [])
                if points:
                    bbox = _polygon_bbox(points)
                    seg = [coord for pt in points for coord in pt]
                    annotations.append({
                        "id": ann_id,
                        "image_id": item.media_id,
                        "category_id": cat_id,
                        "bbox": bbox,
                        "area": _polygon_area(points),
                        "segmentation": [seg],
                        "iscrowd": 0,
                    })
            ann_id += 1

        # Classification labels (only if no spatial annotations)
        if not item.annotations and item.labels:
            for label in item.labels:
                cat_id = _get_cat_id(label)
                annotations.append({
                    "id": ann_id,
                    "image_id": item.media_id,
                    "category_id": cat_id,
                    "bbox": [],
                    "area": 0,
                    "iscrowd": 0,
                })
                ann_id += 1

    categories = [
        {"id": cid, "name": name} for name, cid in category_set.items()
    ]

    coco = {
        "images": images,
        "annotations": annotations,
        "categories": categories,
    }
    return json.dumps(coco, indent=2)
