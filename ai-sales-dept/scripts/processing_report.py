"""
Processing Report — The Fulfillment House
Queries the local SQLite DB and prints a human-readable report of
all leads, suitable for manual ICP calibration review.

Usage:
    python scripts/processing_report.py               # latest 20 leads
    python scripts/processing_report.py --limit 50    # show 50 leads
    python scripts/processing_report.py --all         # all leads
    python scripts/processing_report.py --run <run_id>  # specific run
    python scripts/processing_report.py --csv report.csv  # export to CSV

Output sections:
  1. Pipeline summary
  2. Per-lead detail table (Company / Quality / ICP / Bucket / Reason / Rejected reason)
  3. Calibration notes for manual review
"""

import sys
import csv
import argparse
import sqlite3
from pathlib import Path
from datetime import datetime

ROOT = Path(__file__).parent.parent
DB_PATH = ROOT / "data" / "tfh_sales.db"

BUCKET_ICONS = {"hot": "🔥", "warm": "🟡", "cold": "🔵", None: "⬜"}


def get_conn():
    if not DB_PATH.exists():
        print(f"\n❌  No database found at {DB_PATH}")
        print("    Run the pipeline first:")
        print("    python pipeline.py --import-json data/sample_apify_leads.json\n")
        sys.exit(1)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def fetch_run_summary(conn, run_id=None):
    if run_id:
        row = conn.execute(
            "SELECT * FROM pipeline_runs WHERE id = ?", [run_id]
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 1"
        ).fetchone()
    return dict(row) if row else None


def fetch_leads(conn, run_id=None, limit=20, all_leads=False):
    """
    Fetch leads from the most recent run, or all leads.
    Ordered by: rejected last, then by icp_score DESC.
    """
    base_query = """
        SELECT
            l.id, l.company_name, l.domain, l.website,
            l.platform_source, l.country_code, l.company_country,
            l.product_count, l.avg_product_weight_oz, l.avg_product_price,
            l.avg_rating, l.total_reviews,
            l.industry, l.employee_count,
            l.status, l.is_duplicate,
            l.quality_score, l.quality_flags, l.quality_reason,
            l.icp_score, l.confidence_score, l.lead_category,
            l.score_rationale,
            l.created_at
        FROM leads l
        {where}
        ORDER BY
            CASE WHEN l.status = 'rejected' THEN 1
                 WHEN l.status = 'duplicate' THEN 2
                 ELSE 0 END ASC,
            l.icp_score DESC NULLS LAST,
            l.quality_score DESC
        {limit_clause}
    """

    if run_id:
        # Filter by leads created during that run (within ~5 min of run start)
        run = conn.execute("SELECT started_at FROM pipeline_runs WHERE id = ?", [run_id]).fetchone()
        where = f"WHERE l.created_at >= '{run['started_at'][:10]}'" if run else ""
    else:
        where = ""

    limit_clause = "" if all_leads else f"LIMIT {limit}"
    query = base_query.format(where=where, limit_clause=limit_clause)
    rows = conn.execute(query).fetchall()
    return [dict(r) for r in rows]


def build_reason(lead: dict) -> str:
    """Short human-readable reason sentence for why this lead got its score."""
    # If lead has a score_rationale from Claude, strip the bracket prefix and use it
    rationale = lead.get("score_rationale") or ""
    if rationale.startswith("["):
        # Extract bracket section for breakdown, rest for reason
        bracket_end = rationale.find("]")
        breakdown_str = rationale[1:bracket_end] if bracket_end > 0 else ""
        prose = rationale[bracket_end + 1:].strip() if bracket_end > 0 else rationale
    else:
        breakdown_str = ""
        prose = rationale

    # Build our own reason from data fields first
    parts = []
    skus = lead.get("product_count")
    if skus is not None:
        parts.append(f"{skus} SKUs")
    oz = lead.get("avg_product_weight_oz")
    if oz is not None:
        lbs = round(float(oz) / 16, 1)
        if lbs < 1:
            parts.append(f"very light ({oz} oz)")
        elif lbs <= 5:
            parts.append(f"{lbs} lb avg")
        else:
            parts.append(f"HEAVY {lbs} lbs avg")
    price = lead.get("avg_product_price")
    if price:
        parts.append(f"${price:.0f} avg price")
    reviews = lead.get("total_reviews")
    if reviews:
        parts.append(f"{reviews:,} reviews")
    country = lead.get("country_code") or lead.get("company_country") or ""
    if country:
        parts.append(country)
    src = lead.get("platform_source", "")
    if src:
        parts.append(src.replace("_import", "").replace("_", " ").title())

    data_line = ", ".join(parts) if parts else ""

    # Combine with Claude's prose if available
    if prose and data_line:
        return f"{data_line} | {prose[:100]}"
    elif prose:
        return prose[:120]
    elif data_line:
        return data_line
    return "Insufficient data"


def build_rejection_reason(lead: dict) -> str:
    if lead.get("is_duplicate"):
        return "Duplicate domain/name — removed"
    if lead["status"] == "rejected":
        qr = lead.get("quality_reason") or lead.get("quality_flags") or "Quality threshold not met"
        return f"Quality score {lead.get('quality_score', '?')}/100: {qr}"
    if lead["status"] == "score_error":
        return "Claude scoring failed — check API key and logs"
    return ""


def print_pipeline_summary(run: dict):
    if not run:
        print("\n⚠️  No pipeline runs found in database.\n")
        return

    started  = run.get("started_at", "")[:19].replace("T", " ")
    completed = run.get("completed_at", "")[:19].replace("T", " ")
    status   = run.get("status", "unknown")

    print(f"""
╔══════════════════════════════════════════════════════════════╗
║         THE FULFILLMENT HOUSE — PROCESSING REPORT           ║
╠══════════════════════════════════════════════════════════════╣
║  Run ID:     {run['id'][:36]}   ║
║  Started:    {started:<20}                          ║
║  Completed:  {completed:<20}                          ║
║  Status:     {status:<20}                          ║
╠══════════════════════════════════════════════════════════════╣
║  Scraped:    {run.get('leads_scraped', 0):>5}                                          ║
║  Duplicates: {run.get('leads_duped', 0):>5}                                          ║
║  Rejected:   {run.get('leads_rejected', 0):>5}                                          ║
║  Qualified:  {run.get('leads_qualified', 0):>5}                                          ║
╠══════════════════════════════════════════════════════════════╣
║  🔥 Hot:     {run.get('hot_count', 0):>5}                                          ║
║  🟡 Warm:    {run.get('warm_count', 0):>5}                                          ║
║  🔵 Cold:    {run.get('cold_count', 0):>5}                                          ║
╚══════════════════════════════════════════════════════════════╝""")


def print_lead_report(leads: list[dict], show_limit: int):
    if not leads:
        print("\n  No leads found.\n")
        return

    print(f"\n  LEAD REVIEW TABLE  ({len(leads)} leads shown for manual calibration)\n")
    print(f"  {'#':<4} {'Company':<28} {'Source':<12} {'Q':<4} {'ICP':<4} {'Conf':<5} {'Bucket':<6}  Reason")
    print(f"  {'─'*4} {'─'*28} {'─'*12} {'─'*4} {'─'*4} {'─'*5} {'─'*6}  {'─'*50}")

    for i, lead in enumerate(leads, 1):
        company = (lead.get("company_name") or lead.get("domain") or "—")[:27]
        source  = (lead.get("platform_source") or "")[:11].replace("_import", "").replace("_", " ").title()
        q       = str(lead.get("quality_score") or "—")
        icp     = str(lead.get("icp_score") or "—")
        conf    = str(lead.get("confidence_score") or "—")
        cat     = lead.get("lead_category") or lead.get("status") or "—"
        icon    = BUCKET_ICONS.get(lead.get("lead_category"), "⬜")
        bucket  = f"{icon} {cat}"[:7]

        reason = build_reason(lead)[:60]

        print(f"  {i:<4} {company:<28} {source:<12} {q:<4} {icp:<4} {conf:<5} {bucket:<8} {reason}")

        # If rejected or duplicate, print why on next line
        rej_reason = build_rejection_reason(lead)
        if rej_reason:
            print(f"       {'':28} {'':12} ↳ REJECTED: {rej_reason[:70]}")

    print()


def print_detail_view(leads: list[dict]):
    """Expanded per-lead view for manual ICP calibration."""
    print("\n" + "═" * 70)
    print("  DETAILED LEAD VIEW  (for manual ICP calibration)")
    print("═" * 70)

    for i, lead in enumerate(leads, 1):
        company  = lead.get("company_name") or lead.get("domain") or "Unknown"
        domain   = lead.get("domain") or "—"
        website  = lead.get("website") or "—"
        source   = (lead.get("platform_source") or "").replace("_import", "").replace("_", " ").title()
        country  = lead.get("country_code") or lead.get("company_country") or "—"
        skus     = lead.get("product_count")
        oz       = lead.get("avg_product_weight_oz")
        price    = lead.get("avg_product_price")
        reviews  = lead.get("total_reviews")
        rating   = lead.get("avg_rating")
        industry = lead.get("industry") or "—"
        emp      = lead.get("employee_count")
        status   = lead.get("status") or "—"
        q_score  = lead.get("quality_score") or "—"
        q_reason = lead.get("quality_reason") or "—"
        icp      = lead.get("icp_score") or "—"
        conf     = lead.get("confidence_score") or "—"
        cat      = lead.get("lead_category") or "—"
        icon     = BUCKET_ICONS.get(lead.get("lead_category"), "⬜")
        rationale = lead.get("score_rationale") or "—"
        # Strip bracket breakdown from rationale for display
        if isinstance(rationale, str) and rationale.startswith("["):
            bracket_end = rationale.find("]")
            breakdown   = rationale[1:bracket_end] if bracket_end > 0 else ""
            prose       = rationale[bracket_end + 1:].strip()
        else:
            breakdown   = ""
            prose       = rationale

        lbs_str = ""
        if oz is not None:
            lbs = round(float(oz) / 16, 1)
            lbs_str = f"{oz} oz / {lbs} lbs"

        rej_reason = build_rejection_reason(lead)

        print(f"""
  ── Lead #{i}: {company}
     Website:   {website}
     Domain:    {domain}
     Source:    {source}   Country: {country}
     Industry:  {industry}   Employees: {emp or '—'}
     SKUs:      {skus or '—'}   Weight: {lbs_str or '—'}   Price: ${price:.2f if price else '—'}
     Reviews:   {reviews or '—'}   Rating: {rating or '—'}

     Quality Score:  {q_score}/100
     Quality Reason: {q_reason}

     ICP Score:      {icp}/100   Confidence: {conf}/100
     Bucket:         {icon} {cat}
     ICP Rationale:  {prose[:200] if prose != '—' else '—'}
     Score Breakdown: {breakdown if breakdown else '—'}

     Status:    {status}""")

        if rej_reason:
            print(f"     ⛔ REJECTED: {rej_reason}")

        print(f"  {'─'*66}")


def export_csv(leads: list[dict], output_path: str):
    fields = [
        "company_name", "domain", "platform_source", "country_code",
        "product_count", "avg_product_weight_oz", "avg_product_price",
        "avg_rating", "total_reviews", "industry", "employee_count",
        "status", "quality_score", "quality_reason",
        "icp_score", "confidence_score", "lead_category", "score_rationale",
        "website", "created_at",
    ]
    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["#"] + fields, extrasaction="ignore")
        writer.writeheader()
        for i, lead in enumerate(leads, 1):
            row = {"#": i}
            row.update({k: lead.get(k, "") for k in fields})
            writer.writerow(row)
    print(f"\n  ✅  CSV exported to: {output_path}\n")


def main():
    parser = argparse.ArgumentParser(description="TFH Processing Report")
    parser.add_argument("--limit",  type=int, default=20,
                        help="Number of leads to show (default: 20)")
    parser.add_argument("--all",    action="store_true",
                        help="Show all leads")
    parser.add_argument("--run",    metavar="RUN_ID",
                        help="Filter to a specific pipeline run ID")
    parser.add_argument("--detail", action="store_true",
                        help="Show expanded per-lead detail view")
    parser.add_argument("--csv",    metavar="FILE",
                        help="Export results to CSV file")
    args = parser.parse_args()

    conn  = get_conn()
    run   = fetch_run_summary(conn, args.run)
    limit = None if args.all else args.limit
    leads = fetch_leads(conn, run_id=args.run, limit=limit or 20, all_leads=args.all)
    conn.close()

    print_pipeline_summary(run)

    if args.detail:
        print_detail_view(leads)
    else:
        print_lead_report(leads, limit or len(leads))

    if args.csv:
        export_csv(leads, args.csv)

    print(f"  Run this command for expanded view:")
    print(f"    python scripts/processing_report.py --detail --limit {limit or 20}\n")
    print(f"  Export to CSV for spreadsheet review:")
    print(f"    python scripts/processing_report.py --all --csv review.csv\n")


if __name__ == "__main__":
    main()
