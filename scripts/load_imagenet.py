"""Load ImageNet-1K (1.28M images, 1000 classes) for scale testing.

Requires a HuggingFace account with ImageNet access approved:
  1. Go to https://huggingface.co/datasets/ILSVRC/imagenet-1k
  2. Accept the terms
  3. Run: huggingface-cli login

Usage:
    uv run --with click --with "datasets>=2" scripts/load_imagenet.py --no-embeddings
    uv run --with click --with "datasets>=2" --with torch --with transformers scripts/load_imagenet.py
    uv run --with click --with "datasets>=2" scripts/load_imagenet.py --split validation --no-embeddings

Available embedding models (--model):
    siglip2-384   SigLIP 2 base, 384px input, 768-dim  (default)
    siglip2-224   SigLIP 2 base, 224px input, 768-dim  (faster)
    clip          CLIP ViT-B/32, 224px, 512-dim
    dinov2        DINOv2 base, 224px, 768-dim

For the full 1.28M training set with embeddings, expect:
    ~2 hours for embedding computation (GPU recommended)
    ~4 GB parquet file on disk
    ~3 GB RAM for FAISS index

The validation set (50K images) is a good starting point for testing.
"""

import os
from pathlib import Path

import click
import pandas as pd

CACHE_DIR = Path(__file__).parent

# Reuse model definitions from load_imagenette
MODEL_INFO = {
    "siglip2-384": {
        "col": "siglip2_embedding",
        "hf_name": "google/siglip2-base-patch16-384",
        "fn": "compute_siglip2_embeddings",
        "kwargs": {"model_name": "google/siglip2-base-patch16-384"},
    },
    "siglip2-224": {
        "col": "siglip2_embedding",
        "hf_name": "google/siglip2-base-patch16-224",
        "fn": "compute_siglip2_embeddings",
        "kwargs": {"model_name": "google/siglip2-base-patch16-224"},
    },
    "clip": {
        "col": "clip_embedding",
        "hf_name": "openai/clip-vit-base-patch32",
        "fn": "compute_clip_embeddings",
        "kwargs": {},
    },
    "dinov2": {
        "col": "dinov2_embedding",
        "hf_name": "facebook/dinov2-base",
        "fn": "compute_dinov2_embeddings",
        "kwargs": {},
    },
}

# ImageNet synset ID -> human-readable label (loaded lazily)
_LABEL_NAMES: dict[int, str] | None = None


def _get_label_names(ds) -> dict[int, str]:
    """Extract label index -> name mapping from dataset features."""
    global _LABEL_NAMES
    if _LABEL_NAMES is None:
        _LABEL_NAMES = dict(enumerate(ds.features["label"].names))
    return _LABEL_NAMES


def load_imagenet(split: str = "validation", limit: int = 0) -> pd.DataFrame:
    """Load ImageNet from HuggingFace, save images to disk, return DataFrame.

    Images are saved as JPEGs to avoid re-downloading on subsequent runs.
    """
    # Import HF datasets — avoid collision with local datasets.py
    import sys
    scripts_dir = str(Path(__file__).parent)
    orig_path = sys.path[:]
    sys.path = [p for p in sys.path if scripts_dir not in p]
    local_ds = sys.modules.pop("datasets", None)
    from datasets import load_dataset
    sys.path = orig_path
    if local_ds is not None:
        sys.modules["datasets"] = local_ds

    hf_split = "validation" if split == "validation" else "train"
    print(f"Loading ImageNet-1K ({hf_split} split) from HuggingFace...")
    ds = load_dataset("ILSVRC/imagenet-1k", split=hf_split)
    label_names = _get_label_names(ds)

    if limit > 0:
        ds = ds.select(range(min(limit, len(ds))))
        print(f"  Limited to {len(ds)} items")

    img_dir = CACHE_DIR / "imagenet_images" / hf_split
    img_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for i, item in enumerate(ds):
        label = label_names[item["label"]]
        filename = f"{i:07d}.jpg"
        img_path = img_dir / filename

        if not img_path.exists():
            item["image"].convert("RGB").save(img_path, quality=85)

        rows.append({
            "image": str(img_path),
            "label": label,
        })

        if (i + 1) % 5000 == 0:
            print(f"  Saved {i + 1}/{len(ds)} images")

    df = pd.DataFrame(rows)
    print(f"Loaded {len(df)} images across {df['label'].nunique()} classes ({split})")
    return df


@click.command()
@click.option("--split", type=click.Choice(["train", "validation"]), default="validation",
              help="Dataset split (validation=50K, train=1.28M)")
@click.option("--model", type=click.Choice(list(MODEL_INFO.keys())), default="siglip2-384",
              help="Embedding model")
@click.option("--embeddings/--no-embeddings", default=True, help="Compute embeddings")
@click.option("--limit", default=0, help="Limit number of images (0=all)")
@click.option("--batch-size", default=64, help="Batch size for embedding computation")
def main(split, model, embeddings, limit, batch_size):
    info = MODEL_INFO[model]
    suffix = f"{model}" if embeddings else "no_emb"
    limit_tag = f"_{limit}" if limit > 0 else ""
    cache_path = CACHE_DIR / f"imagenet_{split}{limit_tag}_{suffix}.parquet"

    if cache_path.exists():
        df = pd.read_parquet(cache_path)
        print(f"Loaded {len(df)} items from cache {cache_path}")
    else:
        df = load_imagenet(split, limit)

        if embeddings:
            import sys
            sys.path.insert(0, str(Path(__file__).parent))
            import similarity

            compute_fn = getattr(similarity, info["fn"])
            print(f"Computing {model} embeddings (batch_size={batch_size})...")
            embs, valid_indices = compute_fn(
                df["image"].tolist(), batch_size=batch_size, local=True, **info["kwargs"],
            )

            df = df.iloc[valid_indices].reset_index(drop=True)
            df[info["col"]] = embs
            print(f"Computed embeddings for {len(df)} items ({len(embs[0])}-dim)")

        df.to_parquet(cache_path)
        size_mb = cache_path.stat().st_size / 1024 / 1024
        print(f"Saved cache to {cache_path} ({size_mb:.0f} MB)")

    import clusterfun as clt

    emb_col = info["col"] if info["col"] in df.columns else None

    kwargs = dict(
        media="image",
        title=f"ImageNet ({split}, {len(df):,} images, {model})",
        show=False,
        project=f"imagenet-{model}",
    )

    if emb_col:
        kwargs["embeddings"] = emb_col
        kwargs["embeddings_model"] = info["hf_name"]

    print(clt.grid(df, **kwargs))


if __name__ == "__main__":
    main()
