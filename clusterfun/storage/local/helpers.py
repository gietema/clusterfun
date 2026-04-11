"""Helper functions for local loading and storing"""

from pathlib import Path
from typing import Any, List, Optional, Tuple

import orjson
import pandas as pd

from clusterfun.config import Config
from clusterfun.models.filter import Filter, is_float
from clusterfun.models.media_indices import MediaIndices


def format_df_for_db(cfg: Config, df: pd.DataFrame) -> pd.DataFrame:
    """Format the dataframe for the database."""
    if cfg.bounding_box is not None:
        # make sure bounding box is a list
        df[cfg.bounding_box] = df[cfg.bounding_box].apply(
            lambda x: [x] if not isinstance(x, list) else x
        )
        # then convert to json dump for effective storage in db
        df[cfg.bounding_box] = df[cfg.bounding_box].apply(orjson.dumps)  # pylint: disable=no-member
    return df


def get_columns_for_db(
    df: pd.DataFrame,
    media: str,
    plot_type: str,
    x: Optional[str] = None,
    y: Optional[str] = None,
    embeddings: Optional[str] = None,
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
    if embeddings and embeddings in columns:
        columns.remove(embeddings)
    return columns


def get_filter_query(
    con: Any, config: Config, filters: List[Filter]
) -> Tuple[str, List]:
    """Get the query to apply the filters.

    Returns
    -------
    Tuple[str, List]
        A tuple of (where_clause_with_placeholders, params_list).
        The where clause uses ? placeholders for values.
    """
    query = ""
    params: List = []
    first_valid = True
    for filter_item in filters:
        # Check if filter is valid for given column
        if not filter_item.is_valid(config.columns, con):
            continue
        # Add AND statement if not the first valid filter
        if not first_valid:
            query += " AND "
        first_valid = False
        # Add filter to query string with parameterized placeholders
        if filter_item.comparison in ["COL =", "COL !="]:
            # Column-to-column comparison: no parameter, both sides are column names
            op = "=" if filter_item.comparison == "COL =" else "!="
            other_col = str(filter_item.values[0]).replace('"', '""')
            col_name = filter_item.column.replace('"', '""')
            query += f'"{col_name}" {op} "{other_col}"'
        elif filter_item.comparison in ["IN", "NOT IN"]:
            placeholders = ",".join("?" for _ in filter_item.values)
            query += f"{filter_item.column} {filter_item.comparison} ({placeholders})"
        else:
            query += f"{filter_item.column} {filter_item.comparison} ?"
        # Add the values to the params list (skip for column comparisons)
        if filter_item.comparison not in ["COL =", "COL !="]:
            for value in filter_item.values:
                if str(value).isnumeric() or is_float(value):
                    params.append(
                        float(value)
                        if is_float(value) and not str(value).isnumeric()
                        else value
                    )
                else:
                    params.append(value)
    return query, params


def get_media_query(
    media_indices: MediaIndices,
    paginate: bool = True,
    config: Optional[Config] = None,
    con: Optional[Any] = None,
) -> Tuple[str, List]:
    """Get the query for the media, used for the grid.

    Returns
    -------
    Tuple[str, List]
        A tuple of (query_with_placeholders, params_list).
    """
    params: List = []
    if len(media_indices) == 0:
        # Empty list: return all items (paginated by LIMIT/OFFSET)
        query = "SELECT * FROM database"
    elif len(media_indices) == 1:
        query = "SELECT * FROM database WHERE id = ?"
        params.append(media_indices.media_ids[0])
    else:
        placeholders = ",".join("?" for _ in media_indices.media_ids)
        query = f"SELECT * FROM database WHERE id IN ({placeholders})"
        params.extend(media_indices.media_ids)

    has_where = len(media_indices) > 0
    if media_indices.filters and len(media_indices.filters) > 0:
        assert con is not None and config is not None, (
            "If filters are provided, con and config must be provided"
        )
        filter_query, filter_params = get_filter_query(
            con, config=config, filters=media_indices.filters
        )
        if filter_query:
            joiner = " AND " if has_where else " WHERE "
            query += f"{joiner}{filter_query}"
            params.extend(filter_params)

    has_explicit_sort = (
        media_indices.sort_column is not None
        and media_indices.sort_column != ""
        and media_indices.ascending is not None
    )
    if has_explicit_sort:
        # Validate sort_column against config columns whitelist to prevent SQL injection
        if config is not None and media_indices.sort_column in config.columns:
            query += f" ORDER BY {media_indices.sort_column} {'ASC' if media_indices.ascending else 'DESC'}"
        elif config is None:
            # When config is not available, still use the sort column (caller is responsible for validation)
            query += f" ORDER BY {media_indices.sort_column} {'ASC' if media_indices.ascending else 'DESC'}"
    elif len(media_indices.media_ids) > 1:
        # Preserve the input order of media_ids (important for similarity search results)
        positions = " ".join(
            f"WHEN ? THEN {i}" for i in range(len(media_indices.media_ids))
        )
        query += f" ORDER BY CASE id {positions} END"
        params.extend(media_indices.media_ids)

    if paginate and (len(media_indices.media_ids) > 50 or len(media_indices.media_ids) == 0):
        offset = media_indices.page * 50
        query += " LIMIT 50 OFFSET ?"
        params.append(offset)
    return query, params


def get_recent_dir(directory: Path) -> Path:
    """Get the most recently created directory in a directory"""
    # Get a list of all directories in the directory
    directories = [d for d in directory.iterdir() if d.is_dir()]
    # Sort the directories by creation time (oldest to newest) and get the most recent one
    return max(directories, key=lambda d: d.stat().st_ctime)
