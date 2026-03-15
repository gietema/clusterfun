"""Load Imagenette (10-class ImageNet subset) and launch with embeddings.

Downloads the dataset from HuggingFace, computes CLIP embeddings,
and opens a scatter plot with similarity search and active learning.

Usage:
    uv run --with click --with datasets --with torch --with transformers scripts/imagenette.py
    uv run --with click --with datasets --with torch --with transformers scripts/imagenette.py --split train --size 320
"""

from pathlib import Path

import click
import pandas as pd

CACHE_DIR = Path(__file__).parent


def load_imagenette(split: str = "train", size: str = "320px") -> pd.DataFrame:
    """Load Imagenette from HuggingFace and save images to disk."""
    from datasets import load_dataset

    print(f"Loading imagenette/{size} ({split} split) from HuggingFace...")
    ds = load_dataset("frgfm/imagenette", size, split=split)

    # Map integer labels to class names
    label_names = ds.features["label"].names

    # Save images to local dir so clusterfun can serve them
    img_dir = CACHE_DIR / "imagenette_images" / split
    img_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for i, item in enumerate(ds):
        img = item["image"]
        label = label_names[item["label"]]
        filename = f"{i:05d}.jpg"
        img_path = img_dir / filename

        if not img_path.exists():
            img.convert("RGB").save(img_path, quality=85)

        rows.append({
            "image": str(img_path),
            "label": label,
        })

        if (i + 1) % 1000 == 0:
            print(f"  Saved {i + 1}/{len(ds)} images")

    df = pd.DataFrame(rows)
    print(f"Loaded {len(df)} images across {len(label_names)} classes")
    return df


@click.command()
@click.option("--split", type=click.Choice(["train", "validation"]), default="train")
@click.option("--size", type=click.Choice(["full_size", "320px", "160px"]), default="320px")
@click.option("--embeddings/--no-embeddings", default=True, help="Compute CLIP embeddings")
def main(split, size, embeddings):
    cache_path = CACHE_DIR / f"imagenette_{split}_with_embeddings.parquet"

    if cache_path.exists():
        df = pd.read_parquet(cache_path)
        print(f"Loaded {len(df)} items with cached embeddings from {cache_path}")
    else:
        df = load_imagenette(split, size)

        if embeddings:
            from similarity import compute_clip_embeddings

            print("Computing CLIP embeddings...")
            embs, valid_indices = compute_clip_embeddings(df["image"].tolist(), local=True)
            df = df.iloc[valid_indices].reset_index(drop=True)
            df["clip_embedding"] = embs
            print(f"Computed embeddings for {len(df)} items ({len(embs[0])}-dim)")

        df.to_parquet(cache_path)
        print(f"Saved cache to {cache_path}")

    import clusterfun as clt

    kwargs = dict(
        media="image",
        color="label",
        title=f"Imagenette ({split})",
        show=False,
        project="imagenette",
    )

    if "clip_embedding" in df.columns:
        kwargs["embeddings"] = "clip_embedding"
        kwargs["embeddings_model"] = "openai/clip-vit-base-patch32"

    # If we have embeddings, use scatter with UMAP coordinates
    if "clip_embedding" in df.columns:
        # Use grid — UMAP can be computed in the plot builder
        print(clt.grid(df, **kwargs))
    else:
        print(clt.grid(df, **kwargs))


if __name__ == "__main__":
    main()
