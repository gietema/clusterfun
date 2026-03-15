"""Dynamic plot data generation endpoint.

Regenerates Plotly trace data on-the-fly when users change plot
configuration (type, x, y, color) in the browser, without re-saving
the underlying Parquet data.
"""

import dataclasses
import threading
from typing import Any, Dict, List, Optional

import duckdb
import numpy as np
import pandas as pd
from fastapi import APIRouter
from pydantic import BaseModel

from fastapi import HTTPException

from clusterfun.config import Config
from clusterfun.plot_types.histogram import get_x_and_y
from clusterfun.plot_types.violin import get_violin_x_single
from clusterfun.storage.backends import get_backend
from clusterfun.storage.factory import get_loader
from clusterfun.storage.local.data import get_data_dict
from clusterfun.storage.query import ensure_embeddings_table, get_connection

router = APIRouter()


class PlotBuilderRequest(BaseModel):
    """Request body for dynamic plot data generation."""

    type: str  # "scatter", "histogram", "bar_chart", "violin", "embedding_map"
    x: Optional[str] = None
    y: Optional[str] = None
    color: Optional[str] = None
    color_is_categorical: bool = True
    bins: int = 20  # for histogram
    sample_size: int = 10000  # for embedding_map
    method: str = "umap"  # "umap", "tsne", "pca"
    n_neighbors: int = 15  # for UMAP


def _safe_col(name: str) -> str:
    """Escape a column name for use in double-quoted DuckDB identifiers."""
    return '"' + name.replace('"', '""') + '"'


def _detect_color_is_categorical(
    con: duckdb.DuckDBPyConnection, color: str
) -> bool:
    """Sample the color column and return True if all values are strings."""
    sample = con.execute(
        f"SELECT DISTINCT {_safe_col(color)} FROM database LIMIT 50"
    ).fetchall()
    return all(isinstance(row[0], str) or row[0] is None for row in sample)


def _build_scatter_data(
    con: duckdb.DuckDBPyConnection, cfg: Config
) -> tuple:
    """Generate scatter trace data by delegating to get_data_dict."""
    data, colors = get_data_dict(con, cfg)
    return data, colors


def _build_histogram_data(
    con: duckdb.DuckDBPyConnection, cfg: Config, bins: int
) -> tuple:
    """Generate histogram trace data with computed _y bin counts."""
    np.random.seed(42)

    cat_color = cfg.color if cfg.color and cfg.color_is_categorical else None
    x_col = cfg.x

    if cat_color is not None:
        # Fetch id, x, and color columns
        rows = con.execute(
            f"SELECT id, {_safe_col(x_col)}, {_safe_col(cat_color)} FROM database"
        ).fetchall()
        df = pd.DataFrame(rows, columns=["id", x_col, cat_color])

        # Compute _x and _y per color group
        dfs = []
        for color_val in df[cat_color].unique():
            mask = df[cat_color] == color_val
            subset = df.loc[mask, x_col].tolist()
            dots = get_x_and_y(subset, bins)
            sub_df = df.loc[mask].copy()
            sub_df["_x"] = [d[0] for d in dots]
            sub_df["_y"] = [d[1] for d in dots]
            dfs.append(sub_df)
        df = pd.concat(dfs)
    else:
        # Fetch id, x, and optionally a non-categorical color column
        select_cols = f"id, {_safe_col(x_col)}"
        df_cols = ["id", x_col]
        if cfg.color and not cfg.color_is_categorical and cfg.color != x_col:
            select_cols += f", {_safe_col(cfg.color)}"
            df_cols.append(cfg.color)
        rows = con.execute(f"SELECT {select_cols} FROM database").fetchall()
        df = pd.DataFrame(rows, columns=df_cols)
        dots = get_x_and_y(df[x_col].tolist(), bins)
        df["_x"] = [d[0] for d in dots]
        df["_y"] = [d[1] for d in dots]

    # Register the transformed data in a temporary DuckDB connection
    tmp_con = duckdb.connect()
    try:
        tmp_con.register("df_view", df)
        tmp_con.execute("CREATE VIEW database AS SELECT * FROM df_view")

        hist_cfg = dataclasses.replace(cfg, x="_x", y="_y")
        data, colors_out = get_data_dict(tmp_con, hist_cfg)
    finally:
        tmp_con.close()
    return data, colors_out


def _build_violin_data(
    con: duckdb.DuckDBPyConnection, cfg: Config
) -> tuple:
    """Generate violin trace data with KDE-based x-jitter."""
    np.random.seed(42)

    y_col = cfg.y
    cat_color = cfg.color if cfg.color and cfg.color_is_categorical else None
    colors_out: Optional[List[str]] = None

    if cat_color is not None:
        rows = con.execute(
            f"SELECT id, {_safe_col(y_col)}, {_safe_col(cat_color)} FROM database"
        ).fetchall()
        df = pd.DataFrame(rows, columns=["id", y_col, cat_color])

        x_items = np.zeros(len(df))
        unique_colors = df[cat_color].unique().tolist()
        colors_out = unique_colors
        for idx, color_val in enumerate(unique_colors):
            mask = df[cat_color] == color_val
            indices = df.index[mask]
            y_vals = df.loc[mask, y_col].tolist()
            x_items[indices] = get_violin_x_single(y_vals) + (idx * 2)
        df["_x"] = x_items
    else:
        select_cols = f"id, {_safe_col(y_col)}"
        df_cols = ["id", y_col]
        if cfg.color and not cfg.color_is_categorical and cfg.color != y_col:
            select_cols += f", {_safe_col(cfg.color)}"
            df_cols.append(cfg.color)
        rows = con.execute(f"SELECT {select_cols} FROM database").fetchall()
        df = pd.DataFrame(rows, columns=df_cols)
        df["_x"] = get_violin_x_single(df[y_col].tolist())

    # Register the transformed data in a temporary DuckDB connection
    tmp_con = duckdb.connect()
    try:
        tmp_con.register("df_view", df)
        tmp_con.execute("CREATE VIEW database AS SELECT * FROM df_view")

        violin_cfg = dataclasses.replace(cfg, x="_x")
        data, colors_data = get_data_dict(tmp_con, violin_cfg)
    finally:
        tmp_con.close()

    if colors_out is None and colors_data is not None:
        colors_out = colors_data

    return data, colors_out


def _build_bar_chart_data(
    con: duckdb.DuckDBPyConnection, cfg: Config
) -> tuple:
    """Generate bar chart trace data with random scatter within rectangles."""
    np.random.seed(42)

    x_col = cfg.x
    cat_color = cfg.color if cfg.color and cfg.color_is_categorical else None

    if cat_color is not None:
        rows = con.execute(
            f"SELECT id, {_safe_col(x_col)}, {_safe_col(cat_color)} FROM database"
        ).fetchall()
        df = pd.DataFrame(rows, columns=["id", x_col, cat_color])
    else:
        select_cols = f"id, {_safe_col(x_col)}"
        df_cols = ["id", x_col]
        if cfg.color and not cfg.color_is_categorical and cfg.color != x_col:
            select_cols += f", {_safe_col(cfg.color)}"
            df_cols.append(cfg.color)
        rows = con.execute(f"SELECT {select_cols} FROM database").fetchall()
        df = pd.DataFrame(rows, columns=df_cols)

    df["_x"] = 0.0
    df["_y"] = 0.0

    if cat_color is None or not cfg.color_is_categorical:
        for index, (value, count) in enumerate(df[x_col].value_counts().items()):
            mask = df[x_col] == value
            df.loc[mask, "_x"] = np.random.uniform(
                low=index, high=0.7 + index, size=count
            )
            df.loc[mask, "_y"] = np.random.uniform(low=0, high=count, size=count)
    else:
        for x_index, (x_value, _) in enumerate(df[x_col].value_counts().items()):
            data_x = df[df[x_col] == x_value]
            stacked_y_ref = 0
            for y_value, y_count in data_x[cat_color].value_counts().items():
                mask = (df[x_col] == x_value) & (df[cat_color] == y_value)
                df.loc[mask, "_x"] = np.random.uniform(
                    low=x_index, high=0.7 + x_index, size=y_count
                )
                df.loc[mask, "_y"] = np.random.uniform(
                    low=stacked_y_ref, high=y_count + stacked_y_ref, size=y_count
                )
                stacked_y_ref += y_count

    x_names = df[x_col].value_counts().keys().tolist()

    # Register the transformed data in a temporary DuckDB connection
    tmp_con = duckdb.connect()
    try:
        tmp_con.register("df_view", df)
        tmp_con.execute("CREATE VIEW database AS SELECT * FROM df_view")

        bar_cfg = dataclasses.replace(cfg, x="_x", y="_y")
        data, colors_out = get_data_dict(tmp_con, bar_cfg)
    finally:
        tmp_con.close()

    return data, colors_out, x_names


# Cache for 2D projections so color changes are instant.
_embedding_projection_cache: Dict[str, pd.DataFrame] = {}
# Numba (used by UMAP internally) is not thread-safe with the default
# "workqueue" threading layer. A lock ensures only one projection runs
# at a time. Cached results bypass the lock entirely.
_projection_lock = threading.Lock()


def _compute_projection(
    sample_emb: np.ndarray,
    sample_ids: np.ndarray,
    actual_sample: int,
    method: str,
    n_neighbors: int,
) -> pd.DataFrame:
    """Run dimensionality reduction (UMAP/t-SNE/PCA) on embeddings."""
    # PCA pre-reduction: high-dim NN search is the bottleneck.
    # Reducing 768-dim to 50-dim cuts distance computation ~15x.
    n_dims = sample_emb.shape[1]
    reduced = sample_emb
    if method != "pca" and n_dims > 50:
        from sklearn.decomposition import PCA as _PCA

        reduced = _PCA(n_components=50).fit_transform(sample_emb)

    # For large samples, fit UMAP on a subset then transform the rest.
    FIT_THRESHOLD = 8000

    if method == "umap":
        import umap as umap_lib

        reducer = umap_lib.UMAP(
            n_neighbors=min(n_neighbors, actual_sample - 1),
            n_components=2,
            metric="euclidean",
            init="pca",
            n_jobs=-1,
        )
        if actual_sample > FIT_THRESHOLD:
            fit_rng = np.random.RandomState(42)
            fit_idx = fit_rng.choice(actual_sample, FIT_THRESHOLD, replace=False)
            rest_mask = np.ones(actual_sample, dtype=bool)
            rest_mask[fit_idx] = False
            reducer.fit(reduced[fit_idx])
            coords = np.empty((actual_sample, 2), dtype=np.float32)
            coords[fit_idx] = reducer.embedding_
            coords[rest_mask] = reducer.transform(reduced[rest_mask])
        else:
            coords = reducer.fit_transform(reduced)
    elif method == "tsne":
        from sklearn.manifold import TSNE

        reducer = TSNE(
            n_components=2,
            perplexity=min(30, actual_sample - 1),
            n_jobs=-1,
        )
        coords = reducer.fit_transform(reduced)
    elif method == "pca":
        from sklearn.decomposition import PCA

        reducer = PCA(n_components=2)
        coords = reducer.fit_transform(sample_emb)
    else:
        raise ValueError(f"Unknown method: {method}")

    return pd.DataFrame(
        {
            "id": sample_ids,
            "_x": coords[:, 0].astype(float),
            "_y": coords[:, 1].astype(float),
        }
    )


def _build_embedding_map_data(
    con: duckdb.DuckDBPyConnection,
    cfg: Config,
    view_uuid: str,
    sample_size: int = 10000,
    method: str = "umap",
    n_neighbors: int = 15,
) -> tuple:
    """Generate 2D embedding map using UMAP, t-SNE, or PCA."""
    backend = get_backend()
    emb_col = cfg.embeddings

    emb_con = ensure_embeddings_table(
        view_uuid,
        backend,
        emb_col,
        embeddings_source=cfg.embeddings_source,
        media_col=cfg.media,
    )

    rows = emb_con.execute(
        f'SELECT id, "{emb_col}" FROM embeddings'
    ).fetchall()

    if not rows:
        return [], None

    all_ids = np.array([r[0] for r in rows])
    all_embeddings = np.array([r[1] for r in rows], dtype=np.float32)

    n = len(all_ids)
    actual_sample = min(n, sample_size)
    if n > sample_size:
        rng = np.random.RandomState(42)
        idx = np.sort(rng.choice(n, sample_size, replace=False))
        sample_ids = all_ids[idx]
        sample_emb = all_embeddings[idx]
    else:
        sample_ids = all_ids
        sample_emb = all_embeddings

    cache_key = f"{view_uuid}:{method}:{actual_sample}:{n_neighbors}"
    if cache_key in _embedding_projection_cache:
        proj_df = _embedding_projection_cache[cache_key]
    else:
        with _projection_lock:
            # Double-check after acquiring lock (another thread may have filled it)
            if cache_key in _embedding_projection_cache:
                proj_df = _embedding_projection_cache[cache_key]
            else:
                proj_df = _compute_projection(
                    sample_emb, sample_ids, actual_sample, method, n_neighbors
                )
                _embedding_projection_cache[cache_key] = proj_df

    # Join with color column if needed
    if cfg.color:
        col_safe = _safe_col(cfg.color)
        color_rows = con.execute(
            f"SELECT id, {col_safe} FROM database"
        ).fetchall()
        color_df = pd.DataFrame(color_rows, columns=["id", cfg.color])
        df = proj_df.merge(color_df, on="id", how="left")
    else:
        df = proj_df.copy()

    tmp_con = duckdb.connect()
    try:
        tmp_con.register("df_view", df)
        tmp_con.execute("CREATE VIEW database AS SELECT * FROM df_view")
        map_cfg = dataclasses.replace(cfg, x="_x", y="_y", type="scatter")
        data, colors_out = get_data_dict(tmp_con, map_cfg)
    finally:
        tmp_con.close()

    return data, colors_out


@router.post("/api/views/{view_uuid}/plot-data")
def build_plot_data(
    view_uuid: str, req: PlotBuilderRequest
) -> Dict[str, Any]:
    """Regenerate Plotly trace data for a new plot configuration."""
    loader = get_loader(view_uuid)
    base_config = loader.load_config()
    backend = get_backend()
    con = get_connection(view_uuid, backend)

    # Detect whether the color column is categorical
    color_is_categorical = req.color_is_categorical
    if req.color is not None:
        color_is_categorical = _detect_color_is_categorical(con, req.color)

    # Build a modified config from the base, overriding plot parameters
    cfg = dataclasses.replace(
        base_config,
        type=req.type,
        x=req.x,
        y=req.y,
        color=req.color,
        color_is_categorical=color_is_categorical,
        # Reset computed fields that depend on plot type
        colors=None,
        x_names=None,
    )

    x_names: Optional[List[str]] = None
    colors: Optional[List[str]] = None

    # Handle the case where x or y is None gracefully
    if req.type != "grid" and req.x is None and req.y is None:
        cfg = dataclasses.replace(cfg, type="grid")

    if cfg.type == "grid":
        data, colors = get_data_dict(con, cfg)
    elif cfg.type == "scatter":
        data, colors = _build_scatter_data(con, cfg)
    elif cfg.type == "histogram":
        if req.x is None:
            data, colors = get_data_dict(
                con, dataclasses.replace(cfg, type="grid")
            )
        else:
            data, colors = _build_histogram_data(con, cfg, req.bins)
    elif cfg.type == "violin":
        if req.y is None:
            data, colors = get_data_dict(
                con, dataclasses.replace(cfg, type="grid")
            )
        else:
            data, colors = _build_violin_data(con, cfg)
    elif cfg.type == "bar_chart":
        if req.x is None:
            data, colors = get_data_dict(
                con, dataclasses.replace(cfg, type="grid")
            )
        else:
            data, colors, x_names = _build_bar_chart_data(con, cfg)
    elif cfg.type == "embedding_map":
        if not base_config.embeddings:
            raise HTTPException(
                status_code=400, detail="No embeddings configured for this view"
            )
        data, colors = _build_embedding_map_data(
            con, cfg, view_uuid, req.sample_size, req.method, req.n_neighbors
        )
    else:
        # Unknown type: fall back to scatter
        data, colors = _build_scatter_data(con, cfg)

    # Update config with computed values
    if req.type == "embedding_map":
        method_label = req.method.upper() if req.method != "tsne" else "t-SNE"
        cfg = dataclasses.replace(
            cfg, colors=colors, x_names=x_names,
            x=f"{method_label} 1", y=f"{method_label} 2",
        )
    else:
        cfg = dataclasses.replace(cfg, colors=colors, x_names=x_names)

    return {
        "config": dataclasses.asdict(cfg),
        "data": data,
    }
