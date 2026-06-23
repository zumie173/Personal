"""
Data Quality Agent
Verifies website reachability, email format, and social link presence.
Assigns a quality score (0-100) and flags issues.
"""

import re
import logging
import httpx
from .base_agent import BaseAgent
from database import db as database

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")
REJECTION_THRESHOLD = 30  # quality_score below this → status = 'rejected'

# Points assigned per check (total possible = 100)
SCORE_WEIGHTS = {
    "website_reachable":  40,
    "email_valid":        20,
    "company_name":       15,
    "has_social":         10,
    "has_product_count":  10,
    "has_contact_info":    5,
}


class DataQualityAgent(BaseAgent):
    name = "data_quality"

    def run(self, lead_ids: list[str]) -> list[str]:
        """Score each lead's data quality. Returns lead IDs that met the threshold."""
        passed = []
        for lead_id in lead_ids:
            lead = database.get_lead(lead_id)
            if not lead:
                continue
            score, flags = self._score(lead)
            status = "quality_checked" if score >= REJECTION_THRESHOLD else "rejected"
            database.update_lead(lead_id, {
                "quality_score": score,
                "quality_flags": "; ".join(flags) if flags else None,
                "status": status,
            })
            self.log(lead_id, "quality_scored",
                     result=f"score={score} status={status} flags={flags}")
            if status == "quality_checked":
                passed.append(lead_id)

        rejected = len(lead_ids) - len(passed)
        logger.info("[DataQuality] %d passed, %d rejected (threshold=%d)",
                    len(passed), rejected, REJECTION_THRESHOLD)
        return passed

    def _score(self, lead: dict) -> tuple[int, list[str]]:
        score = 0
        flags = []

        # Website reachable
        website = lead.get("website") or lead.get("domain")
        if website:
            reachable, note = self._check_url(website)
            if reachable:
                score += SCORE_WEIGHTS["website_reachable"]
            else:
                flags.append(f"website_unreachable:{note}")
        else:
            flags.append("no_website")

        # Email format valid
        email = lead.get("email") or ""
        if email and EMAIL_RE.match(email):
            score += SCORE_WEIGHTS["email_valid"]
        elif email:
            flags.append("invalid_email_format")
        else:
            flags.append("no_email")

        # Company name present
        if lead.get("company_name"):
            score += SCORE_WEIGHTS["company_name"]
        else:
            flags.append("no_company_name")

        # At least one social link
        has_social = any(lead.get(k) for k in
                         ("instagram_url", "facebook_url", "tiktok_url", "twitter_url"))
        if has_social:
            score += SCORE_WEIGHTS["has_social"]
        else:
            flags.append("no_social_links")

        # Product count present
        if lead.get("product_count") and int(lead["product_count"] or 0) > 0:
            score += SCORE_WEIGHTS["has_product_count"]
        else:
            flags.append("no_product_count")

        # Any contact info (email or phone)
        if lead.get("email") or lead.get("phone"):
            score += SCORE_WEIGHTS["has_contact_info"]
        else:
            flags.append("no_contact_info")

        return score, flags

    def _check_url(self, url: str) -> tuple[bool, str]:
        if not url.startswith("http"):
            url = f"https://{url}"
        try:
            resp = httpx.head(url, timeout=8, follow_redirects=True,
                              headers={"User-Agent": "Mozilla/5.0"})
            if resp.status_code < 400:
                return True, str(resp.status_code)
            return False, str(resp.status_code)
        except httpx.TimeoutException:
            return False, "timeout"
        except Exception as exc:
            return False, str(exc)[:60]
