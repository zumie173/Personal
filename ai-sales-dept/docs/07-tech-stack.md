# Recommended Tech Stack — AI Sales Department

## Decision Principles
- Start simple; add infrastructure only when you hit a real limit
- Every tool must earn its place with a specific job
- Phase 1 should be live and producing leads within 2–3 weeks

---

## Core Stack

| Layer | Tool | Rationale |
|---|---|---|
| **LLM** | Claude Opus 4.8 (`claude-opus-4-8`) | Best reasoning for scoring and outreach; adaptive thinking for complex analysis |
| **Agent Framework** | Custom Python (base_agent.py) | 14 specialized agents with distinct behaviors; no framework overhead needed |
| **API** | FastAPI + Uvicorn | Fast, async, auto-generates OpenAPI docs; works with n8n HTTP nodes |
| **Scraping** | Apify | Pre-built actors for Shopify/TikTok; no browser infra to maintain |
| **Contact Discovery** | Hunter.io API | Best-in-class email finding; 50 free requests/month to start |
| **Orchestration** | n8n (self-hosted or cloud) | Visual workflow editor; team can modify flows without code |
| **Queue (Phase 1)** | PostgreSQL (task_queue table) | Zero extra infra; sufficient for 1,000 leads/month |
| **Queue (Phase 2)** | Redis + RQ | When daily tasks exceed ~500; 1-day migration |
| **Database (Phase 1)** | Google Sheets | Immediate visibility; shareable with team without DB access |
| **Database (Phase 2)** | Airtable | Richer views, automations, forms; 1-day migration from Sheets |
| **Database (Phase 3)** | PostgreSQL (Supabase) | Full relational model; Supabase gives free hosted tier + REST API |
| **Containerization** | Docker + Docker Compose | Reproducible local dev; easy VPS deploy |
| **Hosting** | Render.com or Railway | Simple VPS-style deploys for API + workers; ~$20/month |
| **Fuzzy Matching** | RapidFuzz (Python) | Duplicate detection without ML overhead |
| **Email Verification** | MX record check (dnspython) + Hunter verify | Free first pass before paid verification |
| **CRM (Phase 3)** | HubSpot (MCP-connected) | HubSpot MCP server already available in this environment |

---

## AI / LLM Tooling

| Component | Choice | Notes |
|---|---|---|
| SDK | `anthropic` Python SDK | Official; streaming + structured output support |
| Thinking mode | `thinking: {"type": "adaptive"}` | On for all scoring and research agents |
| Structured output | `client.messages.parse()` with Pydantic | Scores return validated `LeadScore` model |
| Streaming | `.stream()` with `.get_final_message()` | Used for research + outreach agents (long output) |
| Prompt storage | `/config/prompts/*.txt` | Versioned in git; no hardcoded prompts in agent code |

---

## Apify Actors

| Agent | Actor |
|---|---|
| Shopify Scraper | `apify/shopify-scraper` |
| WooCommerce Scraper | `apify/web-scraper` (custom recipe) |
| TikTok Shop Scraper | `clockworks/tiktok-scraper` |
| LinkedIn (contacts) | `apify/linkedin-company-scraper` |

Apify costs: ~$5–$15/month at 1,000 leads/month volume.
Use Apify webhooks → `/api/v1/webhooks/apify` to trigger next pipeline step when actor completes.

---

## Phase Rollout Plan

### Phase 1 — Foundation (Weeks 1–3)
- [ ] PostgreSQL schema bootstrapped (Supabase free tier)
- [ ] FastAPI service running on Railway or Render
- [ ] Shopify Scraper + Duplicate + Data Quality agents live
- [ ] ICP Scoring agent live (Claude Opus 4.8)
- [ ] Google Sheets CRM sync via n8n
- [ ] Sales Manager cron running daily

**Goal:** 200 qualified leads in Google Sheets with ICP scores

### Phase 2 — Full Scoring (Weeks 4–6)
- [ ] Confidence + Buying Signal agents live
- [ ] Final Score computed; Hot/Warm/Cold categories working
- [ ] Contact Discovery via Hunter.io live
- [ ] Airtable migration (copy Sheets → Airtable, update CRM agent)
- [ ] n8n Slack notifications live

**Goal:** Full scoring pipeline; team reviewing Hot leads weekly

### Phase 3 — Intelligence & Outreach (Weeks 7–10)
- [ ] Research Agent live (Claude Opus 4.8 + adaptive thinking)
- [ ] Outreach Preparation Agent live
- [ ] HubSpot sync via MCP (already connected)
- [ ] WooCommerce + TikTok Shop scrapers live
- [ ] Learning Agent live (weekly cron)

**Goal:** Hot leads arrive in HubSpot with personalized outreach drafts ready to send

### Phase 4 — Scale & Tune (Month 3+)
- [ ] Redis + RQ queue upgrade if needed
- [ ] A/B test outreach templates; Learning Agent refines weights
- [ ] Volume increase to 2,000–3,000 leads/month
- [ ] TikTok Shop signals tuned based on conversion data

---

## Monthly Cost Estimate (Phase 1)

| Service | Est. Cost |
|---|---|
| Claude API (Opus 4.8) — ~500 scored leads × ~10k tokens avg | ~$25–$50 |
| Apify — 1,000 lead scrapes | ~$10–$20 |
| Hunter.io — 400 contact lookups (warm+hot only) | ~$0 (free tier) to $49 |
| Supabase — free tier | $0 |
| Railway / Render — API + worker | ~$10–$20 |
| n8n Cloud — starter | $20 |
| **Total** | **~$65–$160/month** |

---

## Security Notes

- API keys stored in environment variables only — never in code
- `.env.example` committed; `.env` in `.gitignore`
- Supabase RLS policies restrict table access by service role
- Hunter.io and Apify keys rotated quarterly
- HubSpot OAuth credentials stored in n8n credential vault
