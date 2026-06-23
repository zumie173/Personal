"""
Duplicate Detection Agent
Checks each lead against existing records using exact domain match and fuzzy company name match.
"""

import logging
from rapidfuzz import fuzz
from .base_agent import BaseAgent
from database import db as database

logger = logging.getLogger(__name__)

FUZZY_NAME_THRESHOLD = 88   # % similarity to flag as probable duplicate
FUZZY_NAME_HARD_MATCH = 95  # % similarity to auto-reject as duplicate


class DuplicateDetectionAgent(BaseAgent):
    name = "duplicate_detection"

    def run(self, lead_ids: list[str]) -> list[str]:
        """
        Check leads for duplicates. Returns list of lead IDs that passed (non-duplicates).
        Modifies leads in-place: sets is_duplicate=1 and status='duplicate' on matches.
        """
        passed = []
        # Load existing clean domains and names (leads already in DB from prior runs)
        existing_domains: set[str] = set(database.get_all_domains())
        existing_names: list[str] = database.get_all_company_names()

        # Track domains/names from THIS batch to catch intra-batch duplicates
        batch_domains: set[str] = set()
        batch_names: list[str] = []

        for lead_id in lead_ids:
            lead = database.get_lead(lead_id)
            if not lead:
                continue

            domain = (lead.get("domain") or "").lower().strip()
            name = (lead.get("company_name") or "").lower().strip()

            duplicate_of = None
            reason = None

            # ── Exact domain match ──────────────────────────────────────────
            if domain:
                if domain in existing_domains or domain in batch_domains:
                    duplicate_of = lead_id  # self-reference signals duplicate; CRM agent resolves
                    reason = f"exact_domain:{domain}"

            # ── Fuzzy company name match ────────────────────────────────────
            if not duplicate_of and name:
                all_names = list(existing_names) + batch_names
                for existing_name in all_names:
                    score = fuzz.token_sort_ratio(name, existing_name.lower().strip())
                    if score >= FUZZY_NAME_HARD_MATCH:
                        duplicate_of = lead_id
                        reason = f"fuzzy_name:{score:.0f}%:{existing_name}"
                        break
                    elif score >= FUZZY_NAME_THRESHOLD:
                        # Soft flag — mark as possible duplicate but still process
                        database.update_lead(lead_id, {
                            "quality_flags": f"possible_duplicate:{existing_name}:{score:.0f}%"
                        })
                        self.log(lead_id, "possible_duplicate",
                                 result=f"{score:.0f}% match with '{existing_name}'")

            if duplicate_of:
                database.update_lead(lead_id, {
                    "is_duplicate": 1,
                    "status": "duplicate",
                    "duplicate_of_id": "existing_record",
                })
                self.log(lead_id, "marked_duplicate", result=reason)
                logger.debug("[DupDetect] Duplicate: %s (%s)", lead_id, reason)
            else:
                # Add to working sets so intra-batch duplicates are caught
                if domain:
                    batch_domains.add(domain)
                    existing_domains.add(domain)
                if name:
                    batch_names.append(name)
                    existing_names.append(name)
                database.update_lead(lead_id, {"status": "deduped"})
                passed.append(lead_id)

        duped = len(lead_ids) - len(passed)
        logger.info("[DupDetect] %d passed, %d duplicates removed", len(passed), duped)
        return passed
