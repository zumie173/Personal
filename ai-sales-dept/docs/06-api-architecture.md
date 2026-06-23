# API Architecture — AI Sales Department

## Framework: FastAPI (Python)

Single service exposing REST endpoints. n8n and external tools call this API.
The API does not run agents — it enqueues tasks and returns job IDs.
Agents run in separate worker processes.

---

## Base URL
```
https://api.tfh-sales.internal/api/v1
```

---

## Authentication
All endpoints require `Authorization: Bearer <API_KEY>` header.
Keys are stored in environment variables and rotated quarterly.

---

## Endpoints

### Leads

| Method | Path | Description |
|---|---|---|
| `GET` | `/leads` | List leads with filters (status, category, platform, date range) |
| `GET` | `/leads/{id}` | Single lead with all scores, contacts, research |
| `POST` | `/leads` | Manually add a lead (bypasses scraping) |
| `PATCH` | `/leads/{id}` | Update status or fields |
| `GET` | `/leads/{id}/scores` | Scores for a lead |
| `GET` | `/leads/{id}/contacts` | Contacts for a lead |
| `GET` | `/leads/{id}/outreach` | Outreach drafts for a lead |
| `GET` | `/leads/{id}/research` | Research notes for a lead |

**GET /leads query params:**
```
?status=clean&category=hot&platform=shopify
&min_final_score=75&created_after=2026-01-01
&limit=50&offset=0&sort=final_score_desc
```

---

### Tasks (Queue)

| Method | Path | Description |
|---|---|---|
| `POST` | `/tasks/scrape` | Trigger a scraping run (payload: platform, keywords) |
| `POST` | `/tasks/score` | Enqueue scoring for a lead |
| `POST` | `/tasks/learn` | Trigger the learning agent (weekly) |
| `GET` | `/tasks/{id}` | Check task status |
| `GET` | `/tasks` | List recent tasks with status |

**POST /tasks/scrape body:**
```json
{
  "platforms": ["shopify", "woocommerce"],
  "keywords": ["subscription box", "merchandise"],
  "max_results_per_platform": 200
}
```

---

### Scores

| Method | Path | Description |
|---|---|---|
| `GET` | `/scores/summary` | Aggregate score distribution |
| `GET` | `/scores/leaderboard` | Top N leads by final score |

---

### Contacts

| Method | Path | Description |
|---|---|---|
| `GET` | `/contacts` | List contacts (filterable by lead, seniority) |
| `GET` | `/contacts/{id}` | Single contact |

---

### Insights

| Method | Path | Description |
|---|---|---|
| `GET` | `/insights/latest` | Most recent learning agent output |
| `GET` | `/insights` | Historical insights list |

---

### Webhooks (Inbound)

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhooks/apify` | Apify dataset-ready callback (starts dedup) |
| `POST` | `/webhooks/n8n` | n8n status pushes |

**POST /webhooks/apify body (Apify sends this):**
```json
{
  "actorRunId": "abc123",
  "datasetId": "xyz789",
  "status": "SUCCEEDED",
  "meta": { "platform": "shopify" }
}
```

---

## Response Formats

### Lead object
```json
{
  "id": "uuid",
  "domain": "brandname.com",
  "company_name": "Brand Name Co",
  "source_platform": "shopify",
  "status": "scored",
  "scores": {
    "icp_score": 82,
    "confidence_score": 71,
    "intent_score": 79,
    "final_score": 79,
    "lead_category": "hot"
  },
  "contacts": [
    {
      "full_name": "Jane Smith",
      "title": "CEO",
      "email": "jane@brandname.com",
      "is_primary": true
    }
  ],
  "created_at": "2026-06-15T14:30:00Z"
}
```

### Task status object
```json
{
  "id": "uuid",
  "task_type": "score_icp",
  "agent_name": "icp_scoring",
  "lead_id": "uuid",
  "status": "done",
  "started_at": "2026-06-15T14:30:00Z",
  "completed_at": "2026-06-15T14:30:28Z",
  "duration_ms": 28000
}
```

### Error format
```json
{
  "error": "lead_not_found",
  "message": "No lead with ID abc123",
  "status_code": 404
}
```

---

## Rate Limits

| Endpoint group | Limit |
|---|---|
| `GET /leads*` | 120 req/min |
| `POST /tasks/scrape` | 10 req/hour |
| `POST /tasks/score` | 200 req/hour |
| `POST /webhooks/*` | 500 req/min |

---

## Observability

- All requests logged to `agent_run_log`
- `/health` endpoint returns DB connectivity + queue depth
- `/metrics` endpoint returns Prometheus-formatted counters for n8n monitoring

---

## n8n Integration Pattern

n8n calls the API via **HTTP Request nodes**. Example n8n flow:

```
1. Schedule Trigger (daily 6AM)
   ↓
2. HTTP POST /api/v1/tasks/scrape
   ↓ (get task_id)
3. Wait node: 30 min
   ↓
4. HTTP GET /api/v1/tasks/{task_id}
   ↓ (check status == 'done')
5. HTTP POST /api/v1/tasks/score (for each new lead)
   ↓
6. Slack: "Pipeline complete, {n} leads scored"
```
