"""Dynamic plot data generation endpoint.

Regenerates Plotly trace data on-the-fly when users change plot
configuration (type, x, y, color) in the browser, without re-saving
the underlying Parquet data.
"""

import dataclasses
import os
import threading
from collections import defaultdict
from typing import Any, Dict, List, Optional

import duckdb
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from clusterfun.config import Config
from clusterfun.constants import COLORS
from clusterfun.plot_types.histogram import get_x_and_y
from clusterfun.plot_types.violin import get_violin_x_single
from clusterfun.storage.backends import get_backend
from clusterfun.storage.factory import get_loader
from clusterfun.storage.local.data import get_data_dict, PLOT_SAMPLE_LIMIT
from clusterfun.storage.query import ensure_embeddings_table, get_connection

router = APIRouter()

# Cache color-column categoricity: (view_uuid, color_col) -> is_categorical
_color_cat_cache: Dict[tuple, bool] = {}


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


# Column-name fragments that strongly imply categorical regardless of dtype/cardinality.
# Matched case-insensitively against the column name.
_CATEGORICAL_NAME_HINTS = (
    "label", "class", "category", "categorie",
    "pred", "prediction", "predicted",
    "target", "gt", "y_true", "y_pred",
    "tag", "group", "cluster", "split",
)

# Cardinality cap above which integer columns lose their "categorical" assumption
# (unless the name explicitly hints at a label). MNIST=10, CIFAR-10=10, CIFAR-100=100,
# multi-class classification setups typically ≤ a few dozen — 50 is a forgiving cutoff
# that still excludes IDs, timestamps, and zip codes.
_INTEGER_CATEGORICAL_MAX_DISTINCT = 50


def _detect_color_is_categorical(
    con: duckdb.DuckDBPyConnection, color: str, view_uuid: str
) -> bool:
    """Decide whether a color column should be rendered with a discrete (categorical) palette
    rather than a continuous color scale.

    Heuristics (in order):
      - Strings or booleans → categorical.
      - Floats → continuous.
      - Integers → categorical if cardinality is low (≤ 50) OR the column name hints at a
        label (``label``, ``class``, ``pred``, etc.). This catches MNIST/CIFAR-style integer
        class IDs while still treating things like ``timestamp_ms`` or ``id`` as continuous.
      - Mixed/other → continuous.

    Result is cached per ``(view_uuid, color)``.
    """
    cache_key = (view_uuid, color)
    if cache_key in _color_cat_cache:
        return _color_cat_cache[cache_key]

    sample = con.execute(
        f"SELECT DISTINCT {_safe_col(color)} FROM database LIMIT 51"
    ).fetchall()
    non_null = [row[0] for row in sample if row[0] is not None]
    name_lower = color.lower()
    name_suggests_label = any(hint in name_lower for hint in _CATEGORICAL_NAME_HINTS)

    if not non_null:
        result = True
    elif all(isinstance(v, str) for v in non_null):
        result = True
    elif all(isinstance(v, bool) for v in non_null):
        result = True
    elif all(isinstance(v, int) and not isinstance(v, bool) for v in non_null):
        # Integers: categorical when low-cardinality or the name screams "label".
        # `LIMIT 51` above gives us up to 51 distinct samples — if we got back ≤ the cap
        # then cardinality is definitely ≤ the cap. Otherwise consult the column name.
        if len(non_null) <= _INTEGER_CATEGORICAL_MAX_DISTINCT:
            result = True
        else:
            result = name_suggests_label
    else:
        # Floats and mixed types → continuous, unless the name screams label.
        result = name_suggests_label

    _color_cat_cache[cache_key] = result
    return result


def _build_scatter_data(
    con: duckdb.DuckDBPyConnection, cfg: Config
) -> tuple:
    """Generate scatter trace data by delegating to get_data_dict."""
    data, colors = get_data_dict(con, cfg)
    return data, colors


def _build_traces_from_rows(
    rows: list,
    x_col_idx: int,
    y_col_idx: int,
    color_col_idx: Optional[int],
    is_categorical_color: bool,
    opacity: float = 1.0,
) -> tuple:
    """Build Plotly trace dicts directly from fetched rows — no pandas/DuckDB roundtrip."""
    if color_col_idx is not None and is_categorical_color:
        grouped: Dict[Any, list] = defaultdict(list)
        for r in rows:
            grouped[r[color_col_idx]].append(r)
        # Sort group keys so legends are deterministic and ordered naturally.
        # Mixed-type keys (e.g. None alongside ints) fall back to string sort.
        try:
            sorted_items = sorted(grouped.items(), key=lambda kv: (kv[0] is None, kv[0]))
        except TypeError:
            sorted_items = sorted(grouped.items(), key=lambda kv: (kv[0] is None, str(kv[0])))
        data = []
        colors_out = []
        for idx, (color_val, group_rows) in enumerate(sorted_items):
            colors_out.append(color_val)
            data.append({
                "id": [r[0] for r in group_rows],
                "x": [r[x_col_idx] for r in group_rows],
                "y": [r[y_col_idx] for r in group_rows],
                "mode": "markers",
                "type": "scattergl",
                "name": str(color_val),
                "marker": {"color": COLORS[idx % len(COLORS)], "opacity": opacity},
            })
        return data, colors_out
    else:
        trace = {
            "id": [r[0] for r in rows],
            "x": [r[x_col_idx] for r in rows],
            "y": [r[y_col_idx] for r in rows],
            "mode": "markers",
            "type": "scattergl",
        }
        if color_col_idx is not None and not is_categorical_color:
            trace["marker"] = {
                "color": [r[color_col_idx] for r in rows],
                "colorscale": "Viridis",
                "showscale": True,
            }
        return [trace], None


def _build_histogram_data(
    con: duckdb.DuckDBPyConnection, cfg: Config, bins: int
) -> tuple:
    """Generate histogram trace data with computed _y bin counts."""
    np.random.seed(42)

    cat_color = cfg.color if cfg.color and cfg.color_is_categorical else None
    x_col = cfg.x

    _sample = f" ORDER BY hash(id) LIMIT {PLOT_SAMPLE_LIMIT}"

    if cat_color is not None:
        rows = con.execute(
            f"SELECT id, {_safe_col(x_col)}, {_safe_col(cat_color)} FROM database{_sample}"
        ).fetchall()

        grouped: Dict[Any, list] = defaultdict(list)
        for r in rows:
            grouped[r[2]].append(r)

        try:
            sorted_items = sorted(grouped.items(), key=lambda kv: (kv[0] is None, kv[0]))
        except TypeError:
            sorted_items = sorted(grouped.items(), key=lambda kv: (kv[0] is None, str(kv[0])))

        data = []
        colors_out = []
        for idx, (color_val, group_rows) in enumerate(sorted_items):
            colors_out.append(color_val)
            x_values = [r[1] for r in group_rows]
            dots = get_x_and_y(x_values, bins)
            data.append({
                "id": [r[0] for r in group_rows],
                "x": [d[0] for d in dots],
                "y": [d[1] for d in dots],
                "mode": "markers",
                "type": "scattergl",
                "name": str(color_val),
                "marker": {"color": COLORS[idx % len(COLORS)], "opacity": 0.5},
            })
        return data, colors_out
    else:
        select_cols = f"id, {_safe_col(x_col)}"
        has_color = cfg.color and not cfg.color_is_categorical and cfg.color != x_col
        if has_color:
            select_cols += f", {_safe_col(cfg.color)}"
        rows = con.execute(f"SELECT {select_cols} FROM database{_sample}").fetchall()
        x_values = [r[1] for r in rows]
        dots = get_x_and_y(x_values, bins)
        trace = {
            "id": [r[0] for r in rows],
            "x": [d[0] for d in dots],
            "y": [d[1] for d in dots],
            "mode": "markers",
            "type": "scattergl",
        }
        if has_color:
            trace["marker"] = {
                "color": [r[2] for r in rows],
                "colorscale": "Viridis",
                "showscale": True,
            }
        return [trace], None


def _build_violin_data(
    con: duckdb.DuckDBPyConnection, cfg: Config
) -> tuple:
    """Generate violin trace data with KDE-based x-jitter."""
    np.random.seed(42)

    y_col = cfg.y
    cat_color = cfg.color if cfg.color and cfg.color_is_categorical else None
    _sample = f" ORDER BY hash(id) LIMIT {PLOT_SAMPLE_LIMIT}"

    if cat_color is not None:
        rows = con.execute(
            f"SELECT id, {_safe_col(y_col)}, {_safe_col(cat_color)} FROM database{_sample}"
        ).fetchall()

        grouped: Dict[Any, list] = defaultdict(list)
        for r in rows:
            grouped[r[2]].append(r)

        try:
            sorted_items = sorted(grouped.items(), key=lambda kv: (kv[0] is None, kv[0]))
        except TypeError:
            sorted_items = sorted(grouped.items(), key=lambda kv: (kv[0] is None, str(kv[0])))

        data = []
        colors_out = []
        for idx, (color_val, group_rows) in enumerate(sorted_items):
            colors_out.append(color_val)
            y_vals = [r[1] for r in group_rows]
            x_jitter = get_violin_x_single(y_vals)
            x_offset = [v + (idx * 2) for v in x_jitter]
            data.append({
                "id": [r[0] for r in group_rows],
                "x": x_offset,
                "y": y_vals,
                "mode": "markers",
                "type": "scattergl",
                "name": str(color_val),
                "marker": {"color": COLORS[idx % len(COLORS)], "opacity": 1.0},
            })
        return data, colors_out
    else:
        select_cols = f"id, {_safe_col(y_col)}"
        has_color = cfg.color and not cfg.color_is_categorical and cfg.color != y_col
        if has_color:
            select_cols += f", {_safe_col(cfg.color)}"
        rows = con.execute(f"SELECT {select_cols} FROM database{_sample}").fetchall()
        y_vals = [r[1] for r in rows]
        x_jitter = get_violin_x_single(y_vals)
        trace = {
            "id": [r[0] for r in rows],
            "x": x_jitter,
            "y": y_vals,
            "mode": "markers",
            "type": "scattergl",
        }
        if has_color:
            trace["marker"] = {
                "color": [r[2] for r in rows],
                "colorscale": "Viridis",
                "showscale": True,
            }
        return [trace], None


def _build_bar_chart_data(
    con: duckdb.DuckDBPyConnection, cfg: Config
) -> tuple:
    """Generate bar chart trace data with random scatter within rectangles."""
    np.random.seed(42)

    x_col = cfg.x
    cat_color = cfg.color if cfg.color and cfg.color_is_categorical else None

    _sample = f" ORDER BY hash(id) LIMIT {PLOT_SAMPLE_LIMIT}"

    has_nc_color = False
    if cat_color is not None:
        rows = con.execute(
            f"SELECT id, {_safe_col(x_col)}, {_safe_col(cat_color)} FROM database{_sample}"
        ).fetchall()
    else:
        select_cols = f"id, {_safe_col(x_col)}"
        has_nc_color = bool(cfg.color and not cfg.color_is_categorical and cfg.color != x_col)
        if has_nc_color:
            select_cols += f", {_safe_col(cfg.color)}"
        rows = con.execute(f"SELECT {select_cols} FROM database{_sample}").fetchall()

    # Compute value counts for x
    from collections import Counter
    x_counts = Counter(r[1] for r in rows)
    x_order = [val for val, _ in x_counts.most_common()]
    x_index_map = {val: idx for idx, val in enumerate(x_order)}

    # Build per-row _x, _y arrays
    ids = [r[0] for r in rows]
    x_out = [0.0] * len(rows)
    y_out = [0.0] * len(rows)

    if cat_color is None or not cfg.color_is_categorical:
        # Group by x value
        x_groups: Dict[Any, list] = defaultdict(list)
        for i, r in enumerate(rows):
            x_groups[r[1]].append(i)
        for x_val, indices in x_groups.items():
            xi = x_index_map[x_val]
            count = len(indices)
            rx = np.random.uniform(low=xi, high=0.7 + xi, size=count)
            ry = np.random.uniform(low=0, high=count, size=count)
            for j, idx in enumerate(indices):
                x_out[idx] = float(rx[j])
                y_out[idx] = float(ry[j])
    else:
        for x_val in x_order:
            xi = x_index_map[x_val]
            x_rows_idx = [i for i, r in enumerate(rows) if r[1] == x_val]
            color_counts = Counter(rows[i][2] for i in x_rows_idx)
            stacked_y = 0
            for color_val, y_count in color_counts.most_common():
                color_idx = [i for i in x_rows_idx if rows[i][2] == color_val]
                rx = np.random.uniform(low=xi, high=0.7 + xi, size=y_count)
                ry = np.random.uniform(low=stacked_y, high=y_count + stacked_y, size=y_count)
                for j, idx in enumerate(color_idx):
                    x_out[idx] = float(rx[j])
                    y_out[idx] = float(ry[j])
                stacked_y += y_count

    # Build trace rows with computed positions
    has_color_col = cat_color is not None or has_nc_color
    trace_rows = []
    for i, r in enumerate(rows):
        if has_color_col:
            trace_rows.append((ids[i], x_out[i], y_out[i], r[2]))
        else:
            trace_rows.append((ids[i], x_out[i], y_out[i]))

    color_idx = 3 if has_color_col else None
    is_cat = cat_color is not None
    data, colors_out = _build_traces_from_rows(trace_rows, 1, 2, color_idx, is_cat)
    return data, colors_out, x_order


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


def _projection_filename(method: str, sample_size: int, n_neighbors: int) -> str:
    """Return a deterministic parquet filename for a cached projection."""
    return f"projection_{method}_{sample_size}_{n_neighbors}.parquet"


def _load_projection_from_disk(
    view_uuid: str, method: str, sample_size: int, n_neighbors: int
) -> Optional[pd.DataFrame]:
    """Try to load a previously saved projection from disk."""
    backend = get_backend()
    filename = _projection_filename(method, sample_size, n_neighbors)
    try:
        uri = backend.get_parquet_uri_named(view_uuid, filename)
        if not os.path.exists(uri):
            return None
        table = pq.read_table(uri)
        return table.to_pandas()
    except Exception:
        return None


def _save_projection_to_disk(
    view_uuid: str, proj_df: pd.DataFrame,
    method: str, sample_size: int, n_neighbors: int,
) -> None:
    """Persist a projection to disk for future sessions."""
    backend = get_backend()
    filename = _projection_filename(method, sample_size, n_neighbors)
    try:
        table = pa.Table.from_pandas(proj_df, preserve_index=False)
        backend.save_parquet_named(view_uuid, filename, table)
    except Exception:
        pass  # Non-critical — next request will just recompute


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

    # Count total and subsample in SQL to avoid loading all embeddings
    count_row = emb_con.execute("SELECT COUNT(*) FROM embeddings").fetchone()
    n = count_row[0] if count_row else 0
    if n == 0:
        return [], None

    actual_sample = min(n, sample_size)
    cache_key = f"{view_uuid}:{method}:{actual_sample}:{n_neighbors}"

    # 1. In-memory cache (instant)
    if cache_key in _embedding_projection_cache:
        proj_df = _embedding_projection_cache[cache_key]
    else:
        # 2. Disk cache (fast — avoids UMAP recomputation)
        proj_df = _load_projection_from_disk(
            view_uuid, method, actual_sample, n_neighbors
        )
        if proj_df is not None:
            _embedding_projection_cache[cache_key] = proj_df
        else:
            # 3. Compute (slow — UMAP/t-SNE)
            with _projection_lock:
                # Double-check after acquiring lock
                if cache_key in _embedding_projection_cache:
                    proj_df = _embedding_projection_cache[cache_key]
                else:
                    if n > sample_size:
                        rows = emb_con.execute(
                            f'SELECT id, "{emb_col}" FROM embeddings '
                            f"ORDER BY hash(id + 42) LIMIT {sample_size}"
                        ).fetchall()
                    else:
                        rows = emb_con.execute(
                            f'SELECT id, "{emb_col}" FROM embeddings'
                        ).fetchall()

                    sample_ids = np.array([r[0] for r in rows])
                    sample_emb = np.array([r[1] for r in rows], dtype=np.float32)
                    actual_sample = len(sample_ids)

                    proj_df = _compute_projection(
                        sample_emb, sample_ids, actual_sample, method, n_neighbors
                    )
                    _embedding_projection_cache[cache_key] = proj_df
                    _save_projection_to_disk(
                        view_uuid, proj_df, method, actual_sample, n_neighbors
                    )

    # Build traces directly — join with color column if needed
    proj_ids = proj_df["id"].tolist()
    proj_x = proj_df["_x"].tolist()
    proj_y = proj_df["_y"].tolist()

    if cfg.color:
        col_safe = _safe_col(cfg.color)
        placeholders = ",".join("?" for _ in proj_ids)
        color_rows = con.execute(
            f"SELECT id, {col_safe} FROM database WHERE id IN ({placeholders})",
            proj_ids,
        ).fetchall()
        color_map = {r[0]: r[1] for r in color_rows}
        trace_rows = [
            (pid, px, py, color_map.get(pid))
            for pid, px, py in zip(proj_ids, proj_x, proj_y)
        ]
        data, colors_out = _build_traces_from_rows(
            trace_rows, 1, 2, 3, cfg.color_is_categorical
        )
    else:
        trace_rows = list(zip(proj_ids, proj_x, proj_y))
        data, colors_out = _build_traces_from_rows(trace_rows, 1, 2, None, False)

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

    # Detect whether the color column is categorical (cached)
    color_is_categorical = req.color_is_categorical
    if req.color is not None:
        color_is_categorical = _detect_color_is_categorical(con, req.color, view_uuid)

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
    if req.type not in ("grid", "embedding_map") and req.x is None and req.y is None:
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
