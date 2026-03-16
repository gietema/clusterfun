"""HuggingFace dataset support for clusterfun.

Browse any public HuggingFace image dataset directly without downloading.
Uses DuckDB httpfs to read only metadata columns and fetches image bytes on demand.

Usage:
    import clusterfun as clt
    clt.from_huggingface("ethz/food101", split="train")
"""

import dataclasses
import json
from pathlib import Path
from typing import Dict, List, Optional
from uuid import uuid4

import duckdb
import pandas as pd
import requests

from clusterfun.config import Config
from clusterfun.plot import Plot, _register_view_with_project
from clusterfun.storage.backends import get_backend
from clusterfun.storage.local.storer import LocalStorer


def search_datasets(query: str, limit: int = 10) -> List[str]:
    """Search for HuggingFace datasets by name.

    Parameters
    ----------
    query : str
        Search query, e.g. "food101" or "cifar".
    limit : int
        Maximum number of results to return.

    Returns
    -------
    List[str]
        List of dataset IDs, e.g. ["ethz/food101", "nateraw/food101"].
    """
    resp = requests.get(
        "https://huggingface.co/api/datasets",
        params={"search": query, "limit": limit},
        timeout=15,
    )
    resp.raise_for_status()
    return [ds["id"] for ds in resp.json()]


def _discover_parquet_urls(dataset: str, split: str, config_name: str) -> tuple[List[str], str]:
    """Discover parquet file URLs from the HuggingFace datasets server.

    Returns (urls, resolved_config_name).
    """
    resp = requests.get(
        "https://datasets-server.huggingface.co/parquet",
        params={"dataset": dataset},
        timeout=30,
    )
    if resp.status_code == 404:
        # Dataset not found — search for similar names and suggest alternatives
        bare_name = dataset.rsplit("/", 1)[-1]
        try:
            suggestions = search_datasets(bare_name, limit=5)
        except Exception:
            suggestions = []
        msg = f"Dataset '{dataset}' not found on HuggingFace."
        if suggestions:
            formatted = "\n  ".join(suggestions)
            msg += f" Did you mean one of these?\n  {formatted}"
        msg += (
            "\n\nUse clt.search_datasets('...') to search, "
            "or visit https://huggingface.co/datasets"
        )
        raise ValueError(msg)
    resp.raise_for_status()
    data = resp.json()

    parquet_files = data.get("parquet_files", [])
    available_configs = sorted({f.get("config") for f in parquet_files})
    available_splits = sorted({f.get("split") for f in parquet_files})

    # Auto-resolve config: if "default" was requested but doesn't exist,
    # fall back to the sole available config
    resolved_config = config_name
    if config_name == "default" and "default" not in available_configs:
        if len(available_configs) == 1:
            resolved_config = available_configs[0]

    urls = []
    for file_info in parquet_files:
        if file_info.get("split") == split and file_info.get("config") == resolved_config:
            urls.append(file_info["url"])

    if not urls:
        # Try to give a helpful error
        splits_for_config = sorted(
            {f.get("split") for f in parquet_files if f.get("config") == resolved_config}
        )
        if resolved_config in available_configs and split not in splits_for_config:
            raise ValueError(
                f"Split '{split}' not found for dataset='{dataset}' "
                f"(config='{resolved_config}'). "
                f"Available splits: {splits_for_config}"
            )
        raise ValueError(
            f"No parquet files found for dataset='{dataset}', split='{split}', "
            f"config='{config_name}'. "
            f"Available splits: {available_splits}, configs: {available_configs}"
        )
    return urls, resolved_config


def _get_schema(urls: List[str]) -> List[tuple]:
    """Get the column schema from the first parquet file."""
    con = duckdb.connect()
    try:
        con.execute("INSTALL httpfs; LOAD httpfs;")
        return con.execute(f"DESCRIBE SELECT * FROM read_parquet('{urls[0]}')").fetchall()
    finally:
        con.close()


def _detect_all_image_columns(schema: List[tuple]) -> List[str]:
    """Find all struct columns with a 'bytes' field (HF image format).

    Returns column names sorted alphabetically. Returns empty list if none found.
    """
    return sorted(
        row[0]
        for row in schema
        if "STRUCT" in row[1].upper() and "bytes" in row[1].lower()
    )


def _detect_image_column(urls: List[str]) -> str:
    """Auto-detect the primary image column."""
    schema = _get_schema(urls)
    image_cols = _detect_all_image_columns(schema)
    if image_cols:
        return image_cols[0]

    # Fall back to common image column names
    col_names = [row[0] for row in schema]
    for candidate in ("image", "img", "photo", "picture"):
        if candidate in col_names:
            return candidate

    raise ValueError(
        f"Could not auto-detect image column. Columns found: {col_names}. "
        "Please specify image_column explicitly."
    )


def _resolve_labels(dataset: str, config_name: str) -> Optional[dict]:
    """Fetch ClassLabel mappings from the HF dataset info endpoint."""
    try:
        resp = requests.get(
            "https://datasets-server.huggingface.co/info",
            params={"dataset": dataset, "config": config_name},
            timeout=15,
        )
        resp.raise_for_status()
        info = resp.json()

        # Navigate to features
        dataset_info = info.get("dataset_info", {})
        features = dataset_info.get("features", {})

        label_mappings = {}
        for col_name, col_info in features.items():
            if isinstance(col_info, dict) and col_info.get("_type") == "ClassLabel":
                names = col_info.get("names", [])
                if names:
                    label_mappings[col_name] = {i: name for i, name in enumerate(names)}
        return label_mappings if label_mappings else None
    except Exception:
        return None


def _detect_vqa_columns(other_columns: List[str]) -> Optional[Dict[str, str]]:
    """Detect VQA (question/answer/choices/explanation) columns by name matching.

    Returns a dict mapping semantic roles to column names, or None if not a VQA dataset.
    A dataset is considered VQA only if a question column is found.
    """
    col_set = set(other_columns)
    vqa: Dict[str, str] = {}

    # Question: must have one of these to be a VQA dataset
    for name in ("question", "query"):
        if name in col_set:
            vqa["question"] = name
            break
    if "question" not in vqa:
        return None

    # Answer
    for name in ("answer", "answers", "multiple_choice_answer", "label"):
        if name in col_set:
            vqa["answer"] = name
            break

    # Choices: explicit list column, or MMBench-style A/B/C/D
    for name in ("options", "choices"):
        if name in col_set:
            vqa["choices"] = name
            break
    if "choices" not in vqa and all(c in col_set for c in ("A", "B", "C", "D")):
        # MMBench style — will be synthesized into _choices during metadata processing
        vqa["choices"] = "_choices"

    # Explanation
    for name in ("explanation", "solution", "lecture"):
        if name in col_set:
            vqa["explanation"] = name
            break

    return vqa


def _normalize_python_list(value) -> str:
    """Convert a Python repr list string to a proper JSON array string.

    Handles edge cases like escaped quotes and mixed quoting styles
    that are common in HuggingFace datasets (e.g. MMMU options column).
    """
    # Handle array/list/ndarray values (DuckDB returns VARCHAR[] as numpy arrays via fetchdf)
    if hasattr(value, "tolist"):
        return json.dumps(value.tolist())
    if isinstance(value, (list, tuple)):
        return json.dumps(list(value))
    try:
        if pd.isna(value):
            return "[]"
    except (ValueError, TypeError):
        pass
    if value is None:
        return "[]"
    s = str(value).strip()
    if not s.startswith("["):
        return s

    # Try JSON first (already valid)
    try:
        parsed = json.loads(s)
        if isinstance(parsed, list):
            return json.dumps(parsed)
    except (json.JSONDecodeError, ValueError):
        pass

    # Use Python's ast.literal_eval to safely parse Python repr
    import ast
    try:
        parsed = ast.literal_eval(s)
        if isinstance(parsed, list):
            return json.dumps([str(item) for item in parsed])
    except (ValueError, SyntaxError):
        pass

    return s


def _synthesize_mmbench_choices(df: pd.DataFrame) -> pd.DataFrame:
    """Combine MMBench-style A/B/C/D columns into a single JSON _choices column."""
    if not all(c in df.columns for c in ("A", "B", "C", "D")):
        return df
    df["_choices"] = df.apply(
        lambda row: json.dumps(
            [str(row[c]) for c in ("A", "B", "C", "D") if pd.notna(row[c])]
        ),
        axis=1,
    )
    return df


# CharXiv descriptive question templates (IDs 1-19 → question text)
_CHARXIV_QMAP = {
    1: "What is the title of the plot?",
    2: "What is the label of the x-axis?",
    3: "What is the label of the y-axis?",
    4: "What is the leftmost labeled tick on the x-axis?",
    5: "What is the rightmost labeled tick on the x-axis?",
    6: "What is the spatially lowest labeled tick on the y-axis?",
    7: "What is the spatially highest labeled tick on the y-axis?",
    8: "What is difference between consecutive numerical tick values on the x-axis?",
    9: "What is difference between consecutive numerical tick values on the y-axis?",
    10: "How many lines are there?",
    11: "Do any lines intersect?",
    12: "How many discrete labels are there in the legend?",
    13: "What are the names of the labels in the legend? (from top to bottom, then left to right)",
    14: "What is the difference between the maximum and minimum values of the tick labels on the continuous legend (i.e., colorbar)?",
    15: "What is the maximum value of the tick labels on the continuous legend (i.e., colorbar)?",
    16: "What is the general trend of data from left to right?",
    17: "What is the total number of explicitly labeled ticks across all axes?",
    18: "What is the layout of the subplots?",
    19: "What is the number of subplots?",
}


def _is_charxiv_schema(columns: List[str]) -> bool:
    """Check if columns match the CharXiv dataset pattern."""
    col_set = set(columns)
    return (
        "descriptive_q1" in col_set
        and "descriptive_a1" in col_set
        and "reasoning_q" in col_set
        and "reasoning_a" in col_set
    )


def _transform_charxiv(
    df: pd.DataFrame, media_col: str, other_columns: List[str]
) -> tuple[pd.DataFrame, List[str]]:
    """Transform CharXiv multi-question-per-row format into one-row-per-question.

    Each chart in CharXiv has 4 descriptive questions (integer IDs mapping to
    template text) and 1 reasoning question (free text). This function explodes
    each chart into up to 5 rows with standard ``question`` and ``answer`` columns.

    Returns (transformed_df, new_other_columns).
    """
    # Metadata columns to preserve on each exploded row
    meta_cols = [
        c for c in other_columns
        if not c.startswith("descriptive_") and not c.startswith("reasoning_")
    ]

    rows = []
    for _, row in df.iterrows():
        base = {media_col: row[media_col]}
        for col in meta_cols:
            if col in row.index:
                base[col] = row[col]

        # Descriptive questions (q1-q4)
        for i in range(1, 5):
            q_col = f"descriptive_q{i}"
            a_col = f"descriptive_a{i}"
            if q_col in row.index and pd.notna(row[q_col]):
                q_id = int(row[q_col])
                q_text = _CHARXIV_QMAP.get(q_id, f"Descriptive question {q_id}")
                answer = str(row[a_col]) if a_col in row.index and pd.notna(row[a_col]) else ""
                rows.append({
                    **base,
                    "question": q_text,
                    "answer": answer,
                    "question_type": "descriptive",
                    "question_id": q_id,
                })

        # Reasoning question
        if "reasoning_q" in row.index and pd.notna(row["reasoning_q"]):
            rows.append({
                **base,
                "question": str(row["reasoning_q"]),
                "answer": str(row["reasoning_a"]) if pd.notna(row.get("reasoning_a")) else "",
                "question_type": "reasoning",
                "question_id": None,
            })

    new_df = pd.DataFrame(rows)
    new_other_columns = meta_cols + ["question", "answer", "question_type", "question_id"]
    return new_df, new_other_columns


def _read_metadata(
    urls: List[str],
    image_column: str,
    max_rows: Optional[int],
    extra_image_columns: Optional[List[str]] = None,
) -> tuple[pd.DataFrame, List[str]]:
    """Read metadata columns from remote HF parquet files via DuckDB httpfs.

    Returns (df, other_columns) where df has a synthetic 'image' column
    containing the row index for byte fetching.
    """
    extra_set = set(extra_image_columns) if extra_image_columns else set()

    con = duckdb.connect()
    try:
        con.execute("INSTALL httpfs; LOAD httpfs;")

        # Get all columns except image bytes
        schema = con.execute(
            f"DESCRIBE SELECT * FROM read_parquet('{urls[0]}')"
        ).fetchall()

        select_cols = []
        other_columns = []
        for row in schema:
            col_name, col_type = row[0], row[1]
            if col_name == image_column or col_name == "image":
                pass  # Skip image columns (synthetic 'image' column replaces them)
            elif col_name in extra_set:
                # Check null status without reading bytes (parquet bitmap only)
                select_cols.append(
                    f'("{col_name}" IS NOT NULL)::BOOLEAN AS "_has_{col_name}"'
                )
            else:
                select_cols.append(f'"{col_name}"')
                other_columns.append(col_name)

        # Add a global row number as a stable identifier for byte fetching.
        # ROW_NUMBER() gives each row a unique position across all parquet files.
        url_list = ", ".join(f"'{u}'" for u in urls)
        inner_cols = ", ".join(select_cols)
        query = (
            f"SELECT (ROW_NUMBER() OVER () - 1) AS _hf_row_idx, {inner_cols} "
            f"FROM read_parquet([{url_list}])"
        )
        if max_rows is not None:
            query = f"SELECT * FROM ({query}) LIMIT {max_rows}"

        print("Reading metadata from HuggingFace (this may take a moment)...")
        df = con.execute(query).fetchdf()

        # Rename _hf_row_idx to image — this column holds the row index
        # used by the hf-bytes endpoint to fetch the actual image bytes
        df = df.rename(columns={"_hf_row_idx": "image"})
        # Store as string for the media column
        df["image"] = df["image"].astype(str)
    finally:
        con.close()

    # Combine _has_* boolean columns into a single _extra_images JSON list
    if extra_image_columns:
        has_cols = [f"_has_{c}" for c in extra_image_columns if f"_has_{c}" in df.columns]
        if has_cols:
            df["_extra_images"] = df.apply(
                lambda row: json.dumps([
                    c for c in extra_image_columns if row.get(f"_has_{c}", False)
                ]),
                axis=1,
            )
            df = df.drop(columns=has_cols)
            other_columns.append("_extra_images")

    return df, other_columns


def _compute_hf_embeddings(
    urls: List[str],
    image_column: str,
    row_indices: List[int],
    model_name: str,
    batch_size: int = 32,
) -> tuple[List[List[float]], List[int]]:
    """Compute image embeddings by fetching bytes from HF parquet files.

    Returns (embeddings, valid_indices).
    Requires torch and transformers to be installed.
    """
    try:
        import torch
        from transformers import AutoModel, AutoProcessor
    except ImportError:
        raise ImportError(
            "Computing embeddings requires torch and transformers. "
            "Install with: pip install torch transformers"
        )

    from io import BytesIO
    from PIL import Image

    device = (
        "mps" if torch.backends.mps.is_available()
        else "cuda" if torch.cuda.is_available()
        else "cpu"
    )
    print(f"Computing embeddings with {model_name} on {device}...")
    model = AutoModel.from_pretrained(model_name, trust_remote_code=True).to(device)
    processor = AutoProcessor.from_pretrained(model_name, trust_remote_code=True)
    model.eval()

    url_list = ", ".join(f"'{u}'" for u in urls)
    embeddings: List[List[float]] = []
    valid_indices: List[int] = []
    failed = 0

    for start in range(0, len(row_indices), batch_size):
        batch_indices = row_indices[start: start + batch_size]
        batch_images = []
        batch_valid = []

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
            features = model.get_image_features(**inputs)
            if not isinstance(features, torch.Tensor):
                features = features.pooler_output
            features = features / features.norm(dim=-1, keepdim=True)

        for idx, emb in zip(batch_valid, features.cpu().tolist()):
            embeddings.append(emb)
            valid_indices.append(idx)

        processed = min(start + batch_size, len(row_indices))
        print(f"  {processed}/{len(row_indices)} images embedded")

    if failed:
        print(f"  Skipped {failed} images that failed to load")
    return embeddings, valid_indices


def from_huggingface(
    dataset: str,
    split: str = "train",
    config_name: str = "default",
    image_column: Optional[str] = None,
    title: Optional[str] = None,
    show: bool = True,
    project: Optional[str] = None,
    max_rows: Optional[int] = None,
    embeddings_model: Optional[str] = None,
) -> Path:
    """Browse a public HuggingFace image dataset in clusterfun.

    Parameters
    ----------
    dataset : str
        HuggingFace dataset identifier, e.g. "ethz/food101".
    split : str
        Dataset split to load, by default "train".
    config_name : str
        Dataset configuration name, by default "default".
    image_column : str, optional
        Name of the image column. Auto-detected if None.
    title : str, optional
        Title for the view.
    show : bool
        Whether to open the browser, by default True.
    project : str, optional
        Project name to register this view with.
    max_rows : int, optional
        Maximum number of rows to load. None for all.
    embeddings_model : str, optional
        HuggingFace model ID for computing image embeddings, e.g.
        "openai/clip-vit-base-patch32" or "google/siglip2-base-patch16-224".
        Enables similarity search in the resulting view.
        Requires torch and transformers to be installed.

    Returns
    -------
    Path
        Path to the cache directory.
    """
    # 1. Discover parquet URLs
    urls, resolved_config = _discover_parquet_urls(dataset, split, config_name)
    print(f"Found {len(urls)} parquet file(s) for {dataset}/{split}")

    # 2. Auto-detect image columns (primary + extras for multi-image datasets)
    schema = _get_schema(urls)
    all_image_cols = _detect_all_image_columns(schema)
    if image_column is None:
        if all_image_cols:
            image_column = all_image_cols[0]
        else:
            image_column = _detect_image_column(urls)
    extra_image_columns = [c for c in all_image_cols if c != image_column] or None
    print(f"Image column: {image_column}")
    if extra_image_columns:
        print(f"Extra image columns: {extra_image_columns}")

    # 3. Resolve label mappings
    label_mappings = _resolve_labels(dataset, resolved_config)

    # 4. Read metadata via DuckDB httpfs (column pruning skips image bytes)
    df, other_columns = _read_metadata(
        urls, image_column, max_rows, extra_image_columns=extra_image_columns
    )

    print(f"Loaded {len(df)} rows")

    # 5. Apply label mappings (convert integer labels to class names)
    if label_mappings:
        for col_name, mapping in label_mappings.items():
            if col_name in df.columns:
                df[col_name] = df[col_name].map(mapping).fillna(df[col_name])

    # 5b. Transform CharXiv multi-question schema into one-row-per-question
    if _is_charxiv_schema(other_columns):
        df, other_columns = _transform_charxiv(df, "image", other_columns)
        print(f"CharXiv: expanded to {len(df)} question-answer rows")

    # 6. Detect VQA columns and synthesize choices if needed
    vqa = _detect_vqa_columns(other_columns)
    if vqa and vqa.get("choices") == "_choices":
        df = _synthesize_mmbench_choices(df)
        other_columns.append("_choices")

    # 6b. Normalize choices column: convert Python repr to JSON
    if vqa and "choices" in vqa:
        choices_col = vqa["choices"]
        if choices_col in df.columns:
            df[choices_col] = df[choices_col].apply(_normalize_python_list)

    # 7. Set up media column name and columns list
    df = df.reset_index(drop=True)
    media_col = "image"

    # Remove original 'image' column from metadata if it clashes with the
    # synthetic media column (e.g. MathVision has both 'image' path and
    # 'decoded_image' bytes — we use decoded_image, synthetic col is 'image')
    if media_col in other_columns:
        other_columns = [c for c in other_columns if c != media_col]

    # Rename dataset's own 'id' column to avoid clash with the storer's synthetic id
    if "id" in other_columns and "id" in df.columns:
        df = df.rename(columns={"id": "original_id"})
        other_columns = ["original_id" if c == "id" else c for c in other_columns]
        if vqa:
            vqa = {k: ("original_id" if v == "id" else v) for k, v in vqa.items()}

    columns = ["id", media_col] + [c for c in other_columns if c in df.columns]
    df_cols = [c for c in columns if c != "id"]

    # 8. Compute embeddings if requested
    emb_col_name = None
    if embeddings_model:
        row_indices = df[media_col].astype(int).tolist()
        emb_list, valid_indices = _compute_hf_embeddings(
            urls, image_column, row_indices, embeddings_model,
        )
        if emb_list:
            emb_col_name = "_embedding"
            valid_set = set(valid_indices)
            df = df[df[media_col].astype(int).isin(valid_set)].reset_index(drop=True)
            df[emb_col_name] = emb_list
            df_cols.append(emb_col_name)
            print(f"Computed {len(emb_list)} embeddings ({len(emb_list[0])}-dim)")

    # 9. Build config
    display = None
    if vqa:
        display = [vqa["question"]]
        print(f"VQA detected: {vqa}")

    cfg = Config(
        type="grid",
        media=media_col,
        columns=columns,
        title=title or f"{dataset} ({split})",
        display=display,
        hf_parquet_urls=urls,
        hf_image_column=image_column,
        hf_extra_image_columns=extra_image_columns,
        vqa=vqa,
        embeddings=emb_col_name,
        embeddings_model=embeddings_model if emb_col_name else None,
        project=project,
        total_count=len(df),
    )

    # 10. Save using LocalStorer directly (bypass Plot.save's common_media_path logic)
    uuid = str(uuid4())
    LocalStorer().save(uuid, df[df_cols], cfg)

    # 11. Register with project if specified
    if project:
        backend = get_backend()
        _register_view_with_project(uuid, cfg, backend)

    # 12. Open browser
    return Plot(uuid, {}, cfg).show(show)
