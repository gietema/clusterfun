"""Tests for the dynamic plot builder functions.

These tests verify that _build_histogram_data, _build_violin_data, and
_build_bar_chart_data handle non-categorical color columns correctly
(including the case where color == x/y column).
"""

import duckdb
import numpy as np
import pandas as pd
import pytest

from clusterfun.config import Config
from clusterfun.routes.plot_builder import (
    _build_bar_chart_data,
    _build_histogram_data,
    _build_violin_data,
)


@pytest.fixture()
def sample_db():
    """Create a DuckDB connection with a small sample database."""
    np.random.seed(42)
    n = 100
    df = pd.DataFrame(
        {
            "id": range(n),
            "score": np.random.normal(size=n),
            "label": np.random.choice(["cat", "dog", "bird"], size=n),
            "value": np.random.uniform(0, 10, size=n),
            "group_col": np.random.choice(["low", "high"], size=n),
        }
    )
    con = duckdb.connect()
    con.register("df_view", df)
    con.execute("CREATE VIEW database AS SELECT * FROM df_view")
    yield con
    con.close()


def _make_cfg(**kwargs) -> Config:
    defaults = dict(
        type="histogram",
        media="media",
        columns=["id", "score", "label", "value"],
    )
    defaults.update(kwargs)
    return Config(**defaults)


class TestBuildHistogramData:
    def test_basic_histogram(self, sample_db):
        cfg = _make_cfg(type="histogram", x="score")
        data, colors = _build_histogram_data(sample_db, cfg, bins=10)
        assert len(data) == 1
        assert "id" in data[0]
        assert "x" in data[0]
        assert "y" in data[0]
        assert colors is None

    def test_histogram_with_categorical_color(self, sample_db):
        cfg = _make_cfg(
            type="histogram", x="score", color="label", color_is_categorical=True
        )
        data, colors = _build_histogram_data(sample_db, cfg, bins=10)
        assert len(data) > 1  # one trace per color
        assert colors is not None
        assert set(colors) == {"cat", "dog", "bird"}

    def test_histogram_with_non_categorical_color(self, sample_db):
        """Non-categorical color column must be included in temp table."""
        cfg = _make_cfg(
            type="histogram", x="score", color="value", color_is_categorical=False
        )
        data, colors = _build_histogram_data(sample_db, cfg, bins=10)
        assert len(data) == 1
        assert "marker" in data[0]
        assert "color" in data[0]["marker"]

    def test_histogram_color_same_as_x(self, sample_db):
        """When color == x column, should not produce duplicate columns."""
        cfg = _make_cfg(
            type="histogram", x="score", color="score", color_is_categorical=False
        )
        data, colors = _build_histogram_data(sample_db, cfg, bins=10)
        assert len(data) == 1
        assert "id" in data[0]

    def test_histogram_custom_bins(self, sample_db):
        cfg = _make_cfg(type="histogram", x="score")
        data_10, _ = _build_histogram_data(sample_db, cfg, bins=10)
        data_50, _ = _build_histogram_data(sample_db, cfg, bins=50)
        # More bins means different y values (higher counts per bin with fewer bins)
        y10_max = max(data_10[0]["y"])
        y50_max = max(data_50[0]["y"])
        assert y10_max > y50_max  # fewer bins → higher max count

    def test_histogram_x_values_are_jittered_within_bins(self, sample_db):
        """X values should be uniformly scattered within bins, not raw data values."""
        cfg = _make_cfg(type="histogram", x="score")
        data, _ = _build_histogram_data(sample_db, cfg, bins=5)
        x_vals = data[0]["x"]
        # With jittering the x values should cover the full bin width.
        # Check that the range of x values roughly spans the data range
        x_min, x_max = min(x_vals), max(x_vals)
        assert x_max - x_min > 0
        # With 5 bins over ~100 points, there should be no large gaps.
        # Sort x values and check the max gap is smaller than one bin width.
        sorted_x = sorted(x_vals)
        bin_width = (x_max - x_min) / 5
        max_gap = max(b - a for a, b in zip(sorted_x, sorted_x[1:]))
        # The max gap within a bin should be much less than a full bin width
        # (gaps between bins can be up to ~1 bin width, but within a bin it should be dense)
        assert max_gap < bin_width * 1.5  # generous threshold


class TestBuildViolinData:
    def test_basic_violin(self, sample_db):
        cfg = _make_cfg(type="violin", y="score")
        data, colors = _build_violin_data(sample_db, cfg)
        assert len(data) == 1
        assert "id" in data[0]
        assert "x" in data[0]
        assert "y" in data[0]

    def test_violin_with_categorical_color(self, sample_db):
        cfg = _make_cfg(
            type="violin", y="score", color="label", color_is_categorical=True
        )
        data, colors = _build_violin_data(sample_db, cfg)
        assert len(data) > 1
        assert colors is not None

    def test_violin_with_non_categorical_color(self, sample_db):
        """Non-categorical color column must be included in temp table."""
        cfg = _make_cfg(
            type="violin", y="score", color="value", color_is_categorical=False
        )
        data, colors = _build_violin_data(sample_db, cfg)
        assert len(data) == 1
        assert "marker" in data[0]

    def test_violin_color_same_as_y(self, sample_db):
        """When color == y column, should not produce duplicate columns."""
        cfg = _make_cfg(
            type="violin", y="score", color="score", color_is_categorical=False
        )
        data, colors = _build_violin_data(sample_db, cfg)
        assert len(data) == 1


class TestBuildBarChartData:
    def test_basic_bar_chart(self, sample_db):
        cfg = _make_cfg(type="bar_chart", x="label")
        data, colors, x_names = _build_bar_chart_data(sample_db, cfg)
        assert len(data) == 1
        assert "id" in data[0]
        assert set(x_names) == {"cat", "dog", "bird"}

    def test_bar_chart_with_categorical_color(self, sample_db):
        cfg = _make_cfg(
            type="bar_chart",
            x="label",
            color="group_col",
            color_is_categorical=True,
            columns=["id", "score", "label", "value", "group_col"],
        )
        data, colors, x_names = _build_bar_chart_data(sample_db, cfg)
        assert len(data) > 1
        assert colors is not None

    def test_bar_chart_with_non_categorical_color(self, sample_db):
        """Non-categorical color column must be included in temp table."""
        cfg = _make_cfg(
            type="bar_chart", x="label", color="value", color_is_categorical=False
        )
        data, colors, x_names = _build_bar_chart_data(sample_db, cfg)
        assert len(data) == 1
        assert "marker" in data[0]

    def test_bar_chart_color_same_as_x(self, sample_db):
        """When color == x column, should not produce duplicate columns."""
        cfg = _make_cfg(
            type="bar_chart", x="label", color="label", color_is_categorical=False
        )
        data, colors, x_names = _build_bar_chart_data(sample_db, cfg)
        assert len(data) == 1
