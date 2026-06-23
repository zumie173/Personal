"""
Import Apify JSON dataset into the TFH pipeline DB.
Works with either:
  - A local JSON file (Apify dataset export)
  - The raw test data in data/sample_apify_leads.json

Usage:
    python scripts/import_apify_json.py data/sample_apify_leads.json
    python scripts/import_apify_json.py data/sample_apify_leads.json --run-pipeline
"""

import sys
import json
import argparse
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from database import db as database
from integrations.apify_client import normalize_shopify_record

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-8s  %(message)s")
logger = logging.getLogger("import_apify")


def import_json_file(json_path: str) -> list[str]:
    path = Path(json_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {json_path}")

    database.init_schema()

    with open(path, encoding="utf-8") as f:
        items = json.load(f)

    if not isinstance(items, list):
        items = [items]

    logger.info("Loaded %d records from %s", len(items), path.name)

    lead_ids = []
    skipped = []

    for i, raw in enumerate(items, 1):
        # Strip internal notes fields before normalizing
        raw_clean = {k: v for k, v in raw.items() if not k.startswith("_")}
        try:
            record = normalize_shopify_record(raw_clean)
            record["status"] = "raw"

            if not record.get("domain"):
                skipped.append(f"row {i}: no domain")
                continue

            lead_id = database.insert_lead(record)
            lead_ids.append(lead_id)

            weight_str = f"{record.get('avg_product_weight_oz')} oz" if record.get("avg_product_weight_oz") else "wt:?"
            logger.info(
                "  ✓  %-30s  skus:%-4s  %s  reviews:%-6s  %s",
                record.get("domain", ""),
                record.get("product_count", "?"),
                weight_str,
                record.get("total_reviews", "?"),
                record.get("country_code", ""),
            )
        except Exception as exc:
            skipped.append(f"row {i}: {exc}")
            logger.warning("  ✗  row %d skipped: %s", i, exc)

    logger.info("")
    logger.info("Imported: %d  |  Skipped: %d", len(lead_ids), len(skipped))
    for s in skipped:
        logger.info("  - %s", s)
    return lead_ids


def run_pipeline(lead_ids: list[str]):
    from datetime import datetime, timezone
    from config.settings import settings
    from agents.duplicate_detection import DuplicateDetectionAgent
    from agents.data_quality import DataQualityAgent
    from agents.lead_qualifier import LeadQualifierAgent
    from agents.crm_agent import CRMAgent

    run_id = database.create_run()

    logger.info("\n── Duplicate Detection ──────────────────────────────────")
    deduped = DuplicateDetectionAgent(settings, run_id).run(lead_ids)

    logger.info("── Data Quality ─────────────────────────────────────────")
    quality = DataQualityAgent(settings, run_id).run(deduped)

    logger.info("── Lead Qualification (Claude) ───────────────────────────")
    scored = LeadQualifierAgent(settings, run_id).run(quality)

    logger.info("── CRM Sync (Google Sheets) ──────────────────────────────")
    crm = CRMAgent(settings, run_id)
    crm.setup()
    counts = crm.run(scored)

    stats = {
        "leads_scraped":   len(lead_ids),
        "leads_duped":     len(lead_ids) - len(deduped),
        "leads_rejected":  len(deduped) - len(quality),
        "leads_qualified": len(scored),
        "hot_count":       counts.get("hot", 0),
        "warm_count":      counts.get("warm", 0),
        "cold_count":      counts.get("cold", 0),
    }
    database.update_run(run_id, {
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "status": "complete",
        **stats,
    })
    crm.log_run(database.get_run(run_id))

    print(f"""
╔═══════════════════════════════════════════╗
║       APIFY IMPORT PIPELINE COMPLETE     ║
╠═══════════════════════════════════════════╣
║  Imported:    {stats['leads_scraped']:>4}                          ║
║  Duplicates:  {stats['leads_duped']:>4}                          ║
║  Rejected:    {stats['leads_rejected']:>4}                          ║
║  Qualified:   {stats['leads_qualified']:>4}                          ║
╠═══════════════════════════════════════════╣
║  🔥 Hot:      {stats['hot_count']:>4}                          ║
║  🟡 Warm:     {stats['warm_count']:>4}                          ║
║  🔵 Cold:     {stats['cold_count']:>4}                          ║
╚═══════════════════════════════════════════╝
""")
    return stats


def main():
    parser = argparse.ArgumentParser(description="Import Apify JSON into TFH pipeline")
    parser.add_argument("json_file", help="Path to Apify JSON export or sample file")
    parser.add_argument("--run-pipeline", action="store_true",
                        help="Run full pipeline after import")
    args = parser.parse_args()

    lead_ids = import_json_file(args.json_file)
    if args.run_pipeline and lead_ids:
        run_pipeline(lead_ids)


if __name__ == "__main__":
    main()
