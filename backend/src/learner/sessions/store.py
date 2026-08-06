"""Drill-agnostic session state and persistence interface."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from random import Random
from typing import Any, Protocol, runtime_checkable

from learner.drills.base import AnsweredQuestion, Question


@dataclass(slots=True)
class Session:
    """Mutable execution state for one reproducible drill session."""

    session_id: str
    drill_id: str
    config: dict[str, Any]
    seed: int
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    answers: list[AnsweredQuestion] = field(default_factory=list)
    current_question: Question | None = None
    rng: Random = field(init=False, repr=False)

    def __post_init__(self) -> None:
        self.rng = Random(self.seed)


@runtime_checkable
class SessionStore(Protocol):
    """Persistence boundary for session state."""

    def create(
        self,
        *,
        drill_id: str,
        config: dict[str, Any],
        seed: int,
        session_id: str | None = None,
    ) -> Session: ...

    def get(self, session_id: str) -> Session: ...

    def append_answer(self, session_id: str, answer: AnsweredQuestion) -> Session: ...
