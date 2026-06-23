"""
CRM Agent
Syncs all scored leads to Google Sheets. Maintains Leads tab and Hot Leads tab.
"""

import logging
from .base_agent import BaseAgent
from integrations.google_sheets import SheetsClient
from database import db as database

logger = logging.getLogger(__name__)


class CRMAgent(BaseAgent):
    name = "crm_agent"

    def __init__(self, config, run_id: str):
        super().__init__(config, run_id)
        self._sheets = SheetsClient(
            credentials_json=config.google_sheets_credentials_json,
            spreadsheet_id=config.google_sheets_spreadsheet_id,
        )

    def setup(self):
        """Ensure tabs exist. Call once at pipeline start."""
        self._sheets.ensure_tabs()

    def run(self, lead_ids: list[str]) -> dict:
        """
        Sync leads to Google Sheets.
        Returns summary counts by category.
        """
        counts = {"hot": 0, "warm": 0, "cold": 0, "error": 0}

        for lead_id in lead_ids:
            lead = database.get_lead(lead_id)
            if not lead:
                continue
            try:
                row_num, duration_ms = self.timed(self._sheets.upsert_lead, lead)
                database.update_lead(lead_id, {
                    "sheets_row": row_num,
                    "status": "crm_synced",
                })

                category = lead.get("lead_category") or "cold"
                counts[category] = counts.get(category, 0) + 1

                if category == "hot":
                    self._sheets.append_hot_lead(lead)

                self.log(lead_id, "crm_synced",
                         result=f"row={row_num} category={category}",
                         duration_ms=duration_ms)
            except Exception as exc:
                counts["error"] += 1
                logger.error("[CRMAgent] Failed to sync lead %s: %s", lead_id, exc)
                self.log(lead_id, "crm_sync_failed", error=str(exc))

        logger.info("[CRMAgent] Synced: hot=%d warm=%d cold=%d errors=%d",
                    counts["hot"], counts["warm"], counts["cold"], counts["error"])
        return counts

    def log_run(self, run: dict):
        try:
            self._sheets.log_pipeline_run(run)
        except Exception as exc:
            logger.error("[CRMAgent] Failed to log pipeline run: %s", exc)
