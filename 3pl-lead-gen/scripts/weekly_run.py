#!/usr/bin/env python3
"""
weekly_run.py — Automated weekly lead generation for Fulfillment House.
Rotates through Apify actor keywords, parses results, builds Excel, emails it.
Usage: python weekly_run.py [--dry-run] [--keyword "supplements"]
"""

import argparse
import json
import os
import smtplib
import sys
import time
from datetime import datetime
from email import encoders
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

import requests

# ── Config ───────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
OUTPUT_DIR = PROJECT_DIR / "output"
STATE_FILE = OUTPUT_DIR / ".keyword_state.json"
CONFIG_FILE = PROJECT_DIR / "config.env"

SHOPIFY_KEYWORDS = [
    "books",
    "supplements",
    "beauty accessories",
    "candles",
    "subscription box",
    "pet supplies",
    "baby products",
]

APIFY_ACTOR_SHOPIFY = "clearpath/shopify-store-leads"
APIFY_ACTOR_GMAPS = "sovereigntaylor/google-maps-scraper"
APIFY_API_BASE = "https://api.apify.com/v2"

MAX_RESULTS_PER_RUN = 150  # stay under free-tier credits (~$1/run)
POLL_INTERVAL_SECONDS = 15
POLL_TIMEOUT_SECONDS = 600


# ── Helpers ───────────────────────────────────────────────────────────────────

def load_config():
    """Load key=value pairs from config.env into os.environ."""
    if not CONFIG_FILE.exists():
        print(f"ERROR: config.env not found at {CONFIG_FILE}")
        print("Copy config.example.env to config.env and fill in your credentials.")
        sys.exit(1)
    with open(CONFIG_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def get_next_keyword():
    """Rotate through SHOPIFY_KEYWORDS, returning the next one in sequence."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    state = {}
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            state = json.load(f)
    last_idx = state.get("last_keyword_index", -1)
    next_idx = (last_idx + 1) % len(SHOPIFY_KEYWORDS)
    keyword = SHOPIFY_KEYWORDS[next_idx]
    state["last_keyword_index"] = next_idx
    state["last_run"] = datetime.now().isoformat()
    state["last_keyword"] = keyword
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=2)
    return keyword


def run_apify_actor(api_token, actor_id, input_data):
    """Start an Apify actor run and poll until complete. Returns dataset items."""
    headers = {"Authorization": f"Bearer {api_token}", "Content-Type": "application/json"}
    actor_id_encoded = actor_id.replace("/", "~")

    print(f"Starting Apify actor: {actor_id}")
    resp = requests.post(
        f"{APIFY_API_BASE}/acts/{actor_id_encoded}/runs",
        headers=headers,
        json=input_data,
        timeout=30,
    )
    resp.raise_for_status()
    run_id = resp.json()["data"]["id"]
    print(f"Run started: {run_id}")

    # Poll for completion
    deadline = time.time() + POLL_TIMEOUT_SECONDS
    while time.time() < deadline:
        time.sleep(POLL_INTERVAL_SECONDS)
        status_resp = requests.get(
            f"{APIFY_API_BASE}/actor-runs/{run_id}",
            headers=headers,
            timeout=30,
        )
        status_resp.raise_for_status()
        run_data = status_resp.json()["data"]
        status = run_data["status"]
        print(f"  Status: {status}")
        if status == "SUCCEEDED":
            break
        if status in ("FAILED", "ABORTED", "TIMED-OUT"):
            raise RuntimeError(f"Apify run {run_id} ended with status: {status}")
    else:
        raise TimeoutError(f"Apify run {run_id} did not finish within {POLL_TIMEOUT_SECONDS}s")

    # Download dataset
    dataset_id = run_data["defaultDatasetId"]
    items_resp = requests.get(
        f"{APIFY_API_BASE}/datasets/{dataset_id}/items",
        headers=headers,
        params={"format": "json", "clean": "true"},
        timeout=60,
    )
    items_resp.raise_for_status()
    items = items_resp.json()
    print(f"Downloaded {len(items)} items from dataset {dataset_id}")
    return items


def send_email(smtp_host, smtp_port, smtp_user, smtp_pass, to_addr, subject, body, attachment_path=None):
    """Send an email with optional attachment via SMTP."""
    msg = MIMEMultipart()
    msg["From"] = smtp_user
    msg["To"] = to_addr
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    if attachment_path and Path(attachment_path).exists():
        with open(attachment_path, "rb") as f:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", f"attachment; filename={Path(attachment_path).name}")
        msg.attach(part)

    use_ssl = int(smtp_port) == 465
    if use_ssl:
        with smtplib.SMTP_SSL(smtp_host, int(smtp_port)) as server:
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, to_addr, msg.as_string())
    else:
        with smtplib.SMTP(smtp_host, int(smtp_port)) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.sendmail(smtp_user, to_addr, msg.as_string())
    print(f"Email sent to {to_addr}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Weekly lead gen run")
    parser.add_argument("--dry-run", action="store_true", help="Skip Apify call, use existing raw JSON if present")
    parser.add_argument("--keyword", help="Override keyword (skips rotation)")
    parser.add_argument("--no-email", action="store_true", help="Skip sending email")
    args = parser.parse_args()

    load_config()

    apify_token = os.environ.get("APIFY_API_TOKEN", "")
    smtp_host = os.environ.get("SMTP_HOST", "")
    smtp_port = os.environ.get("SMTP_PORT", "587")
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")
    email_to = os.environ.get("EMAIL_TO", smtp_user)

    if not args.dry_run and not apify_token:
        print("ERROR: APIFY_API_TOKEN not set in config.env")
        sys.exit(1)

    keyword = args.keyword if args.keyword else get_next_keyword()
    date_str = datetime.now().strftime("%Y-%m-%d")
    slug = keyword.replace(" ", "_")

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    raw_path = OUTPUT_DIR / f"raw_shopify_{slug}_{date_str}.json"
    csv_path = OUTPUT_DIR / f"cleaned_shopify_{slug}_{date_str}.csv"
    xlsx_path = OUTPUT_DIR / f"leads_{slug}_{date_str}.xlsx"

    print(f"\n{'='*60}")
    print(f"Fulfillment House Weekly Lead Gen")
    print(f"Keyword: {keyword} | Date: {date_str}")
    print(f"{'='*60}\n")

    # Step 1: Scrape
    if args.dry_run and raw_path.exists():
        print(f"DRY RUN: loading existing {raw_path}")
        with open(raw_path) as f:
            items = json.load(f)
    else:
        actor_input = {
            "searchQuery": keyword,
            "maxResults": MAX_RESULTS_PER_RUN,
            "country": "US",
        }
        items = run_apify_actor(apify_token, APIFY_ACTOR_SHOPIFY, actor_input)
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump(items, f, indent=2)
        print(f"Raw JSON saved: {raw_path}")

    if not items:
        print("No items returned. Exiting.")
        sys.exit(0)

    # Step 2: Parse (inline, using parse_leads logic)
    sys.path.insert(0, str(SCRIPT_DIR))
    from parse_leads import parse_shopify_lead, parse_generic_lead, detect_source
    import csv as csv_module

    source_type = detect_source(items)
    leads = []
    seen = set()
    for item in items:
        if source_type == "shopify":
            lead = parse_shopify_lead(item)
        else:
            lead = parse_generic_lead(item)
        key = lead.get("Website", "").lower().strip("/")
        if key and key in seen:
            continue
        seen.add(key)
        leads.append(lead)

    fieldnames = ["#", "Business Name", "Website", "Email", "Phone",
                  "Address", "City", "State", "Zip",
                  "Google Rating", "Review Count", "Category", "Source", "Notes"]
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        writer = csv_module.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for i, lead in enumerate(leads, 1):
            lead["#"] = i
            writer.writerow({k: lead.get(k, "") for k in fieldnames})

    print(f"CSV saved: {csv_path} ({len(leads)} unique leads)")

    # Step 3: Build Excel
    from build_excel import build_excel, score_lead
    build_excel([str(csv_path)], str(xlsx_path))

    # Step 4: Count qualified for email subject
    qualified = sum(1 for lead in leads if score_lead(lead) >= 3)

    # Step 5: Email
    if not args.no_email:
        if not smtp_host or not smtp_user or not smtp_pass:
            print("SMTP not configured — skipping email. Set SMTP_HOST, SMTP_USER, SMTP_PASS in config.env")
        else:
            week_num = datetime.now().isocalendar()[1]
            subject = f"Fulfillment House Leads — Week {week_num}: {keyword.title()} ({qualified} qualified)"
            body = f"""Hi Kurt,

Here are your weekly leads for Fulfillment House!

This week's focus: {keyword.title()}
Total leads scraped: {len(leads)}
Qualified leads (have website + contact info): {qualified}

The attached Excel file has all leads sorted with qualified ones at the top (highlighted in blue).
Your top {min(qualified, 25)} qualified leads are ready for outreach.

Scoring guide:
  - Website present: +1 point
  - Email present: +2 points
  - Phone present: +1 point
  - Google rating 4.0+: +1 point
  - Score 3+ = Qualified (shown in blue, sorted to top)

Next week's keyword will be: {SHOPIFY_KEYWORDS[(SHOPIFY_KEYWORDS.index(keyword) + 1) % len(SHOPIFY_KEYWORDS)].title()}

Good luck with outreach!
— Your Lead Gen Bot
"""
            send_email(smtp_host, smtp_port, smtp_user, smtp_pass, email_to, subject, body, str(xlsx_path))

    print(f"\nDone! {len(leads)} leads → {qualified} qualified → {xlsx_path.name}")


if __name__ == "__main__":
    main()
