"""File to serve a plot from local storage using its unique identifier."""

import argparse
import os
from pathlib import Path

from fastapi.staticfiles import StaticFiles

from clusterfun.app import APP
from clusterfun.plot import Plot
from clusterfun.storage.backends import get_backend
from clusterfun.storage.backends.local import LocalBackend
from clusterfun.storage.factory import get_loader


def main():
    """
    Serve a plot from local storage using its unique identifier.
    """
    parser = argparse.ArgumentParser(description="Serve a plot from local storage using its unique identifier.")
    parser.add_argument(
        "location",
        # metavar="location",
        type=str,
        help='The UUID for the plot, or the path to a local file. Defaults to "recent"',
        default="recent",
        nargs="?",
    )
    args = parser.parse_args()
    path_or_uuid = args.location

    backend = get_backend()

    if path_or_uuid == "recent":
        loader = get_loader("recent")
        path_or_uuid = loader.uuid

    if os.path.exists(path_or_uuid):
        # if it is a path, set cache_dir to path
        cache_dir = Path(path_or_uuid)
    elif isinstance(backend, LocalBackend):
        cache_dir = backend.cache_dir / path_or_uuid
    else:
        cache_dir = Path(path_or_uuid)

    if isinstance(backend, LocalBackend) and not cache_dir.exists():
        raise FileNotFoundError(f"Could not find plot with uuid {path_or_uuid}.")

    plot = Plot.load(cache_dir.stem)
    cfg = plot.cfg

    # run query to get max 1000 random media columns, to see how to load data.
    common_media_path = cfg.common_media_path
    if common_media_path is not None:
        # mounting here actually works.
        APP.mount("/media", StaticFiles(directory=common_media_path), name="media")
    plot.show(open_browser=True, common_media_path=common_media_path)
