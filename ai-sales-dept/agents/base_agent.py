"""
Abstract base class for all AI Sales Department agents.
Each agent inherits this, overrides `run_task()`, and calls `complete_task()` or `fail_task()`.
"""

import time
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Any
import anthropic

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    agent_name: str = ""

    def __init__(self, db, config):
        self.db = db
        self.config = config
        self.client = anthropic.Anthropic(api_key=config.anthropic_api_key)

    def poll_and_process(self):
        """Poll the task queue for this agent's tasks and process them one at a time."""
        tasks = self.db.fetch_pending_tasks(self.agent_name, limit=10)
        for task in tasks:
            self._execute(task)

    def _execute(self, task: dict):
        run_start = datetime.now(timezone.utc)
        self.db.mark_task_running(task["id"])
        try:
            result = self.run_task(task)
            self.complete_task(task["id"], result)
            self._log_run(task, run_start, success=True)
        except Exception as exc:
            logger.exception("Agent %s failed task %s", self.agent_name, task["id"])
            self.fail_task(task["id"], str(exc))
            self._log_run(task, run_start, success=False, error=str(exc))

    @abstractmethod
    def run_task(self, task: dict) -> Any:
        """Override in subclass. Return any value; it is written to task payload."""
        ...

    def complete_task(self, task_id: str, result: Any = None):
        self.db.update_task(task_id, status="done", result=result)

    def fail_task(self, task_id: str, error: str):
        self.db.update_task(task_id, status="failed", error_message=error)

    def enqueue(self, agent_name: str, task_type: str, lead_id: str, payload: dict = None, priority: int = 5):
        """Enqueue a follow-on task. Only Sales Manager should call this in normal flow."""
        self.db.insert_task(
            agent_name=agent_name,
            task_type=task_type,
            lead_id=lead_id,
            payload=payload or {},
            priority=priority,
        )

    def claude(self, system: str, user: str, model: str = "claude-opus-4-8") -> str:
        """Simple single-turn Claude call with adaptive thinking."""
        response = self.client.messages.create(
            model=model,
            max_tokens=4096,
            thinking={"type": "adaptive"},
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return next(b.text for b in response.content if b.type == "text")

    def claude_stream(self, system: str, user: str, model: str = "claude-opus-4-8") -> str:
        """Streaming Claude call — use for long research/outreach outputs."""
        with self.client.messages.stream(
            model=model,
            max_tokens=8192,
            thinking={"type": "adaptive"},
            system=system,
            messages=[{"role": "user", "content": user}],
        ) as stream:
            return stream.get_final_message().content[0].text

    def _log_run(self, task: dict, run_start: datetime, success: bool, error: str = None):
        duration_ms = int((datetime.now(timezone.utc) - run_start).total_seconds() * 1000)
        self.db.insert_agent_run_log(
            agent_name=self.agent_name,
            task_id=task["id"],
            lead_id=task.get("lead_id"),
            run_start=run_start,
            run_end=datetime.now(timezone.utc),
            duration_ms=duration_ms,
            success=success,
            error=error,
        )
