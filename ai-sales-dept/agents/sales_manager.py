"""
Sales Manager Agent
Orchestrates the Phase 1 pipeline end-to-end.
Tracks failures, logs progress, and produces a summary report.
"""

import json
import logging
from datetime import datetime, timezone
from .base_agent import BaseAgent
from .shopify_scraper import ShopifyScraperAgent
from .duplicate_detection import DuplicateDetectionAgent
from .data_quality import DataQualityAgent
from .lead_qualifier import LeadQualifierAgent
from .crm_agent import CRMAgent
from database import db as database

logger = logging.getLogger(__name__)


class SalesManagerAgent(BaseAgent):
    name = "sales_manager"

    def __init__(self, config):
        run_id = database.create_run()
        super().__init__(config, run_id)
        self.run_id = run_id

        # Instantiate all agents with the same run_id so logs correlate
        self._scraper = ShopifyScraperAgent(config, run_id)
        self._dedup = DuplicateDetectionAgent(config, run_id)
        self._quality = DataQualityAgent(config, run_id)
        self._qualifier = LeadQualifierAgent(config, run_id)
        self._crm = CRMAgent(config, run_id)

    def run_pipeline(self, search_queries: list[str], max_results: int = 200) -> dict:
        """
        Execute the full Phase 1 pipeline.
        Returns a summary report dict.
        """
        errors = []
        run_stats = {
            "leads_scraped": 0,
            "leads_duped": 0,
            "leads_rejected": 0,
            "leads_qualified": 0,
            "hot_count": 0,
            "warm_count": 0,
            "cold_count": 0,
        }

        logger.info("=" * 60)
        logger.info("Sales Manager: Starting pipeline run %s", self.run_id)
        logger.info("Queries: %s | Max results: %d", search_queries, max_results)
        logger.info("=" * 60)

        # ── Step 1: CRM setup ────────────────────────────────────────────────
        self._step("CRM setup", lambda: self._crm.setup(), errors)

        # ── Step 2: Scrape ───────────────────────────────────────────────────
        raw_lead_ids = self._step(
            "Shopify scrape",
            lambda: self._scraper.run(search_queries, max_results),
            errors,
            default=[],
        )
        run_stats["leads_scraped"] = len(raw_lead_ids)
        self.log(None, "scrape_complete", result=f"{len(raw_lead_ids)} leads scraped")

        if not raw_lead_ids:
            logger.warning("Sales Manager: No leads scraped. Aborting pipeline.")
            return self._finish(run_stats, errors=["no_leads_scraped"])

        # ── Step 3: Dedup ────────────────────────────────────────────────────
        deduped_ids = self._step(
            "Duplicate detection",
            lambda: self._dedup.run(raw_lead_ids),
            errors,
            default=raw_lead_ids,
        )
        run_stats["leads_duped"] = run_stats["leads_scraped"] - len(deduped_ids)
        self.log(None, "dedup_complete",
                 result=f"{len(deduped_ids)} unique / {run_stats['leads_duped']} dupes removed")

        # ── Step 4: Data Quality ─────────────────────────────────────────────
        quality_ids = self._step(
            "Data quality",
            lambda: self._quality.run(deduped_ids),
            errors,
            default=deduped_ids,
        )
        run_stats["leads_rejected"] = len(deduped_ids) - len(quality_ids)
        self.log(None, "quality_complete",
                 result=f"{len(quality_ids)} passed / {run_stats['leads_rejected']} rejected")

        # ── Step 5: Lead Qualification ───────────────────────────────────────
        scored_ids = self._step(
            "Lead qualification",
            lambda: self._qualifier.run(quality_ids),
            errors,
            default=quality_ids,
        )
        run_stats["leads_qualified"] = len(scored_ids)

        # ── Step 6: CRM Sync ─────────────────────────────────────────────────
        crm_counts = self._step(
            "CRM sync",
            lambda: self._crm.run(scored_ids),
            errors,
            default={},
        )
        run_stats["hot_count"] = crm_counts.get("hot", 0)
        run_stats["warm_count"] = crm_counts.get("warm", 0)
        run_stats["cold_count"] = crm_counts.get("cold", 0)

        return self._finish(run_stats, errors=errors)

    def _step(self, label: str, fn, errors: list, default=None):
        """Run a pipeline step. On failure, record error and return default."""
        logger.info("─── %s", label)
        try:
            return fn()
        except Exception as exc:
            msg = f"{label}: {exc}"
            errors.append(msg)
            logger.error("Sales Manager: STEP FAILED — %s", msg, exc_info=True)
            self.log(None, f"step_failed:{label}", error=msg)
            return default

    def _finish(self, stats: dict, errors: list) -> dict:
        completed_at = datetime.now(timezone.utc).isoformat()
        database.update_run(self.run_id, {
            "completed_at": completed_at,
            "status": "complete" if not errors else "complete_with_errors",
            "errors": json.dumps(errors),
            **stats,
        })

        run = database.get_run(self.run_id)
        self._crm.log_run(run)

        report = self._build_report(stats, errors, run)
        logger.info("\n%s", report)
        return {"run_id": self.run_id, "stats": stats, "errors": errors, "report": report}

    def _build_report(self, stats: dict, errors: list, run: dict) -> str:
        lines = [
            "",
            "╔══════════════════════════════════════════════════════╗",
            "║        THE FULFILLMENT HOUSE — PIPELINE REPORT       ║",
            "╠══════════════════════════════════════════════════════╣",
            f"║  Run ID:        {self.run_id[:36]}  ║",
            f"║  Started:       {(run or {}).get('started_at', '')[:19]}                   ║",
            f"║  Completed:     {(run or {}).get('completed_at', '')[:19]}                   ║",
            "╠══════════════════════════════════════════════════════╣",
            f"║  Leads scraped:   {stats['leads_scraped']:>4}                             ║",
            f"║  Duplicates:    - {stats['leads_duped']:>4}                             ║",
            f"║  Rejected:      - {stats['leads_rejected']:>4}                             ║",
            f"║  Qualified:       {stats['leads_qualified']:>4}                             ║",
            "╠══════════════════════════════════════════════════════╣",
            f"║  🔥 Hot leads:    {stats['hot_count']:>4}                             ║",
            f"║  🟡 Warm leads:   {stats['warm_count']:>4}                             ║",
            f"║  🔵 Cold leads:   {stats['cold_count']:>4}                             ║",
            "╠══════════════════════════════════════════════════════╣",
        ]
        if errors:
            lines.append(f"║  ⚠️  Errors: {len(errors)}                                    ║")
            for e in errors:
                lines.append(f"║    • {e[:50]:<50}  ║")
        else:
            lines.append("║  ✓ No errors                                         ║")
        lines.append("╚══════════════════════════════════════════════════════╝")
        return "\n".join(lines)
