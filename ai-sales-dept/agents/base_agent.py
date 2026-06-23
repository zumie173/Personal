"""
Abstract base class for all Phase 1 agents.
Agents are plain Python classes — no queue, no async. The pipeline runner calls them in sequence.
"""

import time
import logging
from abc import ABC, abstractmethod
from typing import Optional
import anthropic
from database import db as database

logger = logging.getLogger(__name__)


class BaseAgent(ABC):
    name: str = "base"

    def __init__(self, config, run_id: str):
        self.config = config
        self.run_id = run_id
        self._claude = None

    @property
    def claude(self) -> anthropic.Anthropic:
        if self._claude is None:
            self._claude = anthropic.Anthropic(api_key=self.config.anthropic_api_key)
        return self._claude

    def ask(self, system: str, user: str, max_tokens: int = 2048) -> str:
        """Single-turn Claude call with adaptive thinking. Returns the text response."""
        response = self.claude.messages.create(
            model="claude-opus-4-8",
            max_tokens=max_tokens,
            thinking={"type": "adaptive"},
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return next(b.text for b in response.content if b.type == "text")

    def log(self, lead_id: Optional[str], action: str, result: str = None,
            error: str = None, duration_ms: int = None):
        database.log_agent_action(
            run_id=self.run_id,
            agent_name=self.name,
            lead_id=lead_id,
            action=action,
            result=result,
            error=error,
            duration_ms=duration_ms,
        )

    def timed(self, fn, *args, **kwargs):
        """Run fn and return (result, duration_ms)."""
        start = time.monotonic()
        result = fn(*args, **kwargs)
        duration_ms = int((time.monotonic() - start) * 1000)
        return result, duration_ms
