"""Load Imagenette (10-class ImageNet subset) and launch with embeddings.

Downloads from fastai's official URL, computes embeddings (CLIP or DINOv2),
and opens a grid view with similarity search and active learning.

Usage:
    uv run --with click scripts/load_imagenette.py --no-embeddings
    uv run --with click --with torch --with transformers scripts/load_imagenette.py
    uv run --with click --with torch --with transformers scripts/load_imagenette.py --model dinov2
"""

import tarfile
import urllib.request
from pathlib import Path

import click
import pandas as pd

CACHE_DIR = Path(__file__).parent

IMAGENETTE_URLS = {
    "320px": "https://s3.amazonaws.com/fast-ai-imageclas/imagenette2-320.tgz",
    "160px": "https://s3.amazonaws.com/fast-ai-imageclas/imagenette2-160.tgz",
    "full_size": "https://s3.amazonaws.com/fast-ai-imageclas/imagenette2.tgz",
}

LABEL_MAP = {
    "n01440764": "tench",
    "n02102040": "English springer",
    "n02979186": "cassette player",
    "n03000684": "chain saw",
    "n03028079": "church",
    "n03394916": "French horn",
    "n03417042": "garbage truck",
    "n03425413": "gas pump",
    "n03445777": "golf ball",
    "n03888257": "parachute",
}


def load_imagenette(split: str = "train", size: str = "320px") -> pd.DataFrame:
    """Download imagenette and build a DataFrame with image paths and labels."""
    url = IMAGENETTE_URLS[size]
    # Determine extract dir name from URL
    tar_name = url.split("/")[-1]  # e.g. imagenette2-320.tgz
    extract_name = tar_name.replace(".tgz", "")  # e.g. imagenette2-320
    data_dir = CACHE_DIR / extract_name

    if not data_dir.exists():
        tar_path = CACHE_DIR / tar_name
        if not tar_path.exists():
            print(f"Downloading {url}...")
            urllib.request.urlretrieve(url, tar_path)
            print(f"Downloaded to {tar_path}")

        print(f"Extracting {tar_path}...")
        with tarfile.open(tar_path, "r:gz") as tar:
            tar.extractall(path=CACHE_DIR, filter="data")
        tar_path.unlink()
        print(f"Extracted to {data_dir}")

    split_dir = data_dir / ("train" if split == "train" else "val")
    rows = []
    for class_dir in sorted(split_dir.iterdir()):
        if not class_dir.is_dir():
            continue
        label = LABEL_MAP.get(class_dir.name, class_dir.name)
        for img_path in sorted(class_dir.glob("*.JPEG")):
            rows.append({"image": str(img_path), "label": label})

    df = pd.DataFrame(rows)
    print(f"Loaded {len(df)} images across {df['label'].nunique()} classes ({split})")
    return df


MODEL_INFO = {
    "clip": {
        "col": "clip_embedding",
        "hf_name": "openai/clip-vit-base-patch32",
    },
    "dinov2": {
        "col": "dinov2_embedding",
        "hf_name": "facebook/dinov2-base",
    },
}


@click.command()
@click.option("--split", type=click.Choice(["train", "validation"]), default="train")
@click.option("--size", type=click.Choice(["full_size", "320px", "160px"]), default="320px")
@click.option("--model", type=click.Choice(["clip", "dinov2"]), default="clip", help="Embedding model")
@click.option("--embeddings/--no-embeddings", default=True, help="Compute embeddings")
def main(split, size, model, embeddings):
    suffix = f"{model}_embeddings" if embeddings else "no_embeddings"
    cache_path = CACHE_DIR / f"imagenette_{split}_{suffix}.parquet"

    if cache_path.exists():
        df = pd.read_parquet(cache_path)
        print(f"Loaded {len(df)} items from cache {cache_path}")
    else:
        df = load_imagenette(split, size)

        if embeddings:
            import sys
            sys.path.insert(0, str(Path(__file__).parent))

            info = MODEL_INFO[model]
            if model == "clip":
                from similarity import compute_clip_embeddings
                print("Computing CLIP embeddings...")
                embs, valid_indices = compute_clip_embeddings(df["image"].tolist(), local=True)
            else:
                from similarity import compute_dinov2_embeddings
                print("Computing DINOv2 embeddings...")
                embs, valid_indices = compute_dinov2_embeddings(df["image"].tolist())

            df = df.iloc[valid_indices].reset_index(drop=True)
            df[info["col"]] = embs
            print(f"Computed {model} embeddings for {len(df)} items ({len(embs[0])}-dim)")

        df.to_parquet(cache_path)
        print(f"Saved cache to {cache_path}")

    import clusterfun as clt

    info = MODEL_INFO.get(model, MODEL_INFO["clip"])
    emb_col = info["col"] if info["col"] in df.columns else None

    kwargs = dict(
        media="image",
        title=f"Imagenette ({split}, {model})",
        show=False,
        project=f"imagenette-{model}",
    )

    if emb_col:
        kwargs["embeddings"] = emb_col
        kwargs["embeddings_model"] = info["hf_name"]

    print(clt.grid(df, **kwargs))


if __name__ == "__main__":
    main()
