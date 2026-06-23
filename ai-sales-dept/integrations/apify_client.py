"""
Apify integration — runs the Shopify scraper actor and returns structured lead records.
"""

import logging
from typing import Optional
from apify_client import ApifyClient as _ApifyClient

logger = logging.getLogger(__name__)

SHOPIFY_ACTOR_ID = "apify/shopify-scraper"


def run_shopify_scrape(
    api_token: str,
    search_queries: list[str],
    max_results: int = 200,
    timeout_secs: int = 300,
) -> list[dict]:
    """Run the Shopify scraper actor. Blocks until done. Returns raw items."""
    client = _ApifyClient(api_token)

    actor_input = {
        "startUrls": [],
        "searchQueries": search_queries,
        "maxItems": max_results,
        "proxyConfiguration": {"useApifyProxy": True},
    }

    logger.info("Starting Apify Shopify scraper. Queries: %s, max: %d", search_queries, max_results)

    run = client.actor(SHOPIFY_ACTOR_ID).call(
        run_input=actor_input,
        timeout_secs=timeout_secs,
        memory_mbytes=1024,
    )

    if run["status"] != "SUCCEEDED":
        raise RuntimeError(f"Apify actor failed with status: {run['status']}")

    items = list(client.dataset(run["defaultDatasetId"]).iterate_items())
    logger.info("Apify returned %d raw items", len(items))
    return items


def normalize_shopify_record(raw: dict) -> dict:
    """
    Map Apify Shopify scraper output to our lead schema.
    Handles both the structured JSON output and the raw column format.

    Apify shopify-scraper key fields:
      url / website / storeUrl         → website
      name / storeName                 → company_name
      countryCode                      → country_code
      currency                         → currency
      productsCount / productCount     → product_count
      avgProductPrice                  → avg_product_price
      avgProductWeight                 → avg_product_weight_oz (Apify returns oz)
      avgProductRating / avgRating     → avg_rating
      totalReviews / reviewsCount      → total_reviews
      createdAt / storeCreatedAt       → store_created_at
      socialMedia.facebook             → facebook_url
      socialMedia.instagram            → instagram_url
      socialMedia.twitter              → twitter_url
      socialMedia.tiktok               → tiktok_url
      contactInfo.email                → email
      contactInfo.phone                → phone
    """
    def first(*keys):
        for k in keys:
            v = raw.get(k)
            if v is not None and v != "":
                return v
        return None

    def safe_float(val) -> Optional[float]:
        try:
            return float(val) if val is not None else None
        except (ValueError, TypeError):
            return None

    def safe_int(val) -> Optional[int]:
        try:
            return int(val) if val is not None else None
        except (ValueError, TypeError):
            return None

    website = first("url", "website", "storeUrl", "primaryDomain")
    domain = _extract_domain(website)

    social = raw.get("socialMedia") or {}
    contact = raw.get("contactInfo") or {}

    # Tech stack: Apify sometimes returns installedApps list
    apps = raw.get("installedApps") or raw.get("apps") or []
    tech_stack = ", ".join(apps) if isinstance(apps, list) else str(apps or "")

    return {
        "company_name":           first("name", "storeName", "title"),
        "website":                f"https://{domain}" if domain and not (website or "").startswith("http") else website,
        "domain":                 domain,
        "email":                  first("email", contact.get("email")),
        "phone":                  first("phone", contact.get("phone")),
        "instagram_url":          social.get("instagram") or first("instagramUrl"),
        "facebook_url":           social.get("facebook") or first("facebookUrl"),
        "tiktok_url":             social.get("tiktok") or first("tiktokUrl"),
        "twitter_url":            social.get("twitter") or first("twitterUrl"),
        "product_count":          safe_int(first("productsCount", "productCount", "numProducts")),
        "avg_product_price":      safe_float(first("avgProductPrice", "averagePrice")),
        "avg_product_weight_oz":  safe_float(first("avgProductWeight", "avgWeight")),
        "avg_rating":             safe_float(first("avgProductRating", "avgRating", "rating")),
        "total_reviews":          safe_int(first("totalReviews", "reviewsCount", "numReviews")),
        "country_code":           first("countryCode", "country"),
        "currency":               first("currency"),
        "store_created_at":       first("createdAt", "storeCreatedAt"),
        "tech_stack":             tech_stack or None,
        "platform_source":        "shopify",
    }


def _extract_domain(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    url = url.lower().strip()
    for prefix in ("https://", "http://", "www."):
        url = url.removeprefix(prefix)
    return url.split("/")[0].split("?")[0] or None
