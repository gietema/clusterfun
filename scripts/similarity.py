"""Compute CLIP embeddings for the wiki-art dataset and launch a scatter plot with similarity search.

Usage:
    uv run --with torch --with transformers scripts/similarity.py
"""

from pathlib import Path

import pandas as pd
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

import clusterfun as clt


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


def compute_clip_embeddings(
    image_urls: list[str], batch_size: int = 32
) -> list[list[float]]:
    """Compute CLIP embeddings for a list of image URLs."""
    device = (
        "mps"
        if torch.backends.mps.is_available()
        else "cuda"
        if torch.cuda.is_available()
        else "cpu"
    )
    model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").to(device)
    processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
    model.eval()

    embeddings: list[list[float]] = []
    valid_indices: list[int] = []
    failed_indices: list[int] = []

    for start in range(0, len(image_urls), batch_size):
        batch_urls = image_urls[start : start + batch_size]
        batch_images = []
        batch_valid = []

        for i, url in enumerate(batch_urls):
            img = load_image(url)
            if img is not None:
                batch_images.append(img)
                batch_valid.append(start + i)
            else:
                failed_indices.append(start + i)

        if not batch_images:
            continue

        inputs = processor(images=batch_images, return_tensors="pt", padding=True).to(
            device
        )
        with torch.no_grad():
            image_features = model.get_image_features(**inputs)
            if not isinstance(image_features, torch.Tensor):
                image_features = image_features.pooler_output
            image_features = image_features / image_features.norm(dim=-1, keepdim=True)

        for idx, emb in zip(batch_valid, image_features.cpu().tolist()):
            embeddings.append(emb)
            valid_indices.append(idx)

        print(
            f"  Processed {min(start + batch_size, len(image_urls))}/{len(image_urls)} images"
        )

    if failed_indices:
        print(f"  Skipped {len(failed_indices)} images that failed to load")

    return embeddings, valid_indices


CACHE_PATH = Path(__file__).parent / "wiki_art_with_embeddings.parquet"


def main():
    if CACHE_PATH.exists():
        df = pd.read_parquet(CACHE_PATH)
        print(f"Loaded {len(df)} paintings with cached embeddings from {CACHE_PATH}")
    else:
        df = pd.read_csv(
            "https://raw.githubusercontent.com/gietema/clusterfun-data/main/wiki-art.csv"
        )
        print(f"Loaded {len(df)} paintings")

        print("Computing CLIP embeddings...")
        embeddings, valid_indices = compute_clip_embeddings(df["img_path"].tolist())

        # Keep only rows where embedding was computed successfully
        df = df.iloc[valid_indices].reset_index(drop=True)
        df["clip_embedding"] = embeddings
        print(f"Computed embeddings for {len(df)} paintings ({len(embeddings[0])}-dim)")

        df.to_parquet(CACHE_PATH)
        print(f"Saved embeddings cache to {CACHE_PATH}")

    print(clt.scatter(
        df,
        x="x",
        y="y",
        media="img_path",
        color="painter",
        title="Wiki-Art with CLIP Similarity Search",
        embeddings="clip_embedding",
        embeddings_model="openai/clip-vit-base-patch32",
        show=False,
    ))


if __name__ == "__main__":
    main()
