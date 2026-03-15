"""Column and filter routes for querying and downloading data."""

from typing import Any, Dict, List, Union

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from clusterfun.models.column_info import ColumnInfo
from clusterfun.models.filter import Filter
from clusterfun.models.media_indices import MediaIndices
from clusterfun.storage.backends import get_backend
from clusterfun.storage.factory import get_loader
from clusterfun.storage.query import get_connection

router = APIRouter()


class ColumnStatsRequest(BaseModel):
    media_ids: List[int]
    column: str


@router.post("/api/views/{view_uuid}/filter")
def filter_view(view_uuid: str, filters: List[Filter]) -> List[Dict[str, Any]]:
    """Filter plot based on a list of provided filters."""
    return get_loader(view_uuid).filter(filters)


@router.get("/api/views/{view_uuid}/columns", response_model=List[ColumnInfo])
def columns(view_uuid: str) -> List[ColumnInfo]:
    """Get the columns of the view."""
    df = get_loader(view_uuid).get_dataframe()
    column_info = []
    for col in df.columns:
        column_info.append(ColumnInfo(name=col, dtype=str(df[col].dtype), n_unique=int(df[col].nunique())))
    return column_info


@router.post(
    "/api/views/{view_uuid}/columns/{column}/values",
    response_model=List[Dict[str, Union[str, int]]],
)
def column_values(
    view_uuid: str,
    column: str,
    media_indices: MediaIndices,
) -> List[Dict[str, Union[str, int]]]:
    """Get the columns of the view."""
    loader = get_loader(view_uuid)
    df = loader.get_dataframe(
        media_indices=media_indices if len(media_indices.media_ids) > 0 else None
    )
    value_counts = df[column].sort_values().astype(str).value_counts()
    return [{"label": value, "count": count} for value, count in value_counts.items()]


@router.post("/api/views/{view_uuid}/column-stats")
def column_stats(view_uuid: str, req: ColumnStatsRequest) -> Dict[str, Any]:
    """Compute column statistics server-side, returning aggregated data for histograms/bar charts."""
    loader = get_loader(view_uuid)
    config = loader.load_config()
    column = req.column

    if column not in config.columns:
        return {"type": "empty", "data": []}

    backend = get_backend()
    con = get_connection(view_uuid, backend)

    placeholders = ",".join("?" for _ in req.media_ids)
    base_where = f"id IN ({placeholders})"
    params: list = list(req.media_ids)

    # Use double-quoted identifiers (DuckDB standard); square brackets [col]
    # are list constructors in DuckDB, not column references.
    col = f'"{column}"'

    # Check if column is categorical by sampling values
    sample_query = f"SELECT DISTINCT {col} FROM database WHERE {base_where} LIMIT 50"
    sample = con.execute(sample_query, params).fetchall()
    values = [r[0] for r in sample]
    is_categorical = all(isinstance(v, str) or v is None for v in values)

    if is_categorical:
        # Return value counts (top 50)
        query = (
            f"SELECT {col} as label, COUNT(*) as count "
            f"FROM database WHERE {base_where} "
            f"GROUP BY {col} ORDER BY count DESC LIMIT 50"
        )
        rows = con.execute(query, params).fetchall()
        return {
            "type": "categorical",
            "data": [{"label": str(r[0]), "count": r[1]} for r in rows],
        }
    else:
        # Compute histogram bins server-side
        stats_query = (
            f"SELECT MIN({col}), MAX({col}), COUNT({col}) "
            f"FROM database WHERE {base_where} AND {col} IS NOT NULL"
        )
        stats_row = con.execute(stats_query, params).fetchone()
        min_val, max_val, total = stats_row[0], stats_row[1], stats_row[2]
        if total == 0 or min_val is None:
            return {"type": "numeric", "bins": [], "counts": [], "min": 0, "max": 0}

        num_bins = min(50, max(10, int(total**0.5)))
        bin_width = (max_val - min_val) / num_bins if max_val != min_val else 1
        if max_val == min_val:
            return {
                "type": "numeric",
                "bins": [float(min_val)],
                "counts": [total],
                "min": float(min_val),
                "max": float(max_val),
            }

        bin_query = (
            f"SELECT FLOOR((CAST({col} AS DOUBLE) - {float(min_val)}) / {float(bin_width)}) AS bin, COUNT(*) AS count "
            f"FROM database WHERE {base_where} AND {col} IS NOT NULL "
            f"GROUP BY bin ORDER BY bin"
        )
        rows = con.execute(bin_query, params).fetchall()
        bins = [float(min_val + r[0] * bin_width) for r in rows]
        counts = [r[1] for r in rows]
        return {
            "type": "numeric",
            "bins": bins,
            "counts": counts,
            "min": float(min_val),
            "max": float(max_val),
        }


@router.post("/api/views/{view_uuid}/download-grid")
def download_grid(view_uuid: str, media_indices: MediaIndices) -> StreamingResponse:
    """Download the data selected in the grid"""
    loader = get_loader(view_uuid)
    df = loader.get_dataframe(media_indices=media_indices)
    # TODO:: include labels
    return StreamingResponse(
        iter([df.to_csv(index=False)]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=data.csv"},
    )
