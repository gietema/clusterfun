"""HuggingFace dataset support for clusterfun.

Browse any public HuggingFace image dataset directly without downloading.
Uses DuckDB httpfs to read only metadata columns and fetches image bytes on demand.

Usage:
    import clusterfun as clt
    clt.from_huggingface("ethz/food101", split="train")
"""

import dataclasses
from pathlib import Path
from typing import List, Optional
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


def _detect_image_column(urls: List[str]) -> str:
    """Auto-detect the image column by finding a struct with a 'bytes' field."""
    con = duckdb.connect()
    try:
        con.execute("INSTALL httpfs; LOAD httpfs;")
        result = con.execute(f"DESCRIBE SELECT * FROM read_parquet('{urls[0]}')").fetchall()
    finally:
        con.close()

    # Look for struct columns with 'bytes' field (HF image format)
    for row in result:
        col_name, col_type = row[0], row[1]
        if "STRUCT" in col_type.upper() and "bytes" in col_type.lower():
            return col_name

    # Fall back to common image column names
    col_names = [row[0] for row in result]
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


def _read_metadata(
    urls: List[str], image_column: str, max_rows: Optional[int]
) -> tuple[pd.DataFrame, List[str]]:
    """Read metadata columns from remote HF parquet files via DuckDB httpfs.

    Returns (df, other_columns) where df has a synthetic 'image' column
    containing the row index for byte fetching.
    """
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
            if col_name == image_column:
                # Skip image column entirely — we use row number for lookups
                pass
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

    return df, other_columns


def from_huggingface(
    dataset: str,
    split: str = "train",
    config_name: str = "default",
    image_column: Optional[str] = None,
    title: Optional[str] = None,
    show: bool = True,
    project: Optional[str] = None,
    max_rows: Optional[int] = None,
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

    Returns
    -------
    Path
        Path to the cache directory.
    """
    # 1. Discover parquet URLs
    urls, resolved_config = _discover_parquet_urls(dataset, split, config_name)
    print(f"Found {len(urls)} parquet file(s) for {dataset}/{split}")

    # 2. Auto-detect image column
    if image_column is None:
        image_column = _detect_image_column(urls)
    print(f"Image column: {image_column}")

    # 3. Resolve label mappings
    label_mappings = _resolve_labels(dataset, resolved_config)

    # 4. Read metadata via DuckDB httpfs (column pruning skips image bytes)
    df, other_columns = _read_metadata(urls, image_column, max_rows)

    print(f"Loaded {len(df)} rows")

    # 5. Apply label mappings (convert integer labels to class names)
    if label_mappings:
        for col_name, mapping in label_mappings.items():
            if col_name in df.columns:
                df[col_name] = df[col_name].map(mapping).fillna(df[col_name])

    # 6. Set up media column name and columns list
    df = df.reset_index(drop=True)
    media_col = "image"
    # columns includes "id" as schema declaration; the storer adds the actual id column
    columns = ["id", media_col] + [c for c in other_columns if c in df.columns]
    df_cols = [c for c in columns if c != "id"]

    # 7. Build config
    cfg = Config(
        type="grid",
        media=media_col,
        columns=columns,
        title=title or f"{dataset} ({split})",
        hf_parquet_urls=urls,
        hf_image_column=image_column,
        project=project,
        total_count=len(df),
    )

    # 8. Save using LocalStorer directly (bypass Plot.save's common_media_path logic)
    uuid = str(uuid4())
    LocalStorer().save(uuid, df[df_cols], cfg)

    # 9. Register with project if specified
    if project:
        backend = get_backend()
        _register_view_with_project(uuid, cfg, backend)

    # 10. Open browser
    return Plot(uuid, {}, cfg).show(show)
