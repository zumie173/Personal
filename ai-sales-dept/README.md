# TFH AI Sales Department — Phase 1

End-to-end lead generation pipeline for The Fulfillment House.

```
Shopify Scraper → Duplicate Detection → Data Quality → Lead Qualifier → CRM (Google Sheets)
```

---

## Setup (15 minutes)

### 1. Install dependencies
```bash
cd ai-sales-dept
pip install -r requirements.txt
```

### 2. Configure credentials
```bash
cp .env.example .env
# Edit .env with your keys (see each step below)
```

### 3. Get your API keys

**Anthropic (Claude):**
- Go to console.anthropic.com → API Keys → Create Key
- Add to `.env`: `ANTHROPIC_API_KEY=sk-ant-...`

**Apify:**
- Go to console.apify.com → Settings → Integrations → API token
- Add to `.env`: `APIFY_API_TOKEN=apify_api_...`

**Google Sheets:**
1. Go to console.cloud.google.com
2. Create a project → Enable Google Sheets API + Google Drive API
3. Create a Service Account → download JSON key file
4. Create a new Google Spreadsheet
5. Share the spreadsheet with the service account email (Editor access)
6. Add to `.env`:
   ```
   GOOGLE_SHEETS_CREDENTIALS_JSON=/path/to/downloaded-key.json
   GOOGLE_SHEETS_SPREADSHEET_ID=<id from spreadsheet URL>
   ```

---

## Running the Pipeline

### Import from Apollo CSV (recommended first run)
```bash
# Run the full pipeline on an Apollo export
python pipeline.py --import-file data/sample_leads.csv

# Or use the standalone import script
python scripts/import_apollo.py data/sample_leads.csv --run-pipeline
```

### Dry run (built-in synthetic leads — no credentials needed except Anthropic + Sheets)
```bash
python pipeline.py --dry-run
```

### Full Shopify scrape via Apify
```bash
python pipeline.py --queries "subscription box" "book publisher" --max 150
```

---

## What Each Run Produces

| Output | Location |
|---|---|
| All leads with scores | Google Sheets → "Leads" tab |
| Hot leads only | Google Sheets → "Hot Leads" tab |
| Pipeline run summary | Google Sheets → "Pipeline Log" tab |
| Full audit trail | `data/tfh_sales.db` (SQLite) |
| Console report | Terminal output |

---

## Lead Scoring

| Score | Category | Action |
|---|---|---|
| ICP ≥ 75 | 🔥 Hot | Immediate outreach (Phase 3) |
| ICP 40–74 | 🟡 Warm | Monitor, nurture |
| ICP < 40 | 🔵 Cold | Archive |

**ICP score** = fit against Fulfillment House ICP (order volume, SKU count, product type, geography)  
**Confidence score** = how much real data supported the ICP score (vs. inference)

---

## Phase 2 Readiness (when 100 leads process without errors)

The pipeline is designed so Phase 2 agents (WooCommerce scraper, TikTok shop scraper,
Research agent, Contact Discovery) plug in as new agent files with zero changes to
the existing pipeline flow.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `ANTHROPIC_API_KEY not set` | Check `.env` file exists in `ai-sales-dept/` |
| Google Sheets 403 error | Make sure spreadsheet is shared with the service account email |
| Apify actor timeout | Reduce `--max` results or increase `timeout_secs` in `apify_client.py` |
| All leads rejected | Lower `REJECTION_THRESHOLD` in `data_quality.py` (default: 30) |
| Duplicate domain constraint | Expected for re-runs — existing domains are skipped |
