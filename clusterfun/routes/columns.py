"""Column and filter routes for querying and downloading data."""

import csv
import io
from typing import Any, Dict, List, Union

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from clusterfun.models.column_info import ColumnInfo
from clusterfun.models.filter import Filter
from clusterfun.models.media_indices import MediaIndices
from clusterfun.storage.backends import get_backend
from clusterfun.storage.factory import get_loader
from clusterfun.storage.local.helpers import get_media_query
from clusterfun.storage.query import get_connection

router = APIRouter()


class ColumnStatsRequest(BaseModel):
    media_ids: List[int]
    column: str
    offset: int = 0
    limit: int = 50


@router.post("/api/views/{view_uuid}/filter")
def filter_view(view_uuid: str, filters: List[Filter]) -> List[Dict[str, Any]]:
    """Filter plot based on a list of provided filters."""
    return get_loader(view_uuid).filter(filters)


@router.get("/api/views/{view_uuid}/columns", response_model=List[ColumnInfo])
def columns(view_uuid: str) -> List[ColumnInfo]:
    """Get the columns of the view."""
    backend = get_backend()
    con = get_connection(view_uuid, backend)
    col_info = con.execute("SELECT column_name, column_type FROM (DESCRIBE database)").fetchall()
    column_info = []
    for col_name, col_type in col_info:
        row = con.execute(f'SELECT approx_count_distinct("{col_name}") FROM database').fetchone()
        n_unique = int(row[0]) if row else 0
        column_info.append(ColumnInfo(name=col_name, dtype=col_type, n_unique=n_unique))
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
    backend = get_backend()
    con = get_connection(view_uuid, backend)
    col = f'"{column}"'
    if len(media_indices.media_ids) > 0:
        placeholders = ",".join("?" for _ in media_indices.media_ids)
        query = (
            f"SELECT CAST({col} AS VARCHAR) as label, COUNT(*) as count "
            f"FROM database WHERE id IN ({placeholders}) "
            f"GROUP BY {col} ORDER BY count DESC"
        )
        rows = con.execute(query, list(media_indices.media_ids)).fetchall()
    else:
        query = (
            f"SELECT CAST({col} AS VARCHAR) as label, COUNT(*) as count "
            f"FROM database GROUP BY {col} ORDER BY count DESC"
        )
        rows = con.execute(query).fetchall()
    return [{"label": r[0], "count": r[1]} for r in rows]


class CountRequest(BaseModel):
    filters: List[Filter] = []


@router.post("/api/views/{view_uuid}/count")
def filtered_count(view_uuid: str, req: CountRequest) -> Dict[str, int]:
    """Return the number of items matching the given filters."""
    backend = get_backend()
    con = get_connection(view_uuid, backend)
    if req.filters:
        loader = get_loader(view_uuid)
        config = loader.load_config()
        from clusterfun.storage.local.helpers import get_filter_query
        where, params = get_filter_query(con, config, req.filters)
        if where:
            row = con.execute(f"SELECT COUNT(*) FROM database WHERE {where}", params).fetchone()
        else:
            row = con.execute("SELECT COUNT(*) FROM database").fetchone()
    else:
        row = con.execute("SELECT COUNT(*) FROM database").fetchone()
    return {"count": row[0] if row else 0}


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
        # Get total number of distinct values
        total_query = (
            f"SELECT COUNT(DISTINCT {col}) FROM database WHERE {base_where}"
        )
        total_row = con.execute(total_query, params).fetchone()
        total_unique = total_row[0] if total_row else 0

        # Return paginated value counts
        query = (
            f"SELECT {col} as label, COUNT(*) as count "
            f"FROM database WHERE {base_where} "
            f"GROUP BY {col} ORDER BY count DESC "
            f"LIMIT {req.limit} OFFSET {req.offset}"
        )
        rows = con.execute(query, params).fetchall()
        return {
            "type": "categorical",
            "data": [{"label": str(r[0]), "count": r[1]} for r in rows],
            "total_unique": total_unique,
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


def _csv_generator(view_uuid: str, media_indices: MediaIndices):
    """Stream CSV rows using DuckDB fetchmany to avoid loading all data into memory."""
    backend = get_backend()
    loader = get_loader(view_uuid)
    config = loader.load_config()
    con = get_connection(view_uuid, backend)
    query, params = get_media_query(media_indices, paginate=False, config=config, con=con)
    result = con.execute(query, params or [])
    columns = [desc[0] for desc in result.description]

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(columns)
    yield buf.getvalue()
    buf.seek(0)
    buf.truncate(0)

    while True:
        chunk = result.fetchmany(10_000)
        if not chunk:
            break
        for row in chunk:
            writer.writerow(row)
        yield buf.getvalue()
        buf.seek(0)
        buf.truncate(0)


@router.post("/api/views/{view_uuid}/download-grid")
def download_grid(view_uuid: str, media_indices: MediaIndices) -> StreamingResponse:
    """Download the data selected in the grid"""
    return StreamingResponse(
        _csv_generator(view_uuid, media_indices),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=data.csv"},
    )
