"""LocalLoader class for loading data from the local filesystem."""
import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import orjson
import pandas as pd

from clusterfun.config import Config
from clusterfun.models.filter import Filter
from clusterfun.models.media_indices import MediaIndices
from clusterfun.models.media_item import MediaItem
from clusterfun.storage.loader import Loader
from clusterfun.storage.local.data import get_data_dict
from clusterfun.storage.local.helpers import get_filter_query, get_media_query, get_recent_dir, run_query
from clusterfun.storage.storer import load_media


class LocalLoader(Loader):
    """LocalLoader class for loading data from the local filesystem."""

    def __init__(self, uuid: str, cache_dir: Optional[Path] = None):
        """Initialise the loader.

        Parameters
        ----------
        uuid : str
            The uuid of the data to load
            If uuid is "recent", the most recent directory will be used
        cache_dir : Optional[Path]
            The directory to load the data from
        """
        super().__init__(uuid)
        if cache_dir is None:
            cache_dir = Path(os.environ.get("CLUSTERFUN_CACHE_DIR", os.path.expanduser("~/.cache/clusterfun")))
        if uuid == "recent":
            uuid = get_recent_dir(cache_dir).stem
        self.cache_dir = cache_dir / uuid

    @property
    def db_path(self) -> Path:
        """Return the path to the database."""
        return self.cache_dir / "database.db"

    def load(self) -> Tuple[str, Dict[str, Any], Config]:
        """Load the data and config for the given uuid."""
        if not self.cache_dir.exists():
            raise FileExistsError(f"Could not find a directory for {self.uuid=} as {self.cache_dir}")
        return self.uuid, self.load_data(), self.load_config()

    def load_data(self) -> Dict[str, List[Union[int, float]]]:
        """
        Loads the data from the database. The loaded data just contains the minimum data required for the plot,
        so loading this will be fast.

        Returns
        -------
        Dict[str, List[Union[int, float]]]
            The data for the plot
        """
        with open(self.cache_dir / "data.json", "rb") as f:
            return orjson.loads(f.read())  # pylint: disable=no-member

    def load_config(self) -> Config:
        """Loads the config from the json file"""
        with open(self.cache_dir / "config.json", encoding="utf-8") as f:
            return Config(**json.load(f))

    def get_row(self, media_id: int, as_base64: bool = False) -> MediaItem:
        """Get a single row of data for a given uuid and media id."""
        result = run_query(self.db_path, f"SELECT * FROM database WHERE id = {media_id}", fetch_one=True)
        # index zero should be the id, index 1 the media src, everything else the remaining data
        src, height, width = load_media(
            result[1], as_base64=as_base64, common_media_path=self.load_config().common_media_path
        )
        return MediaItem(index=media_id, src=src, height=height, width=width, information=list(result[2:]))

    def get_rows(self, media_indices: MediaIndices) -> List[MediaItem]:
        """
        Gets a list of 50 rows, paginated

        Parameters
        ----------
        media_indices : MediaIndices
            Determines what to query

        Returns
        -------
        List[MediaItem]
            List of queried items
        """
        con, config = None, None
        if media_indices.filters:
            con = sqlite3.connect(self.db_path, check_same_thread=False)
            config = self.load_config()
        query = get_media_query(media_indices, config=config, con=con)
        result = run_query(self.db_path, query)
        items = []
        for item in result:
            src, height, width = load_media(item[1])
            items.append(MediaItem(index=item[0], src=src, height=height, width=width, information=list(item[2:])))
        return items

    def get_rows_metadata(self, media_indices: MediaIndices) -> List[Dict[str, Any]]:
        """
        Get the metadata for a list of media items.

        Parameters
        ----------
        media_indices : MediaIndices
            The indices to query

        Returns
        -------
        List[Dict[str, Any]]
            The metadata for the media items
        """
        query = get_media_query(media_indices, paginate=False)
        result = run_query(self.db_path, query)
        items = []
        for item in result:
            items.append({"index": item[0], "information": item[2:]})
        return items

    def filter(self, filters: List[Filter]) -> List[Dict[str, Any]]:
        """Filters the data based on the given filters."""
        con = sqlite3.connect(self.db_path, check_same_thread=False)
        config = self.load_config()
        query = get_filter_query(con, config, filters)
        # Get filtered data from database
        data = get_data_dict(con, config, query_addition=query)
        con.close()
        return data[0]

    def get_dataframe(self, media_indices: MediaIndices) -> pd.DataFrame:
        """Get the data as a pandas dataframe."""
        con = None
        config = self.load_config()
        if media_indices.filters:
            con = sqlite3.connect(self.db_path, check_same_thread=False)
            config = self.load_config()
        query = get_media_query(media_indices, config=config, con=con, paginate=False)
        result = run_query(self.db_path, query)
        return pd.DataFrame(result, columns=config.columns)
