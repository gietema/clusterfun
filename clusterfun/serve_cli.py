"""CLI entry point for clusterfun.

Usage:
    clusterfun                          # serve most recent view
    clusterfun serve <uuid>             # serve a specific view
"""

import os
from pathlib import Path

import click
from fastapi.staticfiles import StaticFiles

from clusterfun.app import APP
from clusterfun.plot import Plot
from clusterfun.storage.backends import get_backend
from clusterfun.storage.backends.local import LocalBackend
from clusterfun.storage.factory import get_loader


def _resolve_project_uuid(backend, project_name: str) -> str:
    """Resolve a project name to its most recent view UUID."""
    if not backend.project_json_exists(project_name, "project.json"):
        raise FileNotFoundError(f"No project found with name '{project_name}'.")
    manifest = backend.load_project_json(project_name, "project.json")
    views = manifest.get("views", [])
    if not views:
        raise FileNotFoundError(f"Project '{project_name}' has no views.")
    return views[-1]["uuid"]


def _serve(path_or_uuid: str):
    """Serve a saved view by UUID, path, or project name."""
    backend = get_backend()

    if path_or_uuid == "recent":
        loader = get_loader("recent")
        path_or_uuid = loader.uuid

    if (
        not os.path.exists(path_or_uuid)
        and isinstance(backend, LocalBackend)
        and not (backend.cache_dir / path_or_uuid).exists()
        and backend.project_json_exists(path_or_uuid, "project.json")
    ):
        path_or_uuid = _resolve_project_uuid(backend, path_or_uuid)

    if os.path.exists(path_or_uuid):
        cache_dir = Path(path_or_uuid)
    elif isinstance(backend, LocalBackend):
        cache_dir = backend.cache_dir / path_or_uuid
    else:
        cache_dir = Path(path_or_uuid)

    if isinstance(backend, LocalBackend) and not cache_dir.exists():
        raise FileNotFoundError(f"Could not find plot with uuid {path_or_uuid}.")

    plot = Plot.load(cache_dir.stem)
    cfg = plot.cfg

    common_media_path = cfg.common_media_path
    if common_media_path is not None:
        APP.mount("/media", StaticFiles(directory=common_media_path), name="media")
    plot.show(open_browser=True, common_media_path=common_media_path)


@click.group(invoke_without_command=True)
@click.pass_context
def main(ctx):
    """Browse and visualize image datasets."""
    if ctx.invoked_subcommand is None:
        _serve("recent")


@main.command()
@click.argument("location", default="recent", required=False)
def serve(location):
    """Serve a saved view by UUID, path, or project name."""
    _serve(location)


