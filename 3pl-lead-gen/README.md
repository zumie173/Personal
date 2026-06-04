# Fulfillment House — 3PL Lead Generator

Apify-powered weekly lead generation for Fulfillment House (Kansas City, MO non-profit 3PL).
Targets DTC/eCommerce brands that are ideal fulfillment clients.
Goal: 25 qualified leads per week.

---

## Quick Setup

### 1. Install dependencies
```bash
pip install openpyxl requests
```

### 2. Configure credentials
```bash
cp config.example.env config.env
# Edit config.env with your Apify token and SMTP email settings
```

### 3. Test it manually
```bash
python scripts/weekly_run.py --dry-run --no-email
# Or run for real:
python scripts/weekly_run.py
```

### 4. Schedule it (every Monday at 7am)
```bash
crontab -e
# Add this line:
0 7 * * 1 cd /path/to/3pl-lead-gen && python scripts/weekly_run.py >> output/cron.log 2>&1
```

---

## How It Works

Each Monday the script:
1. Picks the next keyword from the rotation (books → supplements → beauty accessories → candles → subscription box → pet supplies → baby products → repeat)
2. Runs the Apify `clearpath/shopify-store-leads` actor for that keyword (max 150 results)
3. Parses + deduplicates the results
4. Scores each lead (0–5 points): website (+1), email (+2), phone (+1), rating 4.0+ (+1)
5. Builds a formatted Excel file with qualified leads (score 3+) sorted to the top in blue
6. Emails you the Excel as an attachment

---

## Lead Scoring

| Points | Field |
|---|---|
| +1 | Has a website |
| +2 | Has an email address |
| +1 | Has a phone number |
| +1 | Google rating 4.0 or higher |

**Score 3+ = Qualified** (highlighted blue, sorted to top of spreadsheet)

Typically 25–50 qualified leads per run of 150 scraped.

---

## Keyword Rotation (one per week)

1. `books` — independent publishers, book boxes
2. `supplements` — wellness, vitamins, protein
3. `beauty accessories` — skincare tools, cosmetics
4. `candles` — home goods
5. `subscription box` — curated monthly boxes
6. `pet supplies` — treats, accessories
7. `baby products` — small packaged goods

Full cycle = 7 weeks. Run state is tracked in `output/.keyword_state.json`.

---

## Manual Usage

```bash
# Run for a specific keyword
python scripts/weekly_run.py --keyword "supplements"

# Run without sending email
python scripts/weekly_run.py --no-email

# Test with a dry run (uses existing raw JSON if present)
python scripts/weekly_run.py --dry-run

# Parse raw JSON manually
python scripts/parse_leads.py output/raw_shopify_books.json output/cleaned_shopify_books.csv

# Build Excel from one or more CSVs
python scripts/build_excel.py output/cleaned_shopify_books.csv output/leads_shopify_books.xlsx

# Merge multiple CSVs into one master list
python scripts/build_excel.py output/cleaned_shopify_books.csv output/cleaned_shopify_supplements.csv output/leads_master.xlsx
```

---

## Apify Credit Management

- Free tier: ~$5/month
- Each run: ~$0.50–1.00 (150 results from Shopify actor)
- 4 runs/month = ~$2–4 total → safely within free tier
- Raw JSON files are saved so you never need to re-scrape

---

## Project Structure

```
3pl-lead-gen/
├── README.md
├── config.example.env      # Template — copy to config.env and fill in
├── config.env              # Your real credentials (gitignored)
├── scripts/
│   ├── weekly_run.py       # Main orchestrator (run this on a cron)
│   ├── parse_leads.py      # Parse Apify JSON → clean CSV
│   └── build_excel.py      # Build formatted Excel from CSV(s)
└── output/                 # All data goes here (gitignored)
    ├── .keyword_state.json # Tracks rotation state
    ├── raw_*.json          # Raw Apify output
    ├── cleaned_*.csv       # Parsed + deduped leads
    └── leads_*.xlsx        # Final formatted Excel files
```

---

## SMTP Setup by Provider

| Provider | SMTP Host | Port |
|---|---|---|
| Office 365 / Outlook | smtp.office365.com | 587 |
| Gmail | smtp.gmail.com | 587 |
| Yahoo | smtp.mail.yahoo.com | 587 |

For Gmail: use an [App Password](https://myaccount.google.com/apppasswords) (not your main password).
For Office 365: your regular password usually works, or use an app password if MFA is enabled.
