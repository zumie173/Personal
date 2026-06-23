# Database Schema — AI Sales Department

## Phase 1: Google Sheets (tabs)
- `leads` — master lead list
- `scores` — all four scores per lead
- `contacts` — discovered contacts
- `outreach_drafts` — email/LinkedIn drafts
- `task_log` — agent activity log

## Phase 2: PostgreSQL (full schema below)

---

## Core Tables

### `leads`
```sql
CREATE TABLE leads (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_platform       VARCHAR(50) NOT NULL,      -- shopify | woocommerce | tiktok_shop
  source_actor          VARCHAR(100),              -- Apify actor that found this
  store_url             TEXT NOT NULL,
  domain                TEXT NOT NULL,
  company_name          TEXT,
  estimated_monthly_orders INTEGER,
  sku_count             INTEGER,
  product_categories    TEXT[],                    -- ['apparel','books']
  country               VARCHAR(10) DEFAULT 'US',
  state                 VARCHAR(50),
  employee_count_est    INTEGER,
  annual_revenue_est    NUMERIC(15,2),
  platform_detected     VARCHAR(50),
  is_duplicate          BOOLEAN DEFAULT FALSE,
  duplicate_of_lead_id  UUID REFERENCES leads(id),
  quality_score         INTEGER,
  quality_flags         JSONB,
  status                VARCHAR(30) DEFAULT 'raw', -- raw|clean|scored|contacted|won|lost|rejected
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_domain ON leads(domain);
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_source_platform ON leads(source_platform);
CREATE INDEX idx_leads_created_at ON leads(created_at);
```

### `lead_scores`
```sql
CREATE TABLE lead_scores (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  icp_score         INTEGER CHECK (icp_score BETWEEN 0 AND 100),
  confidence_score  INTEGER CHECK (confidence_score BETWEEN 0 AND 100),
  intent_score      INTEGER CHECK (intent_score BETWEEN 0 AND 100),
  final_score       INTEGER CHECK (final_score BETWEEN 0 AND 100),
  lead_category     VARCHAR(10),                   -- hot|warm|cold
  icp_breakdown     JSONB,                         -- per-dimension sub-scores
  confidence_notes  TEXT,
  intent_notes      TEXT,
  scored_at         TIMESTAMPTZ DEFAULT NOW(),
  scorer_version    VARCHAR(20),                   -- icp_weights.yaml version tag

  UNIQUE (lead_id)                                 -- one score row per lead
);

CREATE INDEX idx_lead_scores_final ON lead_scores(final_score DESC);
CREATE INDEX idx_lead_scores_category ON lead_scores(lead_category);
```

### `buying_signals`
```sql
CREATE TABLE buying_signals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  signal_type  VARCHAR(50) NOT NULL,   -- job_posting|funding|tech_change|review_complaint|social_spike
  signal_body  TEXT,
  source_url   TEXT,
  signal_date  DATE,
  strength     INTEGER CHECK (strength BETWEEN 1 AND 10),
  detected_at  TIMESTAMPTZ DEFAULT NOW()
);
```

### `contacts`
```sql
CREATE TABLE contacts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  full_name        TEXT,
  first_name       TEXT,
  title            TEXT,
  seniority        VARCHAR(30),        -- founder|c_level|vp|director|manager
  email            TEXT,
  email_verified   BOOLEAN DEFAULT FALSE,
  linkedin_url     TEXT,
  phone            TEXT,
  discovery_source VARCHAR(50),        -- hunter_io|apify_linkedin|manual
  confidence       INTEGER CHECK (confidence BETWEEN 0 AND 100),
  is_primary       BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_lead ON contacts(lead_id);
CREATE UNIQUE INDEX idx_contacts_email ON contacts(email) WHERE email IS NOT NULL;
```

### `lead_research`
```sql
CREATE TABLE lead_research (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id              UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  company_summary      TEXT,
  founding_year        INTEGER,
  current_3pl          TEXT,             -- inferred current fulfillment provider
  pain_points          TEXT[],
  conversation_hooks   TEXT[],
  decision_maker_notes TEXT,
  sources_used         TEXT[],
  researched_at        TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (lead_id)
);
```

### `outreach_drafts`
```sql
CREATE TABLE outreach_drafts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id          UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  contact_id       UUID REFERENCES contacts(id),
  channel          VARCHAR(20) NOT NULL,  -- email|linkedin|call
  subject          TEXT,
  body             TEXT NOT NULL,
  talk_track       TEXT,
  objection_notes  TEXT,
  approved         BOOLEAN DEFAULT FALSE,
  sent_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  model_used       VARCHAR(50)            -- which Claude model generated this
);
```

### `task_queue`
```sql
CREATE TABLE task_queue (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name     VARCHAR(50) NOT NULL,
  task_type      VARCHAR(50) NOT NULL,
  lead_id        UUID REFERENCES leads(id),
  payload        JSONB DEFAULT '{}',
  status         VARCHAR(20) DEFAULT 'pending',  -- pending|running|done|failed|retrying
  priority       INTEGER DEFAULT 5,              -- 1=highest, 10=lowest
  attempts       INTEGER DEFAULT 0,
  max_attempts   INTEGER DEFAULT 3,
  error_message  TEXT,
  scheduled_at   TIMESTAMPTZ DEFAULT NOW(),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_queue_status_priority ON task_queue(status, priority, scheduled_at);
CREATE INDEX idx_queue_agent ON task_queue(agent_name, status);
CREATE INDEX idx_queue_lead ON task_queue(lead_id);
```

### `crm_sync_log`
```sql
CREATE TABLE crm_sync_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       UUID NOT NULL REFERENCES leads(id),
  crm_system    VARCHAR(30) NOT NULL,   -- google_sheets|airtable|hubspot
  external_id   TEXT,
  sync_type     VARCHAR(20),            -- create|update|delete
  synced_at     TIMESTAMPTZ DEFAULT NOW(),
  success       BOOLEAN DEFAULT TRUE,
  error_detail  TEXT
);
```

### `duplicate_candidates`
```sql
CREATE TABLE duplicate_candidates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id_a     UUID NOT NULL REFERENCES leads(id),
  lead_id_b     UUID NOT NULL REFERENCES leads(id),
  similarity    NUMERIC(5,4),           -- 0.0 – 1.0
  match_reason  VARCHAR(50),
  resolved      BOOLEAN DEFAULT FALSE,
  resolution    VARCHAR(20),            -- merged|kept_both|rejected_a|rejected_b
  resolved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

### `learning_insights`
```sql
CREATE TABLE learning_insights (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_week   DATE NOT NULL,          -- Monday of the analysis week
  insight_type    VARCHAR(50),            -- scoring_calibration|signal_accuracy|template_performance
  finding         TEXT NOT NULL,
  recommended_action TEXT,
  data_sample_size INTEGER,
  applied         BOOLEAN DEFAULT FALSE,
  applied_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `agent_run_log`
```sql
CREATE TABLE agent_run_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_name   VARCHAR(50) NOT NULL,
  task_id      UUID REFERENCES task_queue(id),
  lead_id      UUID REFERENCES leads(id),
  run_start    TIMESTAMPTZ NOT NULL,
  run_end      TIMESTAMPTZ,
  duration_ms  INTEGER,
  tokens_used  INTEGER,
  llm_cost_usd NUMERIC(10,6),
  success      BOOLEAN,
  error        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_log_agent ON agent_run_log(agent_name, run_start DESC);
```

---

## Computed Final Score

```sql
-- Computed on insert/update to lead_scores
-- Default weights — adjustable
final_score = ROUND(
  (icp_score * 0.40) +
  (confidence_score * 0.20) +
  (intent_score * 0.40)
);

-- Category assignment
lead_category = CASE
  WHEN final_score >= 75 THEN 'hot'
  WHEN final_score >= 40 THEN 'warm'
  ELSE 'cold'
END;
```

---

## Google Sheets Phase 1 Mapping

| Sheet Tab | Columns |
|---|---|
| Leads | id, domain, company_name, platform, status, created_at |
| Scores | lead_id, icp, confidence, intent, final, category |
| Contacts | lead_id, name, title, email, linkedin |
| Outreach | lead_id, channel, subject, body preview, approved |
| Task Log | agent, task_type, status, started, completed, error |
