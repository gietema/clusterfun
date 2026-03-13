"""Main module - assembles the FastAPI application with all route modules."""

from fastapi import Request
from fastapi.responses import HTMLResponse

from clusterfun.app import APP, FRONTEND_DIR
from clusterfun.routes import views, media, labels, columns

APP.include_router(views.router)
APP.include_router(media.router)
APP.include_router(labels.router)
APP.include_router(columns.router)


@APP.get("/{path:path}", response_class=HTMLResponse)
async def catch_all(request: Request, path: str):
    """Serve index.html for all unmatched routes (Next.js frontend routing)."""
    with open(FRONTEND_DIR / "index.html", encoding="utf-8") as f:
        return f.read()
