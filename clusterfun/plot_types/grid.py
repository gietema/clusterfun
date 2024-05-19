"""
grid.py
=======

This module provides a function to display a grid of media items using the ClusterFun library.
It allows users to create a grid of media items.

Functions
grid(df: pd.DataFrame, media: str, title: Optional[str] = None, show: bool = True) -> None:
Display a grid of media items using the input DataFrame, media, and optional title and show parameters.

"""
from pathlib import Path
from typing import List, Optional, Union

import pandas as pd

from clusterfun.config import Config
from clusterfun.plot import Plot
from clusterfun.plot_types import DOCSTRING_STANDARD
from clusterfun.storage.local.helpers import get_columns_for_db
from clusterfun.validation import validate


def grid(  # pylint: disable=missing-function-docstring
    df: pd.DataFrame, media: str, title: Optional[str] = None, bounding_box: Optional[str] = None, show: bool = True, display: Optional[Union[str, List[str]]] = None,
) -> Path:  # pylint: disable=too-many-arguments
    cfg = Config(
        type="grid",
        media=media,
        bounding_box=bounding_box,
        columns=get_columns_for_db(df, media, "grid"),
        title=title,
        display=display,
    )
    validate(df, cfg)
    return Plot.save(df, cfg).show(show)


grid.__doc__ = "Display just a grid of images." + DOCSTRING_STANDARD
