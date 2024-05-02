"""
app.py
======

This module provides the FastAPI app for the clusterfun web app.
"""
import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles


class ClusterfunApp(FastAPI):
    """
    A FastAPI app for the clusterfun web app, just with a media directory attribute.
    """

    media_directory: str = "/media"


APP = ClusterfunApp(docs_url=None, redoc_url=None)
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
