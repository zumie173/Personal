# Workflow Diagrams — AI Sales Department

All diagrams use Mermaid syntax. Render at mermaid.live or in any Markdown viewer.

---

## Workflow 1: Lead Ingestion Pipeline

```mermaid
flowchart TD
    CRON([Cron: Daily 6AM CT]) --> SM[Sales Manager Agent]
    SM --> |dispatch scrape tasks| Q[(task_queue)]

    Q --> SHOP[Shopify Scraper]
    Q --> WOO[WooCommerce Scraper]
    Q --> TIKTOK[TikTok Shop Scraper]

    SHOP --> |write raw leads| DB[(leads table)]
    WOO --> |write raw leads| DB
    TIKTOK --> |write raw leads| DB

    DB --> |trigger| Q2[(task_queue: dedup task)]
    Q2 --> SM2[Sales Manager]
    SM2 --> DUP[Duplicate Detection Agent]
    DUP --> |mark duplicate| DB
    DUP --> |pass clean lead| Q3[(task_queue: quality task)]

    Q3 --> SM3[Sales Manager]
    SM3 --> DQ[Data Quality Agent]
    DQ --> |quality_score < 40| REJECT([status = rejected])
    DQ --> |quality_score >= 40| Q4[(task_queue: score tasks)]
```

---

## Workflow 2: Scoring Pipeline

```mermaid
flowchart TD
    Q[(task_queue: score)] --> SM[Sales Manager]
    SM --> |parallel dispatch| ICP[ICP Scoring Agent]
    SM --> |parallel dispatch| CONF[Confidence Scoring Agent]
    SM --> |parallel dispatch| SIG[Buying Signal Agent]

    ICP --> |write icp_score| SCORES[(lead_scores)]
    CONF --> |write confidence_score| SCORES
    SIG --> |write intent_score + buying_signals| SCORES

    SCORES --> |all three present| FINAL{Compute Final Score}
    FINAL --> |final_score| SCORES

    FINAL --> |final >= 75| HOT([HOT lead])
    FINAL --> |40-74| WARM([WARM lead])
    FINAL --> |0-39| COLD([COLD — archive])

    HOT --> Q2[(task_queue: contact + research)]
    WARM --> Q3[(task_queue: contact discovery)]
    COLD --> CRM_COLD[CRM Agent — log cold]
```

---

## Workflow 3: Intelligence & Outreach Pipeline

```mermaid
flowchart TD
    Q[(task_queue: contact)] --> SM[Sales Manager]
    SM --> CD[Contact Discovery Agent]
    CD --> |write contacts| CONTACTS[(contacts table)]

    Q2[(task_queue: research)] --> SM2[Sales Manager]
    SM2 --> RES[Research Agent]
    RES --> |write lead_research| RESEARCH[(lead_research)]

    CONTACTS --> |contact exists| READY{Contact + Research ready?}
    RESEARCH --> READY

    READY --> |yes + hot lead| SM3[Sales Manager]
    SM3 --> OUT[Outreach Preparation Agent]
    OUT --> |write drafts| DRAFTS[(outreach_drafts)]

    DRAFTS --> CRM[CRM Agent]
    CRM --> GS[(Google Sheets Phase 1)]
    CRM --> AT[(Airtable Phase 2)]
    CRM --> HS[(HubSpot Phase 3)]
```

---

## Workflow 4: Learning Loop (Weekly)

```mermaid
flowchart TD
    CRON([Cron: Monday 8AM]) --> SM[Sales Manager]
    SM --> LEARN[Learning Agent]

    LEARN --> |query| SCORES[(lead_scores)]
    LEARN --> |query| DRAFTS[(outreach_drafts)]
    LEARN --> |query| LOG[(agent_run_log)]

    LEARN --> |analyze| CLAUDE[Claude Opus 4.8]
    CLAUDE --> |insights| INSIGHTS[(learning_insights)]

    INSIGHTS --> SM2[Sales Manager]
    SM2 --> |generate digest| DIGEST([Weekly Briefing Email])
    SM2 --> |flag weight updates| CONFIG([icp_weights.yaml PR])
```

---

## Workflow 5: n8n Orchestration Map

```
n8n Workflows:
┌─────────────────────────────────────────────────────────┐
│  Workflow: Lead Ingestion                               │
│  Trigger: Schedule (daily)                             │
│  Steps:                                                 │
│    1. HTTP POST → FastAPI /api/v1/tasks/scrape          │
│    2. Wait for webhook callback (Apify done)           │
│    3. HTTP POST → FastAPI /api/v1/tasks/dedup           │
│    4. Notify Slack: "X new leads ingested"             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Workflow: Scoring Pipeline                             │
│  Trigger: Webhook from API (new clean lead)            │
│  Steps:                                                 │
│    1. HTTP POST → /api/v1/tasks/score                   │
│    2. Poll /api/v1/leads/{id}/scores until complete    │
│    3. Branch: Hot → contact workflow                   │
│    4. Branch: Warm → contact-only workflow             │
│    5. Branch: Cold → archive + notify                  │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Workflow: CRM Sync                                     │
│  Trigger: Webhook (lead status change)                 │
│  Steps:                                                 │
│    1. Append row to Google Sheets (Phase 1)            │
│    2. Create/update Airtable record (Phase 2)          │
│    3. Create HubSpot contact+company (Phase 3)         │
│    4. Log to crm_sync_log via API                      │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Workflow: Weekly Learning Loop                         │
│  Trigger: Schedule (Monday 8AM CT)                     │
│  Steps:                                                 │
│    1. POST → /api/v1/tasks/learn                        │
│    2. Fetch insights from /api/v1/insights/latest      │
│    3. Format + send email digest to sales team         │
└─────────────────────────────────────────────────────────┘
```
