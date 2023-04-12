"""File to serve a plot from local storage using its unique identifier."""
import argparse
import os
from pathlib import Path

from fastapi.staticfiles import StaticFiles

from clusterfun.app import APP
from clusterfun.plot import Plot
from clusterfun.storage.local.helpers import run_query
from clusterfun.storage.local.loader import LocalLoader


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

    if path_or_uuid == "recent":
        # set path_or_uuid to uuid
        path_or_uuid = LocalLoader("recent").cache_dir.stem
    if os.path.exists(path_or_uuid):
        # if it is a path, set cache_dir to path
        cache_dir = Path(path_or_uuid)
    else:
        # if it is a uuid, set cache_dir to uuid cache dir
        cache_dir = LocalLoader(path_or_uuid).cache_dir
    if not cache_dir.exists():
        raise FileNotFoundError(f"Could not find plot with uuid {path_or_uuid}.")
    plot = Plot.load(cache_dir.stem, cache_dir.parent)
    cfg = plot.cfg

    # run query to get max 1000 random media columns, to see how to load data.
    query = f"SELECT {cfg.media} FROM database ORDER BY RANDOM() LIMIT 10000"
    media = run_query(LocalLoader(cache_dir.stem, cache_dir.parent).db_path, query, fetch_one=False)
    common_media_path = cfg.common_media_path
    if (not media[0][0].startswith("http") and not media[0][0].startswith("s3://")) and common_media_path is None:
        common_media_path = os.path.commonpath(media)
        # df[cfg.media] = df[cfg.media].apply(lambda x: x.replace(common_media_path, "/media"))
    if common_media_path is not None:
        APP.mount("/media", StaticFiles(directory=common_media_path), name="media")
    plot.show(open_browser=True, common_media_path=common_media_path)
