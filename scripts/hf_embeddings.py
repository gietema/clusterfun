"""Compute CLIP embeddings for a HuggingFace dataset and open in clusterfun.

Fetches images on demand from HF parquet files, computes CLIP embeddings,
and launches a grid view with similarity search enabled.

Usage:
    uv run --with click --with torch --with transformers scripts/hf_embeddings.py --dataset ethz/food101 --max-rows 500
    uv run --with click --with torch --with transformers scripts/hf_embeddings.py --dataset uoft-cs/cifar10 --split test --max-rows 1000
"""

from io import BytesIO
from pathlib import Path
from typing import Optional
from uuid import uuid4

import click
import duckdb
import pandas as pd
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

import clusterfun as clt
from clusterfun.config import Config
from clusterfun.huggingface import (
    _detect_image_column,
    _discover_parquet_urls,
    _read_metadata,
    _resolve_labels,
)
from clusterfun.plot import Plot
from clusterfun.storage.local.storer import LocalStorer


def compute_clip_embeddings_from_hf(
    urls: list[str],
    image_column: str,
    row_indices: list[int],
    batch_size: int = 32,
) -> tuple[list[list[float]], list[int]]:
    """Compute CLIP embeddings by fetching image bytes from HF parquet files.

    Parameters
    ----------
    urls : list[str]
        HuggingFace parquet file URLs.
    image_column : str
        Name of the image column in the parquet files.
    row_indices : list[int]
        Row indices to process (as stored in the local metadata).
    batch_size : int
        Number of images to process at once.

    Returns
    -------
    tuple[list[list[float]], list[int]]
        (embeddings, valid_indices) — embeddings and their corresponding row indices.
    """
    device = (
        "mps"
        if torch.backends.mps.is_available()
        else "cuda"
        if torch.cuda.is_available()
        else "cpu"
    )
    print(f"Using device: {device}")
    model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
    processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    model.eval()

    url_list = ", ".join(f"'{u}'" for u in urls)
    embeddings: list[list[float]] = []
    valid_indices: list[int] = []
    failed = 0

    for start in range(0, len(row_indices), batch_size):
        batch_indices = row_indices[start : start + batch_size]
        batch_images = []
        batch_valid = []

        # Fetch a batch of images from remote parquet
        con = duckdb.connect()
        try:
            con.execute("INSTALL httpfs; LOAD httpfs;")
            for idx in batch_indices:
                try:
                    result = con.execute(
                        f'SELECT "{image_column}".bytes '
                        f"FROM read_parquet([{url_list}]) "
                        f"LIMIT 1 OFFSET {idx}",
                    ).fetchone()
                    if result and result[0]:
                        img = Image.open(BytesIO(bytes(result[0]))).convert("RGB")
                        batch_images.append(img)
                        batch_valid.append(idx)
                    else:
                        failed += 1
                except Exception:
                    failed += 1
        finally:
            con.close()

        if not batch_images:
            continue

        inputs = processor(images=batch_images, return_tensors="pt", padding=True).to(device)
        with torch.no_grad():
            image_features = model.get_image_features(**inputs)
            if not isinstance(image_features, torch.Tensor):
                image_features = image_features.pooler_output
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)

        for idx, emb in zip(batch_valid, image_features.cpu().tolist()):
            embeddings.append(emb)
            valid_indices.append(idx)

        processed = min(start + batch_size, len(row_indices))
        print(f"  Processed {processed}/{len(row_indices)} images")

    if failed:
        print(f"  Skipped {failed} images that failed to load")

    return embeddings, valid_indices


@click.command()
@click.option("--dataset", required=True, help="HuggingFace dataset ID (e.g. ethz/food101)")
@click.option("--split", default="train", help="Dataset split")
@click.option("--config-name", default="default", help="Dataset config name")
@click.option("--max-rows", default=None, type=int, help="Limit number of rows")
@click.option("--batch-size", default=32, type=int, help="Batch size for CLIP inference")
@click.option("--no-show", is_flag=True, help="Don't open browser")
def main(
    dataset: str,
    split: str,
    config_name: str,
    max_rows: Optional[int],
    batch_size: int,
    no_show: bool,
):
    # Check for cached embeddings
    safe_name = dataset.replace("/", "_")
    cache_path = Path(__file__).parent / f"{safe_name}_{split}_hf_embeddings.parquet"

    urls, resolved_config = _discover_parquet_urls(dataset, split, config_name)
    print(f"Found {len(urls)} parquet file(s)")

    image_column = _detect_image_column(urls)
    print(f"Image column: {image_column}")

    if cache_path.exists():
        print(f"Loading cached embeddings from {cache_path}")
        df = pd.read_parquet(cache_path)
        other_columns = [c for c in df.columns if c not in ("image", "clip_embedding")]
    else:
        # Read metadata
        df, other_columns = _read_metadata(urls, image_column, max_rows)
        print(f"Loaded {len(df)} rows of metadata")

        # Resolve labels
        label_mappings = _resolve_labels(dataset, resolved_config)
        if label_mappings:
            for col_name, mapping in label_mappings.items():
                if col_name in df.columns:
                    df[col_name] = df[col_name].map(mapping).fillna(df[col_name])

        # Compute CLIP embeddings
        row_indices = df["image"].astype(int).tolist()
        print(f"Computing CLIP embeddings for {len(row_indices)} images...")
        embeddings, valid_indices = compute_clip_embeddings_from_hf(
            urls, image_column, row_indices, batch_size=batch_size,
        )

        # Filter to valid rows
        valid_set = set(valid_indices)
        df = df[df["image"].astype(int).isin(valid_set)].reset_index(drop=True)
        df["clip_embedding"] = embeddings
        print(f"Computed {len(embeddings)}-item embeddings ({len(embeddings[0])}-dim)")

        # Cache
        df.to_parquet(cache_path)
        print(f"Saved embeddings to {cache_path}")

    # Build view with embeddings
    media_col = "image"
    df = df.reset_index(drop=True)
    columns = ["id", media_col] + [c for c in other_columns if c in df.columns]
    df_cols = [c for c in columns if c != "id"]

    cfg = Config(
        type="grid",
        media=media_col,
        columns=columns,
        title=f"{dataset} ({split}) + CLIP",
        hf_parquet_urls=urls,
        hf_image_column=image_column,
        embeddings="clip_embedding",
        embeddings_model="openai/clip-vit-base-patch32",
        total_count=len(df),
    )

    uuid = str(uuid4())
    # Include clip_embedding in the save so the storer extracts it to embeddings.parquet
    save_df = df[df_cols + ["clip_embedding"]]
    LocalStorer().save(uuid, save_df, cfg)

    print(f"View saved: {uuid}")
    Plot(uuid, {}, cfg).show(not no_show)


if __name__ == "__main__":
    main()
