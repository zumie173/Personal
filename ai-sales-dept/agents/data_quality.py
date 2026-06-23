"""
Data Quality Agent — source-aware scoring.

Apify leads are evaluated differently from Apollo leads:
- Website validity carries almost all the weight (scraped stores don't have emails/socials in raw data)
- Missing email and missing social links do NOT reduce the Apify score
- Threshold is lower (15) because the scraper provides fewer fields by design

Apollo leads continue to use stricter validation (email, socials expected).
"""

import re
import logging
import httpx
from .base_agent import BaseAgent
from database import db as database

logger = logging.getLogger(__name__)

EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")

# ── Source-specific scoring profiles ─────────────────────────────────────────

PROFILES = {
    # Apify scraper sources: website is the only reliable field
    "apify": {
        "threshold": 15,
        "weights": {
            "website_reachable": 70,
            "company_name":      15,
            "has_product_count": 15,
            # email, social, contact_info: not scored (not penalised)
        },
    },
    # Apollo / manual imports: richer data expected
    "apollo": {
        "threshold": 30,
        "weights": {
            "website_reachable": 40,
            "email_valid":       20,
            "company_name":      15,
            "has_social":        10,
            "has_product_count": 10,
            "has_contact_info":   5,
        },
    },
}

# Sources that map to each profile
APIFY_SOURCES  = {"shopify", "woocommerce", "tiktok_shop"}
APOLLO_SOURCES = {"apollo_import", "apollo", "manual"}


def _profile_for(platform_source: str) -> tuple[dict, str]:
    """Return (profile dict, profile name) for a lead's platform_source."""
    src = (platform_source or "").lower()
    if src in APIFY_SOURCES:
        return PROFILES["apify"], "apify"
    return PROFILES["apollo"], "apollo"


class DataQualityAgent(BaseAgent):
    name = "data_quality"

    def run(self, lead_ids: list[str]) -> list[str]:
        """Score each lead's data quality. Returns lead IDs that met their source threshold."""
        passed = []
        source_counts: dict[str, dict] = {}

        for lead_id in lead_ids:
            lead = database.get_lead(lead_id)
            if not lead:
                continue

            score, flags, reason = self._score(lead)
            profile, profile_name = _profile_for(lead.get("platform_source", ""))
            threshold = profile["threshold"]
            status = "quality_checked" if score >= threshold else "rejected"

            database.update_lead(lead_id, {
                "quality_score":  score,
                "quality_flags":  "; ".join(flags) if flags else None,
                "quality_reason": reason,
                "status":         status,
            })

            self.log(lead_id, "quality_scored",
                     result=f"profile={profile_name} score={score}/{threshold} "
                            f"status={status} reason={reason!r}")

            bucket = source_counts.setdefault(profile_name, {"pass": 0, "fail": 0})
            bucket["pass" if status == "quality_checked" else "fail"] += 1

            if status == "quality_checked":
                passed.append(lead_id)

        for src, counts in source_counts.items():
            logger.info("[DataQuality] %s — passed=%d rejected=%d",
                        src, counts["pass"], counts["fail"])

        logger.info("[DataQuality] Total: %d passed / %d rejected",
                    len(passed), len(lead_ids) - len(passed))
        return passed

    def _score(self, lead: dict) -> tuple[int, list[str], str]:
        """
        Returns (score, flags, quality_reason).
        Scoring is driven by the lead's platform_source.
        """
        profile, profile_name = _profile_for(lead.get("platform_source", ""))
        weights = profile["weights"]
        score = 0
        flags = []
        reason_parts = []

        # ── Website reachable ────────────────────────────────────────────────
        website = lead.get("website") or lead.get("domain")
        if "website_reachable" in weights:
            if website:
                reachable, http_note = self._check_url(website)
                if reachable:
                    score += weights["website_reachable"]
                    reason_parts.append("website reachable")
                else:
                    flags.append(f"website_unreachable:{http_note}")
                    reason_parts.append(f"website unreachable ({http_note})")
            else:
                flags.append("no_website")
                reason_parts.append("no website")

        # ── Email ────────────────────────────────────────────────────────────
        email = lead.get("email") or ""
        if "email_valid" in weights:
            if email and EMAIL_RE.match(email):
                score += weights["email_valid"]
                reason_parts.append("email verified")
            elif email:
                flags.append("invalid_email_format")
                reason_parts.append("invalid email format")
            else:
                flags.append("no_email")
                reason_parts.append("no email")
        elif not email:
            # Apify source — not penalised, but note it
            flags.append("no_email (expected for source)")

        # ── Company name ─────────────────────────────────────────────────────
        if "company_name" in weights:
            if lead.get("company_name"):
                score += weights["company_name"]
            else:
                flags.append("no_company_name")
                reason_parts.append("no company name")

        # ── Social links ─────────────────────────────────────────────────────
        has_social = any(lead.get(k) for k in
                         ("instagram_url", "facebook_url", "tiktok_url", "twitter_url"))
        if "has_social" in weights:
            if has_social:
                score += weights["has_social"]
                reason_parts.append("social links present")
            else:
                flags.append("no_social_links")
                reason_parts.append("no social links")
        elif not has_social:
            flags.append("no_social_links (expected for source)")

        # ── Product count ────────────────────────────────────────────────────
        if "has_product_count" in weights:
            try:
                pc = int(lead.get("product_count") or 0)
            except (ValueError, TypeError):
                pc = 0
            if pc > 0:
                score += weights["has_product_count"]
                reason_parts.append(f"{pc} SKUs found")
            else:
                flags.append("no_product_count")
                reason_parts.append("product count unknown")

        # ── Contact info ─────────────────────────────────────────────────────
        if "has_contact_info" in weights:
            if lead.get("email") or lead.get("phone"):
                score += weights["has_contact_info"]
            else:
                flags.append("no_contact_info")
                reason_parts.append("no contact info")

        # ── Build quality_reason ─────────────────────────────────────────────
        threshold = profile["threshold"]
        passed = score >= threshold
        quality_reason = "; ".join(reason_parts) if reason_parts else "no data"
        if not passed:
            quality_reason = f"Rejected (score {score}/{threshold}): {quality_reason}"
        elif profile_name == "apify" and not email:
            quality_reason += " — email not expected from Apify source"

        return score, flags, quality_reason

    def _check_url(self, url: str) -> tuple[bool, str]:
        if not url.startswith("http"):
            url = f"https://{url}"
        try:
            resp = httpx.head(url, timeout=8, follow_redirects=True,
                              headers={"User-Agent": "Mozilla/5.0"})
            return (resp.status_code < 400), str(resp.status_code)
        except httpx.TimeoutException:
            return False, "timeout"
        except Exception as exc:
            return False, str(exc)[:60]
