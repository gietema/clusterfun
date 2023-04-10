"""
validator.py
============

This module provides functionality for validating pandas DataFrames and Config objects
to ensure that they meet specific requirements, such as non-empty DataFrames and the
presence of required columns specified in the Config object.

The module includes custom exceptions for handling cases where a required column is not
found in the DataFrame or the DataFrame is empty.

Functions
---------
validate(df: pd.DataFrame, cfg: Config)
    Validate a pandas DataFrame and a Config object, raising exceptions for invalid cases.

Exceptions
----------
ColumnNotFoundException
    Exception raised when a required column is not found in the DataFrame.
EmptyDataFrameException
    Exception raised when the DataFrame is empty.
"""
import pandas as pd

from clusterfun.config import Config


class ColumnNotFoundException(Exception):
    """
    Exception raised when a required column is not found in the DataFrame.
    """


class EmptyDataFrameException(Exception):
    """
    Exception raised when the DataFrame is empty.
    """


def validate(df: pd.DataFrame, cfg: Config):
    """
    Validate a pandas DataFrame and a Config object.

    This function checks that the DataFrame is not empty,
    and that the columns specified in the Config object are present in the DataFrame.
    If any of these conditions are not met, an exception is raised.

    Parameters
    ----------
    df (pd.DataFrame): The DataFrame to be validated.
    cfg (Config): The Config object specifying the required columns in the DataFrame.

    Raises
    ------
    EmptyDataFrameException: If the DataFrame is empty.
    ColumnNotFoundException: If any of the required columns specified
        in the Config object are not present in the DataFrame.
    """
    if len(df) == 0:
        raise EmptyDataFrameException("DataFrame is empty")
    if cfg.x is not None and cfg.x not in df.columns and cfg.type != "violin":
        raise ColumnNotFoundException(f"{cfg.x} not in columns of dataframe")
    if cfg.y is not None and cfg.y not in df.columns:
        raise ColumnNotFoundException(f"{cfg.y} not in columns of dataframe")
    if cfg.media not in df.columns:
        raise ColumnNotFoundException(f"{cfg.media} not in columns of dataframe")
