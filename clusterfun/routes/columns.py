"""Column and filter routes for querying and downloading data."""

import sqlite3
from typing import Any, Dict, List, Union

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from clusterfun.models.column_info import ColumnInfo
from clusterfun.models.filter import Filter
from clusterfun.models.media_indices import MediaIndices
from clusterfun.storage.local.loader import LocalLoader

router = APIRouter()


class ColumnStatsRequest(BaseModel):
    media_ids: List[int]
    column: str


@router.post("/api/views/{view_uuid}/filter")
def filter_view(view_uuid: str, filters: List[Filter]) -> List[Dict[str, Any]]:
    """Filter plot based on a list of provided filters."""
    return LocalLoader(view_uuid).filter(filters)


@router.get("/api/views/{view_uuid}/columns", response_model=List[ColumnInfo])
def columns(view_uuid: str) -> List[ColumnInfo]:
    """Get the columns of the view."""
    df = LocalLoader(view_uuid).get_dataframe()
    column_info = []
    for col in df.columns:
        column_info.append(ColumnInfo(name=col, dtype=str(df[col].dtype)))
    return column_info


@router.post("/api/views/{view_uuid}/columns/{column}/values", response_model=List[Dict[str, Union[str, int]]])
def column_values(
    view_uuid: str,
    column: str,
    media_indices: MediaIndices,
) -> List[Dict[str, Union[str, int]]]:
    """Get the columns of the view."""
    df = LocalLoader(view_uuid).get_dataframe(media_indices=media_indices if len(media_indices.media_ids) > 0 else None)
    value_counts = df[column].sort_values().astype(str).value_counts()
    return [{"label": value, "count": count} for value, count in value_counts.items()]


@router.post("/api/views/{view_uuid}/column-stats")
def column_stats(view_uuid: str, req: ColumnStatsRequest) -> Dict[str, Any]:
    """Compute column statistics server-side, returning aggregated data for histograms/bar charts.

    Instead of sending all metadata to the client and computing stats there,
    this endpoint computes the stats directly in SQLite and returns only the
    aggregated result.
    """
    loader = LocalLoader(view_uuid)
    config = loader.load_config()
    column = req.column

    if column not in config.columns:
        return {"type": "empty", "data": []}

    con = sqlite3.connect(loader.db_path, check_same_thread=False)
    try:
        placeholders = ",".join("?" for _ in req.media_ids)
        base_where = f"id IN ({placeholders})"
        params: list = list(req.media_ids)

        # Check if column is categorical by sampling values
        sample_query = f"SELECT DISTINCT [{column}] FROM database WHERE {base_where} LIMIT 50"
        sample = con.execute(sample_query, params).fetchall()
        values = [r[0] for r in sample]
        is_categorical = all(isinstance(v, str) or v is None for v in values)

        if is_categorical:
            # Return value counts (top 50)
            query = (
                f"SELECT [{column}] as label, COUNT(*) as count "
                f"FROM database WHERE {base_where} "
                f"GROUP BY [{column}] ORDER BY count DESC LIMIT 50"
            )
            rows = con.execute(query, params).fetchall()
            return {
                "type": "categorical",
                "data": [{"label": str(r[0]), "count": r[1]} for r in rows],
            }
        else:
            # Return raw numeric values for client-side histogram
            # (Plotly needs the raw data to compute bin edges)
            query = f"SELECT [{column}] FROM database WHERE {base_where}"
            rows = con.execute(query, params).fetchall()
            return {
                "type": "numeric",
                "data": [r[0] for r in rows if r[0] is not None],
            }
    finally:
        con.close()


@router.post("/api/views/{view_uuid}/download-grid")
def download_grid(view_uuid: str, media_indices: MediaIndices) -> StreamingResponse:
    """Download the data selected in the grid"""
    loader = LocalLoader(view_uuid)
    df = loader.get_dataframe(media_indices=media_indices)
    # TODO:: include labels
    return StreamingResponse(
        iter([df.to_csv(index=False)]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=data.csv"},
    )
