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
FRONTEND_DIR = Path(__file__).parent.parent / "app" / "out"
if os.environ.get("CLUSTERFUN_PROD_URL") is None and (FRONTEND_DIR / "_next").exists():
    APP.mount("/_next", StaticFiles(directory=FRONTEND_DIR / "_next"), name="_next")

# df = pd.read_parquet(Path(__file__).parent.parent / "tests" / "samples" / "cubism.parquet")
# df.img_path = df.img_path.apply(lambda x: f"/Users/jochemgietema/code/clusterfun{x}")
# common_media_path = os.path.commonpath(df["img_path"].tolist())
# print(common_media_path, "common media path")
# df["img_path"] = df["img_path"].apply(lambda x: x.replace(common_media_path, "/media"))
# APP.mount("/media", StaticFiles(directory=common_media_path), name="media")
