"""
plot.py
=======

This module provides the Plot class for creating, saving, loading, and displaying plots
with unique identifiers, data, and configuration objects. It utilizes a local storage
system and web server to serve the plots in a web browser.
The class is generally accessed via the `clusterfun.plot_types` plots.

Classes
-------
Plot
    A class representing a plot with a unique identifier, data, and configuration.
"""
import asyncio
import dataclasses
import os
import socket
import webbrowser
from functools import partial
from pathlib import Path
from typing import Any, Dict, Optional
from uuid import uuid4

import pandas as pd
import uvicorn
from fastapi.staticfiles import StaticFiles

from clusterfun.app import APP
from clusterfun.config import Config
from clusterfun.storage.local.loader import LocalLoader
from clusterfun.storage.local.storer import LocalStorer


def run_server(local_port: int):
    """
    This function runs the FastAPI server for the clusterfun web app.

    Parameters
    ----------
    local_port : int
        The local port number to be used for serving the application.
    """
    # Check if an event loop is already running
    if asyncio.get_event_loop().is_running():  # Only Python 3.10+
        loop = asyncio.get_event_loop()
    else:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    config = uvicorn.Config(
        "clusterfun.main:APP",
        port=local_port,
        log_level="warning",
        reload=True,
        root_path=str(Path(__file__).parent),
        reload_dirs=[str(Path(__file__).parent)],
    )
    server = uvicorn.Server(config)
    # If the loop is running, create a task. Else, run the coroutine directly.
    if loop.is_running():
        asyncio.create_task(server.serve())
    else:
        loop.run_until_complete(server.serve())


def get_local_port() -> int:
    """
    This function retrieves a local port number to be used for serving the application.
    If the environment variable "CLUSTERFUN_PORT" is not set, it will find an available port
    If the "CLUSTERFUN_PORT" environment variable is set, it will return the value of that variable.

    Returns
    -------
    int
        The local port number to be used for serving the application.
    """
    env_port = os.environ.get("CLUSTERFUN_PORT")
    if env_port is not None:
        return int(env_port)
    sock = socket.socket()
    sock.bind(("", 0))
    return sock.getsockname()[1]


class Plot:
    """
    A class representing a plot with a unique identifier, data, and configuration.

    Attributes
    ----------
    uuid : str
        The unique identifier for the plot.
    data : Dict[str, Any]
        The data to be visualized in the plot.
    cfg : Config
        The configuration object for the plot.

    Methods
    -------
    save(df: pd.DataFrame, cfg: Config) -> 'Plot':
        Save a plot to local storage and return an instance of the Plot class.
    load(uuid: str) -> 'Plot':
        Load a plot from local storage using its unique identifier.
    load_config(uuid: str) -> Config:
        Load the configuration object for a plot using its unique identifier.
    as_json() -> Dict[str, Any]:
        Return the plot as a JSON-serializable dictionary.
    show(open_browser: bool = True, common_media_path: Optional[str] = None) -> Path:
        Display the plot in a web browser and return the cache directory path.
    url() -> str:
        Return the URL where the plot can be accessed.
    """

    def __init__(self, plot_uuid: str, data: Dict[str, Any], cfg: Config):
        """
        Initialize a new instance of the Plot class.

        Parameters
        ----------
        plot_uuid : str
            The unique identifier for the plot.
        data : Dict[str, Any]
            The data to be visualized in the plot.
        cfg : Config
            The configuration object for the plot.
        """
        self.uuid = plot_uuid
        self.data = data
        self.cfg = cfg

    @classmethod
    def save(cls, df: pd.DataFrame, cfg: Config) -> "Plot":
        """
        Save a plot to local storage and return an instance of the Plot class.

        Parameters
        ----------
        df : pd.DataFrame
            The data to be visualized in the plot, as a DataFrame.
        cfg : Config
            The configuration object for the plot.

        Returns
        -------
        Plot
            An instance of the Plot class with the saved data and configuration.
        """
        # copy dataframe to not change original input
        df = df.copy()
        uuid = str(uuid4())
        if not str(df[cfg.media].iloc[0]).startswith("http") and not str(df[cfg.media].iloc[0]).startswith("s3://"):
            # assume all media paths are local and replace with /media
            common_media_path = os.path.commonpath(df[cfg.media].tolist())
            # store common media path in config
            cfg.common_media_path = common_media_path
            df[cfg.media] = df[cfg.media].astype(str).str.replace(str(common_media_path), "/media")
            APP.mount("/media", StaticFiles(directory=common_media_path), name="media")
        LocalStorer().save(uuid, df, cfg)
        return cls(uuid, df.to_dict(), cfg)

    @classmethod
    def load(cls, uuid: str, cache_dir: Optional[Path] = None) -> "Plot":
        """
        Load a plot from local storage using its unique identifier.

        Parameters
        ----------
        uuid : str
            The unique identifier for the plot.

        Returns
        -------
        Plot
            An instance of the Plot class with the loaded data and configuration.
        """
        return cls(*LocalLoader(uuid, cache_dir).load())

    @staticmethod
    def load_config(uuid: str) -> Config:
        """
        Load the configuration object for a plot using its unique identifier.

        Parameters
        ----------
        uuid : str
            The unique identifier for the plot.

        Returns
        -------
        Config
            The configuration object for the plot.
        """
        return LocalLoader(uuid).load_config()

    def as_json(self) -> Dict[str, Any]:
        """
        Return the plot as a JSON-serializable dictionary.

        Returns
        -------
        Dict[str, Any]
            A dictionary containing the plot's UUID, data, and configuration.
        """
        return {
            "uuid": self.uuid,
            "data": self.data,
            "config": dataclasses.asdict(self.cfg),
        }

    def show(self, open_browser: bool = True, common_media_path: Optional[str] = None) -> Path:
        """
        Display the plot in a web browser and return the cache directory path.

        Parameters
        ----------
        open_browser : bool, optional
            Whether to open the plot in a web browser, by default True.
        common_media_path : Optional[str], optional
            The common media path to be used for serving media files, by default None.

        Returns
        -------
        Path
            The path to the cache directory where the plot is stored.
        """
        if open_browser:
            if common_media_path is not None:
                APP.media_directory = common_media_path
            local_port = get_local_port()
            webbrowser.open(f"http://localhost:{local_port}")
            print(f"Serving plot on http://localhost:{local_port}")
            run_server_fn = partial(run_server, local_port=local_port)
            run_server_fn()
        return LocalStorer().cache_dir / self.uuid

    @property
    def url(self) -> str:
        """
        Return the URL where the plot can be accessed.

        Returns
        -------
        str
            The URL for the plot.
        """
        if "CLUSTERFUN_BASE_URL" in os.environ:
            url = f"{os.environ['CLUSTERFUN_BASE_URL']}/views/{self.uuid}"
        else:
            local_port = os.environ.get("CLUSTERFUN_PORT", "8000")
            url = f"http://localhost:{local_port}/views/{self.uuid}"
        return url
