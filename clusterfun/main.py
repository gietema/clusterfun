"""Main module - assembles the FastAPI application with all route modules."""

import os

from fastapi import Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from clusterfun.app import APP, FRONTEND_DIR
from clusterfun.faiss_index import invalidate_index
from clusterfun.routes import views, media, labels, columns, similarity, active_learning, embeddings, plot_builder, insights, projects, image_stats, annotations, export
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

# Mount /media for local image serving. Check the most recent view's config
# at startup — must happen before the catch-all route.
try:
    from clusterfun.storage.backends import get_backend
    from clusterfun.storage.backends.local import LocalBackend
    from clusterfun.storage.local.helpers import get_recent_dir

    _backend = get_backend()
    if isinstance(_backend, LocalBackend):
        _recent = get_recent_dir(_backend.cache_dir)
        if _recent.exists():
            _cfg = _backend.load_json(_recent.stem, "config.json")
            _cmp = _cfg.get("common_media_path")
            if _cmp and os.path.isdir(_cmp):
                APP.mount("/media", StaticFiles(directory=_cmp), name="media")
except Exception:
    pass


@APP.get("/{path:path}", response_class=HTMLResponse)
async def catch_all(request: Request, path: str):
    """Serve index.html for all unmatched routes (Next.js frontend routing)."""
    with open(FRONTEND_DIR / "index.html", encoding="utf-8") as f:
        return f.read()
