"""
filter.py
=========

This module provides the Filter class for managing and validating filters with column,
comparison, and value attributes. It also includes utility functions for validating
whether a given value is a float and whether a filter value exists in a database column.

Classes
-------
Filter
    A class representing a filter with column, comparison, and value attributes.

Functions
---------
filter_value_in_column(filter: Filter, con) -> bool
    Check if a value exists in a column in a database table.
is_float(element: Any) -> bool
    Determines if an element can be converted to a float.
"""

from typing import Any, Dict, List, Union

from pydantic import BaseModel


class Filter(BaseModel):
    """
    A class representing a filter with column, comparison, and value attributes.

    Parameters
    ----------
    column : str
        The column name to filter on.
    comparison : str
        The comparison operator to use for filtering.
    values: List[Union[str, float, int]]
        The value to filter on.
    """

    column: str
    comparison: str
    values: List[Union[str, float, int]]

    def is_valid(self, columns: List[str], con) -> bool:
        """
        Validation of given values to prevent injection and SQL errors.
        Parameters
        ----------
        columns: List[str]
            List of columns in the table
        con: connection object for the database (DuckDB or sqlite3)

        Returns
        -------
        bool
        Returns True if values are valid, False otherwise"""

        def value_is_valid(value) -> bool:
            if self.column not in columns:
                return False
            if self.comparison not in [">", "<", "=", "!=", ">=", "<=", "IN", "NOT IN"]:
                return False
            # validate result of value: should be value of column if categorical else number
            if (
                not str(value).isnumeric()
                and not is_float(value)
                and not filter_value_in_column(self.column, value, con)
            ):
                return False
            if value == "":
                return False
            return True

        if isinstance(self.values, list):
            if len(self.values) == 0:
                return False
            for val in self.values:
                if not value_is_valid(val):
                    return False
        else:
            if not value_is_valid(self.values):
                return False
        return True

    def __str__(self):
        return f"{self.column} {self.comparison} {self.values}"


_column_values_cache: Dict[int, Dict[str, set]] = {}


def _get_column_values(column: str, con: Any) -> set:
    """Get cached distinct values for a column. Cache is keyed by connection identity + column."""
    cache_key = id(con)
    if cache_key not in _column_values_cache:
        _column_values_cache[cache_key] = {}
    if column not in _column_values_cache[cache_key]:
        # Use PRAGMA table_info which works in both SQLite and DuckDB
        cursor = con.execute("PRAGMA table_info('database')")
        valid_columns = {row[1] for row in cursor.fetchall()}
        if column not in valid_columns:
            _column_values_cache[cache_key][column] = set()
        else:
            result = con.execute(f'SELECT DISTINCT "{column}" FROM database').fetchall()
            values = {x[0] for x in result if x[0] is not None}
            _column_values_cache[cache_key][column] = values
    return _column_values_cache[cache_key][column]


def filter_value_in_column(column: str, value: Any, con: Any) -> bool:
    """
    Check if a value exists in a column in a database table.
    Uses a per-connection cache to avoid repeated DISTINCT queries.

    Parameters
    ----------
    column : str
        The column name to check.
    value : Any
        The value to check for in the column.
    con : Any
        A connection object to the database (DuckDB or sqlite3).

    Returns
    -------
    bool
        True if the value exists in the column, False otherwise.
    """
    return value in _get_column_values(column, con)


def is_float(element: Any) -> bool:
    """
    Determines if an element can be converted to a float.

    Parameters
    ----------
    element : any
    The element to be checked for float conversion.

    Returns
    -------
    bool
    True if the element can be converted to a float, False otherwise.
    """
    # If you expect None to be passed:
    if element is None:
        return False
    try:
        float(element)
        return True
    except ValueError:
        return False
