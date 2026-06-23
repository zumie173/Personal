# Agent Architecture — AI Sales Department

## Core Design Principle

All agents share one database. No agent calls another agent directly.
The Sales Manager reads the task queue, dispatches work, and interprets results.
Every agent writes its output back to the database and marks its task complete.

---

## Agent Registry

### 1. Sales Manager Agent
**Role:** Orchestrator  
**Trigger:** Cron (every 15 min) or webhook  
**Reads:** `task_queue` WHERE `status = 'pending'`  
**Writes:** New tasks into `task_queue` for downstream agents  
**LLM:** Claude Opus 4.8 — decides priority, resolves conflicts, generates daily digest  
**Key Responsibilities:**
- Polls queue; dispatches tasks to the correct worker
- Escalates stalled tasks (>2h with no update)
- Generates a daily briefing: top 10 hot leads, pipeline health, agent errors
- Re-queues failed tasks with exponential backoff (max 3 retries)

---

### 2. Shopify Scraper Agent
**Role:** Lead Acquisition  
**Trigger:** Sales Manager dispatch (daily batch)  
**Tool:** Apify — `apify/shopify-scraper` actor  
**Writes:** Raw lead records into `leads` table (status = `raw`)  
**Inputs:** Keyword lists, niche categories, target Shopify store criteria  
**Output fields:** store_url, store_name, product_categories, estimated_sku_count, app_detected_platform  

---

### 3. WooCommerce Scraper Agent
**Role:** Lead Acquisition  
**Trigger:** Sales Manager dispatch (daily batch)  
**Tool:** Apify — `apify/web-scraper` (custom WooCommerce actor)  
**Writes:** Raw lead records into `leads` table  
**Notes:** Uses WooCommerce REST API detection heuristics (`/wp-json/wc/v3/products`)  

---

### 4. TikTok Shop Scraper Agent
**Role:** Lead Acquisition  
**Trigger:** Sales Manager dispatch (daily batch)  
**Tool:** Apify — TikTok Shop actor  
**Writes:** Raw lead records into `leads` table  
**Notes:** Captures seller ID, product count, GMV signals, follower count, fulfillment method signals  

---

### 5. Duplicate Detection Agent
**Role:** Data Hygiene  
**Trigger:** Every new lead insert (queue event)  
**Logic:**
- Exact domain match → hard duplicate, discard
- Fuzzy company name + same state → soft duplicate, flag for review
- Same owner email → merge candidates
**Writes:** Sets `leads.is_duplicate = true` or creates `duplicate_candidates` record  
**LLM:** None — rule-based + fuzzy string matching (RapidFuzz)  

---

### 6. Data Quality Agent
**Role:** Data Hygiene  
**Trigger:** After Duplicate Detection clears a lead  
**Checks:**
- Required fields present (domain, company_name, platform)
- URL resolves (HTTP 200)
- SKU count is numeric and within sane range
- No obvious test/placeholder data
**Writes:** `leads.quality_score` (0–100), `leads.quality_flags` (JSON array of failed checks)  
**LLM:** None — rule-based validators  
**Threshold:** quality_score < 40 → status = `rejected`  

---

### 7. ICP Scoring Agent
**Role:** Qualification  
**Trigger:** Lead passes Data Quality (quality_score ≥ 40)  
**LLM:** Claude Opus 4.8 with structured output  
**Scoring Dimensions (configurable in `icp_weights.yaml`):**

| Dimension | Weight | Signal |
|---|---|---|
| Order volume fit | 25% | Estimated monthly orders 1k–2.5k |
| SKU count fit | 20% | < 50 SKUs |
| Product category fit | 20% | Books / merch / apparel / subscription |
| Geography | 15% | US-based |
| Platform | 10% | Shopify / WooCommerce / TikTok Shop |
| Company size | 10% | Not enterprise; < 50 employees signals |

**Writes:** `lead_scores.icp_score` (0–100)  

---

### 8. Confidence Scoring Agent
**Role:** Data Reliability Assessment  
**Trigger:** After ICP Scoring  
**Measures how certain we are about the ICP score data:**

| Factor | Impact |
|---|---|
| Order volume confirmed vs. estimated | ±20 pts |
| Contact info verified | +15 pts |
| SKU count directly observed | +15 pts |
| Data age < 30 days | +10 pts |
| Multiple data sources corroborate | +10 pts |

**Writes:** `lead_scores.confidence_score` (0–100)  
**LLM:** Claude Opus 4.8 — evaluates evidence chain  

---

### 9. Buying Signal Agent
**Role:** Intent Detection  
**Trigger:** After ICP Scoring  
**Sources scanned:**
- LinkedIn posts (job postings for logistics/ops/3PL roles)
- Tech stack changes (new shipping apps detected)
- Recent fundraise or product launch
- Review sentiment on current 3PL on Trustpilot / Reddit
- Social media growth velocity (TikTok follower spike)
**Writes:** `lead_scores.intent_score` (0–100), `buying_signals` table  
**LLM:** Claude Opus 4.8 — interprets signal strength and recency  

---

### 10. Contact Discovery Agent
**Role:** People Intelligence  
**Trigger:** Lead final_score ≥ 40 (Warm or Hot)  
**Tools:** Hunter.io API, LinkedIn scraping via Apify  
**Targets:** Founder, CEO, Head of Operations, Head of Ecommerce  
**Writes:** `contacts` table with name, title, email, linkedin_url, confidence  
**Validation:** Email syntax + MX record check  

---

### 11. Research Agent
**Role:** Deep Intelligence  
**Trigger:** Lead final_score ≥ 60 (approaching Hot)  
**LLM:** Claude Opus 4.8 with adaptive thinking  
**Sources:** Company website, LinkedIn, Crunchbase, news mentions, Amazon seller profile  
**Output (written to `lead_research`):**
- Company backstory (founding year, mission)
- Current fulfillment setup (in-house / competitor 3PL)
- Pain points inferred from reviews and job postings
- Key decision-maker background
- Conversation hooks

---

### 12. Outreach Preparation Agent
**Role:** Sales Enablement  
**Trigger:** Lead is Hot (final_score ≥ 75) AND contact exists  
**LLM:** Claude Opus 4.8  
**Produces (written to `outreach_drafts`):**
- Personalized cold email (subject + 3-paragraph body)
- LinkedIn connection request message (< 300 chars)
- Call talk track outline
- Objection handler cheat sheet  
**Tone:** Direct, peer-to-peer, nonprofit mission awareness included  

---

### 13. CRM Agent
**Role:** Data Sync  
**Trigger:** Lead status changes to Warm or Hot; outreach draft created  
**Phase 1:** Writes to Google Sheets (structured tab per category)  
**Phase 2:** Syncs to Airtable via API  
**Future:** HubSpot CRM via MCP (HubSpot MCP server already connected)  
**Writes:** `crm_sync_log` — tracks sync status, record IDs per system  

---

### 14. Learning Agent
**Role:** Continuous Improvement  
**Trigger:** Weekly cron  
**LLM:** Claude Opus 4.8 with adaptive thinking  
**Analyzes:**
- Which ICP score ranges actually converted to customers
- Which buying signals were predictive vs. noisy
- Which outreach templates had best reply rates
- Agent error rates and data quality trends  
**Writes:** Recommendations to `learning_insights` table  
**Action:** Sales Manager reads insights and adjusts `icp_weights.yaml` via PR or config update  

---

## Agent Communication Flow

```
External Sources (Apify, Hunter.io, LinkedIn)
        │
        ▼
  Scraper Agents (3) ──── write raw leads ────► [leads table]
                                                      │
                                              [task_queue event]
                                                      │
                                              Sales Manager polls
                                                      │
                              ┌───────────────────────┼──────────────────────┐
                              ▼                       ▼                      ▼
                    Duplicate Detection          Data Quality           (other hygiene)
                              │                       │
                              └───────────┬───────────┘
                                          ▼
                                   [lead: clean]
                                          │
                              ┌───────────┼───────────┐
                              ▼           ▼           ▼
                         ICP Score   Confidence   Buying Signal
                              │           │           │
                              └───────────┼───────────┘
                                          ▼
                                   Final Score computed
                                          │
                          ┌───────────────┼──────────────────┐
                          ▼               ▼                  ▼
                   Contact Discovery   Research        CRM Agent (sync)
                          │               │
                          └───────┬───────┘
                                  ▼
                         Outreach Preparation
                                  │
                                  ▼
                           CRM Agent (sync outreach draft)
                                  │
                                  ▼
                          Learning Agent (weekly)
```
