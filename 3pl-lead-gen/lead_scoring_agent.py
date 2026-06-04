#!/usr/bin/env python3
"""
Fulfillment House — Lead Scoring & Call Scheduling Agent v2
Runs every Monday. Fetches Apify datasets, scores leads,
deduplicates, builds the HTML dashboard, and emails the weekly
call schedule to the configured recipient.

Credentials are loaded from config.env (never hardcoded here).
Copy config.example.env to config.env and fill in your values.
"""

import csv
import json
import os
import sys
import time
import webbrowser
import urllib.request
import urllib.error
from datetime import date, timedelta
from pathlib import Path

# ─────────────────────────────────────────────────────────────────────────────
# LOAD CONFIG FROM config.env
# ─────────────────────────────────────────────────────────────────────────────

_CONFIG_FILE = Path(__file__).parent / "config.env"

def _load_config():
    if not _CONFIG_FILE.exists():
        print(f"ERROR: config.env not found at {_CONFIG_FILE}")
        print("Copy config.example.env to config.env and fill in your credentials.")
        sys.exit(1)
    with open(_CONFIG_FILE) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

_load_config()

APIFY_API_TOKEN  = os.environ.get("APIFY_API_TOKEN", "")
ORGANIZER_EMAIL  = os.environ.get("SMTP_USER", "kurt@thefulfillmenthouse.org")
EMAIL_PASSWORD   = os.environ.get("SMTP_PASS", "")
EMAIL_TO         = os.environ.get("EMAIL_TO", ORGANIZER_EMAIL)

if not APIFY_API_TOKEN:
    print("ERROR: APIFY_API_TOKEN not set in config.env")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────

RUN_TIMEOUT_SEC   = 360
POLL_INTERVAL_SEC = 10
CATEGORIES_PER_WEEK = 5   # 30 total ÷ 5 = 6-week category cycle; 5 runs × ~$0.20 = ~$1/week

# ── 4-ACTOR WEEKLY ROTATION ───────────────────────────────────────────────────
ACTOR_ROTATION = [
    {
        "name":      "WebDataLabs Store Intelligence",
        "actor_id":  "webdatalabs~shopify-store-intelligence",
        "max_items": 20,
        "build_input": lambda kw: {
            "mode":               "discovery",
            "category":           kw,
            "maxStores":          20,
            "maxPages":           1,
            "extractReviews":     True,
            "proxyConfiguration": {"useApifyProxy": False},
        },
    },
]

OUTPUT_ROOT   = Path(__file__).parent / "fulfillment_house_calls"
ROTATION_FILE = OUTPUT_ROOT / "rotation_state.json"
MASTER_CSV    = OUTPUT_ROOT / "master_seen_leads.csv"

# ── STATIC DATASETS (free — read existing Apify datasets, no actor runs needed) ──
STATIC_DATASETS = [
    {"dataset_id": "iiP2BFxZun9fon3oq", "category": "Supplements & Vitamins"},
    {"dataset_id": "ZKRb7eDI2TLddWKe0", "category": "Books & Subscription Boxes"},
    {"dataset_id": "yQCW1L8TJum9bg3IM", "category": "Candles, Skincare & Beauty"},
    {"dataset_id": "ihhLKp6KYS7kEU1Zs", "category": "Specialty Food & Snacks"},
]

# ─────────────────────────────────────────────────────────────────────────────
# 30-CATEGORY LIST  (rotated 5 per week)
# ─────────────────────────────────────────────────────────────────────────────

ALL_CATEGORIES = [
    {"name": "Supplements & Vitamins",         "keywords": "supplements vitamins health wellness"},
    {"name": "Books & Media",                   "keywords": "books media publishing subscription"},
    {"name": "Candles & Home Fragrance",        "keywords": "candles home fragrance wax melts"},
    {"name": "Skincare & Beauty",               "keywords": "skincare beauty cosmetics natural organic"},
    {"name": "Specialty Food & Snacks",         "keywords": "specialty food snacks artisan gourmet"},
    {"name": "Pet Supplies",                    "keywords": "pet supplies dog cat treats accessories"},
    {"name": "Toys & Hobby",                    "keywords": "toys hobby games children play"},
    {"name": "Apparel Accessories",             "keywords": "apparel accessories hats scarves bags"},
    {"name": "Home Goods & Decor",              "keywords": "home goods decor household lifestyle"},
    {"name": "Subscription Boxes",              "keywords": "subscription box monthly curated gifts"},
    {"name": "Coffee & Tea",                    "keywords": "coffee tea specialty beverage roaster"},
    {"name": "Wine Accessories & Barware",      "keywords": "wine accessories barware entertaining gifts"},
    {"name": "Crystals & Spiritual Wellness",   "keywords": "crystals spiritual wellness healing gemstones"},
    {"name": "Outdoor & Camping Accessories",   "keywords": "outdoor camping gear accessories hiking"},
    {"name": "Baby & Infant Products",          "keywords": "baby infant products newborn organic safe"},
    {"name": "Greeting Cards & Stationery",     "keywords": "greeting cards stationery paper goods gifts"},
    {"name": "Puzzles & Board Games",           "keywords": "puzzles board games family tabletop"},
    {"name": "Art Supplies & Craft Kits",       "keywords": "art supplies craft kits DIY maker creative"},
    {"name": "Fitness Accessories",             "keywords": "fitness accessories resistance bands yoga workout"},
    {"name": "Cleaning & Home Organization",    "keywords": "cleaning home organization eco products"},
    {"name": "Gardening & Plant Care",          "keywords": "gardening plant care seeds indoor outdoor"},
    {"name": "Mushroom & Adaptogen Products",   "keywords": "mushroom adaptogen functional wellness health"},
    {"name": "Jewelry & Accessories",           "keywords": "jewelry accessories handmade artisan women"},
    {"name": "Sports Fan Merchandise",          "keywords": "sports fan merchandise team gear apparel"},
    {"name": "Yarn Fabric & Sewing",            "keywords": "yarn fabric sewing knitting crafts textile"},
    {"name": "Educational Toys & Kits",         "keywords": "educational toys learning kits STEM children"},
    {"name": "Hunting & Fishing",               "keywords": "hunting fishing outdoor sporting goods"},
    {"name": "Kitchen Tools & Gadgets",         "keywords": "kitchen tools gadgets cooking accessories"},
    {"name": "Personal Care & Grooming",        "keywords": "personal care grooming hygiene natural"},
    {"name": "Faith & Spiritual Goods",         "keywords": "catholic faith christian spiritual gifts religious"},
]

# ─────────────────────────────────────────────────────────────────────────────
# AUTO-DATE CALCULATION
# ─────────────────────────────────────────────────────────────────────────────

def _this_week_monday():
    today = date.today()
    return today - timedelta(days=today.weekday())

def _build_week_dates():
    monday = _this_week_monday()
    result = []
    for i, name in enumerate(["Monday","Tuesday","Wednesday","Thursday","Friday"]):
        d = monday + timedelta(days=i)
        result.append((name, d.strftime("%B") + " " + str(d.day), d.strftime("%Y%m%d")))
    return result

_monday     = _this_week_monday()
WEEK_DATES  = _build_week_dates()
WEEK_LABEL  = _monday.strftime("%B") + " " + str(_monday.day) + ", " + str(_monday.year)
WEEK_FOLDER = OUTPUT_ROOT / ("week_" + _monday.strftime("%Y_%m_%d"))

# ─────────────────────────────────────────────────────────────────────────────
# ROTATION STATE
# ─────────────────────────────────────────────────────────────────────────────

def load_rotation_state():
    if ROTATION_FILE.exists():
        try:
            data = json.loads(ROTATION_FILE.read_text())
            cat_idx   = data.get("cat_index",   data.get("next_index", 0))
            actor_idx = data.get("actor_index", 0)
            return cat_idx, actor_idx
        except:
            pass
    return 0, 0

def save_rotation_state(cat_idx, actor_idx):
    ROTATION_FILE.write_text(json.dumps({
        "cat_index":   cat_idx   % len(ALL_CATEGORIES),
        "actor_index": actor_idx % len(ACTOR_ROTATION),
    }))

def get_this_weeks_categories():
    cat_idx, _ = load_rotation_state()
    cats = [ALL_CATEGORIES[(cat_idx + i) % len(ALL_CATEGORIES)] for i in range(CATEGORIES_PER_WEEK)]
    return cats, cat_idx

def get_this_weeks_actor():
    _, actor_idx = load_rotation_state()
    return ACTOR_ROTATION[actor_idx], actor_idx

# ─────────────────────────────────────────────────────────────────────────────
# APIFY — FETCH STATIC DATASETS (free, no actor runs)
# ─────────────────────────────────────────────────────────────────────────────

def fetch_dataset(dataset_id, cat_name, max_items=100):
    """Read items from an existing Apify dataset. Costs $0."""
    url = (f"https://api.apify.com/v2/datasets/{dataset_id}/items"
           f"?token={APIFY_API_TOKEN}&limit={max_items}&format=json")
    try:
        req = urllib.request.Request(url, headers={"User-Agent":"FHAgent/2"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data  = json.loads(r.read().decode())
            items = data if isinstance(data, list) else data.get("items", [])
            print(f"    OK {cat_name}: {len(items)} items")
            return items
    except Exception as e:
        print(f"    FAIL Fetch error {cat_name}: {e}")
        return []

def scrape_categories():
    """Read all 4 static datasets. No actor runs — completely free."""
    print(f"  Reading {len(STATIC_DATASETS)} Apify datasets (free)...")
    all_items = []
    for ds in STATIC_DATASETS:
        items = fetch_dataset(ds["dataset_id"], ds["category"])
        for item in items:
            item["_category"] = ds["category"]
        all_items.extend(items)
    print(f"  Total raw items: {len(all_items)}")
    return all_items

# ─────────────────────────────────────────────────────────────────────────────
# DEDUPLICATION
# ─────────────────────────────────────────────────────────────────────────────

def load_seen():
    seen = set()
    if not MASTER_CSV.exists():
        return seen
    try:
        with open(MASTER_CSV, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                if row.get("shopify_domain"):
                    seen.add(row["shopify_domain"].lower().strip())
                if row.get("website_url"):
                    seen.add(row["website_url"].lower().strip().rstrip("/"))
    except Exception as e:
        print(f"  Warning reading master CSV: {e}")
    return seen

def save_to_master(leads):
    exists = MASTER_CSV.exists()
    try:
        with open(MASTER_CSV, "a", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=[
                "brand_name","shopify_domain","website_url","score","tier","category","date_added"])
            if not exists:
                w.writeheader()
            for l in leads:
                w.writerow({
                    "brand_name":    l.get("name",""),
                    "shopify_domain": l.get("myshopifyDomain",""),
                    "website_url":   l.get("websiteUrl",""),
                    "score":         l.get("score",0),
                    "tier":          l.get("tier",""),
                    "category":      l.get("category",""),
                    "date_added":    str(_monday),
                })
        print(f"  OK {len(leads)} leads added to master list")
    except Exception as e:
        print(f"  Warning saving master CSV: {e}")

def deduplicate(leads, seen):
    fresh, skipped = [], 0
    for l in leads:
        domain  = (l.get("myshopifyDomain") or "").lower().strip()
        website = (l.get("websiteUrl") or "").lower().strip().rstrip("/")
        if (domain and domain in seen) or (website and website in seen):
            skipped += 1
            continue
        fresh.append(l)
    if skipped:
        print(f"  Filtered {skipped} already-seen leads")
    return fresh

# ─────────────────────────────────────────────────────────────────────────────
# FIELD EXTRACTION
# ─────────────────────────────────────────────────────────────────────────────

def sf(val, d=0.0):
    try:    return float(str(val).replace("$","").replace(",","").strip())
    except: return d

def si(val, d=0):
    try:    return int(str(val).replace(",","").strip())
    except: return d

def extract_contacts(item):
    email = (item.get("email") or item.get("contactEmail") or "").strip()
    phone = (item.get("phone") or item.get("phoneNumber") or item.get("telephone") or "").strip()
    contact_url = ""
    for c in (item.get("contacts") or []):
        if not isinstance(c, dict): continue
        ctype = (c.get("type") or "").lower()
        val   = (c.get("value") or c.get("email") or c.get("phone") or c.get("url") or "").strip()
        if not val: continue
        if ctype == "email" or (not ctype and "@" in val):
            if not email: email = val
        elif ctype in ("phone","tel"):
            if not phone: phone = val
        elif (ctype in ("url","website","contact") or val.startswith("http")):
            if not contact_url: contact_url = val
    if not contact_url:
        contact_url = (item.get("contactsPage") or item.get("contactPage") or "").strip()
    return email.strip(), phone.strip(), contact_url.strip()

COUNTRY_MAP = {
    "UNITED STATES":"US","UNITED STATES OF AMERICA":"US","USA":"US","U.S.":"US","U.S.A.":"US",
    "CANADA":"CA","UNITED KINGDOM":"GB","UK":"GB","AUSTRALIA":"AU","NEW ZEALAND":"NZ",
}

def _derive_brand_name(item):
    name = (item.get("name") or item.get("title") or item.get("storeName") or "").strip()
    if name:
        return name
    shop = (item.get("shop_name") or "").replace(".myshopify.com", "").strip()
    if shop:
        return shop.replace("-", " ").title()
    domain = (item.get("store_domain") or item.get("store_url") or "").replace("https://","").replace("http://","").split("/")[0]
    return domain.replace("-"," ").replace("."," ").title().strip()

def extract_lead(item, category):
    addr    = item.get("address") or {}
    if not isinstance(addr, dict): addr = {}
    raw_country = (addr.get("country") or item.get("country") or "").upper().strip()
    country = COUNTRY_MAP.get(raw_country, raw_country)

    state = (addr.get("zone") or addr.get("state") or item.get("zone") or item.get("state") or "").strip()
    city  = (addr.get("city") or item.get("city") or "").strip()

    wdl_reviews = 0
    avg_rpp = sf(item.get("avg_reviews_per_product") or 0)
    n_prods = si(item.get("total_products") or 0)
    if avg_rpp and n_prods:
        wdl_reviews = int(avg_rpp * n_prods)
    reviews = si(item.get("totalProductReviews") or item.get("reviewCount") or item.get("reviews") or 0) or wdl_reviews

    rating = sf(item.get("rating") or item.get("averageRating") or item.get("averageProductRating")
                or item.get("avg_rating") or 0)

    product_price, product_title = 0.0, ""
    sample = item.get("top_products") or item.get("sampleProducts") or item.get("products") or []
    if isinstance(sample, list) and sample:
        first = sample[0] if isinstance(sample[0], dict) else {}
        product_price = sf(first.get("price") or first.get("priceMin") or 0)
        product_title = (first.get("title") or first.get("name") or "").strip()
    if not product_price:
        product_price = sf(item.get("price_avg") or item.get("price_min") or 0)

    email, phone, contact_url = extract_contacts(item)
    if not contact_url:
        contact_url = (item.get("store_url") or "").strip()

    website = (item.get("websiteUrl") or item.get("website") or item.get("url")
               or item.get("store_url") or item.get("store_domain") or "").strip()
    myshopify = (item.get("myshopifyDomain") or item.get("shop_name") or "").strip()

    return {
        "name":            _derive_brand_name(item),
        "websiteUrl":      website,
        "country": country, "state": state, "city": city,
        "reviews": reviews, "rating": rating,
        "product_price": product_price, "product_title": product_title,
        "email": email, "phone": phone, "contact_url": contact_url,
        "myshopifyDomain": myshopify,
        "category": category,
    }

# ─────────────────────────────────────────────────────────────────────────────
# ICP SCORING
# ─────────────────────────────────────────────────────────────────────────────

MISSION_KW = [
    "community","wellness","women","woman","female","minority","family","social","impact",
    "inclusive","natural","organic","holistic","purpose","giving","sustainable","clean",
    "ethical","artisan","craft","handmade","small batch","local","heritage","traditional",
    "black","latina","lgbtq","pride","diverse","veteran","disability","empow",
]
SPORTS_KW  = ["sport","athletic","performance","gym","muscle","protein","bulk","mass",
              "gain","beast","ripped","hardcore","extreme","pre-workout","preworkout"]
DISQ_KW    = ["fresh","frozen","refrigerat","dairy","meat","seafood","hazmat",
              "flammable","pharmaceutical"," rx "]

def score_lead(lead):
    score, breakdown, disqualified, disqualify_reason = 0, [], False, ""

    text_l = (lead["category"] + " " + lead["name"]).lower()
    if any(k in text_l for k in DISQ_KW):
        lead.update({"score":0,"tier":"Disqualified","disqualified":True,
                     "disqualify_reason":"Implies cold chain/hazmat","score_breakdown":["Cold chain/hazmat — disqualified"]})
        return lead

    if lead["country"] == "US":
        score += 25; breakdown.append("US-based: +25")
    else:
        disqualified = True
        disqualify_reason = f"Non-US ({lead['country'] or 'unknown'})"
        breakdown.append(f"{disqualify_reason}: +0")

    r = lead["reviews"]
    pts = 20 if r>=5000 else 15 if r>=1000 else 10 if r>=250 else 5 if r>=100 else 2
    score += pts; breakdown.append(f"Reviews ({r:,}): +{pts}")

    p = lead["product_price"]
    if p <= 0:    pts, lbl = 5,  "unknown"
    elif 25<=p<=75: pts, lbl = 20, f"${p:.2f}"
    elif (15<=p<25) or (76<=p<=100): pts, lbl = 10, f"${p:.2f}"
    else:         pts, lbl = 5,  f"${p:.2f}"
    score += pts; breakdown.append(f"Price ({lbl}): +{pts}")

    if lead["email"]:
        score += 15; breakdown.append("Has email: +15")
    elif lead["phone"]:
        score += 10; breakdown.append("Has phone: +10")
    elif lead["contact_url"]:
        score += 5;  breakdown.append("Has contact URL: +5")
    else:
        breakdown.append("No contact: +0")

    name_cat = (lead["name"] + " " + lead["category"]).lower()
    if any(k in name_cat for k in SPORTS_KW):   m = 2
    elif any(k in name_cat for k in MISSION_KW): m = 10
    else:                                         m = 5
    score += m; breakdown.append(f"Mission alignment: +{m}")

    rat = lead["rating"]
    if rat >= 4.7:   score += 10; breakdown.append(f"Rating ({rat}★): +10")
    elif rat >= 4.4: score += 5;  breakdown.append(f"Rating ({rat}★): +5")
    else:            breakdown.append(f"Rating ({rat or 'N/A'}★): +0")

    if disqualified:          tier = "Disqualified"
    elif score >= 75:         tier = "Tier 1 (Hot)"
    elif score >= 55:         tier = "Tier 2 (Warm)"
    elif score >= 35:         tier = "Tier 3 (Cold)"
    else:
        tier, disqualified = "Disqualified", True
        disqualify_reason = f"Score too low ({score})"

    lead.update({"score":score,"tier":tier,"disqualified":disqualified,
                 "disqualify_reason":disqualify_reason,"score_breakdown":breakdown})
    return lead

# ─────────────────────────────────────────────────────────────────────────────
# CALL ANGLE
# ─────────────────────────────────────────────────────────────────────────────

def get_call_angle(lead):
    cat, tier = lead["category"].lower(), lead["tier"].lower()
    if any(k in cat for k in ("beauty","candle","skincare","fragrance")):
        return "Ask about kitting and custom inserts — beauty brands are obsessed with unboxing"
    if any(k in cat for k in ("supplement","vitamin","mushroom","adaptogen")):
        return "Ask how they handle mis-picks — supplement brands get slammed in reviews for wrong items"
    if any(k in cat for k in ("book","media","subscription box")):
        return "Ask what their current fulfillment timeline looks like and where delays happen"
    if any(k in cat for k in ("baby","infant")):
        return "Lead with accuracy and damage rates — parents have zero tolerance for fulfillment errors"
    if any(k in cat for k in ("faith","spiritual","catholic","christian")):
        return "Ask about their peak season and how their current 3PL handles volume spikes"
    if "pet" in cat:
        return "Ask about return rates — pet owners are vocal and wrong orders hurt reviews fast"
    if "tier 1" in tier:
        if lead["email"]: return "Email first to warm up, then call — ask who owns the fulfillment relationship"
        return "Ask what frustrates them most about their current fulfillment setup"
    if "tier 2" in tier:
        if lead["reviews"] >= 1000:
            return "Reference their scale — ask if their current 3PL can keep up with growth"
        return "Ask about packaging customization — do they have control over their unboxing experience?"
    return "Quick qualifier — confirm monthly order volume and whether they self-fulfill or use a 3PL"

# ─────────────────────────────────────────────────────────────────────────────
# CONTACT SCRAPER — pull email/phone/name from brand website
# ─────────────────────────────────────────────────────────────────────────────

import re as _re

_JUNK_EMAIL_DOMAINS = {
    "example.com","sentry.io","wixpress.com","shopify.com","shopifycdn.com",
    "myshopify.com","klaviyo.com","mailchimp.com","sendgrid.net","amazonaws.com",
    "cloudfront.net","schema.org","w3.org","googletagmanager.com","facebook.com",
    "apple.com","google.com","twitter.com","instagram.com","tiktok.com","youtube.com",
    "gorgias.com","zendesk.com","intercom.io","typeform.com","hubspot.com",
}
_JUNK_EMAIL_LOCAL = _re.compile(
    r'(noreply|no-reply|donotreply|bounce|mailer|postmaster|webmaster|admin|'
    r'unsubscribe|optout|privacy|legal|dmca|abuse)',
    _re.IGNORECASE)
_JUNK_MEDIA_EXT = _re.compile(
    r'\.(png|jpg|jpeg|gif|svg|webp|mp4|mp3|pdf|css|js|woff|ttf|eot|ico|xml|json)$',
    _re.IGNORECASE)

def _valid_email(addr):
    if not addr or "@" not in addr:
        return False
    local, _, domain = addr.partition("@")
    if _JUNK_MEDIA_EXT.search(local) or _JUNK_MEDIA_EXT.search(domain):
        return False
    if domain.lower() in _JUNK_EMAIL_DOMAINS:
        return False
    if _JUNK_EMAIL_LOCAL.search(local):
        return False
    if "." not in domain or len(domain) < 4:
        return False
    if _re.search(r'[@_]\d+x\b|\d+w@|@\dx\b', addr, _re.IGNORECASE):
        return False
    return True

def _format_phone(raw):
    digits = _re.sub(r"\D", "", raw)
    if len(digits) == 11 and digits[0] == "1":
        digits = digits[1:]
    if len(digits) == 10:
        area     = digits[:3]
        exchange = digits[3:6]
        if area[0] in "01" or exchange[0] in "01":
            return ""
        if area in ("000", "555"):
            return ""
        return f"({area}) {exchange}-{digits[6:]}"
    return ""

def _fetch_page(url, timeout=9):
    try:
        req = urllib.request.Request(
            url, headers={"User-Agent": "Mozilla/5.0 (compatible; FHAgent/2)",
                          "Accept": "text/html,application/xhtml+xml"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read(80000).decode("utf-8", errors="replace"), r.url
    except Exception:
        return None, None

def _extract_from_html(raw, email_pat, phone_pat, name_pat):
    email, phone, name = "", "", ""

    meta_content = ""
    meta_tags = _re.findall(r'<meta\s([^>]{0,1000}?)/?>', raw, _re.IGNORECASE | _re.DOTALL)
    for attrs in meta_tags:
        name_m  = _re.search(r'(?:name|property)=["\']([^"\']+)["\']', attrs, _re.IGNORECASE)
        cont_m  = _re.search(r'content=["\']([^"\']{0,800})["\']',       attrs, _re.IGNORECASE)
        if name_m and cont_m:
            tag_name = name_m.group(1).lower().strip()
            if tag_name in ("description", "og:description"):
                meta_content = cont_m.group(1)
                break

    clean_text = _re.sub(r'<[^>]+>', ' ', raw)
    clean_text = _re.sub(r'&nbsp;', ' ', clean_text)
    clean_text = _re.sub(r'[ \t]{2,}', ' ', clean_text)

    for src in [meta_content, clean_text]:
        if email:
            break
        for m in email_pat.finditer(src):
            if _valid_email(m.group()):
                email = m.group()
                break

    if meta_content:
        for m in phone_pat.finditer(meta_content):
            formatted = _format_phone(m.group())
            if formatted:
                phone = formatted
                break

    if not phone:
        tel_m = _re.search(r'href=["\']tel:([\+\d][\d\s\-\.\(\)]{6,17})["\']', raw, _re.IGNORECASE)
        if tel_m:
            formatted = _format_phone(tel_m.group(1))
            if formatted:
                phone = formatted

    if not phone:
        label_hits = _re.findall(
            r'(?:phone|tel|call us|telephone)\s*[:\-]?\s*([\+\(]?\d[\d\s\-\.\(\)]{8,17})',
            clean_text, _re.IGNORECASE)
        for raw_num in label_hits:
            formatted = _format_phone(raw_num)
            if formatted:
                phone = formatted
                break

    m = name_pat.search(clean_text)
    if m:
        candidate = m.group(1).strip()
        junk_words = {"about","contact","support","team","our","the","your",
                      "review","left","us","me","you","this","more","all"}
        if not any(w.lower() in junk_words for w in candidate.split()):
            name = candidate
    return email, phone, name

def _scrape_contact(url):
    if not url:
        return "", "", "", "not found"

    base = url.rstrip("/")

    email_pat = _re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,6}")
    phone_pat = _re.compile(r"(\+?1[\s\-.]?)?\(?\d{3}\)?[\s\-.]?\d{3}[\s\-.]?\d{4}")
    name_pat  = _re.compile(
        r'(?:Founder|Co-Founder|Owner|CEO|President|Director|Head of Ops|COO)\s*[:\-,]?\s*'
        r'([A-Z][a-z]{1,20}\s[A-Z][a-z]{1,20})',
        _re.IGNORECASE)

    subpages = [
        "/pages/contact-us", "/contact", "/contact-us", "/pages/contact",
        "/pages/contact-page", "/pages/about-us", "/about", "/about-us",
        "/pages/about", "/support", "/help",
    ]
    best_email, best_phone, best_name, best_source = "", "", "", ""
    for path in subpages:
        if best_email and best_phone:
            break
        raw, _ = _fetch_page(base + path)
        if not raw:
            continue
        email, phone, name = _extract_from_html(raw, email_pat, phone_pat, name_pat)
        if email and not best_email:
            best_email  = email
            best_source = path
        if phone and not best_phone:
            best_phone  = phone
            if not best_source:
                best_source = path
        if name and not best_name:
            best_name = name

    if best_email and best_phone:
        return best_email, best_phone, best_name, best_source

    raw, _ = _fetch_page(base)
    if raw:
        email, phone, name = _extract_from_html(raw, email_pat, phone_pat, name_pat)
        if email and not best_email:
            best_email  = email
            best_source = best_source or "homepage"
        if phone and not best_phone:
            best_phone  = phone
            best_source = best_source or "homepage"
        if name and not best_name:
            best_name = name

    if best_email or best_phone:
        return best_email, best_phone, best_name, best_source or "homepage"

    return "", "", "", "not found"

# ─────────────────────────────────────────────────────────────────────────────
# ORDER VOLUME ESTIMATE
# ─────────────────────────────────────────────────────────────────────────────

def order_estimate(reviews):
    if reviews >= 10000: return "Est. high volume — confirm capacity fit"
    if reviews >= 2000:  return "Est. 1,500–5,000/mo — strong fit"
    if reviews >= 500:   return "Est. 500–1,500/mo"
    if reviews >= 100:   return "Est. 200–500/mo"
    return "Early stage — likely under 200/mo"

def linkedin_url(brand_name):
    import urllib.parse
    q = urllib.parse.quote_plus(brand_name)
    return f"https://www.linkedin.com/search/results/companies/?keywords={q}"

def enrich_lead(lead):
    site = lead.get("websiteUrl") or lead.get("contact_url") or ""
    scraped_email, scraped_phone, scraped_name, source = "", "", "", "not found"
    if site:
        scraped_email, scraped_phone, scraped_name, source = _scrape_contact(site)

    if lead.get("email") and not scraped_email:
        source = "apify data"

    lead["scraped_email"]    = scraped_email
    lead["scraped_phone"]    = scraped_phone
    lead["contact_name"]     = scraped_name
    lead["contact_source"]   = source
    lead["order_estimate"]   = order_estimate(lead.get("reviews", 0))
    lead["linkedin_url"]     = linkedin_url(lead["name"])
    lead["fulfillment_hint"] = "Unknown — ask on call"
    return lead

# ─────────────────────────────────────────────────────────────────────────────
# HTML CHEAT SHEET  (dialer-ready card grid)
# ─────────────────────────────────────────────────────────────────────────────

TC = {"1":"#c0392b","2":"#d68910","3":"#2471a3","D":"#95a5a6"}
TB = {"1":"#fff8f8","2":"#fffbf0","3":"#f0f7ff","D":"#f8f9fa"}
PRIORITY_LABEL = {"1":"HOT","2":"WARM","3":"COLD","D":"—"}

def tk(t):
    if "1" in t: return "1"
    if "2" in t: return "2"
    if "3" in t: return "3"
    return "D"

def tc(t): return TC[tk(t)]
def tb(t): return TB[tk(t)]
def he(s): return str(s).replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace('"',"&quot;")

def _best_email(lead):
    return lead.get("email") or lead.get("scraped_email") or ""

def _best_phone(lead):
    return lead.get("phone") or lead.get("scraped_phone") or ""

def build_html(all_leads, sorted_leads, disqualified, total_pulled):
    t1  = sum(1 for l in sorted_leads if "1" in l["tier"])
    avg = round(sum(l["score"] for l in sorted_leads)/len(sorted_leads)) if sorted_leads else 0
    dq  = len(disqualified)

    cards_html = ""
    for i, lead in enumerate(sorted_leads, 1):
        tkey   = tk(lead["tier"])
        color  = TC[tkey]
        bg     = TB[tkey]
        badge  = PRIORITY_LABEL[tkey]
        email  = he(_best_email(lead))
        phone  = he(_best_phone(lead))
        cname  = he(lead.get("contact_name") or "")
        site   = he(lead.get("websiteUrl") or lead.get("contact_url") or "")
        li_url = he(lead.get("linkedin_url",""))
        price  = f"${lead['product_price']:.2f}" if lead["product_price"] > 0 else "—"
        rating = f"{lead['rating']}★" if lead["rating"] else "—"
        top_prod = he(lead.get("product_title") or "—")
        est    = he(lead.get("order_estimate","—"))
        angle  = he(lead.get("call_angle",""))
        status_id = f"status_{i}"
        notes_id  = f"notes_{i}"

        src    = lead.get("contact_source", "not found")
        src_color = ("#27ae60" if src not in ("not found","") and src != "homepage"
                     else "#e67e22" if src == "homepage"
                     else "#bbb")
        src_badge = f'<span class="src-badge" style="background:{src_color}" title="Contact found on {src}">{he(src)}</span>'

        contact_row = f'<div class="cf src-row"><span class="cl">Source</span><span class="cv">{src_badge}</span></div>'
        if cname:
            contact_row += f'<div class="cf"><span class="cl">Name</span><span class="cv">{cname}</span></div>'
        if email:
            contact_row += f'<div class="cf"><span class="cl">Email</span><span class="cv"><a href="mailto:{email}">{email}</a> <button class="copy-btn" onclick="copyText(\'{email}\',this)" title="Copy email">Copy</button></span></div>'
        else:
            contact_row += f'<div class="cf"><span class="cl">Email</span><span class="cv not-found">Not found &mdash; <a href="{li_url}" target="_blank">check LinkedIn</a></span></div>'
        if phone:
            contact_row += f'<div class="cf"><span class="cl">Phone</span><span class="cv">{phone} <button class="copy-btn" onclick="copyText(\'{phone}\',this)" title="Copy phone">Copy</button></span></div>'
        if site:
            contact_row += f'<div class="cf"><span class="cl">Website</span><span class="cv"><a href="{site}" target="_blank">{site[:45]}{"..." if len(site)>45 else ""}</a></span></div>'
        if li_url:
            contact_row += f'<div class="cf"><span class="cl">LinkedIn</span><span class="cv"><a href="{li_url}" target="_blank">Search LinkedIn</a></span></div>'

        cards_html += f"""
<div class="card" style="border-top:4px solid {color};background:{bg}" id="card_{i}">
  <div class="card-hdr">
    <div class="card-left">
      <span class="priority-dot" style="background:{color}">{badge}</span>
      <span class="rank">#{i}</span>
      <span class="brand-name">{he(lead['name'])}</span>
    </div>
    <div class="card-right">
      <span class="score-badge" style="color:{color}">{lead['score']}/100</span>
    </div>
  </div>
  <div class="card-meta">{he(lead['category'])}</div>
  <div class="card-body">
    <div class="field-group">
      {contact_row}
    </div>
    <div class="divider"></div>
    <div class="field-group">
      <div class="cf"><span class="cl">Top Product</span><span class="cv">{top_prod} &nbsp;{rating}</span></div>
      <div class="cf"><span class="cl">Price Point</span><span class="cv">{price}</span></div>
      <div class="cf"><span class="cl">Est. Orders/mo</span><span class="cv est">{est}</span></div>
      <div class="cf"><span class="cl">Fulfillment</span><span class="cv not-found">{he(lead.get('fulfillment_hint','Unknown — ask on call'))}</span></div>
    </div>
    <div class="divider"></div>
    <div class="angle-box">
      <span class="angle-label">CALL ANGLE</span>
      <span class="angle-text">{angle}</span>
    </div>
    <div class="status-row">
      <select class="status-sel" id="{status_id}" onchange="saveState('{status_id}',this.value)">
        <option value="">-- Status --</option>
        <option value="not_called">Not Called</option>
        <option value="left_vm">Left VM</option>
        <option value="callback">Callback Scheduled</option>
        <option value="not_interested">Not Interested</option>
        <option value="signed">Signed!</option>
      </select>
    </div>
    <textarea class="notes-box" id="{notes_id}" placeholder="Notes..." onchange="saveState('{notes_id}',this.value)" rows="2"></textarea>
  </div>
</div>"""

    drows = "".join(
        f"<tr><td>{he(l['name'])}</td><td>{he(l['category'])}</td><td>{he(l['country'] or '?')}</td>"
        f"<td>{l['score']}</td><td style='color:#c0392b'>{he(l.get('disqualify_reason',''))}</td></tr>"
        for l in sorted(disqualified, key=lambda x: -x["score"])
    )

    csv_rows = []
    for lead in sorted_leads:
        row = [
            lead['name'], lead['category'], lead.get('state',''), lead.get('country','US'),
            str(lead['score']), lead['tier'],
            _best_email(lead), _best_phone(lead), lead.get('contact_name',''),
            lead.get('websiteUrl',''), lead.get('linkedin_url',''),
            lead.get('product_title',''), str(lead.get('product_price',0)),
            str(lead.get('reviews',0)), str(lead.get('rating',0)),
            lead.get('order_estimate',''), lead.get('call_angle','')
        ]
        csv_rows.append('","'.join(he(str(v)) for v in row))
    csv_header = "Name,Category,State,Country,Score,Tier,Email,Phone,Contact Name,Website,LinkedIn,Top Product,Price,Reviews,Rating,Est Orders/mo,Call Angle"
    csv_data   = csv_header + "\n" + "\n".join(f'"{r}"' for r in csv_rows)

    return f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FH Leads — Week of {WEEK_LABEL}</title>
<style>
*{{box-sizing:border-box;margin:0;padding:0}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#eef1f5;color:#1a2533;font-size:13px}}
.hdr{{background:linear-gradient(135deg,#0f2d52,#1a5296);color:#fff;padding:20px 28px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px}}
.hdr h1{{font-size:20px;font-weight:700}}.hdr-sub{{font-size:12px;opacity:.7;margin-top:3px}}
.hdr-actions{{display:flex;gap:10px}}
.btn{{background:rgba(255,255,255,.18);color:#fff;border:1px solid rgba(255,255,255,.3);padding:7px 16px;border-radius:7px;cursor:pointer;font-size:12px;font-weight:600}}
.btn:hover{{background:rgba(255,255,255,.3)}}
.btn-csv{{background:#27ae60;border-color:#27ae60}}
.metrics{{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;padding:16px 28px;background:#fff;border-bottom:1px solid #dde2ea}}
.mc{{background:#f5f7fa;border-radius:8px;padding:12px 16px;text-align:center}}
.mv{{font-size:28px;font-weight:800;color:#0f2d52;line-height:1}}
.ml{{font-size:10px;color:#7f8c8d;margin-top:4px;text-transform:uppercase;letter-spacing:.5px}}
.tabs{{display:flex;background:#fff;border-bottom:2px solid #dde2ea;padding:0 28px}}
.tab{{padding:11px 16px;cursor:pointer;font-size:12px;font-weight:600;color:#7f8c8d;border-bottom:3px solid transparent;margin-bottom:-2px;white-space:nowrap}}
.tab.active{{color:#0f2d52;border-bottom-color:#1a5296}}.tab:hover{{color:#1a5296}}
.tp{{display:none;padding:20px 28px}}.tp.active{{display:block}}
.card-grid{{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}}
@media(max-width:700px){{.card-grid{{grid-template-columns:1fr}}.metrics{{grid-template-columns:repeat(2,1fr)}}}}
.card{{background:#fff;border-radius:10px;box-shadow:0 1px 6px rgba(0,0,0,.08);overflow:hidden}}
.card-hdr{{display:flex;justify-content:space-between;align-items:center;padding:11px 14px 7px;gap:8px}}
.card-left{{display:flex;align-items:center;gap:7px;min-width:0}}
.priority-dot{{font-size:9px;font-weight:800;padding:2px 7px;border-radius:10px;color:#fff;white-space:nowrap;flex-shrink:0}}
.rank{{font-size:11px;color:#aaa;flex-shrink:0}}
.brand-name{{font-size:14px;font-weight:700;color:#0f2d52;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}
.card-right{{flex-shrink:0}}
.score-badge{{font-size:15px;font-weight:800}}
.card-meta{{font-size:11px;color:#888;padding:0 14px 8px}}
.card-body{{padding:0 14px 12px}}
.field-group{{margin-bottom:4px}}
.cf{{display:flex;align-items:baseline;gap:6px;padding:3px 0;border-bottom:1px solid #f3f4f6}}
.cf:last-child{{border-bottom:none}}
.cl{{font-size:10px;color:#999;font-weight:600;text-transform:uppercase;min-width:90px;flex-shrink:0}}
.cv{{font-size:12px;color:#2c3e50;word-break:break-word}}.cv a{{color:#1a5296;text-decoration:none}}
.cv a:hover{{text-decoration:underline}}
.not-found{{color:#aaa;font-style:italic}}
.est{{color:#27ae60;font-weight:600}}
.divider{{height:1px;background:#eef1f5;margin:8px 0}}
.angle-box{{background:#f0f7ff;border-left:3px solid #1a5296;border-radius:0 6px 6px 0;padding:8px 10px;margin-bottom:8px}}
.angle-label{{font-size:9px;font-weight:800;color:#1a5296;text-transform:uppercase;letter-spacing:.5px;display:block;margin-bottom:3px}}
.angle-text{{font-size:12px;color:#1a2533;line-height:1.4}}
.status-row{{margin-bottom:6px}}
.status-sel{{width:100%;padding:5px 8px;border:1px solid #dde2ea;border-radius:6px;font-size:12px;background:#fff;color:#2c3e50;cursor:pointer}}
.notes-box{{width:100%;padding:5px 8px;border:1px solid #dde2ea;border-radius:6px;font-size:11px;color:#555;resize:vertical;font-family:inherit}}
.copy-btn{{background:#e8f0fe;color:#1a5296;border:none;border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700;cursor:pointer;margin-left:6px;vertical-align:middle;transition:background .15s}}
.copy-btn:hover{{background:#1a5296;color:#fff}}
.copy-btn.copied{{background:#27ae60;color:#fff}}
.src-badge{{font-size:9px;font-weight:700;color:#fff;padding:2px 7px;border-radius:8px;text-transform:lowercase;letter-spacing:.3px}}
.src-row{{border-bottom:1px dashed #eee!important}}
.tbl-wrap{{background:#fff;border-radius:10px;overflow:auto;box-shadow:0 1px 4px rgba(0,0,0,.07)}}
table{{width:100%;border-collapse:collapse}}
th{{background:#0f2d52;color:#fff;padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;white-space:nowrap}}
td{{padding:8px 12px;font-size:12px;border-bottom:1px solid #f0f2f5;vertical-align:top}}
.footer{{text-align:center;padding:14px;color:#bbb;font-size:11px;background:#fff;margin-top:24px;border-top:1px solid #eee}}
@media print{{
  .hdr-actions,.tabs,.status-row,.notes-box{{display:none!important}}
  .tp{{display:block!important}}body{{background:#fff}}
  .hdr{{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  .card{{break-inside:avoid;box-shadow:none;border:1px solid #ddd}}
}}
</style></head><body>
<div class="hdr">
  <div><h1>FH Lead Cheat Sheet</h1><div class="hdr-sub">Week of {WEEK_LABEL} &nbsp;·&nbsp; {len(sorted_leads)} leads</div></div>
  <div class="hdr-actions">
    <button class="btn btn-csv" onclick="exportCSV()">Export CSV</button>
    <button class="btn" onclick="window.print()">Print</button>
  </div>
</div>
<div class="metrics">
  <div class="mc"><div class="mv">{total_pulled}</div><div class="ml">Leads pulled</div></div>
  <div class="mc"><div class="mv" style="color:#c0392b">{t1}</div><div class="ml">Hot leads</div></div>
  <div class="mc"><div class="mv" style="color:#27ae60">{avg}</div><div class="ml">Avg score</div></div>
  <div class="mc"><div class="mv" style="color:#95a5a6">{dq}</div><div class="ml">Disqualified</div></div>
</div>
<div class="tabs">
  <div class="tab active" onclick="showTab('leads',this)">Lead List ({len(sorted_leads)})</div>
  <div class="tab" onclick="showTab('disq',this)">Disqualified ({dq})</div>
</div>
<div id="tp-leads" class="tp active"><div class="card-grid">{cards_html}</div></div>
<div id="tp-disq" class="tp"><div class="tbl-wrap"><table><thead><tr><th>Brand</th><th>Category</th><th>Country</th><th>Score</th><th>Reason</th></tr></thead><tbody>{drows}</tbody></table></div></div>
<div class="footer">Fulfillment House Lead Agent &nbsp;·&nbsp; Week of {WEEK_LABEL}</div>
<script>
const CSV_DATA = {json.dumps(csv_data)};
function showTab(n,el){{
  document.querySelectorAll('.tp').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tp-'+n).classList.add('active');
  el.classList.add('active');
}}
function saveState(id,val){{
  try{{localStorage.setItem('fh_'+id,val);}}catch(e){{}}
}}
function loadState(){{
  document.querySelectorAll('.status-sel,.notes-box').forEach(el=>{{
    const v=localStorage.getItem('fh_'+el.id);
    if(v!==null)el.value=v;
  }});
}}
function exportCSV(){{
  const blob=new Blob([CSV_DATA],{{type:'text/csv'}});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='fh_leads_{WEEK_LABEL.replace(" ","_").replace(",","")}.csv';
  a.click();
}}
function copyText(text,btn){{
  navigator.clipboard.writeText(text).then(()=>{{
    btn.textContent='Copied!';btn.classList.add('copied');
    setTimeout(()=>{{btn.textContent='Copy';btn.classList.remove('copied');}},1500);
  }}).catch(()=>{{
    const ta=document.createElement('textarea');ta.value=text;
    document.body.appendChild(ta);ta.select();document.execCommand('copy');
    document.body.removeChild(ta);
    btn.textContent='Copied!';btn.classList.add('copied');
    setTimeout(()=>{{btn.textContent='Copy';btn.classList.remove('copied');}},1500);
  }});
}}
window.onload=loadState;
</script></body></html>"""

# ─────────────────────────────────────────────────────────────────────────────
# EMAIL
# ─────────────────────────────────────────────────────────────────────────────

def build_email_html(sorted_leads):
    cards = ""
    for i, lead in enumerate(sorted_leads, 1):
        tkey  = tk(lead["tier"])
        color = TC[tkey]
        badge = PRIORITY_LABEL[tkey]
        email = _best_email(lead)
        phone = _best_phone(lead)
        cname = lead.get("contact_name","")
        site  = lead.get("websiteUrl") or lead.get("contact_url","")
        li    = lead.get("linkedin_url","")
        price = f"${lead['product_price']:.2f}" if lead["product_price"] > 0 else "—"
        rating = f"{lead['rating']}* " if lead["rating"] else ""
        est   = lead.get("order_estimate","—")
        angle = lead.get("call_angle","")
        top_prod = lead.get("product_title","—")

        contact_rows = ""
        if cname:
            contact_rows += f'<tr><td style="font-size:11px;color:#999;padding:2px 10px 2px 0;white-space:nowrap;font-weight:600">NAME</td><td style="font-size:12px;color:#1a2533;padding:2px 0">{he(cname)}</td></tr>'
        if email:
            contact_rows += f'<tr><td style="font-size:11px;color:#999;padding:2px 10px 2px 0;white-space:nowrap;font-weight:600">EMAIL</td><td style="font-size:12px;padding:2px 0"><a href="mailto:{he(email)}" style="color:#1a5296">{he(email)}</a></td></tr>'
        else:
            contact_rows += f'<tr><td style="font-size:11px;color:#999;padding:2px 10px 2px 0;font-weight:600">EMAIL</td><td style="font-size:12px;color:#aaa;font-style:italic;padding:2px 0">Not found — <a href="{he(li)}" style="color:#1a5296">check LinkedIn</a></td></tr>'
        if phone:
            contact_rows += f'<tr><td style="font-size:11px;color:#999;padding:2px 10px 2px 0;font-weight:600">PHONE</td><td style="font-size:12px;color:#1a2533;padding:2px 0">{he(phone)}</td></tr>'
        if site:
            contact_rows += f'<tr><td style="font-size:11px;color:#999;padding:2px 10px 2px 0;font-weight:600">WEB</td><td style="font-size:12px;padding:2px 0"><a href="{he(site)}" style="color:#1a5296">{he(site[:45])}{"..." if len(site)>45 else ""}</a></td></tr>'

        cards += f"""
<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:14px;border-radius:8px;overflow:hidden;border:1px solid #e0e4ea;border-top:4px solid {color}">
<tr><td style="padding:12px 16px;background:#fff">
  <table width="100%" cellpadding="0" cellspacing="0"><tr>
    <td><span style="background:{color};color:#fff;font-size:9px;font-weight:800;padding:2px 8px;border-radius:8px">{badge}</span>&nbsp;&nbsp;<span style="font-size:14px;font-weight:bold;color:#0f2d52">#{i} {he(lead['name'])}</span></td>
    <td align="right" style="font-size:14px;font-weight:800;color:{color}">{lead['score']}/100</td>
  </tr></table>
  <div style="font-size:11px;color:#999;margin:3px 0 10px">{he(lead['category'])} &nbsp;|&nbsp; {he(lead.get('state') or lead.get('country','US'))}</div>
  <table cellpadding="0" cellspacing="0" style="margin-bottom:10px;width:100%">{contact_rows}</table>
  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;border-top:1px solid #f0f2f5;padding-top:8px">
    <tr>
      <td style="font-size:11px;color:#999;padding:2px 10px 2px 0;font-weight:600;white-space:nowrap">TOP PRODUCT</td>
      <td style="font-size:12px;color:#1a2533">{he(top_prod)} &nbsp;{he(rating)}</td>
    </tr>
    <tr>
      <td style="font-size:11px;color:#999;padding:2px 10px 2px 0;font-weight:600">EST. ORDERS/MO</td>
      <td style="font-size:12px;color:#27ae60;font-weight:600">{he(est)}</td>
    </tr>
    <tr>
      <td style="font-size:11px;color:#999;padding:2px 10px 2px 0;font-weight:600">PRICE POINT</td>
      <td style="font-size:12px;color:#1a2533">{price}</td>
    </tr>
  </table>
  <div style="background:#f0f7ff;border-left:3px solid #1a5296;padding:8px 10px;border-radius:0 6px 6px 0">
    <div style="font-size:9px;font-weight:800;color:#1a5296;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px">CALL ANGLE</div>
    <div style="font-size:12px;color:#1a2533;line-height:1.5">{he(angle)}</div>
  </div>
</td></tr></table>"""

    return f"""<html><body style="font-family:Arial,Helvetica,sans-serif;background:#eef1f5;margin:0;padding:0">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:16px 0;background:#eef1f5"><tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
<tr><td style="background:linear-gradient(135deg,#0f2d52,#1a5296);padding:20px 24px">
  <div style="font-size:18px;font-weight:bold;color:#fff">FH Lead Cheat Sheet</div>
  <div style="font-size:12px;color:rgba(255,255,255,.7);margin-top:4px">Week of {WEEK_LABEL} &nbsp;·&nbsp; {len(sorted_leads)} leads &nbsp;·&nbsp; Open the attached HTML for status tracking &amp; CSV export</div>
</td></tr>
<tr><td style="padding:20px 24px">{cards}</td></tr>
<tr><td style="padding:12px 24px;background:#f8f9fa;border-top:1px solid #eee;font-size:11px;color:#aaa;text-align:center">
  Fulfillment House Lead Agent &nbsp;·&nbsp; Week of {WEEK_LABEL}
</td></tr>
</table></td></tr></table></body></html>"""


def send_email(subject, html_body, html_path):
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from email.mime.base import MIMEBase
    from email import encoders

    if not EMAIL_PASSWORD:
        print("  WARNING: SMTP_PASS not set in config.env — saving email preview instead")
        _save_email_preview(html_body)
        return False

    try:
        msg = MIMEMultipart("mixed")
        msg["From"]    = ORGANIZER_EMAIL
        msg["To"]      = EMAIL_TO
        msg["Subject"] = subject
        msg.attach(MIMEText(html_body, "html"))

        with open(html_path, "rb") as f:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(f.read())
            encoders.encode_base64(part)
            part.add_header("Content-Disposition",
                            f"attachment; filename={html_path.name}")
            msg.attach(part)

        with smtplib.SMTP("smtp.office365.com", 587) as server:
            server.ehlo()
            server.starttls()
            server.login(ORGANIZER_EMAIL, EMAIL_PASSWORD)
            server.sendmail(ORGANIZER_EMAIL, EMAIL_TO, msg.as_string())

        print(f"  OK Email sent to {EMAIL_TO} via M365")
        return True

    except smtplib.SMTPAuthenticationError:
        print("  FAIL Authentication failed — check your password in config.env.")
        print("    If MFA is on, generate an App Password at account.microsoft.com")
        print("    Security > Advanced security options > App passwords")
    except Exception as e:
        print(f"  FAIL Email error: {e}")

    _save_email_preview(html_body)
    return False


def _save_email_preview(html_body):
    fallback = WEEK_FOLDER / "email_preview.html"
    fallback.write_text(html_body, encoding="utf-8")
    print(f"  OK Email preview saved: {fallback.name}")

# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main():
    print()
    print("=" * 62)
    print("  FULFILLMENT HOUSE — LEAD SCORING AGENT v2")
    print(f"  Week of {WEEK_LABEL}")
    print("=" * 62)

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    WEEK_FOLDER.mkdir(parents=True, exist_ok=True)
    print(f"\n  Output: {WEEK_FOLDER.resolve()}\n")

    this_weeks_cats, cat_idx = get_this_weeks_categories()
    print(f"SOURCE — Reading {len(STATIC_DATASETS)} static Apify datasets (free, no actor runs)")
    print(f"ROTATION — Categories in pool this week:")
    for c in this_weeks_cats:
        print(f"  - {c['name']}")
    print()

    print("STEP 1 — Fetching leads from Apify datasets...")
    raw = scrape_categories()
    print(f"\n  Raw items fetched: {len(raw)}")

    print("\nSTEP 2 — Extracting fields...")
    leads = [extract_lead(item, item.get("_category","Unknown")) for item in raw]

    print("\nSTEP 3 — Deduplicating...")
    seen  = load_seen()
    print(f"  {len(seen)} known identifiers in master list")
    leads = deduplicate(leads, seen)

    print("\nSTEP 4 — Scoring against ICP...")
    leads        = [score_lead(l) for l in leads]
    qualified    = sorted([l for l in leads if not l["disqualified"]], key=lambda x:-x["score"])
    disqualified = [l for l in leads if l["disqualified"]]
    print(f"  Qualified: {len(qualified)}  |  Disqualified: {len(disqualified)}")

    if len(qualified) < 25:
        print(f"  WARNING: Only {len(qualified)} qualified leads — partial week.")

    top25 = qualified[:25]

    print("\nSTEP 5 — Scraping contact info and enriching leads...")
    for i, lead in enumerate(top25, 1):
        lead["call_angle"] = get_call_angle(lead)
        enrich_lead(lead)
        src    = lead.get('contact_source', 'not found')
        got_e  = 'yes' if (_best_email(lead))  else 'no'
        got_p  = 'yes' if (_best_phone(lead))  else 'no'
        got_n  = lead.get('contact_name') or '—'
        print(f"  [{i:2d}/{len(top25)}] {lead['name'][:30]:<30} "
              f"email={got_e}  phone={got_p}  name={got_n}  src={src}")

    print("\nSTEP 6 — Building flat lead list...")
    sorted_leads = sorted(top25, key=lambda x: -x["score"])
    for i, lead in enumerate(sorted_leads, 1):
        print(f"  {i:2d}. [{lead['score']:3d}] {lead['tier']:<18} {lead['name']}")

    print("\nSTEP 7 — Generating HTML cheat sheet...")
    html      = build_html(leads, sorted_leads, disqualified, len(raw))
    html_path = WEEK_FOLDER / "call_schedule.html"
    html_path.write_text(html, encoding="utf-8")
    print(f"  OK {html_path.name}")

    print("\nSTEP 8 — Sending email...")
    email_html = build_email_html(sorted_leads)
    subject    = f"FH Leads — Week of {WEEK_LABEL} ({len(top25)} leads)"
    send_email(subject, email_html, html_path)

    print("\nSTEP 9 — Updating master seen-leads list...")
    save_to_master(top25)

    save_rotation_state(cat_idx + CATEGORIES_PER_WEEK, 0)
    next_cats = [ALL_CATEGORIES[(cat_idx + CATEGORIES_PER_WEEK + i) % len(ALL_CATEGORIES)]["name"]
                 for i in range(CATEGORIES_PER_WEEK)]
    print(f"\n  Next Monday's categories: {', '.join(next_cats)}")

    print("\n" + "=" * 62)
    print(f"  TOP {len(top25)} LEADS")
    print("=" * 62)
    for i, lead in enumerate(top25, 1):
        cf = "E" if lead["email"] else ("P" if lead["phone"] else "-")
        print(f"  {i:2d}. [{lead['score']:3d}]  {lead['tier']:<18}  {cf}  {lead['name']}")

    print(f"\n  {WEEK_FOLDER.resolve()}\n  Done.\n")
    webbrowser.open(html_path.resolve().as_uri())


if __name__ == "__main__":
    main()
