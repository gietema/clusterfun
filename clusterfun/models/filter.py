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
from typing import Any, List, Union

from pydantic import BaseModel  # pylint: disable=no-name-in-module


class Filter(BaseModel):  # pylint: disable=too-few-public-methods
    """
    A class representing a filter with column, comparison, and value attributes.

    Parameters
    ----------
    column : str
        The column name to filter on.
    comparison : str
        The comparison operator to use for filtering.
    value : Union[str, float, int]
        The value to filter on.
    """

    column: str
    comparison: str
    value: Union[str, float, int]

    def is_valid(self, columns: List[str], con) -> bool:
        """
        Validation of given values to prevent injection and SQL errors.
        Parameters
        ----------
        columns: List[str]
            List of columns in the table
        con: connection object for the database

        Returns
        -------
        bool
        Returns True if values are valid, False otherwise"""
        if self.column not in columns:
            return False
        if self.comparison not in [">", "<", "=", "!=", ">=", "<="]:
            return False
        # validate result of value: should be value of column if categorical else number
        if not str(self.value).isnumeric() and not is_float(self.value) and not filter_value_in_column(self, con):
            return False
        return True


def filter_value_in_column(filter_item: Filter, con) -> bool:
    """
    Check if a value exists in a column in a database table.

    Parameters
    ----------
    filter_item : Filter
        A Filter object containing the column name and value to check.
    con : connection
        A connection object to the database.

    Returns
    -------
    bool
        True if the value exists in the column, False otherwise.
    """
    query = f"SELECT DISTINCT {filter_item.column} FROM database"
    result = con.execute(query).fetchall()
    result = [x[0] for x in result]
    return filter_item.value in result


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
