"""
Google Sheets CRM integration using gspread.
All leads are written to a single spreadsheet with dedicated tabs.
"""

import logging
from datetime import datetime, timezone
from typing import Optional
import gspread
from google.oauth2.service_account import Credentials

logger = logging.getLogger(__name__)

SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
]

# Tab names within the spreadsheet
TAB_LEADS = "Leads"
TAB_HOT = "Hot Leads"
TAB_PIPELINE_LOG = "Pipeline Log"

# Column headers for the Leads tab (order matters — maps to row writes)
LEADS_HEADERS = [
    # Identity
    "ID", "Company Name", "Website", "Domain", "Platform",
    # Contact person
    "Contact Name", "Contact Title", "Contact LinkedIn",
    # Company contact
    "Email", "Phone",
    # Social
    "Instagram", "Facebook", "TikTok", "Twitter",
    # Company intelligence
    "Industry", "Employee Count", "Tech Stack",
    "Company City", "Company State",
    # Product / shipping profile (ICP signals)
    "Product Count (SKUs)", "Avg Weight (oz)", "Avg Price", "Avg Rating", "Total Reviews",
    "Country", "Status",
    # Scores
    "Quality Score", "Quality Reason",
    "ICP Score", "Confidence Score", "Category",
    "Reason",
    # Meta
    "Source", "Created At",
]


class SheetsClient:
    def __init__(self, credentials_json: str, spreadsheet_id: str):
        creds = Credentials.from_service_account_file(credentials_json, scopes=SCOPES)
        self._gc = gspread.authorize(creds)
        self._spreadsheet_id = spreadsheet_id
        self._sh = None

    def _sheet(self):
        if self._sh is None:
            self._sh = self._gc.open_by_key(self._spreadsheet_id)
        return self._sh

    def ensure_tabs(self):
        """Create required tabs with headers if they don't exist."""
        sh = self._sheet()
        existing = [ws.title for ws in sh.worksheets()]

        if TAB_LEADS not in existing:
            ws = sh.add_worksheet(title=TAB_LEADS, rows=5000, cols=len(LEADS_HEADERS))
            ws.append_row(LEADS_HEADERS, value_input_option="RAW")
            logger.info("Created '%s' tab", TAB_LEADS)

        if TAB_HOT not in existing:
            sh.add_worksheet(title=TAB_HOT, rows=1000, cols=len(LEADS_HEADERS))
            sh.worksheet(TAB_HOT).append_row(LEADS_HEADERS, value_input_option="RAW")
            logger.info("Created '%s' tab", TAB_HOT)

        if TAB_PIPELINE_LOG not in existing:
            ws = sh.add_worksheet(title=TAB_PIPELINE_LOG, rows=500, cols=10)
            ws.append_row(
                ["Run ID", "Started", "Completed", "Scraped", "Duped",
                 "Rejected", "Qualified", "Hot", "Warm", "Cold"],
                value_input_option="RAW",
            )
            logger.info("Created '%s' tab", TAB_PIPELINE_LOG)

    def upsert_lead(self, lead: dict) -> int:
        """
        Append lead to Leads tab. Returns the sheet row number (1-indexed).
        If lead already has a sheets_row, update that row instead.
        """
        ws = self._sheet().worksheet(TAB_LEADS)
        row = _lead_to_row(lead)

        if lead.get("sheets_row"):
            ws.update(f"A{lead['sheets_row']}:{_col_letter(len(LEADS_HEADERS))}{lead['sheets_row']}",
                      [row], value_input_option="USER_ENTERED")
            return lead["sheets_row"]
        else:
            ws.append_row(row, value_input_option="USER_ENTERED")
            # Row number = current row count (header is row 1, first data is row 2)
            return ws.row_count  # approximate; fine for Phase 1

    def append_hot_lead(self, lead: dict):
        ws = self._sheet().worksheet(TAB_HOT)
        ws.append_row(_lead_to_row(lead), value_input_option="USER_ENTERED")

    def log_pipeline_run(self, run: dict):
        ws = self._sheet().worksheet(TAB_PIPELINE_LOG)
        ws.append_row([
            run.get("id", ""),
            run.get("started_at", ""),
            run.get("completed_at", ""),
            run.get("leads_scraped", 0),
            run.get("leads_duped", 0),
            run.get("leads_rejected", 0),
            run.get("leads_qualified", 0),
            run.get("hot_count", 0),
            run.get("warm_count", 0),
            run.get("cold_count", 0),
        ], value_input_option="RAW")


def _lead_to_row(lead: dict) -> list:
    contact_name = " ".join(filter(None, [
        lead.get("contact_first_name"), lead.get("contact_last_name")
    ]))
    return [
        # Identity
        lead.get("id", ""),
        lead.get("company_name", ""),
        lead.get("website", ""),
        lead.get("domain", ""),
        lead.get("platform_source", ""),
        # Contact person
        contact_name,
        lead.get("contact_title", ""),
        lead.get("contact_linkedin_url", ""),
        # Company contact
        lead.get("email", ""),
        lead.get("phone", ""),
        # Social
        lead.get("instagram_url", ""),
        lead.get("facebook_url", ""),
        lead.get("tiktok_url", ""),
        lead.get("twitter_url", ""),
        # Company intelligence
        lead.get("industry", ""),
        lead.get("employee_count", ""),
        lead.get("tech_stack", ""),
        lead.get("company_city", ""),
        lead.get("company_state", ""),
        # Product / shipping profile
        lead.get("product_count", ""),
        lead.get("avg_product_weight_oz", ""),
        lead.get("avg_product_price", ""),
        lead.get("avg_rating", ""),
        lead.get("total_reviews", ""),
        lead.get("country_code") or lead.get("company_country", ""),
        lead.get("status", ""),
        # Scores
        lead.get("quality_score", ""),
        lead.get("quality_reason", ""),
        lead.get("icp_score", ""),
        lead.get("confidence_score", ""),
        lead.get("lead_category", ""),
        _build_reason(lead),
        # Meta
        _source_label(lead.get("platform_source", "")),
        lead.get("created_at", ""),
    ]


def _source_label(platform_source: str) -> str:
    """Convert internal platform_source to human-readable Source column value."""
    mapping = {
        "shopify":        "Shopify",
        "woocommerce":    "WooCommerce",
        "tiktok_shop":    "TikTok",
        "apollo_import":  "Apollo",
        "apollo":         "Apollo",
        "manual":         "Manual",
    }
    return mapping.get((platform_source or "").lower(), platform_source or "Unknown")


def _build_reason(lead: dict) -> str:
    """
    Build a short human-readable Reason sentence from scored lead data.
    Examples:
      "3 SKUs, lightweight products (20 oz), US store, Shopify"
      "129 SKUs, low price point ($20), US store, high review volume"
      "Food manufacturing — not a 3PL fit"
    """
    parts = []

    # SKU count
    skus = lead.get("product_count")
    if skus is not None:
        parts.append(f"{skus} SKUs")

    # Weight
    oz = lead.get("avg_product_weight_oz")
    if oz is not None:
        lbs = round(float(oz) / 16, 1)
        if lbs < 1:
            parts.append(f"lightweight ({oz} oz)")
        elif lbs <= 5:
            parts.append(f"{lbs} lb avg weight")
        else:
            parts.append(f"heavy ({lbs} lbs avg — oversized risk)")

    # Price
    price = lead.get("avg_product_price")
    if price is not None:
        parts.append(f"${price:.0f} avg price")

    # Reviews / volume proxy
    reviews = lead.get("total_reviews")
    if reviews:
        if reviews > 10000:
            parts.append("very high review volume")
        elif reviews > 1000:
            parts.append("strong review volume")
        elif reviews > 100:
            parts.append(f"{reviews} reviews")

    # Country
    country = lead.get("country_code") or lead.get("company_country", "")
    if country:
        parts.append(f"{country} store")

    # Platform
    source = _source_label(lead.get("platform_source", ""))
    if source and source not in ("Unknown", ""):
        parts.append(source)

    # Fallback: use score rationale trimmed if nothing else
    if not parts and lead.get("score_rationale"):
        # Strip the breakdown prefix [vol:X ship:X ...] if present
        rationale = lead["score_rationale"]
        if rationale.startswith("["):
            rationale = rationale.split("]", 1)[-1].strip()
        return rationale[:120]

    return ", ".join(parts) if parts else "Insufficient data"


def _col_letter(n: int) -> str:
    """Convert column number (1-indexed) to spreadsheet letter (A, B, ... Z, AA, ...)."""
    result = ""
    while n > 0:
        n, rem = divmod(n - 1, 26)
        result = chr(65 + rem) + result
    return result
