# Task Queue Design — AI Sales Department

## Overview

The task queue is the nervous system of the system. All work flows through it.
No agent polls another agent — they poll the queue.

Phase 1: PostgreSQL-backed queue (simple, no extra infrastructure)  
Phase 2: Redis + RQ (when throughput demands it, ~500+ tasks/day)

---

## Task Types

| task_type | agent_name | priority | approx duration |
|---|---|---|---|
| `scrape_shopify` | shopify_scraper | 3 | 5–30 min (Apify) |
| `scrape_woocommerce` | woocommerce_scraper | 3 | 5–30 min |
| `scrape_tiktok` | tiktok_shop_scraper | 3 | 5–30 min |
| `dedup_lead` | duplicate_detection | 2 | < 5 sec |
| `quality_check` | data_quality | 2 | < 5 sec |
| `score_icp` | icp_scoring | 1 | 10–30 sec (LLM) |
| `score_confidence` | confidence_scoring | 1 | 10–30 sec (LLM) |
| `score_buying_signal` | buying_signal | 2 | 30–90 sec |
| `discover_contacts` | contact_discovery | 2 | 30 sec–2 min |
| `research_lead` | research | 3 | 1–3 min (LLM) |
| `prepare_outreach` | outreach_preparation | 2 | 30–60 sec (LLM) |
| `sync_crm` | crm | 2 | 5–30 sec |
| `run_learning` | learning | 5 | 5–10 min (LLM) |

Priority: 1 = highest urgency, 10 = lowest

---

## Queue Polling Model

```python
# Sales Manager runs this loop every 15 minutes via cron / n8n

def poll_and_dispatch():
    tasks = db.query("""
        SELECT * FROM task_queue
        WHERE status = 'pending'
          AND scheduled_at <= NOW()
        ORDER BY priority ASC, scheduled_at ASC
        LIMIT 50
    """)
    for task in tasks:
        mark_running(task.id)
        dispatch_to_worker(task)
```

Workers are Python processes (one per agent). They each watch for tasks
assigned to their `agent_name`. In Phase 1 this is a simple polling loop;
in Phase 2 it becomes RQ worker subscription.

---

## Retry Logic

```
Attempt 1: immediate
Attempt 2: 2 minutes after failure
Attempt 3: 8 minutes after failure
Attempt 4+: task marked 'failed', Sales Manager notified
```

```sql
-- Retry update applied on failure
UPDATE task_queue SET
  status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'retrying' END,
  attempts = attempts + 1,
  scheduled_at = NOW() + (INTERVAL '2 minutes' * POWER(2, attempts)),
  error_message = $1
WHERE id = $2;
```

---

## Task Lifecycle State Machine

```
pending
  │
  ├──► running ──► done
  │
  └──► running ──► retrying ──► running ──► done
                             │
                             └──► failed (max attempts reached)
```

---

## Throughput Calculation (1,000 leads/month)

```
1,000 leads / month
= ~33 leads / day
= ~4 leads / hour (business hours only)

Per lead, tasks spawned:
  dedup (1) + quality (1) + score x3 (3) + contact (1) + research (1) + outreach (conditional)
  = ~7-8 tasks per lead
  = ~250 tasks/day peak

At 15-min polling intervals and <3 min avg task duration:
→ Single-process workers are sufficient for Phase 1
→ Redis + RQ needed if scraping volume increases or batch days hit >500 tasks
```

---

## Dead Letter Queue

Tasks that fail 3× are moved to status `failed` and logged to `agent_run_log`.
A daily Slack digest from Sales Manager lists all failed tasks with error summaries.

```sql
-- Daily failed task summary
SELECT agent_name, task_type, COUNT(*), MAX(error_message)
FROM task_queue
WHERE status = 'failed'
  AND created_at >= NOW() - INTERVAL '24 hours'
GROUP BY 1, 2
ORDER BY 3 DESC;
```

---

## Phase 2 Upgrade Path (Redis + RQ)

When ready to move off PostgreSQL queue:

1. Add Redis to `docker-compose.yml`
2. Replace `task_queue` polling with `rq.Queue.enqueue()`
3. Keep `task_queue` table as audit log only (write-through)
4. Run one `rq worker` process per agent type
5. Use RQ Dashboard for visibility

No agent code changes required — swap the queue backend in `base_agent.py` only.
