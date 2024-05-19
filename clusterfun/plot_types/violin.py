"""
violin.py
=========

This module provides the violin plot type for clusterfun.
"""
from typing import Callable, List, Optional, Union

import numpy as np
import pandas as pd

from clusterfun.config import Config
from clusterfun.plot import Plot
from clusterfun.plot_types import DOCSTRING_STANDARD
from clusterfun.storage.local.helpers import get_columns_for_db
from clusterfun.validation import validate


def violin(
    df: pd.DataFrame,
    y: str,
    media: str,
    color: Optional[str] = None,
    bounding_box: Optional[str] = None,
    title: Optional[str] = None,
    show: bool = True,
    display: Optional[Union[str, List[str]]] = None,
):  # pylint: disable=too-many-arguments,missing-function-docstring
    df["x"] = get_violin_x(df, y, color)
    cfg = Config(
        type="violin",
        x="x",
        y=y,
        media=media,
        columns=get_columns_for_db(df, media, "violin", y, "x"),
        color=color,
        bounding_box=bounding_box,
        title=title,
        display=display,
    )
    validate(df, cfg)
    return Plot.save(df, cfg).show(show)


violin.__doc__ = (
    """
    :param df: pd.DataFrame
        The dataframe with the data to plot
    :param x: str
        The column name to create the violin plot
    """
    + DOCSTRING_STANDARD
)


def gaussian_kernel(x: np.ndarray, y: float, bandwidth: float) -> np.ndarray:
    """Gaussian kernel function. Used to create a density estimate for the violin plot.

    Parameters
    ----------
    x : np.ndarray
        The x value.
    y : float
        The y value.
    bandwidth : float
        The bandwidth of the kernel.

    Returns
    -------
    np.ndarray
        The values of the kernel function.
    """
    return np.exp(-0.5 * ((x - y) / bandwidth) ** 2) / (bandwidth * np.sqrt(2 * np.pi))


def simple_gaussian_kde(y: np.ndarray, bandwidth: Optional[float] = None) -> Callable:
    """
    Estimate the kernel density for a univariate dataset using a Gaussian kernel.

    Parameters
    ----------
    y : array-like
        The dataset for which the kernel density estimation is to be calculated.
    bandwidth : float, optional
        The bandwidth of the Gaussian kernel. If None (default), the bandwidth is
        calculated using the Silverman's rule of thumb.

    Returns
    -------
    kde : Callable
        A function that takes a single argument (array-like) and returns the
        estimated kernel density values for the input data.
    """
    if bandwidth is None:
        bandwidth = 1.06 * np.std(y) * len(y) ** (-1 / 5)

    def kde(x):
        density = np.zeros_like(x)
        for y_item in y:
            density += gaussian_kernel(x, y_item, bandwidth)
        return density / len(y)

    return kde


def get_violin_x_single(y: List[float]) -> np.ndarray:
    """
    Calculate the x-coordinates of the violin plot for a single color

    Parameters
    ----------
    y : list of float
        The dataset for which the x-coordinates of the violin plot are to be calculated.

    Returns
    -------
    np.ndarray
        An array of x-coordinates for the violin plot.
    """
    y_array = np.array(y)
    kde = simple_gaussian_kde(y_array)
    weights = kde(y_array)
    weights /= weights.max()
    return (np.random.random(len(y_array)) - 0.5) * weights


def get_violin_x(df: pd.DataFrame, y: str, color: Optional[str] = None) -> np.ndarray:
    """
    Calculate the x-coordinates of the violin plot for a given DataFrame.

    Parameters
    ----------
    df : pd.DataFrame
        The input DataFrame containing the data for which the violin plot
        x-coordinates are to be calculated.
    y : str
        The column name in the DataFrame containing the data to be plotted.
    color : str, optional
        The column name in the DataFrame to be used for grouping the data.
        If None (default), no grouping is performed.

    Returns
    -------
    np.ndarray
        An array of x-coordinates for the violin plot.
    """
    if color is None:
        return get_violin_x_single(df[y].tolist())
    x_items = np.zeros(shape=len(df))
    dff = df.copy().reset_index(drop=True)
    for idx, color_item in enumerate(dff[color].unique()):
        df_color = dff[dff[color] == color_item]
        x_items[df_color.index] = get_violin_x_single(df_color[y].tolist()) + (idx * 2)
    return x_items
