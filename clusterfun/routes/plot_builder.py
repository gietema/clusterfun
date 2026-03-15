"""Dynamic plot data generation endpoint.

Regenerates Plotly trace data on-the-fly when users change plot
configuration (type, x, y, color) in the browser, without re-saving
the underlying Parquet data.
"""

import dataclasses
from typing import Any, Dict, List, Optional

import duckdb
import numpy as np
import pandas as pd
from fastapi import APIRouter
from pydantic import BaseModel

from clusterfun.config import Config
from clusterfun.plot_types.histogram import get_x_and_y
from clusterfun.plot_types.violin import get_violin_x_single
from clusterfun.storage.backends import get_backend
from clusterfun.storage.factory import get_loader
from clusterfun.storage.local.data import get_data_dict
from clusterfun.storage.query import get_connection

router = APIRouter()


class PlotBuilderRequest(BaseModel):
    """Request body for dynamic plot data generation."""

    type: str  # "scatter", "histogram", "bar_chart", "violin"
    x: Optional[str] = None
    y: Optional[str] = None
    color: Optional[str] = None
    color_is_categorical: bool = True
    bins: int = 20  # for histogram


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

    color = cfg.color if cfg.color_is_categorical else None
    x_col = cfg.x

    if color is not None:
        # Fetch id, x, and color columns
        rows = con.execute(
            f"SELECT id, {_safe_col(x_col)}, {_safe_col(color)} FROM database"
        ).fetchall()
        df = pd.DataFrame(rows, columns=["id", x_col, color])

        # Compute _y per color group
        dfs = []
        for color_val in df[color].unique():
            mask = df[color] == color_val
            subset = df.loc[mask, x_col].tolist()
            dots = get_x_and_y(subset, bins)
            y_vals = [d[1] for d in dots]
            sub_df = df.loc[mask].copy()
            sub_df["_y"] = y_vals
            dfs.append(sub_df)
        df = pd.concat(dfs)
    else:
        rows = con.execute(f"SELECT id, {_safe_col(x_col)} FROM database").fetchall()
        df = pd.DataFrame(rows, columns=["id", x_col])
        dots = get_x_and_y(df[x_col].tolist(), bins)
        df["_y"] = [d[1] for d in dots]

    # Register the transformed data in a temporary DuckDB connection
    tmp_con = duckdb.connect()
    try:
        tmp_con.register("df_view", df)
        tmp_con.execute("CREATE VIEW database AS SELECT * FROM df_view")

        hist_cfg = dataclasses.replace(cfg, y="_y")
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
    color = cfg.color if cfg.color_is_categorical else None
    colors_out: Optional[List[str]] = None

    if color is not None:
        rows = con.execute(
            f"SELECT id, {_safe_col(y_col)}, {_safe_col(color)} FROM database"
        ).fetchall()
        df = pd.DataFrame(rows, columns=["id", y_col, color])

        x_items = np.zeros(len(df))
        unique_colors = df[color].unique().tolist()
        colors_out = unique_colors
        for idx, color_val in enumerate(unique_colors):
            mask = df[color] == color_val
            indices = df.index[mask]
            y_vals = df.loc[mask, y_col].tolist()
            x_items[indices] = get_violin_x_single(y_vals) + (idx * 2)
        df["_x"] = x_items
    else:
        rows = con.execute(f"SELECT id, {_safe_col(y_col)} FROM database").fetchall()
        df = pd.DataFrame(rows, columns=["id", y_col])
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
    color = cfg.color if cfg.color_is_categorical else None

    if color is not None:
        rows = con.execute(
            f"SELECT id, {_safe_col(x_col)}, {_safe_col(color)} FROM database"
        ).fetchall()
        df = pd.DataFrame(rows, columns=["id", x_col, color])
    else:
        rows = con.execute(f"SELECT id, {_safe_col(x_col)} FROM database").fetchall()
        df = pd.DataFrame(rows, columns=["id", x_col])

    df["_x"] = 0.0
    df["_y"] = 0.0

    if color is None or not cfg.color_is_categorical:
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
            for y_value, y_count in data_x[color].value_counts().items():
                mask = (df[x_col] == x_value) & (df[color] == y_value)
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
    else:
        # Unknown type: fall back to scatter
        data, colors = _build_scatter_data(con, cfg)

    # Update config with computed values
    cfg = dataclasses.replace(cfg, colors=colors, x_names=x_names)

    return {
        "config": dataclasses.asdict(cfg),
        "data": data,
    }
