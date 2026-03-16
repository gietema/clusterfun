"""Load OmniDocBench into clusterfun with annotations.

The dataset stores images in HuggingFace parquet but all annotations live in
a separate OmniDocBench.json file. This script downloads the annotations,
joins them to the image metadata, and creates a rich grid view.

Usage:
    .venv/bin/python scripts/omnidocbench.py
    .venv/bin/python scripts/omnidocbench.py --max-rows 100
"""

import json
from collections import Counter
from pathlib import Path
from typing import Optional
from uuid import uuid4

import click
import pandas as pd
import requests

import clusterfun as clt
from clusterfun.config import Config
from clusterfun.huggingface import _discover_parquet_urls, _read_metadata
from clusterfun.plot import Plot
from clusterfun.storage.local.storer import LocalStorer

DATASET = "opendatalab/OmniDocBench"
ANNOTATION_URL = "https://huggingface.co/datasets/opendatalab/OmniDocBench/resolve/main/OmniDocBench.json"


def _download_annotations(cache_path: Path) -> list:
    """Download and cache the annotation JSON."""
    if cache_path.exists():
        print(f"Using cached annotations: {cache_path}")
        return json.loads(cache_path.read_text())
    print("Downloading OmniDocBench.json (65 MB)...")
    resp = requests.get(ANNOTATION_URL, timeout=120)
    resp.raise_for_status()
    data = resp.json()
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(data))
    print(f"Cached annotations to {cache_path}")
    return data


def _parse_annotations(annotations: list) -> pd.DataFrame:
    """Parse annotations into a flat DataFrame with one row per page."""
    rows = []
    for page in annotations:
        info = page.get("page_info", {})
        attr = info.get("page_attribute", {})
        dets = page.get("layout_dets", [])

        # Count element types
        type_counts = Counter(d.get("category_type", "unknown") for d in dets)

        # Collect text content
        texts = [d["text"] for d in dets if d.get("text")]
        text_preview = " | ".join(texts[:3])
        if len(texts) > 3:
            text_preview += f" ... (+{len(texts) - 3} more)"

        # Build bounding boxes JSON for clusterfun
        bboxes = []
        for d in dets:
            poly = d.get("poly", [])
            if len(poly) == 8:
                # polygon: x1,y1,x2,y2,x3,y3,x4,y4 → axis-aligned bbox
                xs = [poly[i] for i in range(0, 8, 2)]
                ys = [poly[i] for i in range(1, 8, 2)]
                bboxes.append({
                    "xmin": min(xs),
                    "ymin": min(ys),
                    "xmax": max(xs),
                    "ymax": max(ys),
                    "label": d.get("category_type", ""),
                })

        rows.append({
            "image_path": info.get("image_path", ""),
            "page_no": info.get("page_no"),
            "width": info.get("width"),
            "height": info.get("height"),
            "data_source": attr.get("data_source", ""),
            "language": attr.get("language", ""),
            "layout": attr.get("layout", ""),
            "special_issues": json.dumps(attr.get("special_issue", [])),
            "n_elements": len(dets),
            "element_types": ", ".join(f"{k}({v})" for k, v in type_counts.most_common()),
            "text_preview": text_preview,
            "n_text_blocks": type_counts.get("text_block", 0),
            "n_tables": type_counts.get("table", 0),
            "n_figures": type_counts.get("figure", 0),
            "n_formulas": type_counts.get("isolate_formula", 0) + type_counts.get("inline_formula", 0),
            "bboxes": json.dumps(bboxes),
        })

    return pd.DataFrame(rows)


@click.command()
@click.option("--max-rows", "-n", type=int, default=None, help="Max pages to load")
@click.option("--no-show", is_flag=True, help="Don't open browser")
def main(max_rows: Optional[int], no_show: bool):
    # 1. Download annotations
    cache_path = Path(__file__).parent / "omnidocbench_annotations.json"
    annotations = _download_annotations(cache_path)
    print(f"Loaded {len(annotations)} page annotations")

    # 2. Parse into DataFrame
    anno_df = _parse_annotations(annotations)

    # 3. Discover parquet URLs and read HF metadata
    urls, _ = _discover_parquet_urls(DATASET, "train", "default")
    print(f"Found {len(urls)} parquet file(s)")

    df, other_columns = _read_metadata(urls, "image", max_rows)
    print(f"Loaded {len(df)} image rows from HF")

    # 4. The HF parquet rows are in the same order as the annotation JSON
    # Join by index position
    if max_rows:
        anno_df = anno_df.head(max_rows)

    # Add annotation columns to the HF metadata
    for col in anno_df.columns:
        if col != "image_path":
            df[col] = anno_df[col].values[: len(df)]

    # 5. Build config and save
    metadata_cols = [
        "data_source", "language", "layout", "n_elements", "element_types",
        "text_preview", "n_text_blocks", "n_tables", "n_figures", "n_formulas",
        "special_issues",
    ]
    columns = ["id", "image"] + metadata_cols + ["bboxes"]
    df_cols = [c for c in columns if c != "id" and c in df.columns]

    cfg = Config(
        type="grid",
        media="image",
        columns=columns,
        title=f"OmniDocBench ({len(df)} pages)",
        display=["data_source"],
        bounding_box="bboxes",
        hf_parquet_urls=urls,
        hf_image_column="image",
        total_count=len(df),
    )

    uuid = str(uuid4())
    LocalStorer().save(uuid, df[df_cols], cfg)
    print(f"Saved view: {uuid}")
    Plot(uuid, {}, cfg).show(not no_show)


if __name__ == "__main__":
    main()
