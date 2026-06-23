"""
Apollo CSV Import Script
Reads an Apollo-format CSV export and inserts leads into the TFH pipeline DB.

Usage:
    python scripts/import_apollo.py data/sample_leads.csv
    python scripts/import_apollo.py path/to/apollo_export.csv --run-pipeline
"""

import sys
import csv
import argparse
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from database import db as database

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
logger = logging.getLogger("import_apollo")


def _extract_domain(url: str) -> str | None:
    if not url:
        return None
    url = url.lower().strip()
    for prefix in ("https://", "http://", "www."):
        url = url.removeprefix(prefix)
    return url.split("/")[0].split("?")[0] or None


def parse_apollo_row(row: dict) -> dict:
    """Map Apollo CSV column names to our lead schema."""
    website = row.get("website", "").strip()
    domain = _extract_domain(website)

    # Apollo sometimes puts revenue as a string with commas
    def safe_int(val):
        try:
            return int(str(val).replace(",", "").strip()) if val else None
        except (ValueError, TypeError):
            return None

    return {
        # Company
        "company_name":         row.get("company_name") or row.get("company_full_name", "").split("|")[0].strip(),
        "website":              website or None,
        "domain":               domain,
        "email":                row.get("email", "").strip() or None,
        "phone":                row.get("phone", "").strip() or None,
        # Social
        "facebook_url":         row.get("facebook_url", "").strip() or None,
        "twitter_url":          row.get("twitter_url", "").strip() or None,
        "instagram_url":        None,   # Apollo doesn't export Instagram directly
        "tiktok_url":           None,
        # Contact person
        "contact_first_name":   row.get("first_name", "").strip() or None,
        "contact_last_name":    row.get("last_name", "").strip() or None,
        "contact_title":        row.get("title", "").strip() or None,
        "contact_linkedin_url": row.get("linkedin_person_url", "").strip() or None,
        "contact_seniority":    row.get("seniority", "").strip() or None,
        "contact_department":   row.get("department", "").strip() or None,
        # Company intelligence
        "industry":             row.get("industry", "").strip() or None,
        "keywords":             row.get("keywords", "").strip() or None,
        "company_city":         row.get("city_company", "").strip() or None,
        "company_state":        row.get("state_company", "").strip() or None,
        "company_country":      row.get("country_company", "").strip() or None,
        "employee_count":       safe_int(row.get("employee_count")),
        "revenue_est":          safe_int(row.get("revenue")),
        "funding_stage":        row.get("funding_stage", "").strip() or None,
        "funding_amount":       safe_int(row.get("funding_amount")),
        "tech_stack":           row.get("tech_stack", "").strip() or None,
        "apollo_id":            row.get("apollo_id", "").strip() or None,
        # Pipeline meta
        "product_count":        None,   # Apollo doesn't have this; set from product research
        "platform_source":      "apollo_import",
        "status":               "raw",
    }


def import_file(csv_path: str) -> list[str]:
    path = Path(csv_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {csv_path}")

    database.init_schema()

    lead_ids = []
    skipped = []

    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    logger.info("Reading %d rows from %s", len(rows), path.name)

    for i, row in enumerate(rows, 1):
        try:
            record = parse_apollo_row(row)
            if not record.get("company_name") and not record.get("website"):
                skipped.append(f"row {i}: no company name or website")
                continue
            lead_id = database.insert_lead(record)
            lead_ids.append(lead_id)
            name = record.get("company_name") or record.get("domain") or f"row {i}"
            logger.info("  ✓  %-30s  %s", name, record.get("domain", ""))
        except Exception as exc:
            skipped.append(f"row {i}: {exc}")
            logger.warning("  ✗  row %d skipped: %s", i, exc)

    logger.info("")
    logger.info("Imported: %d leads", len(lead_ids))
    if skipped:
        logger.info("Skipped:  %d", len(skipped))
        for s in skipped:
            logger.info("  - %s", s)

    return lead_ids


def main():
    parser = argparse.ArgumentParser(description="Import Apollo CSV into TFH pipeline")
    parser.add_argument("csv_file", help="Path to Apollo CSV export")
    parser.add_argument("--run-pipeline", action="store_true",
                        help="After import, run Dedup → Quality → Qualify → CRM")
    args = parser.parse_args()

    lead_ids = import_file(args.csv_file)

    if args.run_pipeline and lead_ids:
        from config.settings import settings
        from agents.duplicate_detection import DuplicateDetectionAgent
        from agents.data_quality import DataQualityAgent
        from agents.lead_qualifier import LeadQualifierAgent
        from agents.crm_agent import CRMAgent
        from database import db as database
        import json

        run_id = database.create_run()
        database.update_run(run_id, {"leads_scraped": len(lead_ids)})

        logger.info("\n── Duplicate Detection ─────────────────────────────────")
        deduped = DuplicateDetectionAgent(settings, run_id).run(lead_ids)

        logger.info("── Data Quality ────────────────────────────────────────")
        quality = DataQualityAgent(settings, run_id).run(deduped)

        logger.info("── Lead Qualification (Claude) ──────────────────────────")
        scored = LeadQualifierAgent(settings, run_id).run(quality)

        logger.info("── CRM Sync (Google Sheets) ─────────────────────────────")
        crm = CRMAgent(settings, run_id)
        crm.setup()
        counts = crm.run(scored)

        from datetime import datetime, timezone
        database.update_run(run_id, {
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "status": "complete",
            "leads_scraped": len(lead_ids),
            "leads_duped": len(lead_ids) - len(deduped),
            "leads_rejected": len(deduped) - len(quality),
            "leads_qualified": len(scored),
            "hot_count": counts.get("hot", 0),
            "warm_count": counts.get("warm", 0),
            "cold_count": counts.get("cold", 0),
        })
        run = database.get_run(run_id)
        crm.log_run(run)

        print(f"""
╔══════════════════════════════════════════╗
║      TFH IMPORT PIPELINE COMPLETE       ║
╠══════════════════════════════════════════╣
║  Imported:    {len(lead_ids):>4}                         ║
║  Duplicates:  {len(lead_ids) - len(deduped):>4}                         ║
║  Rejected:    {len(deduped) - len(quality):>4}                         ║
║  Qualified:   {len(scored):>4}                         ║
╠══════════════════════════════════════════╣
║  🔥 Hot:      {counts.get('hot', 0):>4}                         ║
║  🟡 Warm:     {counts.get('warm', 0):>4}                         ║
║  🔵 Cold:     {counts.get('cold', 0):>4}                         ║
╚══════════════════════════════════════════╝
""")


if __name__ == "__main__":
    main()
