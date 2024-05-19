"""
pie_chart.py
============

This module provides functionality to create pie charts using a scatter plot representation.
It generates polar coordinates for points within each pie segment,
converts them to Cartesian coordinates, and formats the data for visualization.

The module includes the following functions:

pie_chart: Creates a pie chart using a scatter plot representation, with optional bounding box and title.
generate_polar_coordinates: Generates polar coordinates for a given number of points, start angle, and ratio.
update_coordinates: Updates the pie chart coordinates in a DataFrame based on the specified column value.
compute_pie_chart_coordinates: Computes the pie chart coordinates for a given DataFrame, color column,
 and counts dictionary.
format_color: Formats the 'color' column in the DataFrame based on the provided counts dictionary.

The primary use case for this module is to create pie charts for various datasets,
allowing users to visualize categorical data using a scatter plot-based pie chart representation.
"""
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Union

import numpy as np
import pandas as pd

from clusterfun.config import Config
from clusterfun.plot import Plot
from clusterfun.plot_types import DOCSTRING_STANDARD
from clusterfun.storage.local.helpers import get_columns_for_db
from clusterfun.validation import validate


def generate_polar_coordinates(count: int, start: float, ratio: float) -> Tuple[np.ndarray, np.ndarray]:
    """
    Generate polar coordinates for a given number of points, start angle, and ratio.

    Parameters
    ----------
    count : int
        The number of points for which polar coordinates are to be generated.
    start : float
        The start angle in radians for generating polar coordinates.
    ratio : float
        The ratio that determines the angular spread of the points.

    Returns
    -------
    Tuple[np.ndarray, np.ndarray]
        A tuple of two numpy arrays, representing the radius (r) and angle (theta)
        values of the generated polar coordinates.
    """
    radius = np.random.rand(count) ** 0.5
    theta = 2 * np.pi * (start + ratio * np.random.rand(count))
    return radius, theta


def update_coordinates(
    df: pd.DataFrame, color: str, col: str, x_coords: np.ndarray, y_coords: np.ndarray
) -> pd.DataFrame:
    """
    Update the pie chart coordinates in a DataFrame based on the specified column value.

    Parameters
    ----------
    df : pd.DataFrame
        The input DataFrame containing the data.
    color : str
        The column name in the DataFrame used for grouping the data.
    col : str
        The specific value of the 'color' column for which the coordinates will be updated.
    x_coords : np.ndarray
        The x-coordinates for the pie chart.
    y_coords : np.ndarray
        The y-coordinates for the pie chart.

    Returns
    -------
    pd.DataFrame
        The updated DataFrame with the pie chart coordinates.
    """
    df.loc[df[color] == col, "pie_chart_x"] = x_coords
    df.loc[df[color] == col, "pie_chart_y"] = y_coords
    return df


def compute_pie_chart_coordinates(df: pd.DataFrame, color: str, counts: Dict[str, float]):
    """
    Compute the pie chart coordinates for a given DataFrame, color column, and counts dictionary.

    Parameters
    ----------
    df : pd.DataFrame
        The input DataFrame containing the data.
    color : str
        The column name in the DataFrame used for grouping the data.
    counts : Dict[str, float]
        A dictionary containing the proportions for each group in the 'color' column.
        (This is based on df[color].value_counts(True).to_dict())

    Returns
    -------
    pd.DataFrame
        The updated DataFrame with the pie chart coordinates.
    """
    df["pie_chart_x"] = 0
    df["pie_chart_y"] = 0
    start = 0.0
    for col, col_count in df[color].value_counts().to_dict().items():
        radius, theta = generate_polar_coordinates(col_count, start, counts[col])
        start += counts[col]
        # convert polar coordinates to cartesian coordinates
        x_coords, y_coords = radius * np.cos(theta), radius * np.sin(theta)
        df = update_coordinates(df, color, col, x_coords, y_coords)
    return df


def format_color(df: pd.DataFrame, color: str, counts: Dict[str, float]) -> pd.DataFrame:
    """
    Format the 'color' column in the DataFrame based on the provided counts dictionary.
    The color column values are replaced with formatted strings containing the group index, the original group name,
    and the proportion (percentage) of each group.

    Parameters
    ----------
    df : pd.DataFrame
        The input DataFrame containing the data.
    color : str
        The column name in the DataFrame that will be given a new format.
    counts : Dict[str, float]
        A dictionary containing the proportions for each group in the 'color' column.

    Returns
    -------
    pd.DataFrame
        The updated DataFrame with the formatted 'color' column.
    """
    df[color] = df[color].map({name: f"{i} - {name} ({count:.01%})" for i, (name, count) in enumerate(counts.items())})
    df = df.sort_values(color)
    return df


def pie_chart(  # pylint: disable=too-many-arguments,missing-function-docstring
    df: pd.DataFrame,
    color: str,
    media: str,
    bounding_box: Optional[str] = None,
    title: Optional[str] = None,
    show: bool = True,
    display: Optional[Union[str, List[str]]] = None,
) -> Path:
    counts = df[color].value_counts(True).to_dict()
    df = compute_pie_chart_coordinates(df, color, counts)
    df = format_color(df, color, counts)

    cfg = Config(
        type="pie_chart",
        x="pie_chart_x",
        y="pie_chart_y",
        media=media,
        columns=get_columns_for_db(df=df, media=media, plot_type="pie_chart", x="pie_chart_x", y="pie_chart_y"),
        color=color,
        bounding_box=bounding_box,
        title=title,
        display=display
    )
    validate(df, cfg)
    return Plot.save(df, cfg).show(show)


pie_chart.__doc__ = (
    """
    :param df: pd.DataFrame
        The dataframe with the data to plot
    """
    + DOCSTRING_STANDARD
)
