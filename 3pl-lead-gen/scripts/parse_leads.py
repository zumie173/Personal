#!/usr/bin/env python3
"""
parse_leads.py — Convert raw Apify JSON output to cleaned CSV for lead lists.
Handles output from: clearpath/shopify-store-leads, sovereigntaylor/google-maps-scraper
Usage: python parse_leads.py <input.json> <output.csv> [--source "Shopify"]
"""

import json
import csv
import sys
import os
import argparse
from datetime import datetime


def parse_shopify_lead(item):
    """Parse a record from clearpath/shopify-store-leads"""
    return {
        "Business Name": item.get("title") or item.get("name") or "",
        "Website": item.get("url") or item.get("domain") or "",
        "Email": item.get("email") or "",
        "Phone": item.get("phone") or "",
        "Address": item.get("address") or "",
        "City": item.get("city") or "",
        "State": item.get("state") or "",
        "Zip": item.get("zip") or item.get("postalCode") or "",
        "Google Rating": "",
        "Review Count": "",
        "Category": item.get("category") or item.get("productType") or "",
        "Source": "Shopify",
        "Notes": item.get("description") or "",
    }


def parse_google_maps_lead(item):
    """Parse a record from sovereigntaylor/google-maps-scraper"""
    address = item.get("address") or ""
    city = item.get("city") or ""
    state = item.get("state") or ""
    zip_code = item.get("postalCode") or item.get("zip") or ""

    if address and not city:
        parts = address.split(",")
        if len(parts) >= 3:
            city = parts[-3].strip() if len(parts) >= 3 else ""
            state_zip = parts[-2].strip() if len(parts) >= 2 else ""
            state = state_zip.split()[0] if state_zip else ""
            zip_code = state_zip.split()[1] if len(state_zip.split()) > 1 else ""

    return {
        "Business Name": item.get("title") or item.get("name") or "",
        "Website": item.get("website") or item.get("url") or "",
        "Email": item.get("email") or "",
        "Phone": item.get("phoneNumber") or item.get("phone") or "",
        "Address": item.get("street") or item.get("address") or "",
        "City": city,
        "State": state,
        "Zip": zip_code,
        "Google Rating": item.get("totalScore") or item.get("rating") or "",
        "Review Count": item.get("reviewsCount") or item.get("reviewCount") or "",
        "Category": item.get("categoryName") or item.get("category") or "",
        "Source": "Google Maps",
        "Notes": "",
    }


def detect_source(data):
    """Auto-detect which Apify actor produced the data"""
    if not data:
        return "unknown"
    sample = data[0] if isinstance(data, list) else data
    if "totalScore" in sample or "reviewsCount" in sample or "categoryName" in sample:
        return "google_maps"
    if "domain" in sample or "productType" in sample:
        return "shopify"
    return "generic"


def parse_generic_lead(item):
    """Fallback parser for unknown actor output"""
    return {
        "Business Name": item.get("name") or item.get("title") or item.get("company") or "",
        "Website": item.get("url") or item.get("website") or item.get("domain") or "",
        "Email": item.get("email") or "",
        "Phone": item.get("phone") or item.get("phoneNumber") or "",
        "Address": item.get("address") or item.get("street") or "",
        "City": item.get("city") or "",
        "State": item.get("state") or "",
        "Zip": item.get("zip") or item.get("postalCode") or "",
        "Google Rating": item.get("rating") or item.get("totalScore") or "",
        "Review Count": item.get("reviewCount") or item.get("reviewsCount") or "",
        "Category": item.get("category") or item.get("categoryName") or "",
        "Source": "Unknown",
        "Notes": "",
    }


def main():
    parser = argparse.ArgumentParser(description="Parse Apify JSON to lead CSV")
    parser.add_argument("input", help="Input JSON file from Apify")
    parser.add_argument("output", help="Output CSV file")
    parser.add_argument("--source", help="Override source label", default=None)
    args = parser.parse_args()

    with open(args.input, "r", encoding="utf-8") as f:
        raw = json.load(f)

    data = raw if isinstance(raw, list) else raw.get("items", raw.get("results", [raw]))

    source_type = detect_source(data)
    print(f"Detected source type: {source_type} ({len(data)} records)")

    leads = []
    for i, item in enumerate(data, 1):
        if source_type == "google_maps":
            lead = parse_google_maps_lead(item)
        elif source_type == "shopify":
            lead = parse_shopify_lead(item)
        else:
            lead = parse_generic_lead(item)

        if args.source:
            lead["Source"] = args.source

        lead["#"] = i
        leads.append(lead)

    seen = set()
    unique_leads = []
    for lead in leads:
        key = lead.get("Website", "").lower().strip("/")
        if key and key in seen:
            continue
        seen.add(key)
        unique_leads.append(lead)

    print(f"After dedup: {len(unique_leads)} unique leads")

    fieldnames = ["#", "Business Name", "Website", "Email", "Phone",
                  "Address", "City", "State", "Zip",
                  "Google Rating", "Review Count", "Category", "Source", "Notes"]

    os.makedirs(os.path.dirname(args.output) if os.path.dirname(args.output) else ".", exist_ok=True)
    with open(args.output, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for i, lead in enumerate(unique_leads, 1):
            lead["#"] = i
            writer.writerow(lead)

    print(f"Saved to: {args.output}")
    with_email = sum(1 for l in unique_leads if l.get("Email"))
    with_phone = sum(1 for l in unique_leads if l.get("Phone"))
    print(f"  With email: {with_email} | With phone: {with_phone}")


if __name__ == "__main__":
    main()
