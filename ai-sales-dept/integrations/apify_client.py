"""
Apify integration — runs the Shopify scraper actor and returns structured lead records.
"""

import time
import logging
from typing import Optional
from apify_client import ApifyClient as _ApifyClient

logger = logging.getLogger(__name__)

# Apify actor for Shopify store discovery
SHOPIFY_ACTOR_ID = "apify/shopify-scraper"


def run_shopify_scrape(
    api_token: str,
    search_queries: list[str],
    max_results: int = 200,
    timeout_secs: int = 300,
) -> list[dict]:
    """
    Run the Shopify scraper actor and return a list of raw store records.
    Blocks until the actor finishes or timeout is hit.
    """
    client = _ApifyClient(api_token)

    actor_input = {
        "startUrls": [],
        "searchQueries": search_queries,
        "maxItems": max_results,
        "proxyConfiguration": {"useApifyProxy": True},
    }

    logger.info("Starting Apify Shopify scraper. Queries: %s, max_results: %d", search_queries, max_results)

    run = client.actor(SHOPIFY_ACTOR_ID).call(
        run_input=actor_input,
        timeout_secs=timeout_secs,
        memory_mbytes=1024,
    )

    if run["status"] != "SUCCEEDED":
        raise RuntimeError(f"Apify actor failed with status: {run['status']}")

    dataset_id = run["defaultDatasetId"]
    items = list(client.dataset(dataset_id).iterate_items())
    logger.info("Apify returned %d raw items", len(items))
    return items


def normalize_shopify_record(raw: dict) -> dict:
    """
    Map Apify Shopify scraper output fields to our lead schema.
    Field names vary slightly across Apify actor versions — this handles both.
    """
    def first(*keys):
        for k in keys:
            if raw.get(k):
                return raw[k]
        return None

    website = first("url", "website", "storeUrl")
    domain = _extract_domain(website)

    social = raw.get("socialMedia") or {}
    contact = raw.get("contactInfo") or {}

    return {
        "company_name": first("name", "storeName", "title"),
        "website": website,
        "domain": domain,
        "email": first("email", contact.get("email")),
        "phone": first("phone", contact.get("phone")),
        "instagram_url": social.get("instagram") or raw.get("instagramUrl"),
        "facebook_url": social.get("facebook") or raw.get("facebookUrl"),
        "tiktok_url": social.get("tiktok") or raw.get("tiktokUrl"),
        "twitter_url": social.get("twitter") or raw.get("twitterUrl"),
        "product_count": first("productsCount", "productCount", "numProducts"),
        "platform_source": "shopify",
    }


def _extract_domain(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    url = url.lower().strip()
    for prefix in ("https://", "http://", "www."):
        url = url.removeprefix(prefix)
    return url.split("/")[0].split("?")[0]
