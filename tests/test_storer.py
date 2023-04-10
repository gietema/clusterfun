import tempfile
from pathlib import Path

import pandas as pd
from clusterfun.config import Config
from clusterfun.storage.local.storer import LocalStorer


def test_save():
    with tempfile.TemporaryDirectory() as tmpdir:
        tmpdir = Path(tmpdir)
        storer = LocalStorer(tmpdir)
        df = pd.DataFrame()
        df["a"] = [1, 2, 3]
        df["img_path"] = ["a", "b", "c"]
        storer.save("test", df, Config("histogram", media="img_path", columns=["a", "id"], x="a"))
        assert (tmpdir / "test" / "database.db").exists()
        assert (tmpdir / "test" / "config.json").exists()
        assert (tmpdir / "test" / "data.json").exists()
