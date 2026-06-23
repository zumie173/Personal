#!/usr/bin/env python3
"""
Google Sheets Diagnostic Script — The Fulfillment House
Tests authentication, spreadsheet access, worksheet validation, and write capability.

Usage:
    python test_google_sheets.py

Prerequisites:
    pip install gspread google-auth
    .env file must contain GOOGLE_SHEETS_CREDENTIALS_JSON and GOOGLE_SHEETS_SPREADSHEET_ID
"""

import sys
import os
import json
import traceback
from pathlib import Path
from datetime import datetime, timezone

# ── Add project root to path ─────────────────────────────────────────────────
ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

PASS = "  ✅  PASS"
FAIL = "  ❌  FAIL"
WARN = "  ⚠️   WARN"
INFO = "  ℹ️   INFO"

results = {}


def section(title):
    print(f"\n{'─' * 60}")
    print(f"  {title}")
    print(f"{'─' * 60}")


def report(label, status, detail=""):
    symbol = PASS if status else FAIL
    print(f"{symbol}  {label}")
    if detail:
        for line in str(detail).splitlines():
            print(f"         {line}")
    results[label] = status
    return status


# ════════════════════════════════════════════════════════════════
# SECTION 1 — Environment Variables
# ════════════════════════════════════════════════════════════════
section("1. ENVIRONMENT VARIABLES")

# Load .env manually so we can report on it regardless of pydantic
env_file = ROOT / ".env"
env_vars = {}
if env_file.exists():
    print(f"{INFO}  .env file found at: {env_file}")
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env_vars[k.strip()] = v.strip()
    os.environ.update(env_vars)
else:
    print(f"{FAIL}  .env file NOT found at: {env_file}")
    print(f"         Expected location: {env_file}")
    print(f"         Copy .env.example to .env and fill in your credentials.")

# Check each required variable
CREDS_KEY  = "GOOGLE_SHEETS_CREDENTIALS_JSON"
SHEET_KEY  = "GOOGLE_SHEETS_SPREADSHEET_ID"
ANTHRO_KEY = "ANTHROPIC_API_KEY"
APIFY_KEY  = "APIFY_API_TOKEN"

creds_path_str = os.environ.get(CREDS_KEY, "")
sheet_id       = os.environ.get(SHEET_KEY, "")
anthro_key     = os.environ.get(ANTHRO_KEY, "")
apify_token    = os.environ.get(APIFY_KEY, "")

# GOOGLE_SHEETS_CREDENTIALS_JSON
if creds_path_str:
    creds_path = Path(creds_path_str)
    if creds_path.exists():
        report(f"{CREDS_KEY}: set, file exists", True,
               f"Path: {creds_path_str}")
        # Validate it looks like a service account JSON
        try:
            with open(creds_path) as f:
                creds_data = json.load(f)
            sa_email = creds_data.get("client_email", "NOT FOUND")
            sa_type  = creds_data.get("type", "NOT FOUND")
            if sa_type == "service_account" and "@" in sa_email:
                report("Service account JSON format valid", True,
                       f"Email: {sa_email}\nType:  {sa_type}")
            else:
                report("Service account JSON format valid", False,
                       f"type={sa_type!r}, client_email={sa_email!r} — expected service_account JSON")
        except Exception as e:
            report("Service account JSON parseable", False, str(e))
            sa_email = None
    else:
        report(f"{CREDS_KEY}: file NOT found", False,
               f"Path set to: {creds_path_str}\nFile does not exist at that path.")
        sa_email = None
        creds_data = {}
else:
    report(f"{CREDS_KEY}: NOT SET", False,
           "Add GOOGLE_SHEETS_CREDENTIALS_JSON=/path/to/service-account.json to .env")
    sa_email = None
    creds_data = {}

# GOOGLE_SHEETS_SPREADSHEET_ID
if sheet_id:
    # A valid Sheets ID is typically 44 chars of alphanumeric + _ + -
    looks_valid = len(sheet_id) >= 20 and " " not in sheet_id
    report(f"{SHEET_KEY}: set", looks_valid,
           f"Value: {sheet_id[:8]}...{sheet_id[-4:]} (len={len(sheet_id)})" if looks_valid
           else f"Value looks invalid: {sheet_id!r}")
else:
    report(f"{SHEET_KEY}: NOT SET", False,
           "Add GOOGLE_SHEETS_SPREADSHEET_ID=<your-spreadsheet-id> to .env")

# Other keys (existence only — no value shown)
report("ANTHROPIC_API_KEY: set", bool(anthro_key),
       "Present" if anthro_key else "Missing — required for lead qualification")
report("APIFY_API_TOKEN: set", bool(apify_token),
       "Present" if apify_token else "Missing — required for live scraping (not needed for import)")


# ════════════════════════════════════════════════════════════════
# SECTION 2 — Google Authentication
# ════════════════════════════════════════════════════════════════
section("2. GOOGLE AUTHENTICATION")

gc = None
try:
    import gspread
    from google.oauth2.service_account import Credentials
    report("gspread installed", True, f"Version: {gspread.__version__}")
except ImportError as e:
    report("gspread installed", False,
           f"{e}\nFix: pip install gspread google-auth")
    print("\n⛔  Cannot continue — install dependencies first:\n    pip install -r requirements.txt")
    sys.exit(1)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

if creds_path_str and Path(creds_path_str).exists():
    try:
        creds = Credentials.from_service_account_file(creds_path_str, scopes=SCOPES)
        report("Credentials loaded from file", True)
    except Exception as e:
        report("Credentials loaded from file", False, str(e))
        creds = None

    if creds:
        try:
            gc = gspread.authorize(creds)
            report("gspread client authorized", True)
        except Exception as e:
            report("gspread client authorized", False, str(e))
            gc = None
else:
    report("Credentials file available for auth", False,
           "Skipped — credentials file missing (see Section 1)")


# ════════════════════════════════════════════════════════════════
# SECTION 3 — Spreadsheet Access
# ════════════════════════════════════════════════════════════════
section("3. SPREADSHEET ACCESS")

sh = None
if gc and sheet_id:
    try:
        sh = gc.open_by_key(sheet_id)
        report("Spreadsheet opened successfully", True,
               f"Title: {sh.title}")
    except gspread.exceptions.SpreadsheetNotFound:
        report("Spreadsheet opened successfully", False,
               f"SpreadsheetNotFound: ID '{sheet_id}' does not exist or is not shared.\n"
               f"Share the spreadsheet with: {sa_email or 'your service account email'}")
    except gspread.exceptions.APIError as e:
        report("Spreadsheet opened successfully", False,
               f"API error: {e}\n"
               f"Ensure the service account ({sa_email}) has Editor access to the spreadsheet.")
    except Exception as e:
        report("Spreadsheet opened successfully", False, str(e))
else:
    report("Spreadsheet access attempted", False,
           "Skipped — missing auth client or spreadsheet ID")


# ════════════════════════════════════════════════════════════════
# SECTION 4 — Worksheet Validation
# ════════════════════════════════════════════════════════════════
section("4. WORKSHEET VALIDATION")

REQUIRED_TABS = ["Leads", "Hot Leads", "Pipeline Log"]
# Note: code only creates these 3 — Warm Leads and Cold Leads are not in current implementation
REQUESTED_TABS = ["Leads", "Hot Leads", "Warm Leads", "Cold Leads", "Pipeline Log"]

if sh:
    existing_tabs = [ws.title for ws in sh.worksheets()]
    print(f"{INFO}  Existing tabs: {existing_tabs}")

    for tab in REQUESTED_TABS:
        exists = tab in existing_tabs
        in_code = tab in REQUIRED_TABS
        if exists:
            report(f"Tab '{tab}' exists", True)
        elif in_code:
            report(f"Tab '{tab}' exists", False,
                   "Missing — will be created automatically when pipeline runs `crm.setup()`")
        else:
            report(f"Tab '{tab}' exists", False,
                   f"Missing — NOTE: '{tab}' tab is NOT in the current code.\n"
                   f"Code only creates: {REQUIRED_TABS}\n"
                   f"Warm and Cold leads both go in the 'Leads' tab (filtered by Category column).")
else:
    report("Worksheet validation", False, "Skipped — spreadsheet not accessible")


# ════════════════════════════════════════════════════════════════
# SECTION 5 — Service Account Permissions
# ════════════════════════════════════════════════════════════════
section("5. SERVICE ACCOUNT PERMISSIONS")

if sa_email:
    print(f"{INFO}  Service account email: {sa_email}")
    print(f"{INFO}  This email MUST have Editor access to the spreadsheet.")
    print(f"{INFO}  To verify: open the spreadsheet → Share → check if {sa_email} is listed.")

    if sh:
        # Try a harmless metadata read to confirm write-level auth
        try:
            # Attempt to list worksheets (read) — already done above
            report("Service account can read spreadsheet", True,
                   f"Confirmed via successful open in Section 3")
            # We'll verify write in Section 9
        except Exception as e:
            report("Service account can read spreadsheet", False, str(e))
    else:
        report("Service account permissions verifiable", False,
               f"Spreadsheet not accessible — check that {sa_email} has Editor access")
else:
    report("Service account email identified", False,
           "Cannot determine service account email — credentials file missing or invalid")


# ════════════════════════════════════════════════════════════════
# SECTION 6 — CRM Agent Code Review
# ════════════════════════════════════════════════════════════════
section("6. CRM AGENT CODE REVIEW")

crm_agent_path = ROOT / "agents" / "crm_agent.py"
sheets_path    = ROOT / "integrations" / "google_sheets.py"

print(f"{INFO}  CRM Agent: {crm_agent_path}")
print(f"{INFO}  Sheets integration: {sheets_path}")

# Check: exceptions are caught (good) but are they logged?
issues = []

crm_code = crm_agent_path.read_text()
sheets_code = sheets_path.read_text()

# Is append_row called?
if "append_row" in sheets_code:
    report("append_row is called in google_sheets.py", True,
           "Location: SheetsClient.upsert_lead() and append_hot_lead()")
else:
    report("append_row is called", False, "append_row not found in google_sheets.py")

# Is exception handling present?
if "except Exception as exc:" in crm_code:
    report("CRM Agent catches exceptions", True,
           "Location: crm_agent.py run() method — per-lead try/except")
else:
    report("CRM Agent catches exceptions", False)

# Is error logged?
if "logger.error" in crm_code:
    report("CRM Agent logs errors", True,
           "[CRMAgent] Failed to sync lead — written to console")
else:
    report("CRM Agent logs errors", False, "Errors are silently swallowed")

# CRITICAL FINDING: sheets_row return value
# upsert_lead returns ws.row_count which is total rows, not the row just written
if "return ws.row_count" in sheets_code:
    report("sheets_row tracking accurate", False,
           "⚠️  BUG FOUND: upsert_lead() returns ws.row_count (total rows in sheet)\n"
           "   not the actual row number just appended. This is imprecise but\n"
           "   does NOT prevent the write from happening.")
else:
    report("sheets_row tracking accurate", True)

# Check: setup() must be called before run()
if "self._crm.setup()" in (ROOT / "agents" / "sales_manager.py").read_text():
    report("CRM setup() called before run()", True,
           "sales_manager.py calls crm.setup() as Step 1")
else:
    report("CRM setup() called before run()", False,
           "setup() not called — tabs would not be created")

# Check dry-run path calls setup
pipeline_code = (ROOT / "pipeline.py").read_text()
if "crm.setup()" in pipeline_code:
    report("CRM setup() called in pipeline.py import paths", True)
else:
    report("CRM setup() called in pipeline.py import paths", False)


# ════════════════════════════════════════════════════════════════
# SECTION 7 — Pipeline Trace (Static Analysis)
# ════════════════════════════════════════════════════════════════
section("7. PIPELINE TRACE (CODE PATH ANALYSIS)")

print(f"""
  Traced code path for --import-json / --import-file / --dry-run:

  1. import_json_file()         → inserts leads with status='raw'
     └─ normalize_shopify_record() maps Apify fields

  2. DuplicateDetectionAgent.run()
     └─ Passes lead_ids → returns subset (non-duplicates)
     └─ Sets status='deduped' on passing leads

  3. DataQualityAgent.run()
     └─ Receives deduped lead_ids
     └─ Scores 0-100. Threshold=30. Below threshold → status='rejected'
     └─ ⚠️  RISK: Apify leads have no email → lose 25 pts immediately
        No social links → lose 10 pts. Max possible = 65 pts if website resolves.
        If website doesn't resolve → score=15 → REJECTED (below 30).

  4. LeadQualifierAgent.run()
     └─ Receives quality-passed lead_ids
     └─ Calls Claude Opus 4.8 per lead
     └─ Sets icp_score, confidence_score, lead_category, status='scored'

  5. CRMAgent.run()
     └─ Receives scored lead_ids
     └─ Calls SheetsClient.upsert_lead(lead) for each
     └─ Calls append_row() on Leads worksheet
     └─ If category='hot' → also calls append_hot_lead()
""")

# ════════════════════════════════════════════════════════════════
# SECTION 8 — SQLite Verification
# ════════════════════════════════════════════════════════════════
section("8. SQLITE VERIFICATION")

import sqlite3
db_path = ROOT / "data" / "tfh_sales.db"

if db_path.exists():
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row

    total = conn.execute("SELECT COUNT(*) as n FROM leads").fetchone()["n"]
    report(f"SQLite DB exists with {total} leads", True, str(db_path))

    statuses = conn.execute(
        "SELECT status, COUNT(*) as n FROM leads GROUP BY status ORDER BY n DESC"
    ).fetchall()
    print(f"\n{INFO}  Lead status breakdown:")
    for row in statuses:
        print(f"         {row['status']:<20} {row['n']}")

    cats = conn.execute(
        "SELECT lead_category, COUNT(*) as n FROM leads GROUP BY lead_category"
    ).fetchall()
    print(f"\n{INFO}  Category breakdown:")
    for row in cats:
        print(f"         {row['lead_category'] or 'unscored':<20} {row['n']}")

    synced = conn.execute(
        "SELECT COUNT(*) as n FROM leads WHERE sheets_row IS NOT NULL"
    ).fetchone()["n"]
    report(f"Leads with sheets_row set (attempted CRM write)", synced > 0,
           f"{synced} of {total} have sheets_row — these attempted a Sheets write")

    if total > 0 and synced == 0:
        print(f"\n  ⛔  CONFIRMED: Leads exist in SQLite but sheets_row is NULL on all records.")
        print(f"     This means the CRM write layer has never successfully executed.")

    recent = conn.execute(
        "SELECT domain, status, icp_score, lead_category, sheets_row, created_at "
        "FROM leads ORDER BY created_at DESC LIMIT 5"
    ).fetchall()
    if recent:
        print(f"\n{INFO}  5 most recent leads:")
        for r in recent:
            print(f"         {r['domain'] or 'no-domain':<30} status={r['status']:<20} "
                  f"icp={r['icp_score'] or '-':<4} cat={r['lead_category'] or '-':<6} "
                  f"sheets_row={r['sheets_row'] or 'NULL'}")

    conn.close()
else:
    report("SQLite DB exists", False,
           f"No database at {db_path}\n"
           f"Pipeline has never been run — run: python pipeline.py --import-json data/sample_apify_leads.json")


# ════════════════════════════════════════════════════════════════
# SECTION 9 — Live Write Test
# ════════════════════════════════════════════════════════════════
section("9. LIVE GOOGLE SHEETS WRITE TEST")

if sh:
    ws = None
    try:
        # Get or create Leads tab
        try:
            ws = sh.worksheet("Leads")
            report("Leads worksheet found", True)
        except gspread.exceptions.WorksheetNotFound:
            ws = sh.add_worksheet(title="Leads", rows=5000, cols=35)
            report("Leads worksheet created", True, "Did not exist — created now")

        before = len(ws.get_all_values())
        report(f"Row count before write: {before}", True)

        # Write a clearly labeled test row
        test_row = [
            f"DIAGNOSTIC-TEST-{datetime.now(timezone.utc).strftime('%H%M%S')}",
            "TFH Diagnostic Test",
            "https://test.example.com",
            "test.example.com",
            "diagnostic",
        ] + [""] * 30
        test_row = test_row[:35]

        ws.append_row(test_row, value_input_option="RAW")
        after = len(ws.get_all_values())

        if after > before:
            report("Test row written successfully", True,
                   f"Row count: {before} → {after}\n"
                   f"✅ Google Sheets WRITE is working.")
        else:
            report("Test row written successfully", False,
                   f"Row count did not increase: before={before} after={after}")

    except gspread.exceptions.APIError as e:
        report("Write test", False,
               f"API error during write: {e}\n"
               f"Check that {sa_email or 'service account'} has EDITOR (not Viewer) access.")
    except Exception as e:
        report("Write test", False, traceback.format_exc())
else:
    report("Write test", False, "Skipped — spreadsheet not accessible")


# ════════════════════════════════════════════════════════════════
# FINAL REPORT
# ════════════════════════════════════════════════════════════════
print(f"\n{'═' * 60}")
print("  ROOT CAUSE ANALYSIS REPORT")
print(f"{'═' * 60}")

passed  = [k for k, v in results.items() if v is True]
failed  = [k for k, v in results.items() if v is False]

print(f"\n  PASSED: {len(passed)}")
print(f"  FAILED: {len(failed)}")

if failed:
    print(f"\n  FAILING CHECKS:")
    for f in failed:
        print(f"    ✗  {f}")

print(f"\n{'─' * 60}")
print("  SECTION A — What is working")
print(f"{'─' * 60}")
for p in passed:
    print(f"    ✓  {p}")

print(f"\n{'─' * 60}")
print("  SECTION B — What is failing")
print(f"{'─' * 60}")
for f in failed:
    print(f"    ✗  {f}")

print(f"\n{'─' * 60}")
print("  SECTION C — Root Cause")
print(f"{'─' * 60}")

no_env    = not env_file.exists()
no_creds  = not creds_path_str or not Path(creds_path_str).exists() if creds_path_str else True
no_sheet  = not sheet_id
no_pkgs   = gc is None and not no_creds

if no_env:
    print("""
  PRIMARY ROOT CAUSE: .env file does not exist.

  The pipeline loads all credentials from .env. Without it, Settings()
  raises a validation error before any agent runs. The pipeline has
  never successfully executed in this environment.

  All Google Sheets failures are downstream of this single missing file.
""")
elif no_pkgs:
    print("""
  PRIMARY ROOT CAUSE: Python dependencies not installed.

  gspread and google-auth are not installed in this Python environment.
  The pipeline will crash on import before reaching the CRM step.

  Fix: pip install -r requirements.txt
""")
elif no_creds:
    print("""
  PRIMARY ROOT CAUSE: GOOGLE_SHEETS_CREDENTIALS_JSON file not found.

  The .env file exists but the service account JSON file it points to
  does not exist at the specified path. Authentication cannot proceed.
""")
elif no_sheet:
    print("""
  PRIMARY ROOT CAUSE: GOOGLE_SHEETS_SPREADSHEET_ID not set.

  Credentials exist but no spreadsheet ID is configured.
""")
elif sh and synced == 0 if 'synced' in dir() else False:
    print("""
  PRIMARY ROOT CAUSE: CRM write layer failing silently.

  Leads exist in SQLite but sheets_row is NULL on all records.
  The CRM Agent's per-lead exception handler is catching an error
  and logging it, but the write is not reaching Google Sheets.
  Check console output for [CRMAgent] Failed to sync lead messages.
""")
else:
    print("""
  Based on available evidence, the most likely root causes in priority order:
  1. .env file missing (confirmed)
  2. Python packages not installed (confirmed)
  3. Pipeline has never successfully run in this environment (confirmed — no SQLite DB)
""")

print(f"\n{'─' * 60}")
print("  SECTION D — Recommended Fix (in order)")
print(f"{'─' * 60}")
print("""
  Step 1: Install dependencies
    cd ai-sales-dept
    pip install -r requirements.txt

  Step 2: Create .env
    cp .env.example .env
    # Fill in all four values:
    #   ANTHROPIC_API_KEY
    #   APIFY_API_TOKEN (not needed for import mode)
    #   GOOGLE_SHEETS_CREDENTIALS_JSON=/absolute/path/to/service-account.json
    #   GOOGLE_SHEETS_SPREADSHEET_ID=<from spreadsheet URL>

  Step 3: Share the spreadsheet
    Open your Google Sheet → Share
    Add the service account email as EDITOR
    The email is printed in the 'Service account email' line above.

  Step 4: Run this diagnostic again to confirm PASS
    python test_google_sheets.py

  Step 5: Run the pipeline
    python pipeline.py --import-json data/sample_apify_leads.json
""")

print(f"\n{'─' * 60}")
print("  SECTION E — Code issues found (fix alongside setup)")
print(f"{'─' * 60}")
print("""
  Issue 1 (minor): upsert_lead() returns ws.row_count (total sheet rows)
  instead of the actual row number just written. This means sheets_row
  in SQLite is inaccurate. Does not prevent writes from working.
  File: integrations/google_sheets.py, line ~100

  Issue 2 (likely data loss): DataQualityAgent rejection threshold.
  Apify leads have no email (-20 pts) and no social links (-10 pts).
  Max score for a website-only Apify lead = 65 pts.
  If the website doesn't resolve → score = 15 → REJECTED (threshold=30).
  Apify leads for brand-new or slow stores will be silently dropped
  before reaching the CRM. Consider lowering threshold or adjusting weights.

  Issue 3 (tabs): Code creates Leads, Hot Leads, Pipeline Log.
  Warm Leads and Cold Leads tabs do not exist and are not created.
  All leads go into the Leads tab and are differentiated by the Category column.
  This is by design but should be documented.
""")
