"""
config.py
=========

This module provides the Config dataclass for clusterfun.
"""
import dataclasses
import os
from typing import List, Optional, Union


@dataclasses.dataclass
class Config:  # pylint: disable=too-many-instance-attributes
    """
    The Config object is used to specify the plot type, columns, and other
    parameters for a plot.

    Parameters
    ----------
    type : str
        The plot type. One of "violin", "histogram", "scatter", "grid", "pie_chart"
    media : str
        The column name of the media column. This is the column that will be used
        to display the media in the plot. This can be either a path to a local
        image, or an S3 URL to an image.
    columns : List[str]
        The column names with additional data to be stored in the database.
    color : Optional[str]
        The column name to use for coloring the plot.
    bounding_box : Optional[str]
        The column name to use for the bounding box of the media.
        The bounding box values should of the form "x1,y1,x2,y2".
    title : Optional[str]
        The title of the plot.
    x : Optional[str]
        The column name to use for the x axis.
    y : Optional[str]
        The column name to use for the y axis.
    save_method : str
        The method to use for saving the plot. One of "local" or "s3".
    colors : Optional[List[str]]
        A list of colors to use for coloring the plot. This is used for setting
        the colors quickly.
    x_names: Optional[List[str]]
        A list of names to use for the x axis ticks. This is used for setting
        the x axis ticks quickly.
    display: Optional[Union[str, List[str]]]
        When added, the information in these columns will be displayed directly
        underneath the media. This is useful when you want to quickly review
        certain types of information related to the media.
        For audio media types, the columns added here will also be displayed
        in the grid view for each single audio file.
    """

    type: str
    media: str
    columns: List[str]
    color: Optional[str] = None
    bounding_box: Optional[str] = None
    title: Optional[str] = None
    x: Optional[str] = None
    y: Optional[str] = None
    save_method: str = os.getenv("saver", default="local")
    # used for setting ticks quickly
    colors: Optional[List[str]] = None
    # for the bar chart, used to set the x axis ticks
    x_names: Optional[List[str]] = None
    # used when data is local
    common_media_path: Optional[str] = None
    color_is_categorical: bool = True
    display: Union[str, List[str]] = None
