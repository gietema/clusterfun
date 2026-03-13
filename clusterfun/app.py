"""
app.py
======

This module provides the FastAPI app for the clusterfun web app.
"""

import os
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware


class CacheControlMiddleware(BaseHTTPMiddleware):
    """Add Cache-Control headers to static media and asset responses."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        path = request.url.path
        if path.startswith("/media") or path.startswith("/_next"):
            response.headers["Cache-Control"] = "public, max-age=86400, immutable"
        return response


class ClusterfunApp(FastAPI):
    """
    A FastAPI app for the clusterfun web app, just with a media directory attribute.
    """

    media_directory: str = "/media"


APP = ClusterfunApp(docs_url=None, redoc_url=None)
APP.add_middleware(CacheControlMiddleware)
APP.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Set the static files directory
FRONTEND_DIR = Path(__file__).parent / "frontend"
# for production setting
if os.environ.get("CLUSTERFUN_PROD_URL") is None and (FRONTEND_DIR / "_next").exists():
    # this loads the static files from the frontend directory (CSS etc.)
    APP.mount("/_next", StaticFiles(directory=FRONTEND_DIR / "_next"), name="_next")
