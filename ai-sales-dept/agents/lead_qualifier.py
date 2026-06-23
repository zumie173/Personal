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

The Fulfillment House handles: pick/pack order fulfillment, warehousing, kitting, printing, and assembly for ecommerce brands.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OPERATIONAL-FIT ICP — score on these dimensions only
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

DO NOT score on industry. A pet treat brand and a book publisher can both be perfect fits.
Score on HOW a product ships, not what category it's in.

── 1. MONTHLY ORDER VOLUME (30 pts) ──────────────────
This is the most important dimension.
  1,000–5,000 /mo  → 30 pts  (sweet spot)
  5,001–10,000     → 25 pts
  10,001–20,000    → 15 pts
  500–999          → 15 pts
  250–499          → 10 pts
  Under 250        → 0 pts
  Unknown          → infer from: review count, Shopify Plus presence, revenue ÷ avg price

── 2. PRODUCT SHIPPING PROFILE (25 pts) ──────────────
  Under 5 lbs avg weight      → +10 pts
  Fits standard parcel box    → +10 pts  (not oversized freight)
  Easy pick/pack              → +5 pts   (not fragile, not kit-assembled per order)

  Examples that score full points: books, vitamin patches, dog treats, merchandise,
  tennis accessories, bug strips, candles, small apparel items, supplements.

── 3. SKU COMPLEXITY (20 pts) ────────────────────────
  Under 50 SKUs   → 20 pts
  50–100 SKUs     → 10 pts
  101–150 SKUs    → 5 pts
  Over 150 SKUs   → 0 pts

── 4. FULFILLMENT SIMPLICITY (15 pts) ────────────────
  Standard ambient storage  → +5 pts
  No refrigeration needed   → +5 pts
  No hazmat requirements    → +5 pts
  (award all 15 unless there's a specific reason not to)

── 5. GROWTH SIGNALS (10 pts) ────────────────────────
  Shopify Plus detected     → +2 pts
  TikTok Shop active        → +2 pts
  Meta Ads running          → +2 pts
  Hiring for logistics/ops  → +2 pts
  Recent funding or growth  → +2 pts

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD DISQUALIFIERS (score < 20 regardless)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Oversized freight (furniture, gym equipment, large appliances)
- Perishable / refrigerated products
- Hazardous materials
- Pure digital / no physical product
- Enterprise scale (Fortune 500, millions of orders/month)
- International only — no US shipping
- Over 500 SKUs

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONFIDENCE SCORE — how solid is the data?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  90–100: weight known, SKU count exact, order volume estimated, US confirmed
  60–89:  most signals present; order volume inferred from reviews or revenue
  30–59:  limited data; significant inference from product type and price
  0–29:   almost no usable data

CATEGORIES: hot = icp_score >= 75 | warm = 40–74 | cold < 40

Respond ONLY with valid JSON in this exact format — no markdown, no explanation outside the JSON:
{
  "icp_score": <integer 0-100>,
  "confidence_score": <integer 0-100>,
  "lead_category": "<hot|warm|cold>",
  "score_breakdown": {
    "order_volume": <0-30>,
    "shipping_profile": <0-25>,
    "sku_complexity": <0-20>,
    "fulfillment_simplicity": <0-15>,
    "growth_signals": <0-10>
  },
  "score_rationale": "<2-3 sentences: what drives the score and the key risk or upside>",
  "disqualifying_flags": []
}

"""


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
                breakdown = result.get("score_breakdown", {})
                rationale = result.get("score_rationale", "")
                if breakdown:
                    breakdown_str = (
                        f"vol:{breakdown.get('order_volume',0)} "
                        f"ship:{breakdown.get('shipping_profile',0)} "
                        f"sku:{breakdown.get('sku_complexity',0)} "
                        f"simple:{breakdown.get('fulfillment_simplicity',0)} "
                        f"growth:{breakdown.get('growth_signals',0)}"
                    )
                    rationale = f"[{breakdown_str}] {rationale}"

                database.update_lead(lead_id, {
                    "icp_score": result["icp_score"],
                    "confidence_score": result["confidence_score"],
                    "lead_category": result["lead_category"],
                    "score_rationale": rationale,
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
        # ── Weight formatting ────────────────────────────────────────────────
        weight_oz = lead.get("avg_product_weight_oz")
        if weight_oz is not None:
            weight_lbs = round(float(weight_oz) / 16, 2)
            weight_str = f"{weight_oz} oz ({weight_lbs} lbs)"
        else:
            weight_str = "unknown"

        # ── Order volume inference from reviews + price ──────────────────────
        reviews = lead.get("total_reviews")
        avg_price = lead.get("avg_product_price")
        rev_note = ""
        if reviews and avg_price:
            # Very rough proxy: ~1-3% of buyers leave reviews; use midpoint 2%
            est_orders_lifetime = int(reviews / 0.02)
            rev_note = f" (review-based lifetime estimate: ~{est_orders_lifetime:,} total orders)"

        lines = [
            "── COMPANY ──────────────────────────────────────────",
            f"Company:          {lead.get('company_name') or lead.get('domain', 'Unknown')}",
            f"Website:          {lead.get('website', 'Unknown')}",
            f"Country:          {lead.get('company_country') or lead.get('country_code', 'unknown')}",
            f"Source:           {lead.get('platform_source', 'unknown')}",
            "",
            "── SHIPPING PROFILE (most important) ───────────────",
            f"Avg product weight: {weight_str}",
            f"Avg product price:  ${avg_price}" if avg_price else "Avg product price:  unknown",
            f"SKU count:          {lead.get('product_count', 'unknown')}",
            "",
            "── ORDER VOLUME SIGNALS ────────────────────────────",
            f"Total reviews:    {reviews}{rev_note}" if reviews else "Total reviews:    unknown",
            f"Avg rating:       {lead.get('avg_rating', 'unknown')}",
            f"Employee count:   {lead.get('employee_count', 'unknown')}",
            f"Revenue estimate: ${lead.get('revenue_est'):,}" if lead.get("revenue_est") else "Revenue estimate: unknown",
            "",
            "── GROWTH SIGNALS ──────────────────────────────────",
            f"Tech stack: {lead.get('tech_stack', 'unknown')[:200]}" if lead.get("tech_stack") else "Tech stack: unknown",
        ]

        if lead.get("industry"):
            lines.append(f"Industry:         {lead['industry']}")
        if lead.get("keywords"):
            lines.append(f"Keywords:         {lead['keywords'][:200]}")
        if lead.get("funding_stage"):
            amt = f"${lead['funding_amount']:,}" if lead.get("funding_amount") else ""
            lines.append(f"Funding:          {lead['funding_stage']} {amt}".strip())
        if lead.get("quality_flags"):
            lines.append(f"\nQuality flags: {lead['quality_flags']}")

        return "\n".join(lines)

    @staticmethod
    def _load_weights(path: str) -> dict:
        p = Path(path)
        if p.exists():
            with open(p) as f:
                return yaml.safe_load(f)
        return {}
