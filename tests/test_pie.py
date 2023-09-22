import pandas as pd
import numpy as np
from clusterfun.plot_types.pie_chart import (
    generate_polar_coordinates,
    update_coordinates,
    compute_pie_chart_coordinates,
    format_color,
)


def test_generate_polar_coordinates():
    count = 5
    start = 0.25
    ratio = 0.1
    r, theta = generate_polar_coordinates(count, start, ratio)

    assert r.shape == (count,)
    assert theta.shape == (count,)
    assert np.all(r >= 0)
    assert np.all(r <= 1)
    assert np.all(theta >= 0)
    assert np.all(theta <= 2 * np.pi)


def test_update_coordinates():
    df = pd.DataFrame(
        {
            "color": ["A", "A", "B", "B", "C"],
            "pie_chart_x": [0, 0, 0, 0, 0],
            "pie_chart_y": [0, 0, 0, 0, 0],
        }
    )

    color = "color"
    col = "A"
    x_coords = np.array([1, 2])
    y_coords = np.array([3, 4])

    updated_df = update_coordinates(df, color, col, x_coords, y_coords)

    assert updated_df["pie_chart_x"].tolist() == [1, 2, 0, 0, 0]
    assert updated_df["pie_chart_y"].tolist() == [3, 4, 0, 0, 0]


def test_compute_pie_chart_coordinates():
    df = pd.DataFrame({"color": ["A", "A", "B", "B", "C"]})
    color = "color"
    counts = {"A": 0.4, "B": 0.4, "C": 0.2}

    updated_df = compute_pie_chart_coordinates(df, color, counts)

    assert "pie_chart_x" in updated_df.columns
    assert "pie_chart_y" in updated_df.columns
    assert len(updated_df["pie_chart_x"]) == len(df)
    assert len(updated_df["pie_chart_y"]) == len(df)


def test_format_color():
    df = pd.DataFrame({"color": ["A", "A", "B", "B", "C"]})
    color = "color"
    counts = {"A": 0.4, "B": 0.4, "C": 0.2}

    formatted_df = format_color(df, color, counts)

    for i, (name, count) in enumerate(counts.items()):
        expected = f"{i} - {name} ({count:.01%})"
        assert any(formatted_df[color] == expected)
