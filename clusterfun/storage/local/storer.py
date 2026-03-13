"""Storer class for saving data via storage backends"""

import dataclasses
from typing import Any, Dict, List, Optional

import duckdb
import orjson
import pandas as pd
import pyarrow as pa

from clusterfun.config import Config
from clusterfun.storage.local.data import get_data_dict
from clusterfun.storage.local.helpers import format_df_for_db
from clusterfun.storage.storer import Storer


class LocalStorer(Storer):
    """
    Stores data using the configured storage backend.
    Writes Parquet for efficient querying via DuckDB, plus JSON artifacts.
    """

    def __init__(self, backend: Optional[Any] = None):
        """Initializes the storer with a storage backend."""
        if backend is None:
            from clusterfun.storage.backends import get_backend

            backend = get_backend()
        self.backend = backend

    def save(self, uuid: str, df: pd.DataFrame, cfg: Config):
        """Saves the data using the storage backend."""
        df = format_df_for_db(cfg, df)
        df = df.reset_index(drop=False).rename(columns={"index": "id"})

        # Sort by id for optimal row group pruning in Parquet
        df = df.sort_values("id").reset_index(drop=True)

        # Save Parquet to backend
        # Downcast large_string → string so DuckDB returns plain strings, not lists
        table = pa.Table.from_pandas(df[cfg.columns])
        new_fields = []
        for field in table.schema:
            if field.type == pa.large_string():
                new_fields.append(field.with_type(pa.string()))
            elif field.type == pa.large_binary():
                new_fields.append(field.with_type(pa.binary()))
            else:
                new_fields.append(field)
        table = table.cast(pa.schema(new_fields))
        self.backend.save_parquet(uuid, table)

        # Generate plot data via DuckDB on the in-memory DataFrame
        con = duckdb.connect()
        temp_df = df[cfg.columns]
        con.register("database", temp_df)
        data_dict, colors = get_data_dict(con, cfg)
        cfg.colors = colors
        con.close()

        # Normalize display field
        if cfg.display is not None and isinstance(cfg.display, str):
            cfg.display = [cfg.display]

        # Save JSON artifacts to backend
        self.backend.save_json(uuid, "config.json", dataclasses.asdict(cfg))
        self.backend.save_json(uuid, "data.json", data_dict)

    def save_config(self, cfg: Config):
        """Not used directly - config is saved as part of save()."""
        pass

    def save_data(self, data: List[Dict[str, Any]]):
        """Not used directly - data is saved as part of save()."""
        pass
