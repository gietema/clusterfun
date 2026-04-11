"""SQLite-backed label storage.

Replaces JSON file read-modify-write with atomic SQL operations.
Uses WAL mode for concurrent reads/writes without locks.

Schema:
  view_labels(view_uuid, media_id, label)  — view-scoped labels
  project_labels(project, media_path, label) — project-scoped labels

On first access, automatically migrates existing labels.json files.
"""

import os
import sqlite3
import threading
from pathlib import Path
from typing import Dict, List, Optional

# Module-level connection, protected by lock for thread safety.
# SQLite in WAL mode supports concurrent reads + serialized writes.
_db_lock = threading.Lock()
_connections: Dict[str, sqlite3.Connection] = {}
_conn_paths: Dict[str, str] = {}  # same keys as _connections, tracks db path


def _get_db_path() -> Path:
    cache_dir = Path(os.environ.get("CLUSTERFUN_CACHE_DIR", Path.home() / ".cache" / "clusterfun"))
    cache_dir.mkdir(parents=True, exist_ok=True)
    return cache_dir / "labels.db"


def _get_connection() -> sqlite3.Connection:
    """Get or create a thread-safe SQLite connection with WAL mode."""
    db_path = str(_get_db_path())
    tid = threading.get_ident()
    key = f"{tid}"

    if key not in _connections or _conn_paths.get(key) != db_path:
        # Close stale connection if db path changed (e.g. test isolation)
        old = _connections.pop(key, None)
        if old is not None:
            try:
                old.close()
            except Exception:
                pass
        conn = sqlite3.connect(db_path, timeout=10)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        _ensure_schema(conn)
        _connections[key] = conn
        _conn_paths[key] = db_path

    return _connections[key]


def reset() -> None:
    """Close all connections and clear state. Used by tests."""
    for conn in _connections.values():
        try:
            conn.close()
        except Exception:
            pass
    _connections.clear()
    _conn_paths.clear()


def _ensure_schema(conn: sqlite3.Connection) -> None:
    """Create tables if they don't exist."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS view_labels (
            view_uuid TEXT NOT NULL,
            media_id  INTEGER NOT NULL,
            label     TEXT NOT NULL,
            PRIMARY KEY (view_uuid, media_id, label)
        );

        CREATE INDEX IF NOT EXISTS idx_view_labels_uuid
            ON view_labels(view_uuid);

        CREATE TABLE IF NOT EXISTS project_labels (
            project    TEXT NOT NULL,
            media_path TEXT NOT NULL,
            label      TEXT NOT NULL,
            PRIMARY KEY (project, media_path, label)
        );

        CREATE INDEX IF NOT EXISTS idx_project_labels_project
            ON project_labels(project);

        CREATE TABLE IF NOT EXISTS _migrations (
            key TEXT PRIMARY KEY
        );
    """)
    conn.commit()


def _is_migrated(conn: sqlite3.Connection, key: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM _migrations WHERE key = ?", (key,)
    ).fetchone()
    return row is not None


def _mark_migrated(conn: sqlite3.Connection, key: str) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO _migrations (key) VALUES (?)", (key,)
    )
    conn.commit()


# ── View-level label operations ──


def migrate_view_labels(view_uuid: str, backend) -> None:
    """Import labels from labels.json into SQLite (one-time migration)."""
    conn = _get_connection()
    mig_key = f"view:{view_uuid}"
    if _is_migrated(conn, mig_key):
        return

    with _db_lock:
        # Double-check after acquiring lock
        if _is_migrated(conn, mig_key):
            return

        if backend.json_exists(view_uuid, "labels.json"):
            data = backend.load_json(view_uuid, "labels.json")
            if data:
                rows = [
                    (view_uuid, int(media_id), label)
                    for media_id, labels in data.items()
                    for label in labels
                ]
                conn.executemany(
                    "INSERT OR IGNORE INTO view_labels (view_uuid, media_id, label) VALUES (?, ?, ?)",
                    rows,
                )
        _mark_migrated(conn, mig_key)
        conn.commit()


def read_view_labels(view_uuid: str) -> Dict[str, List[str]]:
    """Read all labels for a view. Returns {str(media_id): [label, ...]}."""
    conn = _get_connection()
    rows = conn.execute(
        "SELECT media_id, label FROM view_labels WHERE view_uuid = ?",
        (view_uuid,),
    ).fetchall()

    result: Dict[str, List[str]] = {}
    for media_id, label in rows:
        result.setdefault(str(media_id), []).append(label)
    return result


def save_view_labels(view_uuid: str, label: str, media_ids: List[int]) -> None:
    """Add a label to multiple media items (atomic)."""
    conn = _get_connection()
    with _db_lock:
        conn.executemany(
            "INSERT OR IGNORE INTO view_labels (view_uuid, media_id, label) VALUES (?, ?, ?)",
            [(view_uuid, mid, label) for mid in media_ids],
        )
        conn.commit()


def delete_view_labels(view_uuid: str, label: str, media_ids: List[int]) -> None:
    """Remove a label from multiple media items (atomic)."""
    conn = _get_connection()
    with _db_lock:
        conn.executemany(
            "DELETE FROM view_labels WHERE view_uuid = ? AND media_id = ? AND label = ?",
            [(view_uuid, mid, label) for mid in media_ids],
        )
        conn.commit()


# ── Project-level label operations ──


def migrate_project_labels(project: str, backend) -> None:
    """Import labels from project labels.json into SQLite (one-time migration)."""
    conn = _get_connection()
    mig_key = f"project:{project}"
    if _is_migrated(conn, mig_key):
        return

    with _db_lock:
        if _is_migrated(conn, mig_key):
            return

        if backend.project_json_exists(project, "labels.json"):
            data = backend.load_project_json(project, "labels.json")
            if data:
                rows = [
                    (project, media_path, label)
                    for media_path, labels in data.items()
                    for label in labels
                ]
                conn.executemany(
                    "INSERT OR IGNORE INTO project_labels (project, media_path, label) VALUES (?, ?, ?)",
                    rows,
                )
        _mark_migrated(conn, mig_key)
        conn.commit()


def read_project_labels(project: str) -> Dict[str, List[str]]:
    """Read all labels for a project. Returns {media_path: [label, ...]}."""
    conn = _get_connection()
    rows = conn.execute(
        "SELECT media_path, label FROM project_labels WHERE project = ?",
        (project,),
    ).fetchall()

    result: Dict[str, List[str]] = {}
    for media_path, label in rows:
        result.setdefault(media_path, []).append(label)
    return result


def save_project_labels(project: str, label: str, media_paths: List[str]) -> None:
    """Add a label to multiple media paths (atomic)."""
    conn = _get_connection()
    with _db_lock:
        conn.executemany(
            "INSERT OR IGNORE INTO project_labels (project, media_path, label) VALUES (?, ?, ?)",
            [(project, path, label) for path in media_paths],
        )
        conn.commit()


def delete_project_labels(project: str, label: str, media_paths: List[str]) -> None:
    """Remove a label from multiple media paths (atomic)."""
    conn = _get_connection()
    with _db_lock:
        conn.executemany(
            "DELETE FROM project_labels WHERE project = ? AND media_path = ? AND label = ?",
            [(project, path, label) for path in media_paths],
        )
        conn.commit()
