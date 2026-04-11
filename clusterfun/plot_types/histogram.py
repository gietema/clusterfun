"""
histogram.py
============

This module provides functionality for creating histogram plots with clusterfun.

Functions
---------
histogram
    Create a histogram plot with clusterfun.
get_x_and_y
    Get the x and y values for a histogram plot.
"""

from pathlib import Path
from typing import List, Optional, Union

import pandas as pd

from clusterfun.config import Config
from clusterfun.plot import Plot
from clusterfun.plot_types import DOCSTRING_STANDARD
from clusterfun.storage.local.helpers import get_columns_for_db
from clusterfun.validation import validate


def histogram(  # pylint: disable=too-many-arguments,missing-function-docstring
    df: pd.DataFrame,
    x: str,
    media: str,
    bins: int = 20,
    color: Optional[str] = None,
    bounding_box: Optional[str] = None,
    title: Optional[str] = None,
    show: bool = True,
    color_is_categorical: bool = True,
    display: Optional[Union[str, List[str]]] = None,
    hline: Optional[float] = None,
    vline: Optional[float] = None,
    embeddings: Optional[str] = None,
    embeddings_model: Optional[str] = None,
    project: Optional[str] = None,
) -> Path:
    # pylint: disable=too-many-locals
    if "_x" in df.columns or "_y" in df.columns:
        raise KeyError(
            '"_y" is a protected clusterfun columns and should not be included in the original dataframe.'
        )
    if color is not None and color_is_categorical:
        dfs = []
        for color_item in df[color].unique():
            data_color = get_x_and_y(df[df[color] == color_item][x], bins)
            dff = pd.DataFrame(data_color, columns=["_x", "_y"])
            dff.index = df[df[color] == color_item].index
            dfs.append(dff)
        dff = pd.concat(dfs)
        df = pd.merge(df, dff, left_index=True, right_index=True)
    else:
        dff = pd.DataFrame(get_x_and_y(df[x], bins), columns=["_x", "_y"])
        df = df.join(dff)
    cfg = Config(
        type="histogram",
        x="_x",
        y="_y",
        media=media,
        columns=get_columns_for_db(
            df=df,
            media=media,
            plot_type="histogram",
            x="_x",
            y="_y",
            embeddings=embeddings,
        ),
        color=color,
        bounding_box=bounding_box,
        title=title,
        color_is_categorical=color_is_categorical,
        display=display,
        vline=vline,
        hline=hline,
        embeddings=embeddings,
        embeddings_model=embeddings_model,
        project=project,
    )
    validate(df, cfg)
    return Plot.save(df, cfg).show(show)


histogram.__doc__ = (
    """
            :param df: pd.DataFrame
                The dataframe with the data to plot
            :param x: str
                The column name of the data for the histogram
            :param bins: int = 20
                The number of bins to use for the histogram
            """
    + DOCSTRING_STANDARD
    + """
        hline: Optional[float] = None
            Optional horizontal line to draw on the plot
        vline: Optional[float] = None
            Optional vertical line to draw on the plot
    """
)


def get_x_and_y(data: List[float], bins: int):
    """Compute the x and y coordinates of each dot in the histogram for the given data and number of bins.

    Parameters
    ----------
    data : List[float]
        The input data, a list of numerical values to be represented as a histogram.
    bins : int
        The number of bins for the histogram.

    Returns
    -------
    List[Tuple[float, int]]
        A list of tuples representing the x and y coordinates of each dot in the histogram.
        The x coordinate is a uniform-random position within the dot's bin, and the y
        coordinate is its running bin count.
    """
    import random as _rng

    # Find the range of the data
    data_min = min(data)
    data_max = max(data)
    data_range = data_max - data_min

    # Create a list of bin edges
    bin_edges = [data_min + i * data_range / bins for i in range(bins + 1)]
    bin_edges[-1] = data_max

    # Initialize a list of bin counts
    bin_counts = [0 for _ in range(bins)]

    dots = []

    # Iterate through the data and increment the count for the appropriate bin
    for datum in data:
        for index, (low, high) in enumerate(zip(bin_edges[:-1], bin_edges[1:])):
            if low <= datum <= high:
                bin_counts[index] += 1
                # Scatter x uniformly within the bin so bars appear solid
                jittered_x = _rng.uniform(low, high)
                dots.append((jittered_x, bin_counts[index]))
                break

    return dots
