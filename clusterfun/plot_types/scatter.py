"""
scatter.py
==========

This module provides a function to display a scatter plot using the ClusterFun library.
It allows users to create a scatter plot of two columns of data.
"""
from typing import List, Optional, Union

import pandas as pd

from clusterfun.config import Config
from clusterfun.plot import Plot
from clusterfun.plot_types import DOCSTRING_STANDARD
from clusterfun.storage.local.helpers import get_columns_for_db
from clusterfun.validation import validate


def scatter(
    df: pd.DataFrame,
    x: str,
    y: str,
    media: str,
    color: Optional[str] = None,
    bounding_box: Optional[str] = None,
    title: Optional[str] = None,
    show: bool = True,
    color_is_categorical: bool = True,
    display: Optional[Union[str, List[str]]] = None,
):  # pylint: disable=too-many-arguments,missing-function-docstring
    cfg = Config(
        type="scatter",
        x=x,
        y=y,
        media=media,
        columns=get_columns_for_db(df, media, "scatter", x, y),
        color=color,
        bounding_box=bounding_box,
        title=title,
        color_is_categorical=color_is_categorical,
        display=display,
    )
    validate(df, cfg)
    return Plot.save(df, cfg).show(show)


scatter.__doc__ = (
    """
        :param df: pd.DataFrame
            The dataframe with the data to plot
        :param x: str
            The column name of the data to plot on the x-axis.
        :param y: str
            The column name of the data to plot on the y-axis.
        """
    + DOCSTRING_STANDARD
)
