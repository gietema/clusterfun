import pytest

import clusterfun.storage.backends as backends_module


@pytest.fixture()
def cache_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("CLUSTERFUN_CACHE_DIR", str(tmp_path))
    # Reset the global backend so each test gets a fresh LocalBackend with the tmp_path
    backends_module._backend = None
    return tmp_path
