"""Storer class for saving the data locally"""
import dataclasses
import json
import os
import sqlite3
from pathlib import Path
from typing import Any, Dict, List, Optional

import orjson
import pandas as pd

from clusterfun.config import Config
from clusterfun.storage.local.data import get_data_dict
from clusterfun.storage.local.helpers import format_df_for_db
from clusterfun.storage.storer import Storer


class LocalStorer(Storer):
    """
    Stores the data in a local directory. The directory is created in the cache directory.
    """

    def __init__(
        self,
        cache_dir: Optional[Path] = None,
    ):
        """Initializes the storer, sets the cache_dir"""
        if cache_dir is None:
            cache_dir = Path(os.environ.get("CLUSTERFUN_CACHE_DIR", os.path.expanduser("~/.cache/clusterfun")))
        self.cache_dir = cache_dir
        self.uuid: Optional[str] = None

    @property
    def save_dir(self):
        """Returns the path to the directory where the data is saved"""
        return Path(f"{self.cache_dir}/{self.uuid}")

    def save(self, uuid: str, df: pd.DataFrame, cfg: Config):
        """Saves the data to the local directory"""
        self.uuid = uuid
        self.save_dir.mkdir(parents=True, exist_ok=True)
        con = self.save_db(cfg, df)

        data_dict, colors = get_data_dict(con, cfg)
        cfg.colors = colors
        self.save_config(cfg)
        self.save_data(data_dict)

    def save_db(self, cfg: Config, df: pd.DataFrame):
        """Saves the dataframe to a sqlite database"""
        con = sqlite3.connect(self.save_dir / "database.db")
        df = format_df_for_db(cfg, df)
        try:
            df.reset_index(drop=False).rename(columns={"index": "id"})[cfg.columns].to_sql(
                name="database", con=con, index=False
            )
        except sqlite3.InterfaceError as exc:
            raise sqlite3.InterfaceError(
                "This dataframe could not be saved to the database. "
                "Check if you have any columns with uncommon value types."
            ) from exc
        return con

    def save_config(self, cfg: Config):
        """Saves the config to a json file"""
        if cfg.display is not None and isinstance(cfg.display, str):
            cfg.display = [cfg.display]
        with open(str(self.save_dir / "config.json"), "w", encoding="utf-8") as f:
            json.dump(dataclasses.asdict(cfg), f, indent=2)

    def save_data(self, data: List[Dict[str, Any]]):
        """Saves the data for plotly to a json file"""
        with open(self.save_dir / "data.json", "wb") as f:
            f.write(
                orjson.dumps(  # pylint: disable=no-member
                    data,
                    option=orjson.OPT_NAIVE_UTC | orjson.OPT_SERIALIZE_NUMPY,  # pylint: disable=no-member
                )
            )
