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


def confusion_matrix(
    df: pd.DataFrame,
    y_true: str,
    y_pred: str,
    media: str,
    bounding_box: Optional[str] = None,
    title: Optional[str] = None,
    show: bool = True,
    display: Optional[Union[str, List[str]]] = None,
):  # pylint: disable=too-many-arguments,missing-function-docstring,too-many-locals

    labels = sorted(df[y_true].unique().tolist())
    for index_label, label in enumerate(labels):
        for index_pred, label_pred in enumerate(labels):
            mask = (df[y_true] == label) & (df[y_pred] == label_pred)
            number_of_dots_in_square = mask.sum()  # Number of dots in this square

            # Generate random angles and radii
            angles = np.random.uniform(0, 2 * np.pi, number_of_dots_in_square)
            max_radius = 0.3  # Adjust max_radius to change the size of the filled circle
            radii = np.sqrt(
                np.random.uniform(0, max_radius**2, number_of_dots_in_square)
            )  # sqrt for uniform distribution

            # Calculate the Cartesian coordinates for each dot
            x_offsets = radii * np.cos(angles)
            y_offsets = radii * np.sin(angles)

            # Calculate the final positions of the dots
            df.loc[mask, "_label"] = np.repeat(index_label, number_of_dots_in_square) + x_offsets + 1
            df.loc[mask, "_prediction"] = np.repeat(index_pred, number_of_dots_in_square) + y_offsets + 1

    df = df.sort_values(by=["_label", "_prediction"], ascending=True)

    cfg = Config(
        type="confusion_matrix",
        x="_label",
        y="_prediction",
        media=media,
        columns=get_columns_for_db(df, media, "confusion_matrix", "_prediction", "_label"),
        color=y_true,
        bounding_box=bounding_box,
        title=title,
        x_names=labels,
        display=display,
    )
    validate(df, cfg)
    return Plot.save(df, cfg).show(show)


confusion_matrix.__doc__ = """
    :param df: pd.DataFrame
        The dataframe with the data to plot
    :param y_true: str
        The ground truth label. This can be either a string or an integer
    :param y_pred: str
        The predicted label. This can be either a string or an integer
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
