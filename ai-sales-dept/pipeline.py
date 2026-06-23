"""
The Fulfillment House — Phase 1 Pipeline Runner

Usage:
    python pipeline.py
    python pipeline.py --queries "subscription box" "merchandise" --max 100
    python pipeline.py --dry-run     # skips Apify; uses sample data

The Sales Manager orchestrates all agents in sequence.
Results are written to SQLite (local) and synced to Google Sheets.
"""

import sys
import argparse
import logging
import json
from pathlib import Path

# ── Path setup ───────────────────────────────────────────────────────────────
# Allow imports from repo root
sys.path.insert(0, str(Path(__file__).parent))

from config.settings import settings
from database import db as database
from agents import SalesManagerAgent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("pipeline")

# Default Shopify search queries targeting TFH's ICP
DEFAULT_QUERIES = [
    "subscription box ecommerce",
    "book publisher direct to consumer",
    "merchandise online store",
    "apparel brand shopify",
    "nonprofit merchandise store",
    "fan merchandise ecommerce",
]


def parse_args():
    parser = argparse.ArgumentParser(description="TFH AI Sales Pipeline")
    parser.add_argument("--queries", nargs="+", default=DEFAULT_QUERIES,
                        help="Apify search queries")
    parser.add_argument("--max", type=int, default=settings.default_max_results,
                        help="Max results from Apify")
    parser.add_argument("--dry-run", action="store_true",
                        help="Use built-in sample data instead of calling Apify")
    parser.add_argument("--import-file", metavar="CSV",
                        help="Import leads from an Apollo CSV export (skips scraper)")
    return parser.parse_args()


def load_sample_data(run_id: str) -> list[str]:
    """Insert sample leads for dry-run / testing without Apify."""
    samples = [
        {
            "company_name": "Bookish Box",
            "website": "https://bookishbox.com",
            "domain": "bookishbox.com",
            "email": "hello@bookishbox.com",
            "phone": "555-0101",
            "instagram_url": "https://instagram.com/bookishbox",
            "product_count": 12,
            "platform_source": "shopify",
            "status": "raw",
        },
        {
            "company_name": "Merch Wave",
            "website": "https://merchwaveco.com",
            "domain": "merchwaveco.com",
            "email": "info@merchwaveco.com",
            "product_count": 34,
            "platform_source": "shopify",
            "status": "raw",
        },
        {
            "company_name": "AppCo Threads",
            "website": "https://appcothreads.com",
            "domain": "appcothreads.com",
            "email": "orders@appcothreads.com",
            "instagram_url": "https://instagram.com/appcothreads",
            "tiktok_url": "https://tiktok.com/@appcothreads",
            "product_count": 28,
            "platform_source": "shopify",
            "status": "raw",
        },
        {
            # Intentional duplicate of first record — should be caught
            "company_name": "Bookish Box",
            "website": "https://bookishbox.com",
            "domain": "bookishbox.com",
            "email": "hello@bookishbox.com",
            "product_count": 12,
            "platform_source": "shopify",
            "status": "raw",
        },
        {
            # Low quality — should be rejected
            "company_name": "",
            "website": "",
            "domain": "",
            "email": "not-an-email",
            "product_count": None,
            "platform_source": "shopify",
            "status": "raw",
        },
        {
            "company_name": "SubBox Monthly",
            "website": "https://subboxmonthly.com",
            "domain": "subboxmonthly.com",
            "email": "subscribe@subboxmonthly.com",
            "instagram_url": "https://instagram.com/subboxmonthly",
            "facebook_url": "https://facebook.com/subboxmonthly",
            "product_count": 8,
            "platform_source": "shopify",
            "status": "raw",
        },
    ]
    ids = []
    for s in samples:
        try:
            lid = database.insert_lead(s)
            ids.append(lid)
        except Exception:
            pass  # duplicate domain constraint — expected for the dup sample
    logger.info("[DryRun] Inserted %d sample leads", len(ids))
    return ids


def main():
    args = parse_args()

    # Initialize DB schema on first run
    database.init_schema()

    if args.import_file:
        logger.info("IMPORT MODE — loading leads from %s", args.import_file)
        from scripts.import_apollo import import_file
        from agents.duplicate_detection import DuplicateDetectionAgent
        from agents.data_quality import DataQualityAgent
        from agents.lead_qualifier import LeadQualifierAgent
        from agents.crm_agent import CRMAgent
        from datetime import datetime, timezone

        raw_ids = import_file(args.import_file)
        if not raw_ids:
            logger.error("No leads imported. Check the file format.")
            sys.exit(1)

        run_id = database.create_run()
        deduped = DuplicateDetectionAgent(settings, run_id).run(raw_ids)
        quality = DataQualityAgent(settings, run_id).run(deduped)
        scored = LeadQualifierAgent(settings, run_id).run(quality)

        crm = CRMAgent(settings, run_id)
        crm.setup()
        counts = crm.run(scored)

        stats = {
            "leads_scraped": len(raw_ids),
            "leads_duped": len(raw_ids) - len(deduped),
            "leads_rejected": len(deduped) - len(quality),
            "leads_qualified": len(scored),
            **{f"{k}_count": v for k, v in counts.items()},
        }
        database.update_run(run_id, {
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "status": "complete",
            **stats,
        })
        run = database.get_run(run_id)
        crm.log_run(run)

        print(f"""
╔═══════════════════════════════════════════╗
║      TFH IMPORT PIPELINE COMPLETE        ║
╠═══════════════════════════════════════════╣
║  Imported:    {len(raw_ids):>4}                          ║
║  Duplicates:  {stats['leads_duped']:>4}                          ║
║  Rejected:    {stats['leads_rejected']:>4}                          ║
║  Qualified:   {len(scored):>4}                          ║
╠═══════════════════════════════════════════╣
║  🔥 Hot:      {counts.get('hot', 0):>4}                          ║
║  🟡 Warm:     {counts.get('warm', 0):>4}                          ║
║  🔵 Cold:     {counts.get('cold', 0):>4}                          ║
╚═══════════════════════════════════════════╝
""")
    elif args.dry_run:
        logger.info("DRY RUN MODE — using sample leads, no Apify call")
        # In dry-run, bypass the scraper and inject sample data directly
        run_id = database.create_run()

        from agents.duplicate_detection import DuplicateDetectionAgent
        from agents.data_quality import DataQualityAgent
        from agents.lead_qualifier import LeadQualifierAgent
        from agents.crm_agent import CRMAgent

        raw_ids = load_sample_data(run_id)
        deduped = DuplicateDetectionAgent(settings, run_id).run(raw_ids)
        quality = DataQualityAgent(settings, run_id).run(deduped)
        scored = LeadQualifierAgent(settings, run_id).run(quality)

        crm = CRMAgent(settings, run_id)
        crm.setup()
        counts = crm.run(scored)

        stats = {
            "leads_scraped": len(raw_ids),
            "leads_duped": len(raw_ids) - len(deduped),
            "leads_rejected": len(deduped) - len(quality),
            "leads_qualified": len(scored),
            **{f"{k}_count": v for k, v in counts.items()},
        }
        from datetime import datetime, timezone
        database.update_run(run_id, {
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "status": "complete",
            **stats,
        })
        run = database.get_run(run_id)
        crm.log_run(run)
        print(json.dumps({"run_id": run_id, "stats": stats}, indent=2))
    else:
        manager = SalesManagerAgent(settings)
        result = manager.run_pipeline(
            search_queries=args.queries,
            max_results=args.max,
        )
        # Exit with error code if pipeline had failures
        sys.exit(1 if result.get("errors") else 0)


if __name__ == "__main__":
    main()
