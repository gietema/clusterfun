"""Load Imagenette (10-class ImageNet subset) and launch with embeddings.

Downloads from fastai's official URL, computes embeddings, and opens
a grid view with similarity search and active learning.

Usage:
    uv run --with click --with torch --with transformers scripts/load_imagenette.py
    uv run --with click --with torch --with transformers scripts/load_imagenette.py --model dinov2
    uv run --with click scripts/load_imagenette.py --no-embeddings

Available embedding models (--model):
    siglip2-384   SigLIP 2 base, 384px input, 768-dim  (default, best quality/speed)
    siglip2-224   SigLIP 2 base, 224px input, 768-dim  (faster, slightly lower quality)
    siglip2-l     SigLIP 2 large, 384px, 1024-dim      (slower, higher quality)
    siglip2-so    SigLIP 2 SO-400M, 384px, 1152-dim    (slowest, highest quality)
    clip          CLIP ViT-B/32, 224px, 512-dim         (fast, semantic similarity)
    dinov2        DINOv2 base, 224px, 768-dim           (visual/spatial features)
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

MODEL_INFO = {
    "siglip2-384": {
        "col": "siglip2_embedding",
        "hf_name": "google/siglip2-base-patch16-384",
        "fn": "compute_siglip2_embeddings",
        "kwargs": {"model_name": "google/siglip2-base-patch16-384"},
        "desc": "SigLIP 2 base 384px (768-dim, best quality/speed balance)",
    },
    "siglip2-224": {
        "col": "siglip2_embedding",
        "hf_name": "google/siglip2-base-patch16-224",
        "fn": "compute_siglip2_embeddings",
        "kwargs": {"model_name": "google/siglip2-base-patch16-224"},
        "desc": "SigLIP 2 base 224px (768-dim, faster)",
    },
    "siglip2-l": {
        "col": "siglip2l_embedding",
        "hf_name": "google/siglip2-large-patch16-384",
        "fn": "compute_siglip2_embeddings",
        "kwargs": {"model_name": "google/siglip2-large-patch16-384"},
        "desc": "SigLIP 2 large 384px (1024-dim, higher quality)",
    },
    "siglip2-so": {
        "col": "siglip2so_embedding",
        "hf_name": "google/siglip2-so400m-patch14-384",
        "fn": "compute_siglip2_embeddings",
        "kwargs": {"model_name": "google/siglip2-so400m-patch14-384"},
        "desc": "SigLIP 2 SO-400M 384px (1152-dim, highest quality)",
    },
    "clip": {
        "col": "clip_embedding",
        "hf_name": "openai/clip-vit-base-patch32",
        "fn": "compute_clip_embeddings",
        "kwargs": {},
        "desc": "CLIP ViT-B/32 (512-dim, fast, semantic)",
    },
    "dinov2": {
        "col": "dinov2_embedding",
        "hf_name": "facebook/dinov2-base",
        "fn": "compute_dinov2_embeddings",
        "kwargs": {},
        "desc": "DINOv2 base (768-dim, visual/spatial features)",
    },
}


def load_imagenette(split: str = "train", size: str = "320px") -> pd.DataFrame:
    """Download imagenette and build a DataFrame with image paths and labels."""
    url = IMAGENETTE_URLS[size]
    tar_name = url.split("/")[-1]
    extract_name = tar_name.replace(".tgz", "")
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


@click.command()
@click.option("--split", type=click.Choice(["train", "validation"]), default="train")
@click.option("--size", type=click.Choice(["full_size", "320px", "160px"]), default="320px")
@click.option("--model", type=click.Choice(list(MODEL_INFO.keys())), default="siglip2-384",
              help="Embedding model (see module docstring for details)")
@click.option("--embeddings/--no-embeddings", default=True, help="Compute embeddings")
def main(split, size, model, embeddings):
    info = MODEL_INFO[model]
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
            import similarity

            compute_fn = getattr(similarity, info["fn"])
            print(f"Computing {info['desc']}...")
            embs, valid_indices = compute_fn(df["image"].tolist(), local=True, **info["kwargs"])

            df = df.iloc[valid_indices].reset_index(drop=True)
            df[info["col"]] = embs
            print(f"Computed embeddings for {len(df)} items ({len(embs[0])}-dim)")

        df.to_parquet(cache_path)
        print(f"Saved cache to {cache_path}")

    import clusterfun as clt

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
