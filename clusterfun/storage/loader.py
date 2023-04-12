"""Base class for data loader."""
import abc
from typing import Any, Dict, List, Tuple

from clusterfun.config import Config
from clusterfun.models.filter import Filter
from clusterfun.models.media_indices import MediaIndices
from clusterfun.models.media_item import MediaItem


class Loader(abc.ABC):
    """Base class for data loader."""

    def __init__(self, uuid: str):
        """Initialise the loader.

        Parameters
        ----------
        uuid : str
            The uuid of the data to load"""
        self.uuid = uuid

    @abc.abstractmethod
    def load(self) -> Tuple[str, Dict[str, Any], Config]:
        """Load the data and config for a given uuid.

        Returns
        -------
        data : Dict[str, Any]
            The data for the plot. This contains just the minimum data required for the plot,
            so loading this will be fast. Other data can be loaded on demand via the get_row method.
        config : Config
            The config for the plot"""

    @abc.abstractmethod
    def get_row(self, media_id: int) -> MediaItem:
        """Get a single row of data for a given uuid and row id.

        Parameters
        ----------
        media_id : int
            The id of the row to get

        Returns
        -------
        MediaItem
            The media item for the given row
        """

    @abc.abstractmethod
    def get_rows(self, media_indices: MediaIndices) -> List[MediaItem]:
        """ "
        Get a list of rows of data for a given uuid and row ids.

        Parameters
        ----------
        media_indices : MediaIndices
            The ids of the rows to get

        Returns
        -------
        List[MediaItem]
            The media items for the given rows
        """

    @abc.abstractmethod
    def filter(self, filters: List[Filter]) -> List[Dict[str, Any]]:
        """
        Filter data in database based on given filters

        Parameters
        ----------
        filters (List[Filter]): List of Filter objects to apply to the data

        Returns
        -------
        List[Dict[str, any]]: Filtered data in dictionary format

        Example:
        filter("12345", [Filter("column1", ">", 3), Filter("column2", "=", "abc")])
        """
