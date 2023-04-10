import pytest


@pytest.fixture()
def cache_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("CLUSTERFUN_CACHE_DIR", str(tmp_path))
    return tmp_path
