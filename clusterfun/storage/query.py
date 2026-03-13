"""DuckDB connection manager for querying Parquet data."""

import threading
from typing import List, Optional

import duckdb

from clusterfun.storage.backends.base import StorageBackend

# Thread-local storage: each worker thread gets its own DuckDB connections.
# DuckDB connections are NOT thread-safe — concurrent execute() calls from
# different threads corrupt each other's results. Thread-local connections
# eliminate contention entirely.
_local = threading.local()

# Global generation counter. Bumped by invalidate_cache() so that worker threads
# (which have their own _local) detect stale connections and recreate them.
_generation = 0
_generation_lock = threading.Lock()


def get_connection(uuid: str, backend: StorageBackend) -> duckdb.DuckDBPyConnection:
    """Get or create a thread-local DuckDB connection with a lazy view over the Parquet file.

    The view is a pointer to the Parquet file; DuckDB only fetches data when queries execute,
    using column pruning and row-group statistics to minimize I/O.
    """
    if (
        not hasattr(_local, "connections")
        or getattr(_local, "generation", -1) != _generation
    ):
        # Close stale connections from a previous generation
        for conn in getattr(_local, "connections", {}).values():
            conn.close()
        _local.connections = {}
        _local.generation = _generation
    if uuid not in _local.connections:
        con = duckdb.connect()
        backend.configure_duckdb(con)
        uri = backend.get_parquet_uri(uuid)
        con.execute(f"CREATE VIEW database AS SELECT * FROM read_parquet('{uri}')")
        _local.connections[uuid] = con
    return _local.connections[uuid]


def ensure_embeddings_table(
    uuid: str, backend: StorageBackend, emb_col: str
) -> duckdb.DuckDBPyConnection:
    """Set up embeddings for similarity search.

    Tries to create an in-memory TABLE with an HNSW index (via the ``vss``
    extension) for O(log n) queries.  Falls back to a plain VIEW over the
    Parquet file (brute-force scan) when the extension is unavailable.
    """
    con = get_connection(uuid, backend)
    try:
        con.execute("SELECT 1 FROM embeddings LIMIT 0")
        return con
    except duckdb.CatalogException:
        pass

    emb_uri = backend.get_parquet_uri_named(uuid, "embeddings.parquet")

    try:
        con.execute("INSTALL vss; LOAD vss;")
        dim = con.execute(
            f"SELECT len(\"{emb_col}\") FROM read_parquet('{emb_uri}') LIMIT 1"
        ).fetchone()[0]
        con.execute(
            f"CREATE TABLE embeddings AS "
            f'SELECT id, "{emb_col}"::FLOAT[{dim}] AS "{emb_col}" '
            f"FROM read_parquet('{emb_uri}')"
        )
        con.execute(
            f"CREATE INDEX emb_hnsw_idx ON embeddings "
            f"USING HNSW (\"{emb_col}\") WITH (metric = 'cosine')"
        )
    except Exception:
        # VSS not available — fall back to a view for brute-force search
        try:
            con.execute("DROP TABLE IF EXISTS embeddings")
        except Exception:
            pass
        con.execute(
            f"CREATE VIEW embeddings AS SELECT * FROM read_parquet('{emb_uri}')"
        )

    return con


def run_query(
    uuid: str,
    backend: StorageBackend,
    query: str,
    params: Optional[List] = None,
    fetch_one: bool = False,
) -> List:
    """Run a SQL query against the Parquet data via DuckDB.

    DuckDB pushes predicates to the Parquet reader automatically,
    so only matching row groups and referenced columns are fetched.
    """
    con = get_connection(uuid, backend)
    result = con.execute(query, params or [])
    if fetch_one:
        row = result.fetchone()
        if row is None:
            raise ValueError(f"Query returned no results: {query}")
        return list(row)
    else:
        rows = result.fetchall()
        if not rows:
            raise ValueError(f"Query returned no results: {query}")
        return rows


def invalidate_cache(uuid: str = None) -> None:
    """Remove cached connections. If uuid is None, clear all for this thread
    and bump the global generation so other threads also refresh."""
    global _generation
    if not hasattr(_local, "connections"):
        _local.connections = {}
    if uuid is not None:
        conn = _local.connections.pop(uuid, None)
        if conn:
            conn.close()
    else:
        for conn in _local.connections.values():
            conn.close()
        _local.connections.clear()
        # Bump generation so worker threads discard their stale connections
        with _generation_lock:
            _generation += 1
        _local.generation = _generation
