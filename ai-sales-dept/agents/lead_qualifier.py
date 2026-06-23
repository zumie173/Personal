"""
Lead Qualifier Agent
Scores each lead against The Fulfillment House ICP using Claude Opus 4.8.
Assigns ICP score, confidence score, and Hot/Warm/Cold category.
"""

import json
import logging
import yaml
from pathlib import Path
from .base_agent import BaseAgent
from database import db as database

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are the Lead Qualifier for The Fulfillment House, a nonprofit third-party logistics (3PL) company in Missouri.

The Fulfillment House provides: order fulfillment, warehousing, kitting, printing, and assembly.

IDEAL CUSTOMER PROFILE (score high):
- Ecommerce companies shipping 1,000–2,500 orders/month (primary fit)
- 500–5,000 orders/month (secondary fit)
- Less than 50 SKUs (< 200 is acceptable)
- Product types: books, merchandise, apparel, subscription boxes, gifts
- US-based

NOT A FIT (score low or flag):
- Large enterprise companies
- High SKU counts (200+)
- Oversized freight, industrial, or perishable products
- Pure digital / software companies with no physical product

CONFIDENCE SCORE reflects how much data we actually have:
- 90-100: product count known, order volume estimated, clear product category
- 60-89: most signals present, some inferred
- 30-59: limited data, significant inference required
- 0-29: almost no data, score is a rough guess

Respond ONLY with a valid JSON object in this exact format:
{
  "icp_score": <integer 0-100>,
  "confidence_score": <integer 0-100>,
  "lead_category": "<hot|warm|cold>",
  "score_rationale": "<2-3 sentences explaining the scores and category>",
  "disqualifying_flags": ["<string>"]
}

Category thresholds: hot = icp_score >= 75, warm = 40-74, cold = < 40"""


class LeadQualifierAgent(BaseAgent):
    name = "lead_qualifier"

    def __init__(self, config, run_id: str):
        super().__init__(config, run_id)
        self._weights = self._load_weights(config.icp_weights_path)

    def run(self, lead_ids: list[str]) -> list[str]:
        """Score each lead. Returns all lead IDs (all qualified leads get scored)."""
        scored = []
        for lead_id in lead_ids:
            lead = database.get_lead(lead_id)
            if not lead:
                continue
            try:
                result, duration_ms = self.timed(self._score_lead, lead)
                database.update_lead(lead_id, {
                    "icp_score": result["icp_score"],
                    "confidence_score": result["confidence_score"],
                    "lead_category": result["lead_category"],
                    "score_rationale": result["score_rationale"],
                    "status": "scored",
                })
                self.log(lead_id, "lead_scored",
                         result=f"icp={result['icp_score']} conf={result['confidence_score']} "
                                f"cat={result['lead_category']}",
                         duration_ms=duration_ms)
                scored.append(lead_id)
            except Exception as exc:
                logger.error("[LeadQualifier] Failed to score %s: %s", lead_id, exc)
                self.log(lead_id, "score_failed", error=str(exc))
                # Still include in output — CRM agent will store whatever we have
                database.update_lead(lead_id, {"status": "score_error"})
                scored.append(lead_id)

        logger.info("[LeadQualifier] Scored %d leads", len(scored))
        return scored

    def _score_lead(self, lead: dict) -> dict:
        user_prompt = self._build_prompt(lead)
        raw = self.ask(SYSTEM_PROMPT, user_prompt, max_tokens=1024)

        # Strip markdown code fences if Claude wraps the JSON
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        raw = raw.strip()

        result = json.loads(raw)

        # Validate category against thresholds (don't trust model blindly)
        icp = int(result.get("icp_score", 0))
        if icp >= 75:
            result["lead_category"] = "hot"
        elif icp >= 40:
            result["lead_category"] = "warm"
        else:
            result["lead_category"] = "cold"

        return result

    def _build_prompt(self, lead: dict) -> str:
        lines = [
            f"Company: {lead.get('company_name', 'Unknown')}",
            f"Website: {lead.get('website', 'Unknown')}",
            f"Platform: {lead.get('platform_source', 'shopify')}",
            f"Product count: {lead.get('product_count', 'unknown')}",
            f"Email present: {'yes' if lead.get('email') else 'no'}",
            f"Social links: " + ", ".join(
                k.replace("_url", "") for k in
                ("instagram_url", "facebook_url", "tiktok_url", "twitter_url")
                if lead.get(k)
            ) or "none",
            f"Data quality score: {lead.get('quality_score', 'unknown')}/100",
        ]
        if lead.get("quality_flags"):
            lines.append(f"Quality flags: {lead['quality_flags']}")
        return "\n".join(lines)

    @staticmethod
    def _load_weights(path: str) -> dict:
        p = Path(path)
        if p.exists():
            with open(p) as f:
                return yaml.safe_load(f)
        return {}
