"""Compute CLIP embeddings and launch a scatter plot with similarity search.

Usage:
    uv run --with click --with torch --with transformers scripts/similarity.py [--dataset wiki-art]
"""

from pathlib import Path

import click
import pandas as pd
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

import clusterfun as clt
from demo_datasets import dataset_option, load_dataset


def load_image(url: str) -> Image.Image | None:
    """Download and open an image, returning None on failure."""
    import requests
    from io import BytesIO

    try:
        resp = requests.get(url, timeout=10)
        resp.raise_for_status()
        return Image.open(BytesIO(resp.content)).convert("RGB")
    except Exception:
        return None


def _get_device() -> str:
    return (
        "mps" if torch.backends.mps.is_available()
        else "cuda" if torch.cuda.is_available()
        else "cpu"
    )


def _load_images(
    image_paths: list[str], start: int, batch_size: int, local: bool,
) -> tuple[list, list[int], list[int]]:
    """Load a batch of images, returning (images, valid_indices, failed_indices)."""
    batch_paths = image_paths[start : start + batch_size]
    images, valid, failed = [], [], []
    for i, path in enumerate(batch_paths):
        try:
            img = Image.open(path).convert("RGB") if local else load_image(path)
            if img is not None:
                images.append(img)
                valid.append(start + i)
            else:
                failed.append(start + i)
        except Exception:
            failed.append(start + i)
    return images, valid, failed


def compute_siglip2_embeddings(
    image_paths: list[str], batch_size: int = 32, local: bool = False,
    model_name: str = "google/siglip2-base-patch16-224",
) -> tuple[list[list[float]], list[int]]:
    """Compute SigLIP 2 embeddings for a list of image paths or URLs.

    SigLIP 2 is a vision-language model with improved training (sigmoid
    loss instead of softmax), producing 768-dim embeddings that work well
    for both semantic similarity and fine-grained visual search.
    """
    from transformers import AutoModel, AutoProcessor

    device = _get_device()
    model = AutoModel.from_pretrained(model_name).to(device)
    processor = AutoProcessor.from_pretrained(model_name)
    model.eval()

    embeddings: list[list[float]] = []
    valid_indices: list[int] = []
    all_failed: list[int] = []

    for start in range(0, len(image_paths), batch_size):
        images, valid, failed = _load_images(image_paths, start, batch_size, local)
        all_failed.extend(failed)
        if not images:
            continue

        inputs = processor(images=images, return_tensors="pt", padding=True).to(device)
        with torch.no_grad():
            image_features = model.get_image_features(**inputs)
            if not isinstance(image_features, torch.Tensor):
                image_features = image_features.pooler_output
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)

        for idx, emb in zip(valid, image_features.cpu().tolist()):
            embeddings.append(emb)
            valid_indices.append(idx)

        print(f"  Processed {min(start + batch_size, len(image_paths))}/{len(image_paths)} images")

    if all_failed:
        print(f"  Skipped {len(all_failed)} images that failed to load")

    return embeddings, valid_indices


def compute_clip_embeddings(
    image_urls: list[str], batch_size: int = 32, local: bool = False,
) -> tuple[list[list[float]], list[int]]:
    """Compute CLIP embeddings for a list of image URLs or local paths."""
    device = _get_device()
    model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
    processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    model.eval()

    embeddings: list[list[float]] = []
    valid_indices: list[int] = []
    all_failed: list[int] = []

    for start in range(0, len(image_urls), batch_size):
        images, valid, failed = _load_images(image_urls, start, batch_size, local)
        all_failed.extend(failed)
        if not images:
            continue

        inputs = processor(images=images, return_tensors="pt", padding=True).to(device)
        with torch.no_grad():
            image_features = model.get_image_features(**inputs)
            if not isinstance(image_features, torch.Tensor):
                image_features = image_features.pooler_output
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)

        for idx, emb in zip(valid, image_features.cpu().tolist()):
            embeddings.append(emb)
            valid_indices.append(idx)

        print(f"  Processed {min(start + batch_size, len(image_urls))}/{len(image_urls)} images")

    if all_failed:
        print(f"  Skipped {len(all_failed)} images that failed to load")

    return embeddings, valid_indices


def compute_dinov2_embeddings(
    image_paths: list[str], batch_size: int = 32, local: bool = True,
    model_name: str = "facebook/dinov2-base",
) -> tuple[list[list[float]], list[int]]:
    """Compute DINOv2 embeddings for a list of image paths or URLs.

    DINOv2 captures fine-grained visual features (texture, orientation,
    spatial layout) better than CLIP, making it more suitable for
    within-class distinctions like left-facing vs right-facing fish.
    """
    device = (
        "mps"
        if torch.backends.mps.is_available()
        else "cuda"
        if torch.cuda.is_available()
        else "cpu"
    )

    from transformers import AutoImageProcessor, AutoModel
    processor = AutoImageProcessor.from_pretrained(model_name)
    model = AutoModel.from_pretrained(model_name).to(device)
    model.eval()

    embeddings: list[list[float]] = []
    valid_indices: list[int] = []
    failed_indices: list[int] = []

    for start in range(0, len(image_paths), batch_size):
        batch_paths = image_paths[start : start + batch_size]
        batch_images = []
        batch_valid = []

        for i, path in enumerate(batch_paths):
            try:
                if local:
                    img = Image.open(path).convert("RGB")
                else:
                    img = load_image(path)
                if img is not None:
                    batch_images.append(img)
                    batch_valid.append(start + i)
                else:
                    failed_indices.append(start + i)
            except Exception:
                failed_indices.append(start + i)

        if not batch_images:
            continue

        inputs = processor(images=batch_images, return_tensors="pt").to(device)
        with torch.no_grad():
            outputs = model(**inputs)
            # Use CLS token embedding
            cls_embeddings = outputs.last_hidden_state[:, 0]
            cls_embeddings = cls_embeddings / cls_embeddings.norm(dim=-1, keepdim=True)

        for idx, emb in zip(batch_valid, cls_embeddings.cpu().tolist()):
            embeddings.append(emb)
            valid_indices.append(idx)

        print(
            f"  Processed {min(start + batch_size, len(image_paths))}/{len(image_paths)} images"
        )

    if failed_indices:
        print(f"  Skipped {len(failed_indices)} images that failed to load")

    return embeddings, valid_indices


@click.command()
@dataset_option
def main(dataset):
    cache_path = Path(__file__).parent / f"{dataset}_with_embeddings.parquet"

    if cache_path.exists():
        df = pd.read_parquet(cache_path)
        print(f"Loaded {len(df)} items with cached embeddings from {cache_path}")
    else:
        df, _ = load_dataset(dataset)
        print("Computing CLIP embeddings...")
        embeddings, valid_indices = compute_clip_embeddings(df["img_path"].tolist())

        df = df.iloc[valid_indices].reset_index(drop=True)
        df["clip_embedding"] = embeddings
        print(f"Computed embeddings for {len(df)} items ({len(embeddings[0])}-dim)")

        df.to_parquet(cache_path)
        print(f"Saved embeddings cache to {cache_path}")

    # Re-read dataset config (need it for column names)
    from demo_datasets import DATASETS

    ds = DATASETS[dataset]

    print(clt.scatter(
        df,
        x=ds.x,
        y=ds.y,
        media=ds.media,
        color=ds.color,
        title=f"{ds.name} with CLIP Similarity Search",
        embeddings="clip_embedding",
        embeddings_model="openai/clip-vit-base-patch32",
        show=False,
        project=dataset,
    ))


if __name__ == "__main__":
    main()
