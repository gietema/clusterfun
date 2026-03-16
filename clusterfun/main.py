"""Main module - assembles the FastAPI application with all route modules."""

import os

from fastapi import Request, Response
from fastapi.responses import HTMLResponse

from clusterfun.app import APP, FRONTEND_DIR
from clusterfun.faiss_index import invalidate_index
from clusterfun.routes import views, media, labels, columns, similarity, active_learning, embeddings, plot_builder, insights, projects, image_stats, annotations, export, huggingface
from clusterfun.storage.query import register_invalidation_hook

# Clear FAISS index cache when DuckDB cache is invalidated
register_invalidation_hook(invalidate_index)

APP.include_router(views.router)
APP.include_router(media.router)
APP.include_router(labels.router)
APP.include_router(columns.router)
APP.include_router(similarity.router)
APP.include_router(active_learning.router)
APP.include_router(embeddings.router)
APP.include_router(plot_builder.router)
APP.include_router(insights.router)
APP.include_router(projects.router)
APP.include_router(image_stats.router)
APP.include_router(annotations.router)
APP.include_router(export.router)
APP.include_router(huggingface.router)

_media_dirs: set[str] = set()


def register_media_directory(path: str) -> None:
    """Register a directory for serving local media files."""
    if os.path.isdir(path):
        _media_dirs.add(path)


def _resolve_media_file(relative_path: str):
    """Find a media file across all registered media directories."""
    from pathlib import Path
    for media_dir in _media_dirs:
        file_path = Path(media_dir) / relative_path
        if file_path.exists() and file_path.is_file():
            return file_path
    return None


def _ensure_media_dirs_loaded() -> None:
    """Lazily scan recent views for common_media_path directories."""
    if _media_dirs:
        return
    try:
        from clusterfun.storage.backends import get_backend
        from clusterfun.storage.backends.local import LocalBackend

        backend = get_backend()
        if not isinstance(backend, LocalBackend):
            return

        cache_dir = backend.cache_dir
        if not cache_dir.exists():
            return

        view_dirs = sorted(
            (d for d in cache_dir.iterdir() if d.is_dir() and (d / "config.json").exists()),
            key=lambda d: d.stat().st_mtime,
            reverse=True,
        )

        for view_dir in view_dirs[:20]:
            try:
                cfg = backend.load_json(view_dir.stem, "config.json")
                cmp = cfg.get("common_media_path")
                if cmp and os.path.isdir(cmp):
                    _media_dirs.add(cmp)
            except Exception:
                continue
    except Exception:
        pass


@APP.get("/{path:path}")
async def catch_all(request: Request, path: str):
    """Serve index.html for all unmatched routes, or serve local media files."""
    if path.startswith("media/"):
        _ensure_media_dirs_loaded()
        file_path = _resolve_media_file(path[len("media/"):])
        if file_path:
            from fastapi.responses import FileResponse
            return FileResponse(file_path, headers={"Cache-Control": "public, max-age=86400, immutable"})
        return Response(status_code=404)
    with open(FRONTEND_DIR / "index.html", encoding="utf-8") as f:
        return HTMLResponse(content=f.read())
