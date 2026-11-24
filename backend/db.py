"""SQLite schema, small query helpers, password hashing and the seeded demo user (stdlib only)."""

import hashlib
import hmac
import json
import secrets
import sqlite3
from contextlib import closing
from datetime import UTC, datetime, timedelta

import config
import rules

# 7 tables (PRD Ã‚Â§14). JSON columns hold lists/dicts; ON DELETE CASCADE makes project delete a hard delete.
SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT,
  pw_hash TEXT NOT NULL, salt TEXT NOT NULL, created_at TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT);
CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT, role TEXT, area TEXT,
  brief_masked TEXT DEFAULT '', uploads TEXT DEFAULT '[]', answers TEXT DEFAULT '{}', stage INTEGER DEFAULT 0,
  factors TEXT DEFAULT '{}', ranking TEXT DEFAULT '[]', workflow TEXT DEFAULT '{}', artefacts TEXT DEFAULT '{}',
  baseline_version INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS requirements(id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, rid TEXT, version INTEGER DEFAULT 1,
  data TEXT, status TEXT DEFAULT 'open', confidence INTEGER, UNIQUE(project_id, rid));
CREATE TABLE IF NOT EXISTS conflicts(id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, a_rid TEXT, b_rid TEXT, type TEXT,
  explanation TEXT, fix TEXT, resolution TEXT, note TEXT);
CREATE TABLE IF NOT EXISTS approvals(id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, gate INTEGER, version INTEGER,
  name TEXT, role TEXT, comment TEXT, at TEXT);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE, at TEXT, kind TEXT, agent TEXT,
  model TEXT, prompt TEXT, response TEXT, evidence_ids TEXT DEFAULT '[]', rules TEXT DEFAULT '{}',
  tokens_in INTEGER DEFAULT 0, tokens_out INTEGER DEFAULT 0, ms INTEGER DEFAULT 0);
"""
JSON_COLS = {"uploads", "answers", "factors", "ranking", "workflow", "artefacts", "data", "evidence_ids", "rules"}


def now() -> str:
    """UTC ISO time; the UI shows it in IST (NFR-07)."""
    return datetime.now(UTC).isoformat(timespec="seconds")


def _connect() -> sqlite3.Connection:
    # Note: new connection per call; fine for one uvicorn worker, pool if it ever scales out.
    c = sqlite3.connect(config.DB_PATH, isolation_level=None)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA foreign_keys=ON")
    return c


def _args(args: tuple) -> list:
    return [json.dumps(a) if isinstance(a, (dict, list)) else a for a in args]


def q(sql: str, *args) -> list[dict]:
    """Run a SELECT; rows come back as dicts with JSON columns decoded."""
    with closing(_connect()) as c:
        rows = c.execute(sql, _args(args)).fetchall()
    return [{k: json.loads(v) if k in JSON_COLS and v else v for k, v in dict(r).items()} for r in rows]


def one(sql: str, *args) -> dict | None:
    rows = q(sql, *args)
    return rows[0] if rows else None


def run(sql: str, *args) -> int:
    """Run a write; returns the new row id."""
    with closing(_connect()) as c:
        return c.execute(sql, _args(args)).lastrowid


def update(table: str, row_id: int, **cols) -> None:
    """UPDATE one row by id. Column names come from code, never from the user."""
    run(f"UPDATE {table} SET {', '.join(f'{k}=?' for k in cols)} WHERE id=?", *cols.values(), row_id)


def hash_pw(password: str, salt: str) -> str:
    return hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=2**14, r=8, p=1).hex()


def seed_templates(user_id: int) -> None:
    """Four example projects (brief written, not yet run) so every account has something to open. Skips names it has."""
    have = {r["name"] for r in q("SELECT name FROM projects WHERE owner_id=?", user_id)}
    for t in json.loads((config.FIXTURES / "templates.json").read_text(encoding="utf-8")):
        if t["name"] in have:
            continue
        brief, n = rules.mask(t["brief"])
        run(
            "INSERT INTO projects(owner_id, name, role, area, brief_masked, artefacts, created_at, updated_at) "
            "VALUES (?,?,?,?,?,?,?,?)",
            user_id,
            t["name"],
            t["role"],
            t["area"],
            brief,
            {"masked": n},
            now(),
            now(),
        )


def add_user(email: str, name: str, password: str) -> int:
    salt = secrets.token_hex(16)
    uid = run(
        "INSERT INTO users(email, name, pw_hash, salt, created_at) VALUES (?,?,?,?,?)",
        email.lower(),
        name,
        hash_pw(password, salt),
        salt,
        now(),
    )
    seed_templates(uid)
    return uid


def check_login(email: str, password: str) -> dict | None:
    u = one("SELECT * FROM users WHERE email=?", email.lower())
    return u if u and hmac.compare_digest(u["pw_hash"], hash_pw(password, u["salt"])) else None


def new_session(user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(UTC) + timedelta(days=config.SESSION_DAYS)).isoformat(timespec="seconds")
    run("INSERT INTO sessions VALUES (?,?,?)", token, user_id, expires)
    return token


def session_user(token: str | None) -> dict | None:
    if not token:
        return None
    return one(
        "SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id "
        "WHERE s.token=? AND s.expires_at > ?",
        token,
        now(),
    )


def init() -> None:
    """Create tables, the demo user (M2) if a demo password is set in .env, and its template projects."""
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(_connect()) as c:
        c.executescript(SCHEMA)
    demo = one("SELECT id FROM users WHERE email=?", config.DEMO_EMAIL)
    if config.PASSWORD and not demo:
        add_user(config.DEMO_EMAIL, "Demo user", config.PASSWORD)
    elif demo:
        seed_templates(demo["id"])  # demo user made before templates existed
