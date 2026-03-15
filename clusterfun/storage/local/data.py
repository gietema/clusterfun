"""
data.py
=======

This module contains functions for formatting the data to be used in the plotly plots.
"""

from typing import Any, Dict, List, Optional, Tuple

from clusterfun.config import Config
from clusterfun.constants import COLORS


def get_data_dict(
    con: Any,
    cfg: Config,
    query_addition: Optional[str] = None,
    query_params: Optional[List] = None,
) -> Tuple[List[Dict[str, Any]], Optional[List[str]]]:
    """Get data for plotly graph. Used to store directly to disk here.
    - Used when saving the data for the first time. By saving the data in the right format once,
    we can save a lot of time later on as we will directly
    use the data from disk instead of querying the database again.
    - Also used when filtering data and we need to update the data on the fly.

    Parameters
    ----------
    con : Any
        Database connection (DuckDB connection)
    cfg : Config
        Configuration object
    query_addition : Optional[str], optional
        Additional query string to add to the query, by default None
        Used for filtering data. Should use ? placeholders for values.
    query_params : Optional[List], optional
        Parameters for the query placeholders, by default None

    Returns
    -------
    Tuple[List[Dict[str, Any]], Optional[List[str]]]
        Data for plotly graph.
        List of dicts with keys: id, x, y, mode, type, name (optional) and marker (optional)

        List of colors for each data point. Used for coloring the data points.
    """
    colors = None
    if cfg.color is not None and cfg.color_is_categorical:
        return get_data_per_color(cfg, con, query_addition, query_params)
    if cfg.type == "grid":
        data = get_grid_data(con, query_addition, query_params)
    else:
        data = get_data_standard(cfg, con, query_addition, query_params)
    return data, colors


def get_data_standard(
    cfg: Config,
    con: Any,
    query_addition: Optional[str] = None,
    query_params: Optional[List] = None,
) -> List[Dict[str, Any]]:
    """Get data for standard plotly graph, in case there is no color column.

    Parameters
    ----------
    cfg : Config
        Configuration object
    con : Any
        Database connection (DuckDB connection)
    query_addition : Optional[str], optional
        Additional query string to add to the query, by default None
        Used for filtering data. Should use ? placeholders for values.
    query_params : Optional[List], optional
        Parameters for the query placeholders, by default None

    Returns
    -------
    List[Dict[str, Any]]
        Data for plotly graph.
        List of dicts with keys: id, x, y, mode, type
    """
    select_columns = ["id"]
    if cfg.x is not None:
        select_columns.append(cfg.x)
    if cfg.y is not None:
        select_columns.append(cfg.y)
    if cfg.color is not None and not cfg.color_is_categorical:
        select_columns.append(cfg.color)

    query = f"SELECT {','.join(select_columns)} FROM database"

    params: List = []
    if query_addition:
        query += f" WHERE {query_addition}"
        if query_params:
            params.extend(query_params)
    if params:
        res = con.execute(query, params).fetchall()
    else:
        res = con.execute(query).fetchall()
    data = [
        {
            "id": [x[0] for x in res],
            "mode": "markers",
            "type": "scattergl",
        }
    ]
    if cfg.x is not None:
        data[0]["x"] = [x[1] for x in res]
    if cfg.y is not None:
        data[0]["y"] = [x[2] for x in res]
    if cfg.color is not None and not cfg.color_is_categorical:
        # Color is always categorical here, index always the last column
        data[0]["marker"] = {
            "color": [x[-1] for x in res],
            "colorscale": "Viridis",
            "showscale": True,
        }
    return data


def get_grid_data(
    con: Any,
    query_addition: Optional[str] = None,
    query_params: Optional[List] = None,
) -> List[Dict[str, List[int]]]:
    """Get data for the grid. The grid is a special case as it does not have x and y values,
    so we can be more efficient here.

    Parameters
    ----------
    con : Any
        Database connection (DuckDB connection)
    query_addition : Optional[str], optional
        Additional query string to add to the query, by default None
        Used when filtering data. Should use ? placeholders for values.
    query_params : Optional[List], optional
        Parameters for the query placeholders, by default None

    Returns
    -------
    List[Dict[str, List[int]]]
        Data for the grid
    """
    query = "SELECT COUNT(*) FROM database"
    params: List = []
    if query_addition:
        query += f" WHERE {query_addition}"
        if query_params:
            params.extend(query_params)
    if params:
        res = con.execute(query, params).fetchone()
    else:
        res = con.execute(query).fetchone()
    count = res[0] if res else 0
    data: List[Dict[str, Any]] = [{"count": count}]
    return data


def get_data_per_color(
    cfg: Config,
    con: Any,
    query_addition: Optional[str] = None,
    query_params: Optional[List] = None,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Get data for plotly graph per color.

    Uses a single query to fetch all data, then groups by color in Python
    to avoid N+1 query overhead.

    Parameters
    ----------
    cfg : Config
        Configuration object
    con : Any
        Database connection (DuckDB connection)
    query_addition : Optional[str], optional
        Additional query string to add to the query, by default None
        Used when filtering data. Should use ? placeholders for values.
    query_params : Optional[List], optional
        Parameters for the query placeholders, by default None

    Returns
    -------
    Tuple[List[Dict[str, Any]], List[str]]
        Data for plotly graph.
        List of dicts with keys: id, x, y, mode, type, name (the color) and marker (indicating the color)

        List of colors for each data point. Used for coloring the data points.
    """
    query = f"SELECT id,{cfg.x},{cfg.y},{cfg.color} FROM database"
    params: List = []
    if query_addition:
        where = query_addition.lstrip(" ")
        if where.startswith("AND"):
            where = where[3:].lstrip(" ")
        query += f" WHERE {where}"
        if query_params:
            params.extend(query_params)

    if params:
        all_rows: List[Any] = con.execute(query, params).fetchall()
    else:
        all_rows = con.execute(query).fetchall()

    # Group rows by color value in Python
    grouped: Dict[Any, List[Any]] = {}
    for row in all_rows:
        color_val = row[3]
        if color_val not in grouped:
            grouped[color_val] = []
        grouped[color_val].append(row)

    colors, data = [], []
    for idx, (color_val, rows) in enumerate(grouped.items()):
        colors.append(color_val)
        data.append(
            {
                "id": [r[0] for r in rows],
                "x": [r[1] for r in rows],
                "y": [r[2] for r in rows],
                "mode": "markers",
                "type": "scattergl",
                "name": color_val,
                "marker": {
                    "color": COLORS[idx % len(COLORS)],
                    "opacity": 1.0 if cfg.type != "histogram" else 0.5,
                },
            }
        )
    return data, colors
