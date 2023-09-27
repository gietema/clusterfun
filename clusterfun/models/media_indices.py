"""
media_indices.py
================

This module provides the MediaIndices class for managing and representing sets of media
indices with optional sorting and pagination. The MediaIndices class is built on top of
Pydantic's BaseModel, providing data validation and serialization functionality.

A media index is a unique identifier for a media file, so that we can load it from a database.

Classes
-------
MediaIndices
    A class representing a set of media indices with optional sorting and pagination.
"""
from typing import List, Optional

from pydantic import BaseModel  # pylint: disable=no-name-in-module

from clusterfun.models.filter import Filter  # pylint: disable=no-name-in-module


class MediaIndices(BaseModel):  # pylint: disable=too-few-public-methods
    """
    A class representing a set of media indices with optional sorting and pagination.
    Used for selecting a page of media in the grid view.
    """

    media_ids: List[int]
    page: int = 0
    sort_column: Optional[str] = None
    ascending: Optional[bool] = None
    filters: Optional[List[Filter]] = None

    def __len__(self) -> int:
        return len(self.media_ids)
