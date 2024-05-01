"""Helper functions for local loading and storing"""
import sqlite3
from pathlib import Path
from typing import Any, List, Optional

import orjson
import pandas as pd

from clusterfun.config import Config
from clusterfun.models.filter import Filter, is_float
from clusterfun.models.media_indices import MediaIndices


def format_df_for_db(cfg: Config, df: pd.DataFrame) -> pd.DataFrame:
    """Format the dataframe for the database."""
    if cfg.bounding_box is not None:
        # make sure bounding box is a list
        df[cfg.bounding_box] = df[cfg.bounding_box].apply(lambda x: [x] if not isinstance(x, list) else x)
        # then convert to json dump for effective storage in db
        df[cfg.bounding_box] = df[cfg.bounding_box].apply(orjson.dumps)  # pylint: disable=no-member
    return df


def get_columns_for_db(
    df: pd.DataFrame, media: str, plot_type: str, x: Optional[str] = None, y: Optional[str] = None
) -> List[str]:
    """Get the columns for the database."""
    columns = ["id", media]
    if plot_type != "grid":
        if x is None and y is not None:
            columns = columns + [y]
        elif x is not None and y is None:
            columns = columns + [x]
        elif x is not None and y is not None:
            columns = columns + [x, y]
        columns = columns + [c for c in df.columns if c not in ["id", media, x, y]]
    else:
        # if plot type is a grid, we do not need to add x and y to the columns
        columns = columns + [c for c in df.columns if c not in ["id", media]]
    # temporary fix as `index` is protected column used later on.
    # TODO:: move to special index column name
    columns = [c for c in columns if c != "index"]
    return columns


def get_filter_query(con: sqlite3.Connection, config: Config, filters: List[Filter]):
    """Get the query to apply the filters"""
    query = ""
    for idx, filter_item in enumerate(filters):
        # Check if filter is valid for given column
        if not filter_item.is_valid(config.columns, con):
            continue
        # Add AND statement if not first or last filter
        if 0 < idx < len(filters):
            query += " AND "
        # Add filter to query string
        if str(filter_item.value).isnumeric() or is_float(filter_item.value):
            query += f"{filter_item.column} {filter_item.comparison} {filter_item.value}"
        else:
            query += f"{filter_item.column} {filter_item.comparison} '{filter_item.value}'"
    return query


def get_media_query(
    media_indices: MediaIndices, paginate: bool = True, config: Optional[Config] = None, con: Optional[Any] = None
) -> str:
    """Get the query for the media, used for the grid"""
    if len(media_indices) == 1:
        query = f"SELECT * FROM database WHERE id = {media_indices.media_ids[0]}"
    else:
        query = f"SELECT * FROM database WHERE id IN {str(tuple(media_indices.media_ids))}"
    if media_indices.filters and len(media_indices.filters) > 0:
        assert con is not None and config is not None, "If filters are provided, con and config must be provided"
        filter_query = get_filter_query(con, config=config, filters=media_indices.filters)
        if filter_query:
            query += " AND {filter_query}"
    if (
        media_indices.sort_column is not None
        and media_indices.sort_column != ""
        and media_indices.ascending is not None
    ):
        query += f" ORDER BY {media_indices.sort_column} {'ASC' if media_indices.ascending else 'DESC'}"
    if len(media_indices.media_ids) > 50 and paginate:
        offset = media_indices.page * 50
        query += f" LIMIT 50 OFFSET {offset}"
    return query


def get_recent_dir(directory: Path) -> Path:
    """Get the most recently created directory in a directory"""
    # Get a list of all directories in the directory
    directories = [d for d in directory.iterdir() if d.is_dir()]
    # Sort the directories by creation time (oldest to newest) and get the most recent one
    return max(directories, key=lambda d: d.stat().st_ctime)


def run_query(db_path: Path, query: str, fetch_one: bool = False) -> List:
    """Run a query on the database

    Parameters
    ----------
    db_path : Path
        Path to the database
    query : str
        Query to run
    fetch_one : bool, optional
        Whether to fetch one result or all results, by default False

    Returns
    -------
    List
        List of results
    """
    con = sqlite3.connect(db_path, check_same_thread=False)
    result = con.execute(query)
    result = result.fetchone() if fetch_one else result.fetchall()
    con.close()
    result_list = list(result)
    if len(result_list) == 0:
        raise ValueError(f"Query {query=} returned no results")
    return result_list
