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
    "ID", "Company Name", "Website", "Email", "Phone",
    "Instagram", "Facebook", "TikTok", "Twitter",
    "Product Count", "Platform", "Status",
    "Quality Score", "Quality Flags",
    "ICP Score", "Confidence Score", "Category",
    "Score Rationale", "Created At",
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
    return [
        lead.get("id", ""),
        lead.get("company_name", ""),
        lead.get("website", ""),
        lead.get("email", ""),
        lead.get("phone", ""),
        lead.get("instagram_url", ""),
        lead.get("facebook_url", ""),
        lead.get("tiktok_url", ""),
        lead.get("twitter_url", ""),
        lead.get("product_count", ""),
        lead.get("platform_source", "shopify"),
        lead.get("status", ""),
        lead.get("quality_score", ""),
        lead.get("quality_flags", ""),
        lead.get("icp_score", ""),
        lead.get("confidence_score", ""),
        lead.get("lead_category", ""),
        lead.get("score_rationale", ""),
        lead.get("created_at", ""),
    ]


def _col_letter(n: int) -> str:
    """Convert column number (1-indexed) to spreadsheet letter (A, B, ... Z, AA, ...)."""
    result = ""
    while n > 0:
        n, rem = divmod(n - 1, 26)
        result = chr(65 + rem) + result
    return result
