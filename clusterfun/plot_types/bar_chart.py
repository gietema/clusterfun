"""
bar_chart.py
=========

This module provides the bar chart plot type for clusterfun.
"""
from typing import List, Optional, Union

import numpy as np
import pandas as pd

from clusterfun.config import Config
from clusterfun.plot import Plot
from clusterfun.storage.local.helpers import get_columns_for_db
from clusterfun.validation import validate


def bar_chart(
    df: pd.DataFrame,
    x: str,
    media: str,
    color: Optional[str] = None,
    bounding_box: Optional[str] = None,
    title: Optional[str] = None,
    show: bool = True,
    color_is_categorical: bool = True,
    display: Optional[Union[str, List[str]]] = None,
):  # pylint: disable=too-many-arguments,missing-function-docstring,too-many-locals
    if color is None or not color_is_categorical:
        start_index = 0
        for index, (value, count) in enumerate(df[x].value_counts().items()):
            df.loc[df[x] == value, "_x"] = np.random.uniform(low=start_index + index, high=0.7 + index, size=count)
            df.loc[df[x] == value, "_y"] = np.random.uniform(low=0, high=count, size=count)
    else:
        start_index = 0
        for x_index, (x_value, _) in enumerate(df[x].value_counts().items()):
            data = df[df[x] == x_value]
            stacked_y_ref = 0
            for y_value, y_count in data[color].value_counts().items():
                df.loc[(df[x] == x_value) & (df[color] == y_value), "_x"] = np.random.uniform(
                    low=start_index + x_index, high=0.7 + x_index, size=y_count
                )
                df.loc[(df[x] == x_value) & (df[color] == y_value), "_y"] = np.random.uniform(
                    low=stacked_y_ref, high=y_count + stacked_y_ref, size=y_count
                )
                stacked_y_ref += y_count

    x_names = df[x].value_counts().keys().tolist()

    cfg = Config(
        type="bar_chart",
        x="_x",
        y="_y",
        media=media,
        columns=get_columns_for_db(df, media, "bar_chart", "_y", "_x"),
        color=color,
        bounding_box=bounding_box,
        title=title,
        x_names=x_names,
        color_is_categorical=color_is_categorical,
        display=display,
    )
    validate(df, cfg)
    return Plot.save(df, cfg).show(show)


bar_chart.__doc__ = """
    :param df: pd.DataFrame
        The dataframe with the data to plot
    :param x: str
        The column name for the x-axis. One bar per unique value.
    :param media: str
        The column name of the media to display on the plot.
        This should be a list of strings that can be decoded by one of the implemented storers.
        See the Storer class for more information about how this works.
    :param color: Optional[str] = None
        If added, this will make the bar chart a stacked bar chart with the color column as the stack.
    :param bounding_box: Optional[Dict[str, Any], List[Dict[str, Any]]] = None
        Optional column to draw bounding boxes on top of the media.
        The bounding boxes should be a dictionary or an array of dictionaries of type:
        {
            "xmin": float/int
            "ymin": float/int
            "xmax": float/int
            "ymax": float/int
            "color": Optional[str] = None
            "label": Optional[str] = None
        }
        - If no color is provided, a default color scheme will be used.
        - The label will be displayed in the top left of the bounding box
    :param title: Optional[str] = None
        Optional title to display on top of the plot"""


def add_x_count_column(data: pd.DataFrame, x: str) -> pd.DataFrame:
    """
    Adds a count column for the unique values in column x of the DataFrame.
    """
    x_count_column_name = f"{x}_count"
    data[x_count_column_name] = data[x].map(data[x].value_counts())
    return data
