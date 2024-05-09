"""
data.py
=======

This module contains functions for formatting the data to be used in the plotly plots.
"""
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

from clusterfun.config import Config
from clusterfun.constants import COLORS


def get_data_dict(
    con: sqlite3.Connection, cfg: Config, query_addition: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], Optional[List[str]]]:
    """Get data for plotly graph. Used to store directly to disk here.
    - Used when saving the data for the first time. By saving the data in the right format once,
    we can save a lot of time later on as we will directly
    use the data from disk instead of querying the database again.
    - Also used when filtering data and we need to update the data on the fly.

    Parameters
    ----------
    con : sqlite3.Connection
        Database connection
    cfg : Config
        Configuration object
    query_addition : Optional[str], optional
        Additional query string to add to the query, by default None
        Used for filtering data

    Returns
    -------
    Tuple[List[Dict[str, Any]], Optional[List[str]]]
        Data for plotly graph.
        List of dicts with keys: id, x, y, mode, type, name (optional) and marker (optional)

        List of colors for each data point. Used for coloring the data points.
    """
    colors = None
    if cfg.color is not None and cfg.color_is_categorical:
        return get_data_per_color(cfg, con, query_addition)
    if cfg.type == "grid":
        data = get_grid_data(con, query_addition)
    else:
        data = get_data_standard(cfg, con, query_addition)
    return data, colors


def get_data_standard(
    cfg: Config,
    con: sqlite3.Connection,
    query_addition: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Get data for standard plotly graph, in case there is no color column.

    Parameters
    ----------
    cfg : Config
        Configuration object
    con : sqlite3.Connection
        Database connection
    query_addition : Optional[str], optional
        Additional query string to add to the query, by default None
        Used for filtering data

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

    if query_addition:
        query += f" WHERE {query_addition}"
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
        data[0]["marker"] = {"color": [x[-1] for x in res], "colorscale": "Viridis", "showscale": True}
    return data


def get_grid_data(con: sqlite3.Connection, query_addition: Optional[str] = None) -> List[Dict[str, List[int]]]:
    """Get data for the grid. The grid is a special case as it does not have x and y values,
    so we can be more efficient here.

    Parameters
    ----------
    con : sqlite3.Connection
        Database connection
    query_addition : Optional[str], optional
        Additional query string to add to the query, by default None
        Used when filtering data.

    Returns
    -------
    List[Dict[str, List[int]]]
        Data for the grid
    """
    query = "SELECT id FROM database"
    if query_addition:
        query += f" WHERE {query_addition}"
    res = con.execute(query).fetchall()
    data = [{"id": [x[0] for x in res]}]
    return data


def get_data_per_color(
    cfg: Config, con: sqlite3.Connection, query_addition: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Get data for plotly graph per color.

    Parameters
    ----------
    cfg : Config
        Configuration object
    con : sqlite3.Connection
        Database connection
    query_addition : Optional[str], optional
        Additional query string to add to the query, by default None
        Used when filtering data.

    Returns
    -------
    Tuple[List[Dict[str, Any]], List[str]]
        Data for plotly graph.
        List of dicts with keys: id, x, y, mode, type, name (the color) and marker (indicating the color)

        List of colors for each data point. Used for coloring the data points.
    """
    colors, data = [], []
    res = con.execute(f"SELECT DISTINCT {cfg.color} FROM database")
    results: List[Any] = res.fetchall()
    for idx, color in enumerate([x[0] for x in results]):
        colors.append(color)
        query = f"SELECT id,{cfg.x},{cfg.y},{cfg.color} FROM database WHERE {cfg.color} = '{color}'"
        if query_addition:
            query += f" AND {query_addition}"
        res_query: List[Any] = con.execute(query).fetchall()
        data.append(
            {
                "id": [x[0] for x in res_query],
                "x": [x[1] for x in res_query],
                "y": [x[2] for x in res_query],
                "mode": "markers",
                "type": "scattergl",
                "name": color,
                "marker": {
                    "color": COLORS[idx % len(COLORS)],
                    "opacity": 1.0 if cfg.type != "histogram" else 0.5,
                },
            }
        )
    return data, colors
