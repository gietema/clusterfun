"""
This module contains all the plot types that can be used to visualize the data.
"""
DOCSTRING_STANDARD = """    :param media: str
        The column name of the media to display on the plot.
        This should be a list of strings that can be decoded by one of the implemented storers.
        See the Storer class for more information about how this works.
    :param color: Optional[str] = None
        Optional column name to color points according to the value in the column
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
        Optional title to display on top of the plot
    
    :param display: Optional[Union[str, List[str]]]
        When added, the information in these columns will be displayed directly
        underneath the media. This is useful when you want to quickly review
        certain types of information related to the media.
        For audio media types, the columns added here will also be displayed
        in the grid view for each single audio file.
    """
