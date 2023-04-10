import json
import random
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from clusterfun import violin
from clusterfun.constants import COLORS
from clusterfun.plot_types.grid import grid
from clusterfun.plot_types.histogram import histogram
from clusterfun.plot_types.scatter import scatter
from clusterfun.validation import ColumnNotFoundException, EmptyDataFrameException


def test_violin(cache_dir):
    df = pd.DataFrame()
    max_len = 1000
    df["media"] = ["https://picsum.photos/300/300" for _ in range(max_len)]
    df["y"] = np.random.normal(size=max_len)
    df["color"] = np.random.choice(COLORS, size=max_len)
    cache_dir = violin(df, y="y", media="media", title="A title of a plot", color="color", show=False)
    assert isinstance(cache_dir, Path)
    assert (cache_dir / "config.json").exists()
    assert (cache_dir / "data.json").exists()
    assert (cache_dir / "database.db").exists()
    with open(cache_dir / "config.json") as f:
        config = json.load(f)
        assert config["columns"] == ["id", "media", "y", "x", "color"]
        assert config["media"] == "media"
        assert config["color"] == "color"
        assert config["y"] == "y"
        assert config["type"] == "violin"


def test_grid(cache_dir):
    df = pd.DataFrame()
    max_len = 1000
    df["media"] = ["https://picsum.photos/300/300" for _ in range(max_len)]
    cache_dir = grid(df, media="media", title="A title of a plot", show=False)
    assert isinstance(cache_dir, Path)
    with open(cache_dir / "config.json") as f:
        config = json.load(f)
        assert config["type"] == "grid"


def randn_skew_fast(N, alpha=0.0, loc=0.0, scale=1.0):
    sigma = alpha / np.sqrt(1.0 + alpha**2)
    u0 = np.random.randn(N)
    v = np.random.randn(N)
    u1 = (sigma * u0 + np.sqrt(1.0 - sigma**2) * v) * scale
    u1[u0 < 0] *= -1
    u1 = u1 + loc
    return u1


def test_histogram(cache_dir):
    df = pd.DataFrame()
    max_len = 10000
    df["media"] = ["https://picsum.photos/300/300" for _ in range(max_len)]
    colors = []
    for i in range(2):
        colors.extend([i] * 5000)
    df["color"] = colors
    df["x"] = np.concatenate(
        [np.random.normal(loc=-10, scale=5, size=5000), np.random.normal(loc=10, scale=5, size=5000)]
    )
    cache_dir = histogram(df, x="x", media="media", title="A title of a plot", bins=40, color="color", show=False)
    assert isinstance(cache_dir, Path)
    assert (cache_dir / "config.json").exists()
    assert (cache_dir / "data.json").exists()
    assert (cache_dir / "database.db").exists()


def test_it_creates_a_scatter(cache_dir):
    df = pd.DataFrame()
    max_len = 10000
    df["x"] = [random.randint(0, max_len) / 1000 for _ in range(max_len)]
    df["y"] = [random.randint(0, max_len) / 1000 for _ in range(max_len)]
    df["color"] = [str(random.randint(0, 10)) for _ in range(max_len)]
    df["media"] = ["https://picsum.photos/300/300" for _ in range(max_len)]
    df["bbox"] = [
        [
            {
                "xmin": np.random.randint(low=5, high=100),
                "ymin": np.random.randint(low=5, high=100),
                "xmax": np.random.randint(low=200, high=280),
                "ymax": np.random.randint(low=200, high=280),
                "color": str(np.random.choice(COLORS, 1)[0]),
                "label": "a first label",
            },
            {
                "xmin": np.random.randint(low=5, high=100),
                "ymin": np.random.randint(low=5, high=100),
                "xmax": np.random.randint(low=200, high=280),
                "ymax": np.random.randint(low=200, high=280),
                "color": str(np.random.choice(COLORS, 1)[0]),
                "label": "a second label",
            },
        ]
        for _ in range(max_len)
    ]
    cache_dir = scatter(
        df,
        x="x",
        y="y",
        media="media",
        color="color",
        title="A title of a plot",
        bounding_box="bbox",
        show=False
    )
    assert isinstance(cache_dir, Path)
    assert (cache_dir / "config.json").exists()
    assert (cache_dir / "data.json").exists()
    assert (cache_dir / "database.db").exists()

    # without colour
    cache_dir = scatter(
        df,
        x="x",
        y="y",
        media="media",
        title="A title of a plot",
        bounding_box="bbox",
        show=False
    )
    assert isinstance(cache_dir, Path)
    assert (cache_dir / "config.json").exists()
    assert (cache_dir / "data.json").exists()
    assert (cache_dir / "database.db").exists()


def test_it_cannot_create_a_plot_with_non_existing_column_names(cache_dir):
    df = pd.DataFrame()
    max_len = 100
    df["x"] = [random.randint(0, max_len) / 1000 for _ in range(max_len)]
    df["y"] = [random.randint(0, max_len) / 1000 for _ in range(max_len)]
    with pytest.raises(ColumnNotFoundException):
        scatter(df, x="non_existing", y="y", media="media", color="color", show=False)


def test_it_cannot_plot_an_empty_dataframe(cache_dir):
    df = pd.DataFrame()
    df["x"] = []
    df["y"] = []
    df["media"] = []
    with pytest.raises(EmptyDataFrameException):
        scatter(df, x="x", y="y", media="media", show=False)
