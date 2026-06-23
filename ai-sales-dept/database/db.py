"""
SQLite database layer for Phase 1.
Single file, zero infrastructure. Replace DATABASE_URL in .env to switch to PostgreSQL.
"""

import sqlite3
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from contextlib import contextmanager
from typing import Optional


DB_PATH = Path(__file__).parent.parent / "data" / "tfh_sales.db"


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_schema():
    """Create all tables if they don't exist."""
    with db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS leads (
                id              TEXT PRIMARY KEY,
                -- Company fields
                company_name    TEXT,
                website         TEXT,
                domain          TEXT,
                email           TEXT,
                phone           TEXT,
                -- Contact person fields (populated from Apollo / Contact Discovery)
                contact_first_name  TEXT,
                contact_last_name   TEXT,
                contact_title       TEXT,
                contact_linkedin_url TEXT,
                contact_seniority   TEXT,
                contact_department  TEXT,
                -- Company intelligence (from Apollo / Research)
                industry        TEXT,
                keywords        TEXT,
                company_city    TEXT,
                company_state   TEXT,
                company_country TEXT,
                employee_count  INTEGER,
                revenue_est     INTEGER,
                funding_stage   TEXT,
                funding_amount  INTEGER,
                tech_stack      TEXT,
                apollo_id       TEXT,
                -- Apify-sourced product/shipping signals
                avg_product_weight_oz REAL,
                avg_product_price     REAL,
                avg_rating            REAL,
                total_reviews         INTEGER,
                country_code          TEXT,
                currency              TEXT,
                store_created_at      TEXT,
                instagram_url   TEXT,
                facebook_url    TEXT,
                tiktok_url      TEXT,
                twitter_url     TEXT,
                product_count   INTEGER,
                platform_source TEXT DEFAULT 'shopify',
                status          TEXT DEFAULT 'raw',
                is_duplicate    INTEGER DEFAULT 0,
                duplicate_of_id TEXT,
                quality_score   INTEGER,
                quality_flags   TEXT,       -- JSON array
                icp_score       INTEGER,
                confidence_score INTEGER,
                lead_category   TEXT,       -- hot|warm|cold
                score_rationale TEXT,
                sheets_row      INTEGER,    -- row number in Google Sheet
                created_at      TEXT,
                updated_at      TEXT
            );

            CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_domain ON leads(domain)
                WHERE domain IS NOT NULL AND is_duplicate = 0;

            CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
            CREATE INDEX IF NOT EXISTS idx_leads_category ON leads(lead_category);

            CREATE TABLE IF NOT EXISTS pipeline_runs (
                id              TEXT PRIMARY KEY,
                started_at      TEXT,
                completed_at    TEXT,
                leads_scraped   INTEGER DEFAULT 0,
                leads_duped     INTEGER DEFAULT 0,
                leads_rejected  INTEGER DEFAULT 0,
                leads_qualified INTEGER DEFAULT 0,
                hot_count       INTEGER DEFAULT 0,
                warm_count      INTEGER DEFAULT 0,
                cold_count      INTEGER DEFAULT 0,
                errors          TEXT,       -- JSON array of error strings
                status          TEXT DEFAULT 'running'
            );

            CREATE TABLE IF NOT EXISTS agent_log (
                id          TEXT PRIMARY KEY,
                run_id      TEXT,
                agent_name  TEXT,
                lead_id     TEXT,
                action      TEXT,
                result      TEXT,
                error       TEXT,
                duration_ms INTEGER,
                created_at  TEXT
            );
        """)


# ── Lead helpers ────────────────────────────────────────────────────────────

def insert_lead(data: dict) -> str:
    lid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    data["id"] = lid
    data["created_at"] = now
    data["updated_at"] = now
    cols = ", ".join(data.keys())
    placeholders = ", ".join(["?" for _ in data])
    with db() as conn:
        conn.execute(f"INSERT INTO leads ({cols}) VALUES ({placeholders})", list(data.values()))
    return lid


def update_lead(lead_id: str, updates: dict):
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    sets = ", ".join([f"{k} = ?" for k in updates])
    with db() as conn:
        conn.execute(f"UPDATE leads SET {sets} WHERE id = ?", [*updates.values(), lead_id])


def get_lead(lead_id: str) -> Optional[dict]:
    with db() as conn:
        row = conn.execute("SELECT * FROM leads WHERE id = ?", [lead_id]).fetchone()
        return dict(row) if row else None


def get_leads_by_status(status: str) -> list[dict]:
    with db() as conn:
        rows = conn.execute(
            "SELECT * FROM leads WHERE status = ? ORDER BY created_at ASC", [status]
        ).fetchall()
        return [dict(r) for r in rows]


def get_all_domains() -> list[str]:
    with db() as conn:
        rows = conn.execute(
            "SELECT domain FROM leads WHERE domain IS NOT NULL AND is_duplicate = 0"
        ).fetchall()
        return [r["domain"] for r in rows]


def get_all_company_names() -> list[str]:
    with db() as conn:
        rows = conn.execute(
            "SELECT company_name FROM leads WHERE company_name IS NOT NULL AND is_duplicate = 0"
        ).fetchall()
        return [r["company_name"] for r in rows]


def count_leads_by_category() -> dict:
    with db() as conn:
        rows = conn.execute(
            "SELECT lead_category, COUNT(*) as n FROM leads "
            "WHERE lead_category IS NOT NULL GROUP BY lead_category"
        ).fetchall()
        return {r["lead_category"]: r["n"] for r in rows}


# ── Pipeline run helpers ─────────────────────────────────────────────────────

def create_run() -> str:
    rid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    with db() as conn:
        conn.execute(
            "INSERT INTO pipeline_runs (id, started_at, status) VALUES (?, ?, 'running')",
            [rid, now],
        )
    return rid


def update_run(run_id: str, updates: dict):
    sets = ", ".join([f"{k} = ?" for k in updates])
    with db() as conn:
        conn.execute(f"UPDATE pipeline_runs SET {sets} WHERE id = ?", [*updates.values(), run_id])


def get_run(run_id: str) -> Optional[dict]:
    with db() as conn:
        row = conn.execute("SELECT * FROM pipeline_runs WHERE id = ?", [run_id]).fetchone()
        return dict(row) if row else None


# ── Agent log ────────────────────────────────────────────────────────────────

def log_agent_action(run_id: str, agent_name: str, lead_id: Optional[str],
                     action: str, result: str = None, error: str = None, duration_ms: int = None):
    with db() as conn:
        conn.execute(
            "INSERT INTO agent_log (id, run_id, agent_name, lead_id, action, result, error, duration_ms, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [str(uuid.uuid4()), run_id, agent_name, lead_id, action,
             result, error, duration_ms, datetime.now(timezone.utc).isoformat()],
        )
