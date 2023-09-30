import json
from pathlib import Path

import pandas as pd

from clusterfun import confusion_matrix


def test_confusion_matrix(cache_dir):
    df = pd.DataFrame(
        {
            "y_true": ["A", "A", "B", "B", "C"],
            "y_pred": ["A", "B", "A", "B", "C"],
        }
    )
    df["media"] = ["https://picsum.photos/300/300" for _ in range(len(df))]
    cache_dir = confusion_matrix(df, "y_true", "y_pred", "media", show=False)
    assert isinstance(cache_dir, Path)
    assert (cache_dir / "config.json").exists()
    assert (cache_dir / "data.json").exists()
    assert (cache_dir / "database.db").exists()
    with open(cache_dir / "config.json") as f:
        config = json.load(f)
        assert config["columns"] == ["id", "media", "_prediction", "_label", "y_true", "y_pred"]
        assert config["media"] == "media"
        assert config["y"] == "_prediction"
        assert config["x"] == "_label"
        assert config["type"] == "confusion_matrix"