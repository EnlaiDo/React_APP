from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterable, Literal, Union


BASE_DIR = Path(__file__).resolve().parent
STORAGE_DIR = BASE_DIR / "storage"
DB_PATH = STORAGE_DIR / "paper_trading.sqlite3"
BUSY_TIMEOUT_MS = 5000
FetchMode = Literal["all", "one", "none"]


class DatabaseTransaction:
    def __init__(self, conn: sqlite3.Connection):
        self._conn = conn

    def execute(
        self,
        sql: str,
        params: Iterable[Any] = (),
        fetch: FetchMode = "none",
    ) -> Union[list[dict[str, Any]], dict[str, Any], None]:
        cursor = self._conn.execute(sql, tuple(params))
        if fetch == "one":
            row = cursor.fetchone()
            return dict(row) if row else None
        if fetch == "all":
            return [dict(row) for row in cursor.fetchall()]
        return None


def get_conn() -> sqlite3.Connection:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=BUSY_TIMEOUT_MS / 1000)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute(f"PRAGMA busy_timeout = {BUSY_TIMEOUT_MS}")
    return conn


def execute_query(
    sql: str,
    params: Iterable[Any] = (),
    fetch: FetchMode = "all",
) -> Union[list[dict[str, Any]], dict[str, Any], None]:
    conn = get_conn()
    try:
        cursor = conn.execute(sql, tuple(params))
        if fetch == "one":
            row = cursor.fetchone()
            return dict(row) if row else None
        if fetch == "all":
            return [dict(row) for row in cursor.fetchall()]
        conn.commit()
        return None
    finally:
        conn.close()


@contextmanager
def execute_transaction():
    conn = get_conn()
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield DatabaseTransaction(conn)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def initialize_database() -> None:
    conn = get_conn()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE COLLATE NOCASE,
                cash_balance TEXT NOT NULL DEFAULT '50000.00',
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS trades (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                action TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
                coingecko_id TEXT NOT NULL,
                symbol TEXT NOT NULL,
                quantity TEXT NOT NULL,
                execution_price TEXT NOT NULL,
                cash_delta TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(id)
            );

            CREATE INDEX IF NOT EXISTS idx_trades_user_id_id
                ON trades(user_id, id);

            CREATE INDEX IF NOT EXISTS idx_trades_user_asset
                ON trades(user_id, coingecko_id);
            """
        )
        conn.commit()
    finally:
        conn.close()
