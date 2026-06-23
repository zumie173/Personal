"""
Shopify Scraper Agent
Pulls ecommerce stores from Apify's Shopify actor and writes raw leads to the DB.
"""

import logging
from .base_agent import BaseAgent
from integrations.apify_client import run_shopify_scrape, normalize_shopify_record
from database import db as database

logger = logging.getLogger(__name__)


class ShopifyScraperAgent(BaseAgent):
    name = "shopify_scraper"

    def run(self, search_queries: list[str], max_results: int = 200) -> list[str]:
        """
        Scrape Shopify stores matching search_queries.
        Returns list of lead IDs inserted into the DB.
        """
        logger.info("[ShopifyScraper] Starting scrape. Queries: %s", search_queries)

        try:
            raw_items, duration_ms = self.timed(
                run_shopify_scrape,
                api_token=self.config.apify_api_token,
                search_queries=search_queries,
                max_results=max_results,
            )
        except Exception as exc:
            self.log(None, "scrape_failed", error=str(exc))
            raise

        self.log(None, "scrape_complete",
                 result=f"{len(raw_items)} raw items returned",
                 duration_ms=duration_ms)

        lead_ids = []
        skipped = 0
        for raw in raw_items:
            try:
                record = normalize_shopify_record(raw)
                if not record.get("website") and not record.get("company_name"):
                    skipped += 1
                    continue
                lead_id = database.insert_lead({**record, "status": "raw"})
                lead_ids.append(lead_id)
                self.log(lead_id, "lead_inserted", result=record.get("domain"))
            except Exception as exc:
                skipped += 1
                logger.warning("[ShopifyScraper] Skipped record: %s", exc)

        logger.info("[ShopifyScraper] Inserted %d leads, skipped %d", len(lead_ids), skipped)
        return lead_ids
