# Folder Structure — AI Sales Department

```
ai-sales-dept/
│
├── agents/                          # One file per agent
│   ├── __init__.py
│   ├── base_agent.py                # Abstract base class all agents inherit
│   ├── sales_manager.py             # Orchestrator — routes tasks, owns the queue
│   ├── shopify_scraper.py
│   ├── woocommerce_scraper.py
│   ├── tiktok_shop_scraper.py
│   ├── duplicate_detection.py
│   ├── data_quality.py
│   ├── icp_scoring.py
│   ├── confidence_scoring.py
│   ├── buying_signal.py
│   ├── contact_discovery.py
│   ├── research.py
│   ├── outreach_preparation.py
│   ├── crm.py
│   └── learning.py
│
├── api/                             # FastAPI service layer
│   ├── __init__.py
│   ├── main.py                      # App entry point
│   ├── routers/
│   │   ├── leads.py
│   │   ├── tasks.py
│   │   ├── scores.py
│   │   ├── contacts.py
│   │   └── webhooks.py
│   ├── schemas/                     # Pydantic request/response models
│   │   ├── lead.py
│   │   ├── task.py
│   │   ├── score.py
│   │   └── contact.py
│   └── deps.py                      # Shared dependencies (DB session, auth)
│
├── database/
│   ├── models.py                    # SQLAlchemy ORM models
│   ├── migrations/                  # Alembic migration files
│   │   └── versions/
│   ├── seeds/                       # Dev/test seed data
│   └── queries/                     # Named query helpers
│       ├── leads.py
│       ├── tasks.py
│       └── scores.py
│
├── workflows/                       # n8n exported JSON workflows
│   ├── lead-ingestion.json
│   ├── scoring-pipeline.json
│   ├── contact-discovery.json
│   ├── outreach-prep.json
│   ├── crm-sync.json
│   └── learning-loop.json
│
├── integrations/                    # Third-party API wrappers
│   ├── apify_client.py
│   ├── google_sheets.py
│   ├── airtable.py                  # Activated in phase 2
│   ├── hubspot.py
│   ├── anthropic_client.py
│   └── hunter_io.py                 # Contact discovery
│
├── config/
│   ├── settings.py                  # Pydantic BaseSettings (reads .env)
│   ├── icp_weights.yaml             # Tunable ICP scoring weights
│   ├── prompts/                     # All Claude system/user prompts
│   │   ├── sales_manager.txt
│   │   ├── icp_scoring.txt
│   │   ├── research.txt
│   │   ├── buying_signal.txt
│   │   └── outreach_prep.txt
│   └── logging.yaml
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
│
├── scripts/
│   ├── bootstrap_db.py              # Create schema + seed lookup tables
│   ├── run_pipeline.py              # Manual trigger for dev
│   └── backfill_scores.py
│
├── docker-compose.yml               # Postgres + Redis + API + worker
├── Dockerfile
├── pyproject.toml
├── .env.example
└── README.md
```
