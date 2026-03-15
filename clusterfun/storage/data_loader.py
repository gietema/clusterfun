"""Backend-agnostic data loader."""

import dataclasses
import time
from typing import Any, Dict, List, Optional, Tuple, Union

import pandas as pd

from clusterfun.config import Config
from clusterfun.models.filter import Filter
from clusterfun.models.media_indices import MediaIndices
from clusterfun.models.media_item import MediaItem
from clusterfun.storage.backends.base import StorageBackend
from clusterfun.storage.local.data import get_data_dict
from clusterfun.storage.local.helpers import get_filter_query, get_media_query
from clusterfun.storage.local.annotation_manager import AnnotationManager
from clusterfun.storage.local.label_manager import LabelManager
from clusterfun.storage.local.project_label_manager import ProjectLabelManager
from clusterfun.storage.query import get_connection, run_query
from clusterfun.storage.storer import load_media

_config_cache: Dict[str, Config] = {}
_label_cache: Dict[str, tuple] = {}  # uuid -> (labels_dict, timestamp)
_LABEL_TTL = 2.0  # seconds


class DataLoader:
    """Backend-agnostic data loader for clusterfun."""

    def __init__(self, uuid: str, backend: StorageBackend):
        self.uuid = uuid
        self.backend = backend
        self._label_manager: Optional[Union[LabelManager, ProjectLabelManager]] = None
        self._annotation_manager: Optional[AnnotationManager] = None

    @property
    def label_manager(self) -> Union[LabelManager, ProjectLabelManager]:
        if self._label_manager is None:
            config = self._load_base_config()
            if config.project:
                self._label_manager = ProjectLabelManager(
                    self.uuid,
                    config.project,
                    self.backend,
                    config.columns[1],  # media column is always 2nd in columns list
                    common_media_path=config.common_media_path,
                )
            else:
                self._label_manager = LabelManager(self.uuid, self.backend)
        return self._label_manager

    @property
    def annotation_manager(self) -> AnnotationManager:
        if self._annotation_manager is None:
            self._annotation_manager = AnnotationManager(self.uuid, self.backend)
        return self._annotation_manager

    def load(self) -> Tuple[str, Dict[str, Any], Config]:
        """Load the data and config for the given uuid."""
        if not self.backend.exists(self.uuid):
            raise FileNotFoundError(f"Could not find data for uuid={self.uuid}")
        return self.uuid, self.load_data(), self.load_config()

    def load_data(self) -> Dict[str, List[Union[int, float]]]:
        """Load minimal plot data from data.json."""
        return self.backend.load_json(self.uuid, "data.json")

    def _load_base_config(self) -> Config:
        """Load the base config from JSON, with caching."""
        cache_key = f"{type(self.backend).__name__}:{self.uuid}"
        if cache_key not in _config_cache:
            _config_cache[cache_key] = Config(
                **self.backend.load_json(self.uuid, "config.json")
            )
        return _config_cache[cache_key]

    def load_config(self) -> Config:
        """Load config with labels (cached for short TTL)."""
        base = self._load_base_config()
        config = dataclasses.replace(base)
        now = time.monotonic()
        cached = _label_cache.get(self.uuid)
        if cached and (now - cached[1]) < _LABEL_TTL:
            labels = cached[0]
        else:
            labels = self.label_manager.read_labels()
            _label_cache[self.uuid] = (labels, now)
        config.labels = list(
            {label for label_list in labels.values() for label in label_list}
        )
        if config.total_count is None:
            try:
                con = get_connection(self.uuid, self.backend)
                row = con.execute("SELECT COUNT(*) FROM database").fetchone()
                config.total_count = row[0] if row else 0
            except Exception:
                config.total_count = 0
        return config

    def _build_info_dict(self, row: tuple) -> Dict[str, Any]:
        """Build a column-name-to-value dict from a DB row (skipping id and src)."""
        columns = self._load_base_config().columns
        return dict(zip(columns[2:], row[2:]))

    def get_row(self, media_id: int, as_base64: bool = False) -> MediaItem:
        """Get a single row of data."""
        result = run_query(
            self.uuid,
            self.backend,
            "SELECT * FROM database WHERE id = ?",
            params=[media_id],
            fetch_one=True,
        )
        if as_base64:
            src, height, width = load_media(
                result[1],
                as_base64=True,
                common_media_path=self._load_base_config().common_media_path,
            )
        else:
            src, height, width = result[1], None, None
        return MediaItem(
            index=media_id,
            src=src,
            height=height,
            width=width,
            information=self._build_info_dict(result),
        )

    def get_rows(self, media_indices: MediaIndices) -> List[MediaItem]:
        """Get a paginated list of rows."""
        con, config = None, self.load_config()
        if media_indices.filters or len(media_indices) == 0:
            con = get_connection(self.uuid, self.backend)
        query, params = get_media_query(media_indices, config=config, con=con)
        result = run_query(self.uuid, self.backend, query, params=params)
        labels = self.label_manager.read_labels()
        needs_url_transform = any(
            str(item[1]).startswith("s3://") or str(item[1]).startswith("gs://")
            for item in result[:1]
        )
        items = []
        for item in result:
            if needs_url_transform:
                src, _, _ = load_media(
                    item[1], common_media_path=config.common_media_path
                )
            else:
                src = item[1]
            labels_item = labels.get(str(item[0]))
            items.append(
                MediaItem(
                    index=item[0],
                    src=src,
                    height=None,
                    width=None,
                    information=self._build_info_dict(item),
                    labels=labels_item,
                )
            )
        return items

    def get_rows_metadata(self, media_indices: MediaIndices) -> List[Dict[str, Any]]:
        """Get metadata for a list of media items."""
        query, params = get_media_query(media_indices, paginate=False)
        result = run_query(self.uuid, self.backend, query, params=params)
        columns = self._load_base_config().columns
        return [
            {"index": item[0], "information": dict(zip(columns[2:], item[2:]))}
            for item in result
        ]

    def filter(self, filters: List[Filter]) -> List[Dict[str, Any]]:
        """Filter data based on given filters."""
        con = get_connection(self.uuid, self.backend)
        config = self.load_config()
        query, query_params = get_filter_query(con, config, filters)
        data = get_data_dict(
            con, config, query_addition=query, query_params=query_params
        )
        return data[0]

    def get_dataframe(
        self, media_indices: Optional[MediaIndices] = None
    ) -> pd.DataFrame:
        """Get data as a pandas DataFrame."""
        con = get_connection(self.uuid, self.backend)
        if media_indices is not None:
            config = self.load_config()
            query, params = get_media_query(
                media_indices, config=config, con=con, paginate=False
            )
            return con.execute(query, params or []).fetchdf()
        return con.execute("SELECT * FROM database").fetchdf()
